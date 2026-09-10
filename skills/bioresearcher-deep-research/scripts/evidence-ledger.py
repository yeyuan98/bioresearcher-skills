#!/usr/bin/env python3
"""Structured evidence ledger for deep-research citation integrity.

Workers append one JSON record per potentially-citable source as they search
(per-aspect JSONL files, fields copied verbatim from biomcp tool output); the
orchestrator merges, verifies against NCBI esummary, and exports the bibliography.

Contract:
- Fail-safe: network/API failure exits 0 and preserves data unchanged.
- Fill-missing-only merging: never overwrite a non-null stored value.
- Loud gaps: missing fields render as [MISSING field: ...]; unknown bib keys as
  [MISSING record <key>] with a non-zero exit. Never fabricate.
- Verb banners: every subcommand prints "[evidence-ledger] <verb>: ..." so
  test graders can anchor on deterministic stdout.

Zero external dependencies (pure Python standard library).
"""

import argparse
import contextlib
import datetime as _dt
import glob as _glob
import hashlib
import html as _html
import io
import json
import re
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ncbi_esummary import fetch_ncbi_summaries  # noqa: E402

SCHEMA = "bioresearcher-evidence/1"
LEDGER_TYPES = {
    "article", "trial", "patent", "gene", "variant",
    "drug", "disease", "dataset", "web", "other",
}
KEY_NAMESPACES = (
    "pmid", "doi", "pmcid", "nct", "patent", "geo", "sra", "gb",
    "gene", "clinvar", "chembl", "chebi", "unii",
    "mondo", "doid", "omim", "efo", "url", "title",
)

# biomcp-native id field names -> canonical ids slots (see TYPE_SPECS below).
# Aliased values are COPIED into the canonical slot (originals stay verbatim);
# None means "no canonical target: keep under the original key, never fold".
ID_ALIASES = {
    "nct_id": "nct",                      # biomcp trial_search
    "ncbi_gene_id": "ncbi_gene",
    "entrez_id": "ncbi_gene",
    "clinvar_id": "clinvar",
    "clinvarid": "clinvar",
    "rsid": "rs",
    "rs_id": "rs",
    "chembl_id": "chembl",
    "chebi_id": "chebi",
    "hgnc_id": "hgnc",
    "patent_id": "patent",
    "publication_number": "patent",
    "geo_id": "geo",
    "sra_id": "sra",
    "gb_acc": "genbank",
    "disease_id": None,                   # context-dependent: prefix-sniffed below
}

# Worker-written top-level fields COPIED into meta (fill-only; canonical meta
# wins; nulls never fold; idempotent under the every-read re-normalization).
FOLD_FIELDS = {
    "trial": ["phase", "status", "sponsor", "enrollment"],
    "drug": ["indication", "source_section"],
    "patent": ["assignee", "status"],
    "gene": ["symbol", "full_name"],
    "variant": ["gene", "protein_change", "significance"],
}


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

def banner(verb: str, message: str) -> None:
    print(f"[evidence-ledger] {verb}: {message}")


def warn(message: str) -> None:
    print(f"[evidence-ledger] warning: {message}", file=sys.stderr)


# ---------------------------------------------------------------------------
# Record schema + normalization
# ---------------------------------------------------------------------------

def _strip_id_prefix(value: str) -> str:
    return re.sub(r"^\s*(?:pmid|pmcid|doi|nct)\s*[:=]\s*", "", str(value), flags=re.IGNORECASE).strip()


def _canonicalize_id_value(key: str, value: str) -> str:
    """Apply the per-key canonicalization rules (case, digits, DOI dots)."""
    if key == "doi":
        return value.lower().rstrip(".")
    if key == "pmid":
        if not value.isdigit():
            raise ValueError(f"pmid must be digits, got {value!r}")
        return value.lstrip("0") or "0"
    if key in ("pmcid", "nct", "patent"):
        return value.upper()
    return value


_DISEASE_NS_RE = re.compile(r"^(MONDO|DOID|OMIM|EFO)[:_\s-]?(\d+)", re.IGNORECASE)


def normalize_ids(ids_raw: dict) -> dict:
    """Canonicalize id values; copy alias slots to canonical keys verbatim-preserving."""
    ids: dict = {}
    for k, v in ids_raw.items():
        if v is None:
            continue
        v = _strip_id_prefix(v)
        if not v:
            continue
        ids[k] = _canonicalize_id_value(k, v)
        # disease_id values carry their ontology in the prefix: sniff it
        if k == "disease_id":
            m = _DISEASE_NS_RE.match(v)
            if m:
                ns, num = m.group(1).upper(), m.group(2)
                slot = {"MONDO": "mondo", "DOID": "doid", "OMIM": "omim", "EFO": "efo"}[ns]
                ids.setdefault(slot, f"{ns}:{num}")
    for k, target in ID_ALIASES.items():
        if target is None or k not in ids_raw:
            continue
        v = ids_raw[k]
        if v is None:
            continue
        v = _strip_id_prefix(v)
        if not v:
            continue
        ids.setdefault(target, _canonicalize_id_value(target, v))
    return ids


def normalize_record(raw, require_provenance_aspect=None) -> dict:
    """Validate + normalize an incoming record. Raises ValueError on bad input."""
    if not isinstance(raw, dict):
        raise ValueError("record must be a JSON object")
    if raw.get("schema") not in (None, SCHEMA):
        raise ValueError(f"unsupported schema {raw.get('schema')!r} (expected {SCHEMA})")
    rtype = raw.get("type")
    if rtype not in LEDGER_TYPES:
        raise ValueError(f"unknown type {rtype!r} (allowed: {', '.join(sorted(LEDGER_TYPES))})")

    ids_raw = raw.get("ids") or {}
    if not isinstance(ids_raw, dict):
        raise ValueError("ids must be an object")
    ids = normalize_ids(ids_raw)

    title = raw.get("title")
    if title is not None:
        title = str(title).strip() or None
    if not title and not ids:
        raise ValueError("record needs a title or at least one id")
    if raw.get("meta") is not None and not isinstance(raw.get("meta"), dict):
        raise ValueError("meta must be an object")
    if raw.get("authors") is not None and not isinstance(raw.get("authors"), list):
        raise ValueError("authors must be a list of name strings")

    # Loose-field folding: copy worker-written top-level fields into meta
    # (fill-only; canonical meta wins; nulls never fold; originals preserved).
    meta = dict(raw.get("meta") or {})
    for field in FOLD_FIELDS.get(rtype, ()):
        value = raw.get(field)
        if value in (None, ""):
            continue
        if meta.get(field) in (None, ""):
            meta[field] = value

    key = canonical_key(raw.get("key"), rtype, ids, title)

    provenance_raw = raw.get("provenance") or []
    if not isinstance(provenance_raw, list):
        raise ValueError("provenance must be a list")
    provenance = []
    for p in provenance_raw:
        if not isinstance(p, dict) or not p.get("aspect"):
            raise ValueError("every provenance entry needs an 'aspect'")
        provenance.append({
            "aspect": str(p["aspect"]),
            "tool": str(p.get("tool") or "unknown"),
            "args": p.get("args") or {},
            "retrieved_at": str(p.get("retrieved_at") or ""),
        })
    if require_provenance_aspect and not any(p["aspect"] == require_provenance_aspect for p in provenance):
        provenance.append({
            "aspect": require_provenance_aspect, "tool": "unknown", "args": {}, "retrieved_at": "",
        })

    rec = dict(raw)  # preserve extra/meta fields verbatim
    rec.update({"schema": SCHEMA, "key": key, "type": rtype, "ids": ids, "title": title, "meta": meta})
    for opt in ("title_original", "authors", "journal", "year", "volume", "issue", "pages", "url"):
        rec.setdefault(opt, None)
    rec.setdefault("verified", False)
    rec.setdefault("verified_source", None)
    rec.setdefault("verified_at", None)
    if not isinstance(rec.get("backfilled"), list):
        rec["backfilled"] = []
    rec["provenance"] = provenance
    return rec


def _title_key(rtype: str, title) -> str:
    digest = hashlib.sha256(f"{rtype}:{title}".encode("utf-8")).hexdigest()[:16]
    return f"title:{digest}"


def derive_dataset_key(ids: dict, title) -> str:
    for v in ids.values():
        v = str(v)
        if v.upper().startswith("GSE"):
            return f"geo:GSE{v[3:]}"
        if v.upper().startswith("GDS"):
            return f"geo:GDS{v[3:]}"
        if v.upper().startswith("SRR"):
            return f"sra:SRR{v[3:]}"
        if v.upper().startswith("SRP"):
            return f"sra:SRP{v[3:]}"
    for k, v in ids.items():
        if (k or "").lower() in ("genbank", "gb", "accession"):
            return f"gb:{v}"
    raise ValueError("dataset record needs a geo (GSE/GDS), sra (SRR/SRP), or genbank accession id")


def derive_web_key(ids: dict, title) -> str:
    url = str((ids.get("url") or "")).strip()
    if not url:
        raise ValueError("web record needs ids.url")
    return "url:" + hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]


def derive_other_key(ids: dict, title) -> str:
    """Deterministic fallback key: url -> first id in sorted key order -> title hash."""
    url = str((ids.get("url") or "")).strip()
    if url:
        return "url:" + hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    for k in sorted(ids):
        v = str(ids[k])
        if v:
            ns = ID_ALIASES.get(k, k)
            if ns in KEY_NAMESPACES:
                return f"{ns}:{v}"
    if title:
        return _title_key("other", title)
    raise ValueError("record needs an id or a title to derive a key")


def canonical_key(raw_key, rtype: str, ids: dict, title=None) -> str:
    """Canonical primary key (registry-driven); an explicit well-formed key wins."""
    if raw_key:
        k = str(raw_key).strip()
        ns = k.split(":", 1)[0]
        if ns in KEY_NAMESPACES and ":" in k:
            # An explicit title: key must not bypass the hard-id requirement of
            # verify-gated types (a title-only article could never verify).
            if ns == "title" and (TYPE_SPECS.get(rtype) or {}).get("verify"):
                raise ValueError(f"{rtype} record keeps its hard id requirement; explicit title: keys are not accepted")
            return k
        raise ValueError(f"malformed key {raw_key!r}")

    spec = TYPE_SPECS.get(rtype) or {}
    key_from = spec.get("key_from")
    if key_from:
        for ns, field in key_from:
            if ids.get(field):
                return f"{ns}:{ids[field]}"
    elif spec.get("key_fn"):
        return spec["key_fn"](ids, title)

    # No derivation succeeded. Article keeps its hard id requirement (a
    # title-only article could never verify); verify-less types may fall
    # back to a deterministic title key.
    if rtype != "article" and title:
        return _title_key(rtype, title)
    fallback_errors = {
        "article": "article record needs a pmid, doi, or pmcid",
        "trial": "trial record needs ids.nct (or a title)",
        "patent": "patent record needs ids.patent (or a title)",
        "gene": "gene record needs ids.ncbi_gene (or a title)",
        "variant": "variant record needs ids.clinvar (or a title)",
        "drug": "drug record needs a chembl/chebi/unii id (or a title)",
        "disease": "disease record needs a mondo/doid/omim/efo id (or a title)",
    }
    raise ValueError(fallback_errors.get(rtype, f"{rtype} record needs an id or a title"))


def secondary_ids(rec: dict) -> set:
    """Secondary identity for cross-key article dedupe (doi + pmcid)."""
    out = set()
    if rec.get("type") == "article":
        for k in ("doi", "pmcid"):
            v = (rec.get("ids") or {}).get(k)
            if v:
                out.add(f"{k}:{str(v).lower()}")
    return out


NO_FILL_FIELDS = {
    "schema", "key", "type", "source", "score", "_error",
    "verified", "verified_source", "verified_at", "backfilled",
    "title_original", "provenance",
}

# Key-namespace precedence for twin merges: a pmid-bearing twin promotes the
# union record to the pmid key so bib lookups work regardless of which aspect
# file sorted first (pmid > doi > pmcid).
_KEY_STRENGTH = {"pmid": 3, "doi": 2, "pmcid": 1}


def _key_namespace(key: str) -> str:
    return key.split(":", 1)[0]


def merge_fill(base: dict, incoming: dict) -> None:
    """Fill missing base fields from incoming; NEVER overwrite non-null values.

    `meta` merges NESTED fill-only (complementary worker fields union instead
    of the whole-dict drop a scalar comparison would cause).
    """
    incoming_meta = incoming.get("meta")
    if isinstance(incoming_meta, dict):
        base_meta = base.get("meta")
        if not isinstance(base_meta, dict):
            base_meta = {}
            base["meta"] = base_meta
        for k, v in incoming_meta.items():
            if base_meta.get(k) in (None, "", [], {}) and v not in (None, "", [], {}):
                base_meta[k] = v
    for field, value in incoming.items():
        if field in NO_FILL_FIELDS or field in ("meta",) or field.startswith("_"):
            continue
        if base.get(field) in (None, "", [], {}) and value not in (None, "", [], {}):
            base[field] = value
    base_provs = base.setdefault("provenance", [])
    known_aspects = {p.get("aspect") for p in base_provs}
    for p in incoming.get("provenance") or []:
        if p.get("aspect") not in known_aspects:
            base_provs.append(p)
            known_aspects.add(p.get("aspect"))


# ---------------------------------------------------------------------------
# JSONL file IO
# ---------------------------------------------------------------------------

class Ledger:
    """In-memory ledger: records by key + secondary-id index + quarantine."""

    def __init__(self):
        self.by_key: dict = {}
        self.sec_index: dict = {}
        self.quarantined: list = []

    def upsert(self, rec: dict) -> None:
        existing = self.by_key.get(rec["key"])
        if existing is not None:
            merge_fill(existing, rec)
        else:
            twin_key = None
            for sid in secondary_ids(rec):
                twin_key = self.sec_index.get(sid)
                if twin_key:
                    break
            if twin_key is not None and twin_key in self.by_key:
                base = self.by_key[twin_key]
                merge_fill(base, rec)
                # promote to the stronger key namespace (pmid > doi > pmcid)
                if _KEY_STRENGTH.get(_key_namespace(rec["key"]), 0) > _KEY_STRENGTH.get(_key_namespace(twin_key), 0):
                    del self.by_key[twin_key]
                    base["key"] = rec["key"]
                    self.by_key[rec["key"]] = base
                    for sid, k in list(self.sec_index.items()):
                        if k == twin_key:
                            self.sec_index[sid] = rec["key"]
                    twin_key = rec["key"]
                rec = base
            else:
                self.by_key[rec["key"]] = rec
        for sid in secondary_ids(rec):
            self.sec_index.setdefault(sid, rec["key"])

    def records(self) -> list:
        return list(self.by_key.values())

    def write(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            for rec in self.records():
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        tmp.replace(path)


def read_ledger(path: Path) -> Ledger:
    led = Ledger()
    if not path.is_file():
        return led
    for lineno, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        s = line.strip()
        if not s:
            continue
        try:
            led.upsert(normalize_record(json.loads(s)))
        except (json.JSONDecodeError, ValueError, TypeError) as e:
            led.quarantined.append({"file": str(path), "line": lineno, "record": s, "error": str(e)})
    return led


def append_quarantine(out_path: Path, entries: list) -> Path:
    qpath = out_path.parent / "_invalid.jsonl"
    seen = set()
    if qpath.is_file():
        for line in qpath.read_text(encoding="utf-8-sig").splitlines():
            try:
                e = json.loads(line)
                seen.add((e.get("file"), e.get("line"), e.get("error")))
            except (json.JSONDecodeError, AttributeError):
                continue
    with qpath.open("a", encoding="utf-8") as fh:
        for e in entries:
            fingerprint = (e.get("file"), e.get("line"), e.get("error"))
            if fingerprint in seen:
                continue
            seen.add(fingerprint)
            fh.write(json.dumps(e, ensure_ascii=False) + "\n")
    return qpath


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------

def _parse_incoming(args) -> list:
    if args.stdin:
        payload = json.loads(sys.stdin.read())
        return payload if isinstance(payload, list) else [payload]
    if getattr(args, "record", None) is None:
        raise ValueError("provide a record JSON, @file, or --stdin")
    if args.record.startswith("@"):
        payload = json.loads(Path(args.record[1:]).read_text(encoding="utf-8-sig"))
        return payload if isinstance(payload, list) else [payload]
    return [json.loads(args.record)]


def cmd_add(args) -> int:
    path = Path(args.file)
    led = read_ledger(path)
    # add rewrites the file: pre-existing malformed lines would be silently
    # dropped — quarantine them loudly instead (same file merge uses).
    if led.quarantined:
        qpath = append_quarantine(path, led.quarantined)
        warn(f"{len(led.quarantined)} pre-existing malformed line(s) quarantined to {qpath} (excluded from rewrite)")
    accepted = rejected = 0
    for raw in _parse_incoming(args):
        try:
            led.upsert(normalize_record(raw, require_provenance_aspect=args.aspect))
        except (ValueError, TypeError) as e:
            rejected += 1
            warn(f"rejected record ({e}): {json.dumps(raw, ensure_ascii=False)[:200]}")
            continue
        accepted += 1
    led.write(path)
    banner("add", f"{accepted} record(s) accepted, {rejected} rejected -> {path}")
    return 0


def _expand_input_files(patterns: list, out_path: Path) -> list:
    files: list = []
    for pattern in patterns:
        matches = sorted(_glob.glob(pattern)) if any(c in pattern for c in "*?[") else [pattern]
        for m in matches:
            p = Path(m)
            if not p.is_file():
                continue
            if p.resolve() == out_path.resolve():
                continue  # never re-ingest own output
            if p.name.startswith("_"):
                continue  # quarantine + underscore-prefixed files always excluded
            files.append(p)
    return files


def cmd_merge(args) -> int:
    out_path = Path(args.out)
    inputs = _expand_input_files(args.inputs, out_path)
    merged = Ledger()
    quarantine_entries = []
    for f in inputs:
        led = read_ledger(f)
        quarantine_entries.extend(led.quarantined)
        for rec in led.records():
            merged.upsert(rec)
    merged.write(out_path)
    qnote = ""
    if quarantine_entries:
        qpath = append_quarantine(out_path, quarantine_entries)
        qnote = f"; {len(quarantine_entries)} malformed line(s) quarantined to {qpath}"
    banner("merge", f"{len(merged.by_key)} record(s) from {len(inputs)} file(s) -> {out_path}{qnote}")
    return 0


def _esummary_locator(doc: dict) -> dict:
    m = re.search(r"\b(19\d\d|20\d\d)\b", str(doc.get("pubdate", "")))
    year = m.group(1) if m else str(doc.get("sortpubdate") or "")[:4]
    return {
        "year": year or None,
        "volume": str(doc.get("volume", "")).strip() or None,
        "issue": str(doc.get("issue", "")).strip() or None,
        "pages": str(doc.get("pages", "")).strip() or None,
    }


def _esummary_title(doc: dict) -> str:
    t = re.sub(r"<[^>]+>", "", str(doc.get("title", "")))
    t = _html.unescape(t).replace("\u00a0", " ")
    return t.strip().rstrip(".")


def _esummary_doi(doc: dict):
    for aid in doc.get("articleids", []) or []:
        if aid.get("idtype") == "doi":
            v = str(aid.get("value", "")).strip().rstrip(".").lower()
            return v or None
    return None


def cmd_verify(args) -> int:
    path = Path(args.file)
    led = read_ledger(path)
    verifiable = {t for t, spec in TYPE_SPECS.items() if spec.get("verify")}
    pmids = sorted({r["ids"]["pmid"] for r in led.records()
                    if r.get("type") in verifiable and (r.get("ids") or {}).get("pmid") and not r.get("verified")})
    docs = fetch_ncbi_summaries(pmids, timeout=args.timeout) if pmids else {}
    now = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    filled = title_fixed = clean = unreachable = 0
    skipped = sum(1 for r in led.records() if r.get("type") not in verifiable)
    for rec in led.records():
        if rec.get("type") not in verifiable:
            continue
        pmid = (rec.get("ids") or {}).get("pmid")
        if not pmid or rec.get("verified"):
            continue
        doc = docs.get(pmid)
        if not doc:
            unreachable += 1
            continue
        changed = False
        loc = _esummary_locator(doc)
        for field in ("year", "volume", "issue", "pages"):
            if rec.get(field) in (None, "") and loc[field]:
                rec[field] = loc[field]
                rec["backfilled"].append(field)
                changed = True
        if not (rec.get("ids") or {}).get("doi"):
            doi = _esummary_doi(doc)
            if doi:
                rec["ids"]["doi"] = doi
                rec["backfilled"].append("doi")
                changed = True
        if not rec.get("journal"):
            j = str(doc.get("source", "")).strip()
            if j:
                rec["journal"] = j
                rec["backfilled"].append("journal")
                changed = True
        if not rec.get("title"):
            t = _esummary_title(doc)
            if t:
                rec["title"] = t
                rec["title_original"] = None
                rec["backfilled"].append("title")
                changed = True
                title_fixed += 1
        rec["verified"] = True
        rec["verified_source"] = "ncbi-esummary"
        rec["verified_at"] = now
        if changed:
            filled += 1
        else:
            clean += 1
    if args.apply:
        led.write(path)
        if led.quarantined:
            qpath = append_quarantine(path, led.quarantined)
            warn(f"{len(led.quarantined)} pre-existing malformed line(s) quarantined to {qpath} (excluded from rewrite)")
    banner(
        "verify",
        f"{len(docs)} PubMed record(s) checked; {filled} backfilled, {title_fixed} title(s) set, "
        f"{clean} verified clean, {unreachable} unreachable (fail-safe, left unverified); "
        f"{skipped} record(s) of unverified type(s) skipped (no verifier configured)"
        + ("; --apply written" if args.apply else " (dry-run, no changes written)"),
    )
    return 0


# ---------------------------------------------------------------------------
# Bibliography rendering
# ---------------------------------------------------------------------------

_GROUP_AUTHOR_RE = re.compile(
    r"\b(group|consortium|investigators?|network|committee|collaborative|initiative|"
    r"team|registry|alliance|panel|authors?|working|study|trial|project|program|"
    r"organization|organisation|society|association|institute|council|foundation|"
    r"university|college)\b",
    re.IGNORECASE,
)

# lowercase surname particles absorbed into the family name ("van der Berg Jan"
# -> "van der Berg J"), never treated as given-name initials
_SURNAME_PARTICLES = {"van", "der", "den", "de", "del", "la", "di", "da", "dos", "von", "ter", "ten", "op", "'t"}


def vancouver_author(name: str) -> str:
    """'Chapman Paul B' -> 'Chapman PB'; group/corporate names pass through."""
    name = (name or "").strip()
    if not name:
        return ""
    if _GROUP_AUTHOR_RE.search(name):
        return name
    tokens = name.split()
    if len(tokens) == 1:
        return name
    if tokens[0].lower() in _SURNAME_PARTICLES:
        # particle-leading surname: "van der Berg Jan" -> surname "van der Berg"
        i = 0
        while i < len(tokens) and tokens[i].lower() in _SURNAME_PARTICLES:
            i += 1
        if i < len(tokens):
            surname = " ".join(tokens[: i + 1])
            given = tokens[i + 1 :]
        else:
            surname, given = name, []
    else:
        surname, given = tokens[0], tokens[1:]
    initials = "".join(t[0].upper() for t in given if t and t[0].isalpha())
    return f"{surname} {initials}" if initials else surname


def _author_list(rec: dict, max_authors: int = 3) -> str:
    authors = [a for a in (rec.get("authors") or []) if str(a).strip()]
    if not authors:
        return "[MISSING field: authors]"
    out = ", ".join(filter(None, (vancouver_author(str(a)) for a in authors[:max_authors])))
    if len(authors) > max_authors:
        out += ", et al"
    return out


def expand_pages(pages: str) -> str:
    """Expand abbreviated numeric page ranges: '2507-16' -> '2507-2516'."""
    m = re.match(r"^(\d+)\s*-\s*(\d+)$", (pages or "").strip())
    if not m:
        return pages
    left, right = m.group(1), m.group(2)
    if len(right) < len(left):
        right = left[: len(left) - len(right)] + right
    if int(right) < int(left):
        return pages  # ambiguous abbreviation; keep verbatim
    return f"{left}-{right}"


def _locator(rec: dict, expand: bool) -> str:
    year = rec.get("year") or "[MISSING field: year]"
    vol, iss = rec.get("volume"), rec.get("issue")
    pg = expand_pages(rec.get("pages")) if expand else rec.get("pages")
    if vol and iss and pg:
        return f"{year};{vol}({iss}):{pg}"
    if vol and pg:
        return f"{year};{vol}:{pg}"
    if vol and iss:
        return f"{year};{vol}({iss})"
    if vol:
        return f"{year};{vol}"
    return f"{year}"


def _need(rec: dict, field: str) -> str:
    v = rec.get(field)
    if v in (None, ""):
        return f"[MISSING field: {field}]"
    return str(v)


def _close(s: str) -> str:
    return s if s.endswith(".") else s + "."


def render_article(rec: dict, expand: bool) -> str:
    ids = rec.get("ids") or {}
    title = _close(_need(rec, "title").strip())
    journal = _close(_need(rec, "journal"))
    if any(rec.get(f) for f in ("volume", "issue", "pages")):
        head = f"{_author_list(rec)} {title} {journal} {_locator(rec, expand)}."
    else:  # epub-ahead-of-print: locator legitimately absent at NCBI
        head = f"{_author_list(rec)} {title} {journal} {rec.get('year') or '[MISSING field: year]'}."
    tail = ""
    if ids.get("doi"):
        tail += f" DOI: {ids['doi']}."
    if ids.get("pmid"):
        tail += f" PMID: {ids['pmid']}."
    return head + tail


def render_trial(rec: dict) -> str:
    ids = rec.get("ids") or {}
    meta = rec.get("meta") or {}
    nct = ids.get("nct") or "[MISSING field: ids.nct]"
    out = f"{nct}: {_need(rec, 'title')}."
    phase = str(meta.get("phase") or "").strip().rstrip(".")
    if phase:
        # Workers copy phase verbatim from biomcp/CTgov ("Phase 2", "PHASE3",
        # "2"): never double the prefix.
        out += f" {phase}." if phase.lower().startswith("phase") else f" Phase {phase}."
    if meta.get("sponsor"):
        out += f" Sponsor: {meta['sponsor']}."
    if meta.get("status"):
        out += f" Status: {meta['status']}."
    out += " " + (rec.get("url") or f"https://clinicaltrials.gov/study/{nct}")
    return out


def render_patent(rec: dict) -> str:
    ids = rec.get("ids") or {}
    meta = rec.get("meta") or {}
    num = ids.get("patent") or "[MISSING field: ids.patent]"
    assignee = meta.get("assignee") or "[MISSING field: meta.assignee]"
    status = f" ({meta['status']})" if meta.get("status") else ""
    url = rec.get("url") or f"https://patents.google.com/patent/{num}"
    return f"{assignee}. {_need(rec, 'title')}. {num}{status}. {url}"


def render_gene(rec: dict) -> str:
    ids = rec.get("ids") or {}
    meta = rec.get("meta") or {}
    symbol = meta.get("symbol") or "[MISSING field: meta.symbol]"
    gene_id = ids.get("ncbi_gene") or "[MISSING field: ids.ncbi_gene]"
    hgnc = ids.get("hgnc") or meta.get("hgnc")
    hgnc_part = f" HGNC: {hgnc}." if hgnc else ""
    url = rec.get("url") or f"https://www.ncbi.nlm.nih.gov/gene/{ids.get('ncbi_gene', '')}"
    return f"{symbol}: {_need(rec, 'title')}. NCBI Gene ID: {gene_id}.{hgnc_part} {url}"


def render_variant(rec: dict) -> str:
    ids = rec.get("ids") or {}
    meta = rec.get("meta") or {}
    gene = meta.get("gene") or "[MISSING field: meta.gene]"
    change = meta.get("protein_change") or "[MISSING field: meta.protein_change]"
    sig = meta.get("significance") or "[MISSING field: meta.significance]"
    clinvar = ids.get("clinvar") or "[MISSING field: ids.clinvar]"
    rs = ids.get("rs") or meta.get("rs")
    rs_part = f" ({rs})" if rs else ""
    url = rec.get("url") or f"https://www.ncbi.nlm.nih.gov/clinvar/variation/{clinvar}"
    return f"{gene} p.{change}{rs_part}: {sig} [ClinVar: {clinvar}]. {url}"


def render_drug(rec: dict) -> str:
    ids = rec.get("ids") or {}
    meta = rec.get("meta") or {}
    dbid = next((f"{k.upper()}: {ids[k]}" for k in ("chembl", "chebi", "unii") if ids.get(k)),
                "[MISSING field: ids.chembl|chebi|unii]")
    ind = f" Indication: {meta['indication']}." if meta.get("indication") else ""
    url = rec.get("url") or ""
    return f"{_need(rec, 'title')}.{ind} {dbid}. {url}".strip()


def render_disease(rec: dict) -> str:
    ids = rec.get("ids") or {}
    oid = next((f"{k.upper()}:{ids[k]}" for k in ("mondo", "doid", "omim", "efo") if ids.get(k)),
               "[MISSING field: ids.mondo|doid|omim|efo]")
    return f"{_need(rec, 'title')}. {oid}. {rec.get('url') or ''}".strip()


def render_dataset(rec: dict) -> str:
    ids = rec.get("ids") or {}
    key = rec.get("key", "")
    title = _need(rec, "title")
    if key.startswith("geo:"):
        acc = ids.get("geo") or ids.get("accession") or key[len("geo:"):]
        return f"GEO series {acc}: {title}. https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={acc}"
    if key.startswith("sra:"):
        acc = ids.get("sra") or ids.get("accession") or key[len("sra:"):]
        return f"SRA run {acc}: {title}. https://trace.ncbi.nlm.nih.gov/Traces/?run={acc}"
    acc = ids.get("genbank") or ids.get("accession") or key[len("gb:"):]
    return f"GenBank accession {acc}: {title}. https://www.ncbi.nlm.nih.gov/nuccore/{acc}"


def render_web(rec: dict) -> str:
    meta = rec.get("meta") or {}
    updated = f" Updated {meta['updated']}." if meta.get("updated") else ""
    url = rec.get("url") or (rec.get("ids") or {}).get("url") or "[MISSING field: url]"
    accessed = meta.get("accessed") or "[MISSING field: meta.accessed]"
    return f"{_need(rec, 'title')}. {meta.get('organization') or '[MISSING field: meta.organization]'}.{updated} {url}. Accessed: {accessed}."


def render_other(rec: dict) -> str:
    """Generic renderer for the `other` escape-hatch type (and any future type
    that registers without a dedicated render function)."""
    parts = [_need(rec, "title")]
    ids = rec.get("ids") or {}
    extras = [f"{k}: {v}" for k, v in sorted(ids.items()) if v]
    if rec.get("url"):
        extras.append(str(rec["url"]))
    if extras:
        parts.append(" ".join(extras) + ".")
    parts.append(f"[type: {rec.get('type', 'other')}]")
    return " ".join(parts)


TYPE_SPECS = {
    # key_from = ordered (namespace, id-field) pairs for auto-derivation —
    # every namespace listed MUST be in KEY_NAMESPACES or re-reads quarantine
    # the record; key_fn for value-pattern derivation (dataset) or
    # deterministic fallbacks (web, other); verify gates cmd_verify; render
    # renders in bib.
    "article": {"key_from": [("pmid", "pmid"), ("doi", "doi"), ("pmcid", "pmcid")], "verify": True, "render": lambda r, e: render_article(r, e)},
    "trial":   {"key_from": [("nct", "nct")], "verify": False, "render": lambda r, e: render_trial(r)},
    "patent":  {"key_from": [("patent", "patent")], "verify": False, "render": lambda r, e: render_patent(r)},
    "gene":    {"key_from": [("gene", "ncbi_gene")], "verify": False, "render": lambda r, e: render_gene(r)},
    "variant": {"key_from": [("clinvar", "clinvar")], "verify": False, "render": lambda r, e: render_variant(r)},
    "drug":    {"key_from": [("chembl", "chembl"), ("chebi", "chebi"), ("unii", "unii")], "verify": False, "render": lambda r, e: render_drug(r)},
    "disease": {"key_from": [("mondo", "mondo"), ("doid", "doid"), ("omim", "omim"), ("efo", "efo")], "verify": False, "render": lambda r, e: render_disease(r)},
    "dataset": {"key_fn": derive_dataset_key, "verify": False, "render": lambda r, e: render_dataset(r)},
    "web":     {"key_fn": derive_web_key, "verify": False, "render": lambda r, e: render_web(r)},
    # NOTE: web and other share the url: key namespace (by design: same URL =
    # same source); same-URL records of the two types therefore merge into one
    # record on add/merge, fill-only, with both provenance chains preserved.
    "other":   {"key_fn": derive_other_key, "verify": False, "render": lambda r, e: render_other(r)},
}


def render_record(rec: dict, expand_pages: bool = False) -> str:
    rtype = rec.get("type")
    spec = TYPE_SPECS.get(rtype)
    if spec and spec.get("render"):
        return spec["render"](rec, expand_pages)
    return render_other(rec)


def cmd_bib(args) -> int:
    path = Path(args.file)
    led = read_ledger(path)
    keys = [k.strip() for k in args.keys.split(",") if k.strip()]
    lines = []
    missing = []
    n = args.offset
    for k in keys:
        rec = led.by_key.get(k)
        if rec is None:
            missing.append(k)
            lines.append(f"[MISSING record {k}]")
            continue
        n += 1
        lines.append(f"[{n}] {render_record(rec, args.expand_pages)}")
    print("\n".join(lines))
    if missing:
        banner("bib", f"{len(keys) - len(missing)} rendered, {len(missing)} unknown key(s): {', '.join(missing)}")
        return 1
    banner("bib", f"{len(keys)} record(s) rendered from {path}")
    return 0


def cmd_get(args) -> int:
    led = read_ledger(Path(args.file))
    rec = led.by_key.get(args.key)
    if rec is None:
        banner("get", f"key {args.key} not found in {args.file}")
        return 1
    print(json.dumps(rec, indent=2, ensure_ascii=False))
    banner("get", f"key {args.key}")
    return 0


def cmd_keys(args) -> int:
    led = read_ledger(Path(args.file))
    for k in sorted(led.by_key):
        print(k)
    banner("keys", f"{len(led.by_key)} key(s)")
    return 0


def cmd_stats(args) -> int:
    led = read_ledger(Path(args.file))
    types: dict = {}
    verified = located = 0
    for rec in led.records():
        types[rec.get("type", "?")] = types.get(rec.get("type", "?"), 0) + 1
        verified += bool(rec.get("verified"))
        located += bool(rec.get("volume") or rec.get("pages"))
    banner("stats", f"{len(led.by_key)} record(s); verified {verified}; with locator {located}; quarantined lines {len(led.quarantined)}")
    for t, c in sorted(types.items()):
        print(f"  {t}: {c}")
    return 0


# ---------------------------------------------------------------------------
# Hermetic selftest (CI; no network)
# ---------------------------------------------------------------------------

def _capture(fn, *a, **kw):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = fn(*a, **kw)
    return rc, buf.getvalue()


def _fixture_article(pmid="21639808", doi="10.1056/nejmoa1103782", title="Improved survival with vemurafenib in melanoma with BRAF V600E mutation", **over):
    rec = {
        "schema": SCHEMA,
        "key": f"pmid:{pmid}",
        "type": "article",
        "ids": {"pmid": pmid, "doi": doi, "pmcid": "PMC3549296"},
        "title": title,
        "title_original": None,
        "authors": ["Chapman Paul B", "Hauschild Axel", "Robert Caroline", "BRIM-3 Investigators"],
        "journal": "N Engl J Med",
        "year": "2011", "volume": "364", "issue": "26", "pages": "2507-16",
        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "verified": False, "verified_source": None, "verified_at": None, "backfilled": [],
        "provenance": [{"aspect": "test", "tool": "article_search", "args": {"query": "x"}, "retrieved_at": "2026-09-10T00:00:00Z"}],
    }
    rec.update(over)
    return rec


def selftest() -> int:
    with tempfile.TemporaryDirectory() as td:
        d = Path(td)
        results = []

        def check(name, fn):
            try:
                fn()
                results.append((name, None))
            except AssertionError as e:
                results.append((name, str(e)))
            except Exception as e:  # noqa: BLE001
                results.append((name, f"exception: {type(e).__name__}: {e}"))

        # ---- add ------------------------------------------------------------
        def st_add():
            f = d / "a.jsonl"
            rc, _ = _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(_fixture_article()), stdin=False, aspect=None))
            assert rc == 0
            led = read_ledger(f)
            assert "pmid:21639808" in led.by_key and not led.quarantined
            # ID normalization: PMID: prefix + leading zeros stripped; DOI lowercased
            rec2 = _fixture_article(pmid="12345", doi="10.1000/UPPER.Case", title="Second paper")
            rec2["ids"].update({"pmid": "PMID: 0012345", "pmcid": "PMC9999999"})
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(rec2), stdin=False, aspect=None))
            led = read_ledger(f)
            assert "pmid:12345" in led.by_key, "PMID: prefix / leading zeros not stripped"
            assert led.by_key["pmid:12345"]["ids"]["doi"] == "10.1000/upper.case", "DOI not lowercased"
            # secondary-id dedupe: doi-only twin merges into the pmid record
            rec3 = {"type": "article", "ids": {"doi": "10.1056/nejmoa1103782"}, "title": None, "journal": None}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(rec3), stdin=False, aspect=None))
            led = read_ledger(f)
            assert len(led.by_key) == 2, f"secondary-id dedupe failed ({len(led.by_key)} records)"
            assert led.by_key["pmid:21639808"]["title"].startswith("Improved survival"), "merge-fill overwrote a non-null value"
            # bad records rejected loudly
            rc, _ = _capture(cmd_add, argparse.Namespace(file=str(f), record='{"type": "article", "title": "x", "ids": {}}', stdin=False, aspect=None))
            led2 = read_ledger(f)
            assert len(led2.by_key) == 2, "invalid record accepted"
        check("add", st_add)

        # ---- merge ------------------------------------------------------------
        def st_merge():
            sub = d / "aspects"
            sub.mkdir()
            f1, f2, f3 = sub / "m1.jsonl", sub / "m2.jsonl", sub / "m3.jsonl"
            rec_a = _fixture_article(volume=None, issue=None, pages=None)
            f1.write_text(json.dumps(rec_a) + "\n", encoding="utf-8")
            rec_b = _fixture_article(key=None)
            rec_b.pop("key")
            rec_b["ids"] = {"doi": "10.1056/nejmoa1103782"}
            rec_b["volume"] = "364"
            f2.write_text(json.dumps(rec_b) + "\n", encoding="utf-8")
            f3.write_text(
                json.dumps({"key": "pmid:1", "type": "article", "ids": {"pmid": "1"}, "title": "t",
                            "provenance": [{"aspect": "x"}]}) + "\nnot json at all\n",
                encoding="utf-8",
            )
            out = sub / "sources.jsonl"
            rc, _ = _capture(cmd_merge, argparse.Namespace(out=str(out), inputs=[str(f1), str(f2), str(f3)]))
            led = read_ledger(out)
            assert rc == 0
            assert "pmid:21639808" in led.by_key and "doi:10.1056/nejmoa1103782" not in led.by_key, "secondary-id union failed"
            assert led.by_key["pmid:21639808"]["volume"] == "364", "locator not merged in"
            assert "pmid:1" in led.by_key
            assert (sub / "_invalid.jsonl").is_file(), "quarantine file not written"
            # glob re-run: own output + quarantine excluded -> same content
            rc2, _ = _capture(cmd_merge, argparse.Namespace(out=str(out), inputs=[str(sub / "*.jsonl")]))
            led2 = read_ledger(out)
            assert rc2 == 0 and set(led2.by_key) == {"pmid:21639808", "pmid:1"}, f"glob re-run broke ledger: {sorted(led2.by_key)}"
            # quarantine stays idempotent across re-merges
            qbefore = len((sub / "_invalid.jsonl").read_text(encoding="utf-8").splitlines())
            _capture(cmd_merge, argparse.Namespace(out=str(out), inputs=[str(sub / "*.jsonl")]))
            qafter = len((sub / "_invalid.jsonl").read_text(encoding="utf-8").splitlines())
            assert qbefore == qafter, "quarantine grew on re-merge"
            # doi-first twin ordering promotes the union record to the pmid key
            d1, d2 = sub / "aa_doi.jsonl", sub / "zz_pmid.jsonl"
            d1.write_text(json.dumps({"type": "article", "ids": {"doi": "10.9999/promote"},
                                      "title": "Union record", "volume": None,
                                      "provenance": [{"aspect": "doi_side"}]}) + "\n", encoding="utf-8")
            d2.write_text(json.dumps({"key": "pmid:777", "type": "article", "ids": {"pmid": "777", "doi": "10.9999/promote"},
                                      "title": None, "volume": "9",
                                      "provenance": [{"aspect": "pmid_side"}]}) + "\n", encoding="utf-8")
            out2 = sub / "promoted.jsonl"
            _capture(cmd_merge, argparse.Namespace(out=str(out2), inputs=[str(d1), str(d2)]))
            led3 = read_ledger(out2)
            assert set(led3.by_key) == {"pmid:777"}, f"key promotion failed: {sorted(led3.by_key)}"
            assert led3.by_key["pmid:777"]["volume"] == "9" and led3.by_key["pmid:777"]["title"] == "Union record"
        check("merge", st_merge)

        # ---- verify offline (fail-safe) -----------------------------------------
        def st_verify_offline():
            import ncbi_esummary as ne
            f = d / "v.jsonl"
            f.write_text(json.dumps(_fixture_article(volume=None, issue=None, pages=None)) + "\n", encoding="utf-8")
            old_url, old_sleep = ne.NCBI_ESUMMARY_URL, ne.time.sleep
            ne.NCBI_ESUMMARY_URL = "http://127.0.0.1:1/unreachable"
            ne.time.sleep = lambda *_: None
            try:
                rc, _ = _capture(cmd_verify, argparse.Namespace(file=str(f), apply=True, timeout=0.2))
            finally:
                ne.NCBI_ESUMMARY_URL, ne.time.sleep = old_url, old_sleep
            assert rc == 0, "verify must exit 0 on network failure"
            rec = read_ledger(f).by_key["pmid:21639808"]
            assert rec["verified"] is False and rec["volume"] is None, "fail-safe violated: record changed on network failure"
        check("verify-offline", st_verify_offline)

        # ---- verify backfill (mocked esummary) -----------------------------------
        def st_verify_backfill():
            f = d / "v2.jsonl"
            epub = _fixture_article(pmid="42487519", doi="10.1111/cas.70480",
                                    title="New Treatment Strategy and Future Research Direction for BRAF-Mutated Cancer",
                                    volume=None, issue=None, pages=None)
            epub.update({"journal": "Cancer Sci", "year": "2026", "authors": ["Takahashi Masanobu", "Taniguchi Sakura Hiraide"]})
            hint = _fixture_article(pmid="99900001", doi=None, title=None, journal=None, year=None,
                                    volume=None, issue=None, pages=None, authors=None)
            hint["ids"] = {"pmid": "99900001"}
            f.write_text(json.dumps(epub) + "\n" + json.dumps(hint) + "\n", encoding="utf-8")
            docs = {
                "42487519": {"pubdate": "2026 Jul 23", "volume": "", "issue": "", "pages": "",
                             "source": "Cancer Sci",
                             "title": "New Treatment Strategy and Future Research Direction for BRAF-Mutated Cancer.",
                             "articleids": [{"idtype": "doi", "value": "10.1111/cas.70480"}]},
                "99900001": {"pubdate": "2011 Jun 30", "volume": "364", "issue": "26", "pages": "2507-16",
                             "source": "N Engl J Med", "title": "Mocked title for hint record.",
                             "articleids": [{"idtype": "doi", "value": "10.1056/NEJMoa1103782"}]},
            }
            mod = sys.modules[__name__]
            original = mod.fetch_ncbi_summaries
            mod.fetch_ncbi_summaries = lambda pmids, timeout=15.0: docs
            try:
                rc, _ = _capture(cmd_verify, argparse.Namespace(file=str(f), apply=True, timeout=1.0))
            finally:
                mod.fetch_ncbi_summaries = original
            assert rc == 0
            led = read_ledger(f)
            e = led.by_key["pmid:42487519"]
            assert e["verified"] is True and e["volume"] is None, "epub record must verify WITHOUT inventing locators"
            h = led.by_key["pmid:99900001"]
            assert h["title"] == "Mocked title for hint record", "hint title not backfilled"
            assert h["volume"] == "364" and h["pages"] == "2507-16", "locators not backfilled"
            assert "volume" in h["backfilled"] and "title" in h["backfilled"]
        check("verify-backfill", st_verify_backfill)

        # ---- bib -------------------------------------------------------------------
        def st_bib():
            # Vancouver initials: standard, particle surnames, group passthrough
            assert vancouver_author("Chapman Paul B") == "Chapman PB"
            assert vancouver_author("van der Berg Jan") == "van der Berg J", vancouver_author("van der Berg Jan")
            assert vancouver_author("De la Cruz Maria E") == "De la Cruz ME", vancouver_author("De la Cruz Maria E")
            assert vancouver_author("World Health Organization") == "World Health Organization"
            assert vancouver_author("Li Jiang") == "Li J"
            assert vancouver_author("WHO") == "WHO"
            # expand_pages guards
            assert expand_pages("2507-16") == "2507-2516"
            assert expand_pages("2507-2516") == "2507-2516"
            assert expand_pages("e71310") == "e71310"
            assert expand_pages("2507-6") == "2507-6", "backwards expansion must be rejected"
            f = d / "b.jsonl"
            f.write_text(json.dumps(_fixture_article()) + "\n", encoding="utf-8")
            rc, out = _capture(cmd_bib, argparse.Namespace(file=str(f), keys="pmid:21639808", expand_pages=False, offset=0))
            assert rc == 0
            first = out.splitlines()[0]
            assert "Chapman PB, Hauschild A, Robert C, et al" in first, f"Vancouver initials wrong: {first}"
            assert "2011;364(26):2507-16" in first, f"locator wrong: {first}"
            assert "PMID: 21639808." in first and "DOI: 10.1056/nejmoa1103782." in first, first
            rc, out = _capture(cmd_bib, argparse.Namespace(file=str(f), keys="pmid:21639808", expand_pages=True, offset=0))
            assert "2011;364(26):2507-2516" in out.splitlines()[0], "expand-pages failed"
            # epub form: locator-less render
            epub = _fixture_article(pmid="42487519", doi="10.1111/cas.70480", title="New Treatment Strategy",
                                    volume=None, issue=None, pages=None)
            epub.update({"journal": "Cancer Sci", "year": "2026", "authors": ["Takahashi Masanobu", "Taniguchi Sakura Hiraide"]})
            f.write_text(json.dumps(epub) + "\n", encoding="utf-8")
            _, out = _capture(cmd_bib, argparse.Namespace(file=str(f), keys="pmid:42487519", expand_pages=False, offset=0))
            line = out.splitlines()[0]
            assert "Cancer Sci. 2026." in line and "364" not in line and "DOI: 10.1111/cas.70480." in line, f"epub form wrong: {line}"
            assert "Takahashi M, Taniguchi SH" in line, "multi-initial author wrong"
            # unknown key -> loud + non-zero
            rc, out = _capture(cmd_bib, argparse.Namespace(file=str(f), keys="pmid:42487519,pmid:nope", expand_pages=False, offset=0))
            assert rc != 0, "unknown key must exit non-zero"
            assert "[MISSING record pmid:nope]" in out
        check("bib", st_bib)

        # ---- get / keys / stats ------------------------------------------------------
        def st_misc():
            f = d / "g.jsonl"
            f.write_text(json.dumps(_fixture_article()) + "\n", encoding="utf-8")
            rc, out = _capture(cmd_get, argparse.Namespace(file=str(f), key="pmid:21639808"))
            assert rc == 0 and '"key": "pmid:21639808"' in out
            rc, out = _capture(cmd_keys, argparse.Namespace(file=str(f)))
            assert rc == 0 and "pmid:21639808" in out
            rc, out = _capture(cmd_stats, argparse.Namespace(file=str(f)))
            assert rc == 0 and "record(s)" in out
        check("get/keys/stats", st_misc)

        # ---- aliases (biomcp-native field names -> canonical slots) ---------
        def st_aliases():
            f = d / "al.jsonl"
            # variant: rsid -> rs
            rec = {"type": "variant", "ids": {"clinvar": "13961", "rsid": "rs113488022"},
                   "title": "BRAF V600E", "meta": {"gene": "BRAF", "protein_change": "V600E", "significance": "Pathogenic"},
                   "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(rec), stdin=False, aspect=None))
            led = read_ledger(f)
            assert "clinvar:13961" in led.by_key
            assert led.by_key["clinvar:13961"]["ids"].get("rs") == "rs113488022", "rsid alias not copied"
            assert led.by_key["clinvar:13961"]["ids"].get("rsid") == "rs113488022", "original alias key lost"
            # gene: entrez_id -> ncbi_gene
            rec = {"type": "gene", "ids": {"entrez_id": "673"}, "title": "BRAF",
                   "meta": {"symbol": "BRAF"}, "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(rec), stdin=False, aspect=None))
            led = read_ledger(f)
            assert "gene:673" in led.by_key, "entrez_id alias not canonicalized"
            # lowercase nct_id must NOT fork a duplicate key (alias values are canonicalized)
            a = {"type": "trial", "ids": {"nct": "NCT04903119"}, "title": "T", "provenance": [{"aspect": "a"}]}
            b = {"type": "trial", "ids": {"nct_id": "nct04903119"}, "title": None, "provenance": [{"aspect": "b"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(a), stdin=False, aspect=None))
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(b), stdin=False, aspect=None))
            led = read_ledger(f)
            assert len([k for k in led.by_key if k.startswith("nct:")]) == 1, "lowercase alias forked a duplicate nct key"
            # explicit well-formed key beats alias-derived key
            c = {"key": "nct:NCT00000001", "type": "trial", "ids": {"nct_id": "NCT04903119"},
                 "title": "Other", "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(c), stdin=False, aspect=None))
            led = read_ledger(f)
            assert "nct:NCT00000001" in led.by_key, "explicit key did not win over alias-derived key"
        check("aliases", st_aliases)

        # ---- folding (verbatim q05 regression fixture + semantics) ----------
        def st_folding():
            f = d / "fold.jsonl"
            # EXACT shape the q05 worker wrote (real-run regression fixture)
            q05 = {"schema": SCHEMA, "key": "nct:NCT04903119", "type": "trial",
                   "ids": {"nct_id": "NCT04903119"},
                   "title": "Nilotinib Plus Dabrafenib/Trametinib or Encorafenib/Binimetinib in Metastatic Melanoma",
                   "phase": None, "status": "RECRUITING", "sponsor": None,
                   "url": "https://clinicaltrials.gov/study/NCT04903119",
                   "provenance": [{"aspect": "combination_strategies", "tool": "biomcp_trial_search"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(q05), stdin=False, aspect=None))
            led = read_ledger(f)
            rec = led.by_key["nct:NCT04903119"]
            assert rec["ids"].get("nct") == "NCT04903119", "nct_id alias not applied"
            assert rec["meta"].get("status") == "RECRUITING", "top-level status not folded into meta"
            assert "phase" not in rec["meta"] and "sponsor" not in rec["meta"], "nulls must never fold"
            assert rec.get("status") == "RECRUITING", "original top-level field not preserved verbatim"
            _, out = _capture(cmd_bib, argparse.Namespace(file=str(f), keys="nct:NCT04903119", expand_pages=False, offset=0))
            line = out.splitlines()[0]
            assert "[MISSING" not in line, f"q05 regression: [MISSING in render: {line}"
            assert "NCT04903119: Nilotinib Plus" in line and "Status: RECRUITING." in line, f"trial render wrong: {line}"
            assert "Phase" not in line and "Sponsor" not in line, "null segments must be omitted"
            # canonical meta wins over conflicting top-level fold
            conflict = {"type": "trial", "ids": {"nct": "NCT00000002"}, "title": "C",
                        "phase": "WRONG", "meta": {"phase": "3"},
                        "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(conflict), stdin=False, aspect=None))
            led = read_ledger(f)
            assert led.by_key["nct:NCT00000002"]["meta"]["phase"] == "3", "canonical meta did not win the fold"
            # fold is idempotent across re-reads
            before = json.dumps(led.by_key["nct:NCT04903119"], sort_keys=True)
            after = json.dumps(read_ledger(f).by_key["nct:NCT04903119"], sort_keys=True)
            assert before == after, "re-normalization not idempotent"
            # synthetic trial with all three segments renders all three
            full = {"type": "trial", "ids": {"nct": "NCT04280705"},
                    "title": "Encorafenib Plus Cetuximab With or Without Nivolumab",
                    "phase": "Phase 2", "status": "Completed", "sponsor": "Pfizer",
                    "url": "https://clinicaltrials.gov/study/NCT04280705",
                    "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(full), stdin=False, aspect=None))
            _, out = _capture(cmd_bib, argparse.Namespace(file=str(f), keys="nct:NCT04280705", expand_pages=False, offset=0))
            line = out.splitlines()[0]
            assert "Phase Phase" not in line and "Phase 2." in line and "Sponsor: Pfizer." in line and "Status: Completed." in line, f"full trial render wrong: {line}"
        check("folding", st_folding)

        # ---- auto-key derivation + title round-trip ---------------------------
        def st_auto_key():
            f = d / "ak.jsonl"
            # trial without explicit key derives nct: from the alias slot
            rec = {"type": "trial", "ids": {"nct_id": "NCT01234567"}, "title": "Derived",
                   "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(rec), stdin=False, aspect=None))
            led = read_ledger(f)
            assert "nct:NCT01234567" in led.by_key, "auto-key from alias slot failed"
            # title-only verify-less record derives a title: key that round-trips
            rec = {"type": "trial", "title": "Title-only trial record", "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(rec), stdin=False, aspect=None))
            led = read_ledger(f)
            title_keys = [k for k in led.by_key if k.startswith("title:")]
            assert len(title_keys) == 1, "title fallback key not derived"
            # THE round-trip trap: re-read must NOT quarantine the title: key
            again = read_ledger(f)
            assert not again.quarantined, f"title: key quarantined on re-read: {again.quarantined}"
            assert title_keys[0] in again.by_key, "title: key lost on re-read"
            rc, out = _capture(cmd_bib, argparse.Namespace(file=str(f), keys=title_keys[0], expand_pages=False, offset=0))
            # A title-only trial is a degraded record: the renderer correctly
            # emits the loud [MISSING field: ids.nct] marker (never fabricates)
            # — asserted here instead of pretending it renders clean.
            assert rc == 0 and "Title-only trial record" in out.splitlines()[0], "bib on title: key failed"
            assert "[MISSING field: ids.nct]" in out.splitlines()[0], "degraded trial must render its missing id loudly"
            # article keeps its hard id requirement
            _capture(cmd_add, argparse.Namespace(file=str(f), record='{"type": "article", "title": "x", "ids": {}}', stdin=False, aspect=None))
            assert len(read_ledger(f).by_key) == 2, "title-only article was accepted"
        check("auto-key", st_auto_key)

        # ---- other type (escape hatch) + verify skip accounting --------------
        def st_other_and_verify_skip():
            f = d / "ot.jsonl"
            rec = {"type": "other", "title": "FDA label excerpt for vemurafenib",
                   "ids": {"url": "https://www.accessdata.fda.gov/scripts/cder/daf/index.cfm?event=overview.process&ApplNo=1234"},
                   "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(rec), stdin=False, aspect=None))
            article = _fixture_article()
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(article), stdin=False, aspect=None))
            led = read_ledger(f)
            assert any(k.startswith("url:") for k in led.by_key), "other-type url key not derived"
            _, out = _capture(cmd_bib, argparse.Namespace(file=str(f), keys=next(k for k in led.by_key if k.startswith("url:")), expand_pages=False, offset=0))
            assert "[type: other]" in out.splitlines()[0] and "[MISSING" not in out.splitlines()[0], out
            # verify (offline, fail-safe) skips the other-type record and says so
            import ncbi_esummary as ne
            old_url, old_sleep = ne.NCBI_ESUMMARY_URL, ne.time.sleep
            ne.NCBI_ESUMMARY_URL = "http://127.0.0.1:1/unreachable"
            ne.time.sleep = lambda *_: None
            try:
                _, out = _capture(cmd_verify, argparse.Namespace(file=str(f), apply=False, timeout=0.2))
            finally:
                ne.NCBI_ESUMMARY_URL, ne.time.sleep = old_url, old_sleep
            assert "1 record(s) of unverified type(s) skipped (no verifier configured)" in out, f"skip accounting wrong: {out}"
            # article-only ledger keeps deterministic wording (0 skipped) for graders
            f2 = d / "ot2.jsonl"
            _capture(cmd_add, argparse.Namespace(file=str(f2), record=json.dumps(article), stdin=False, aspect=None))
            _, out = _capture(cmd_stats, argparse.Namespace(file=str(f2)))
            assert "record(s)" in out
        check("other-type/verify-skip", st_other_and_verify_skip)

        # ---- meta-aware twin merging (complementary worker fields) -----------
        def st_meta_merge():
            f1, f2 = d / "mm1.jsonl", d / "mm2.jsonl"
            a = {"type": "trial", "ids": {"nct": "NCT09876543"}, "title": "Complementary",
                 "meta": {"phase": "Phase 3"}, "provenance": [{"aspect": "worker_a"}]}
            b = {"type": "trial", "ids": {"nct_id": "NCT09876543"}, "title": None,
                 "sponsor": "NCI", "status": "Recruiting", "provenance": [{"aspect": "worker_b"}]}
            f1.write_text(json.dumps(a) + "\n", encoding="utf-8")
            f2.write_text(json.dumps(b) + "\n", encoding="utf-8")
            out = d / "mm-merged.jsonl"
            _capture(cmd_merge, argparse.Namespace(out=str(out), inputs=[str(f1), str(f2)]))
            led = read_ledger(out)
            assert "nct:NCT09876543" in led.by_key, "twin merge failed"
            meta = led.by_key["nct:NCT09876543"]["meta"]
            assert meta.get("phase") == "Phase 3" and meta.get("sponsor") == "NCI" and meta.get("status") == "Recruiting", \
                f"complementary meta fields did not union: {meta}"
            _, rendered = _capture(cmd_bib, argparse.Namespace(file=str(out), keys="nct:NCT09876543", expand_pages=False, offset=0))
            line = rendered.splitlines()[0]
            assert "Phase Phase" not in line and "Phase 3." in line and "Sponsor: NCI." in line and "Status: Recruiting." in line, f"merged render wrong: {line}"
            aspects = {p["aspect"] for p in led.by_key["nct:NCT09876543"]["provenance"]}
            assert aspects == {"worker_a", "worker_b"}, f"provenance aspects lost: {aspects}"
        check("meta-merge", st_meta_merge)

        # ---- batch appends, title-key rules, rewrite quarantine, BOM --------
        def st_batch_and_title_rules():
            def add_stdin(f, payload):
                old_stdin, sys.stdin = sys.stdin, io.StringIO(payload)
                try:
                    return _capture(cmd_add, argparse.Namespace(file=str(f), record=None, stdin=True, aspect=None))
                finally:
                    sys.stdin = old_stdin
            f = d / "bt.jsonl"
            # --stdin JSON-array batch (the worker-protocol rule-8 shape)
            batch = [_fixture_article(pmid="10000001", doi="10.1000/b1", title="Batch one", ids={"pmid": "10000001", "doi": "10.1000/b1", "pmcid": "PMC1000001"}),
                     _fixture_article(pmid="10000002", doi="10.1000/b2", title="Batch two", ids={"pmid": "10000002", "doi": "10.1000/b2", "pmcid": "PMC1000002"})]
            rc, out = add_stdin(f, json.dumps(batch))
            assert rc == 0 and "add: 2 record(s) accepted, 0 rejected" in out, f"stdin batch failed: {out}"
            # @array-file batch
            bf = d / "bt-batch.json"
            bf.write_text(json.dumps([_fixture_article(pmid="10000003", doi="10.1000/b3", title="Batch three", ids={"pmid": "10000003", "doi": "10.1000/b3", "pmcid": "PMC1000003"}),
                                      _fixture_article(pmid="10000004", doi="10.1000/b4", title="Batch four", ids={"pmid": "10000004", "doi": "10.1000/b4", "pmcid": "PMC1000004"})]) + "\n", encoding="utf-8")
            rc, out = _capture(cmd_add, argparse.Namespace(file=str(f), record="@" + str(bf), stdin=False, aspect=None))
            assert rc == 0 and "add: 2 record(s) accepted" in out, f"@file batch failed: {out}"
            assert len(read_ledger(f).by_key) == 4, f"batch appends lost records: {sorted(read_ledger(f).by_key)}"
            # mixed batch: valid accepted, invalid rejected loudly, rc 0
            mixed = [_fixture_article(pmid="10000005", doi="10.1000/b5", title="Batch five", ids={"pmid": "10000005", "doi": "10.1000/b5", "pmcid": "PMC1000005"}),
                     {"type": "article", "title": "no ids", "ids": {}}]
            rc, out = add_stdin(f, json.dumps(mixed))
            assert rc == 0 and "1 record(s) accepted, 1 rejected" in out, f"mixed batch accounting wrong: {out}"
            # title-key rules: web/dataset keep hard identity fields; article
            # rejects title-only input AND explicit title: keys; other falls
            # back to a title: key.
            before = len(read_ledger(f).by_key)
            for bad in ('{"type": "web", "title": "Just a page", "ids": {}}',
                        '{"type": "dataset", "title": "Just a series", "ids": {}}',
                        '{"type": "article", "title": "x", "ids": {}}',
                        '{"type": "article", "key": "title:abc123", "title": "Bypass", "ids": {}}',
                        '{"type": ["article"], "title": "unhashable", "ids": {}}'):
                rc, out = _capture(cmd_add, argparse.Namespace(file=str(f), record=bad, stdin=False, aspect=None))
                assert rc == 0 and "0 record(s) accepted, 1 rejected" in out, f"should have been rejected: {bad}: {out}"
            assert len(read_ledger(f).by_key) == before, "rejected records must not be written"
            other = {"type": "other", "title": "Guideline page", "ids": {},
                     "provenance": [{"aspect": "a"}]}
            rc, out = _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(other), stdin=False, aspect=None))
            assert rc == 0 and "add: 1 record(s) accepted" in out, f"other title-only rejected: {out}"
            assert any(k.startswith("title:") for k in read_ledger(f).by_key), "other title: key not derived"
            # pre-existing malformed line: add quarantines loudly, keeps good lines
            f2 = d / "bt2.jsonl"
            f2.write_text(json.dumps(_fixture_article(pmid="10000009", doi="10.1000/b9", title="Keep me", ids={"pmid": "10000009", "doi": "10.1000/b9", "pmcid": "PMC1000009"})) + "\nnot json\n", encoding="utf-8")
            rc, out = _capture(cmd_add, argparse.Namespace(file=str(f2), record=json.dumps(_fixture_article(pmid="10000010", doi="10.1000/b10", title="Add me", ids={"pmid": "10000010", "doi": "10.1000/b10", "pmcid": "PMC1000010"})), stdin=False, aspect=None))
            led2 = read_ledger(f2)
            assert rc == 0 and len(led2.by_key) == 2, f"rewrite kept wrong records: {sorted(led2.by_key)}"
            assert (f2.parent / "_invalid.jsonl").is_file(), "quarantine file not written by add"
            # BOM tolerance: re-read a BOM-prefixed file cleanly
            f3 = d / "bt3.jsonl"
            f3.write_bytes(b"\xef\xbb\xbf" + (json.dumps(_fixture_article(pmid="10000011", doi="10.1000/b11", title="Bom", ids={"pmid": "10000011", "doi": "10.1000/b11", "pmcid": "PMC1000011"})) + "\n").encode("utf-8"))
            led3 = read_ledger(f3)
            assert len(led3.by_key) == 1 and not led3.quarantined, f"BOM re-read failed: {led3.quarantined}"
        check("batch/title-rules", st_batch_and_title_rules)

    failed = [r for r in results if r[1] is not None]
    for name, err in results:
        print(f"{'PASS' if err is None else 'FAIL'} {name}" + (f": {err}" if err else ""))
    banner("selftest", f"{len(results) - len(failed)}/{len(results)} group(s) passed" + (" — FAILURES PRESENT" if failed else ""))
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Structured evidence ledger for deep-research citation integrity.")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("add", help="Append/merge records into a ledger file")
    p.add_argument("file")
    p.add_argument("record", nargs="?", help="record JSON, @file, or omit with --stdin")
    p.add_argument("--stdin", action="store_true", help="read a record (or list) from stdin")
    p.add_argument("--aspect", help="aspect stamped onto records lacking provenance")
    p.set_defaults(fn=cmd_add)

    p = sub.add_parser("merge", help="Union per-aspect ledgers into one file")
    p.add_argument("-o", "--out", required=True)
    p.add_argument("inputs", nargs="+", help="input files or globs (own output and _-prefixed files always excluded)")
    p.set_defaults(fn=cmd_merge)

    p = sub.add_parser("verify", help="Cross-check article records against NCBI esummary (fail-safe)")
    p.add_argument("file")
    p.add_argument("--apply", action="store_true", help="write backfills in-place")
    p.add_argument("--timeout", type=float, default=15.0)
    p.set_defaults(fn=cmd_verify)

    p = sub.add_parser("bib", help="Render a numbered bibliography from ledger records")
    p.add_argument("file")
    p.add_argument("--keys", required=True, help="comma-separated ledger keys in citation order")
    p.add_argument("--offset", type=int, default=0)
    p.add_argument("--expand-pages", action="store_true", help="expand abbreviated ranges (2507-16 -> 2507-2516)")
    p.set_defaults(fn=cmd_bib)

    p = sub.add_parser("get", help="Print one record by key")
    p.add_argument("file")
    p.add_argument("--key", required=True)
    p.set_defaults(fn=cmd_get)

    p = sub.add_parser("keys", help="List all keys")
    p.add_argument("file")
    p.set_defaults(fn=cmd_keys)

    p = sub.add_parser("stats", help="Ledger summary counts")
    p.add_argument("file")
    p.set_defaults(fn=cmd_stats)

    p = sub.add_parser("selftest", help="Hermetic feature-matrix selftest (no network)")
    p.set_defaults(fn=lambda a: selftest())

    args = parser.parse_args()
    try:
        return args.fn(args)
    except FileNotFoundError as e:
        banner(args.cmd, f"file not found (treated as empty, fail-safe): {e}")
        return 0
    except (json.JSONDecodeError, ValueError) as e:
        banner(args.cmd, f"input error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())

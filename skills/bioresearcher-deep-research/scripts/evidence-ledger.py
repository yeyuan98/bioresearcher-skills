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
- render is the single numbering authority: drafts cite [@key] markers; render
  assigns numbers by first appearance, rewrites the markers, and appends the
  References section from the ledger. Any unresolved key or [MISSING ...] entry
  fails the render (exit 1) WITHOUT writing the output file.
- check validates a ledger end-to-end (exit 1 on quarantined lines; with
  --markers also on unresolved/mixed [@key] markers in the given markdown
  files - exit 1 iff anything this invocation validated failed).
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
    "pmid", "doi", "pmcid", "nct", "patent", "geo", "sra", "gb", "pdb",
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
    "pdb_id": "pdb",                      # biomcp pdb
    "rcsb_id": "pdb",
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
    "dataset": ["method", "experimental_method", "resolution"],
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
    if key in ("pmcid", "nct", "patent", "pdb"):
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
    if title is None and rtype != "article":
        # biomcp record shapes often carry `name` instead of `title` (drugs,
        # genes, diseases): fold it fill-only so bibliographies never render
        # [MISSING field: title] for schema-shaped records. Articles keep
        # their hard id requirement (a name-only article must not verify-gate).
        name = raw.get("name")
        if isinstance(name, str) and name.strip():
            title = name.strip()
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
    if ids.get("pdb"):
        return f"pdb:{ids['pdb'].upper()}"
    for k, v in ids.items():
        if (k or "").lower() in ("pdb", "pdb_id"):
            return f"pdb:{str(v).upper()}"
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
    raise ValueError("dataset record needs a pdb, geo (GSE/GDS), sra (SRR/SRP), or genbank accession id")


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

def _parse_payload(text: str) -> list:
    """Parse JSON array, single JSON object, or newline-delimited JSON (.jsonl).
    Strips optional markdown code fences, leading UTF-8 BOM, and blank lines."""
    text = (text or "").lstrip("\ufeff")
    lines = text.strip().splitlines()
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip().startswith("```"):
        lines = lines[:-1]
    cleaned = "\n".join(lines).strip()
    if not cleaned:
        raise ValueError("empty record input payload")
    try:
        payload = json.loads(cleaned)
        return payload if isinstance(payload, list) else [payload]
    except json.JSONDecodeError:
        records = []
        for line_no, line in enumerate(cleaned.splitlines(), start=1):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as e:
                raise ValueError(f"malformed JSON at line {line_no}: {e}") from e
            if isinstance(item, list):
                records.extend(item)
            else:
                records.append(item)
        return records


def _parse_incoming(args) -> list:
    if args.stdin:
        return _parse_payload(sys.stdin.read())
    if getattr(args, "record", None) is None:
        raise ValueError("provide a record JSON, @file, or --stdin")
    if args.record.startswith("@"):
        return _parse_payload(Path(args.record[1:]).read_text(encoding="utf-8-sig"))
    return _parse_payload(args.record)


def cmd_add(args) -> int:
    path = Path(args.file)
    led = read_ledger(path)
    # add rewrites the file: pre-existing malformed lines would be silently
    # dropped — quarantine them loudly instead (same file merge uses).
    if led.quarantined:
        qpath = append_quarantine(path, led.quarantined)
        warn(f"{len(led.quarantined)} pre-existing malformed line(s) quarantined to {qpath} (excluded from rewrite)")
    accepted = rejected = 0
    derived_keys: list = []
    for raw in _parse_incoming(args):
        try:
            rec = normalize_record(raw, require_provenance_aspect=args.aspect)
        except (ValueError, TypeError) as e:
            rejected += 1
            warn(f"rejected record ({e}): {json.dumps(raw, ensure_ascii=False)[:200]}")
            continue
        led.upsert(rec)
        derived_keys.append(rec["key"])
        accepted += 1
    led.write(path)
    banner("add", f"{accepted} record(s) accepted, {rejected} rejected -> {path}")
    if derived_keys:
        # Echo the derived canonical keys so workers cite exactly what the
        # ledger keyed (dataset/alias-derived keys are otherwise guesswork).
        banner("add", f"derived keys: {', '.join(derived_keys)}")
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


def _token_overlap(t1: str, t2: str) -> float:
    toks1 = set(re.findall(r"[a-z0-9]{3,}", (t1 or "").lower()))
    toks2 = set(re.findall(r"[a-z0-9]{3,}", (t2 or "").lower()))
    if not toks1 or not toks2:
        return 1.0
    return len(toks1 & toks2) / min(len(toks1), len(toks2))


def _esummary_locator(doc: dict) -> dict:
    m = re.search(r"\b(19\d\d|20\d\d)\b", str(doc.get("pubdate", "")))
    year = m.group(1) if m else str(doc.get("sortpubdate") or "")[:4]
    pages = str(doc.get("pages", "")).strip() or None
    if not pages:
        eloc = str(doc.get("elocationid", "")).strip()
        if eloc and not eloc.lower().startswith("doi:"):
            pages = re.sub(r"^(?:pii|articleno|article):\s*", "", eloc, flags=re.IGNORECASE) or None
    return {
        "year": year or None,
        "volume": str(doc.get("volume", "")).strip() or None,
        "issue": str(doc.get("issue", "")).strip() or None,
        "pages": pages,
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


def _esummary_authors(doc: dict) -> list:
    out = []
    for a in doc.get("authors", []) or []:
        if isinstance(a, dict) and a.get("name"):
            out.append(str(a["name"]).strip())
    return out


def cmd_verify(args) -> int:
    path = Path(args.file)
    led = read_ledger(path)
    verifiable = {t for t, spec in TYPE_SPECS.items() if spec.get("verify")}
    pmids = sorted({r["ids"]["pmid"] for r in led.records()
                    if r.get("type") in verifiable and (r.get("ids") or {}).get("pmid") and not r.get("verified")})
    docs = fetch_ncbi_summaries(pmids, timeout=args.timeout) if pmids else {}
    now = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    filled = title_fixed = clean = unreachable = mismatches = 0
    already = sum(1 for r in led.records()
                  if r.get("type") in verifiable and (r.get("ids") or {}).get("pmid") and r.get("verified"))
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

        # Conflict detection
        mismatch_reasons = []
        ncbi_title = _esummary_title(doc)
        if rec.get("title") and ncbi_title and len(ncbi_title) > 20:
            overlap = _token_overlap(rec["title"], ncbi_title)
            if overlap < 0.30:
                mismatch_reasons.append(f"title overlap {overlap:.2f} < 0.30")

        ncbi_doi = _esummary_doi(doc)
        rec_doi = (rec.get("ids") or {}).get("doi")
        if rec_doi and ncbi_doi:
            if rec_doi.lower().rstrip(".") != ncbi_doi.lower().rstrip("."):
                mismatch_reasons.append(f"doi conflict ({rec_doi} vs {ncbi_doi})")

        if mismatch_reasons:
            rec["verified"] = False
            rec["verification_notes"] = f"mismatch: {'; '.join(mismatch_reasons)}"
            warn(f"pmid:{pmid} metadata mismatch: {'; '.join(mismatch_reasons)}. Record left unverified.")
            mismatches += 1
            continue

        changed = False
        loc = _esummary_locator(doc)
        for field in ("year", "volume", "issue", "pages"):
            if rec.get(field) in (None, "") and loc[field]:
                rec[field] = loc[field]
                rec["backfilled"].append(field)
                changed = True
        if not (rec.get("ids") or {}).get("doi"):
            if ncbi_doi:
                rec["ids"]["doi"] = ncbi_doi
                rec["backfilled"].append("doi")
                changed = True
        if not rec.get("journal"):
            j = str(doc.get("source", "")).strip()
            if j:
                rec["journal"] = j
                rec["backfilled"].append("journal")
                changed = True
        if not rec.get("title"):
            if ncbi_title:
                rec["title"] = ncbi_title
                rec["title_original"] = None
                rec["backfilled"].append("title")
                changed = True
                title_fixed += 1
        if not rec.get("authors"):
            es_authors = _esummary_authors(doc)
            if es_authors:
                rec["authors"] = es_authors
                rec["backfilled"].append("authors")
                changed = True
        rec["verified"] = True
        rec["verified_source"] = "ncbi-esummary"
        rec["verified_at"] = now
        rec.pop("verification_notes", None)
        if changed:
            filled += 1
        else:
            clean += 1
    if args.apply:
        led.write(path)
        if led.quarantined:
            qpath = append_quarantine(path, led.quarantined)
            warn(f"{len(led.quarantined)} pre-existing malformed line(s) quarantined to {qpath} (excluded from rewrite)")
    mismatch_note = f", {mismatches} metadata mismatch(es) (unverified)" if mismatches else ""
    banner(
        "verify",
        f"{len(docs)} PubMed record(s) checked; {filled} backfilled, {title_fixed} title(s) set, "
        f"{clean} verified clean{mismatch_note}, {unreachable} unreachable (fail-safe, left unverified); "
        f"{skipped} record(s) of unverified type(s) skipped (no verifier configured)"
        + (f"; {already} already verified (not rechecked)" if already else "")
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
    surname = surname.rstrip(",")
    # Handle generational suffixes (Jr, Sr, 2nd, 3rd, II, III, IV)
    suffix = ""
    if given and given[-1].lower() in {"jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "2nd", "3rd"}:
        suffix = " " + given[-1].rstrip(".")
        given = given[:-1]
    cleaned_given = [t.replace(".", "") for t in given if t]
    # Idempotency guard: if given is already uppercase initials (e.g. ["PB"], ["J.W."], ["SH"])
    if len(cleaned_given) == 1 and cleaned_given[0].isupper() and cleaned_given[0].isalpha() and len(cleaned_given[0]) <= 4:
        initials = cleaned_given[0]
    else:
        initials = "".join(t[0].upper() for t in given if t and t[0].isalpha())
    res = f"{surname} {initials}" if initials else surname
    return f"{res}{suffix}"


def _author_list(rec: dict, max_authors: int = 3) -> str:
    authors = [a for a in (rec.get("authors") or []) if str(a).strip()]
    if not authors:
        return "[MISSING field: authors]"
    out = ", ".join(filter(None, (vancouver_author(str(a)) for a in authors[:max_authors])))
    if len(authors) > max_authors:
        out += ", et al."
    else:
        out = _close_segment(out)
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


def _close_segment(s: str) -> str:
    """Ensure a metadata segment terminates with exactly one period, stripping any
    pre-existing trailing period or whitespace (e.g. 'Tesaro, Inc.' -> 'Tesaro, Inc.')."""
    if not s:
        return ""
    stripped = str(s).strip()
    if not stripped:
        return ""
    return stripped.rstrip(".") + "."


def _close_title(v) -> str:
    """Render a title and close with a single period (registry titles often
    already end with one - never emit 'Title..')."""
    if v in (None, ""):
        return f"[MISSING field: title]"
    return _close(str(v).strip().rstrip("."))


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
    out = f"{nct}: {_close_title(rec.get('title'))}"
    phase = str(meta.get("phase") or "").strip().rstrip(".")
    if phase:
        # Workers copy phase verbatim from biomcp/CTgov ("Phase 2", "PHASE3",
        # "2"): never double the prefix.
        out += f" {phase}." if phase.lower().startswith("phase") else f" Phase {phase}."
    if meta.get("sponsor"):
        out += f" Sponsor: {_close_segment(meta['sponsor'])}"
    if meta.get("status"):
        out += f" Status: {_close_segment(meta['status'])}"
    out += " " + (rec.get("url") or f"https://clinicaltrials.gov/study/{nct}")
    return out


def render_patent(rec: dict) -> str:
    ids = rec.get("ids") or {}
    meta = rec.get("meta") or {}
    num = ids.get("patent") or "[MISSING field: ids.patent]"
    assignee = (meta.get("assignee") or "").strip()
    assignee_str = f"{_close_segment(assignee)} " if assignee else "[MISSING field: meta.assignee]. "
    status = f" ({meta['status']})" if meta.get("status") else ""
    url = rec.get("url") or f"https://patents.google.com/patent/{num}"
    return f"{assignee_str}{_close_title(rec.get('title'))} {num}{status}. {url}"


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
    return f"{_close_title(rec.get('title'))}{ind} {dbid}. {url}".strip()


def render_disease(rec: dict) -> str:
    ids = rec.get("ids") or {}
    oid = next((f"{k.upper()}:{ids[k]}" for k in ("mondo", "doid", "omim", "efo") if ids.get(k)),
               "[MISSING field: ids.mondo|doid|omim|efo]")
    return f"{_close_title(rec.get('title'))} {oid}. {rec.get('url') or ''}".strip()


def render_dataset(rec: dict) -> str:
    ids = rec.get("ids") or {}
    key = rec.get("key", "")
    title = _need(rec, "title").strip().rstrip(".")
    if key.startswith("pdb:"):
        acc = ids.get("pdb") or key[len("pdb:"):]
        meta = rec.get("meta") or {}
        extras = []
        method = meta.get("method") or meta.get("experimental_method")
        if method:
            extras.append(f"[{method}]")
        if meta.get("resolution"):
            extras.append(f"Resolution: {meta['resolution']}.")
        extra_str = f" {' '.join(extras)}" if extras else ""
        return f"PDB structure {acc}: {title}.{extra_str} https://www.rcsb.org/structure/{acc}"
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
    updated = f" Updated {_close_segment(meta['updated'])}" if meta.get("updated") else ""
    url = rec.get("url") or (rec.get("ids") or {}).get("url") or "[MISSING field: url]"
    accessed = meta.get("accessed") or "[MISSING field: meta.accessed]"
    org = (meta.get("organization") or "").strip()
    org_str = f" {_close_segment(org)}" if org else " [MISSING field: meta.organization]."
    return f"{_close_title(rec.get('title'))}{org_str}{updated} {url}. Accessed: {accessed}."


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
# Cite-key rendering (draft -> numbered report; the single numbering authority)
# ---------------------------------------------------------------------------

# A cite-key marker: [@ns:value] or [@a; @b]. A bracket is a citation group
# only if EVERY non-empty token is a recognized namespace with a shape-valid
# value; anything else (prose [@home], pandoc [@Chapman2011], [@gene:BRAF]
# symbols) passes through verbatim.
MARKER_RE = re.compile(r"\[@([^\[\]]+)\]")

# Canonical value shapes per key namespace (see KEY_NAMESPACES). Namespaces
# without an entry accept any non-empty value.
NS_VALUE_SHAPES = {
    "pmid": re.compile(r"^\d+$"),
    "doi": re.compile(r"^10\.\S+$", re.IGNORECASE),
    "pmcid": re.compile(r"^PMC\d+$", re.IGNORECASE),
    "nct": re.compile(r"^NCT\d+$", re.IGNORECASE),
    "patent": re.compile(r"^[A-Z]{2}\d+", re.IGNORECASE),
    "geo": re.compile(r"^GS[ED]\d+$", re.IGNORECASE),
    "sra": re.compile(r"^SR[RP]\d+$", re.IGNORECASE),
    "gb": re.compile(r"^[A-Z]{2,}\d+(\.\d+)?$", re.IGNORECASE),
    "pdb": re.compile(r"^[0-9][a-z0-9]{3}$", re.IGNORECASE),
    "gene": re.compile(r"^\d+$"),
    "clinvar": re.compile(r"^\d+$"),
    "chembl": re.compile(r"^CHEMBL\d+$", re.IGNORECASE),
    "chebi": re.compile(r"^CHEBI[:_ ]?\d+$", re.IGNORECASE),
    "unii": re.compile(r"^[A-Z0-9]{4,10}$", re.IGNORECASE),
    "mondo": re.compile(r"^MONDO[:_ ]?\d+$", re.IGNORECASE),
    "doid": re.compile(r"^DOID[:_ ]?\d+$", re.IGNORECASE),
    "omim": re.compile(r"^\d{5,7}$"),
    "efo": re.compile(r"^[A-Z]{2,}[_:]?\d+", re.IGNORECASE),
    "url": re.compile(r"^[0-9a-f]{16}$", re.IGNORECASE),
    "title": re.compile(r"^[0-9a-f]{16}$", re.IGNORECASE),
}

REFS_STRIP_RE = re.compile(
    r"(?ims)^#{1,6}[ \t]*(?:references?|bibliography|literature cited|citations)\b[^\n]*\n"
    r".*?(?=\n#{1,6}[ \t]*\S|\Z)"
)

# Hand-typed numeric citation brackets (render's input is authored with
# [@key] markers, so any [N]/[N, M]/[N-M] bracket in a draft is suspect).
# Negative lookarounds exclude markdown links [1](url), reference defs [1]:,
# and wikilinks [[1,2]].
HAND_TYPED_NUM_RE = re.compile(r"(?<!\[)\[\d{1,3}(?:\s*[,\u2013\-]\s*\d{1,3})*\](?![:(\[])")

CODE_BLOCK_RE = re.compile(r"(?ms)^(?:```|~~~)[^\n]*\n.*?^(?:```|~~~)[ \t]*$")


def mask_code_blocks(text: str) -> str:
    """Fenced code blocks -> same-length newline filler (offsets preserved), so
    section detection and marker scans never fire on example/documentation
    content inside fences."""
    return CODE_BLOCK_RE.sub(lambda m: "\n" * (m.end() - m.start()), text)


def classify_token(token: str):
    """Classify a marker token: ('cite', ns, value) | ('shape', ns, value) | ('plain', tok, None)."""
    tok = token.strip()
    if tok.startswith("@"):
        tok = tok[1:].strip()
    if ":" not in tok:
        return ("plain", tok, None)
    ns, _, value = tok.partition(":")
    ns, value = ns.strip().lower(), value.strip()
    if not value or ns not in KEY_NAMESPACES:
        return ("plain", tok, None)
    shape = NS_VALUE_SHAPES.get(ns)
    if shape is None or shape.match(value):
        return ("cite", ns, value)
    return ("shape", ns, value)


def _canonical_marker_key(ns: str, value: str) -> str:
    try:
        return f"{ns}:{_canonicalize_id_value(ns, value)}"
    except ValueError:
        return f"{ns}:{value}"


def resolve_key(led: Ledger, ns: str, value: str):
    """Resolve a marker key to a ledger key: direct -> secondary-id twin -> None."""
    cand = _canonical_marker_key(ns, value)
    if cand in led.by_key:
        return cand
    if ns in ("doi", "pmcid"):
        # merge promotes doi:/pmcid: twins to their pmid key; the marker may
        # legitimately cite the pre-promotion namespace.
        canon_val = cand.split(":", 1)[1].lower()
        twin = led.sec_index.get(f"{ns}:{canon_val}")
        if twin and twin in led.by_key:
            return twin
    return None


def _compress_numbers(nums: list) -> str:
    """[1,2,3,5] -> '1-3, 5'; [1,2] -> '1, 2'."""
    nums = sorted(set(nums))
    parts, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        if j - i >= 2:
            parts.append(f"{nums[i]}-{nums[j]}")
        elif j == i + 1:
            parts.append(f"{nums[i]}, {nums[j]}")
        else:
            parts.append(str(nums[i]))
        i = j + 1
    return ", ".join(parts)


def cmd_render(args) -> int:
    led = read_ledger(Path(args.ledger))
    text = Path(args.draft).read_text(encoding="utf-8-sig")
    out_path = Path(args.out)

    # Strip pre-existing References-like sections, fence-aware: detect on a
    # code-block-masked copy (offsets preserved), cut from the real text in
    # reverse so earlier spans stay valid.
    masked = mask_code_blocks(text)
    had_entries = False
    for m in reversed(list(REFS_STRIP_RE.finditer(masked))):
        chunk = text[m.start():m.end()]
        if re.search(r"(?m)^\s*[-*]?\s*\[\d+\]", chunk):
            had_entries = True
        if "[@" in chunk:
            warn("a pre-existing References-like section contained [@key] marker(s); "
                 "the section was stripped - cite those sources in the body instead")
        text = text[:m.start()] + text[m.end():]
    body = text.rstrip() + "\n"

    failures: list = []
    numbers: dict = {}
    order: list = []

    def render_marker(bracket: str) -> str:
        inner = bracket[2:-1] if bracket.endswith("]") else bracket[2:]
        tokens = [t for t in inner.split(";") if t.strip()]
        kinds = [classify_token(t) for t in tokens]
        cites = [k for k in kinds if k[0] == "cite"]
        if not tokens or not cites:
            for kind, ns, _ in kinds:
                if kind == "shape":
                    warn(f"bracket {bracket!r} uses the {ns}: namespace but its value is not shape-valid; left verbatim")
            return bracket
        if any(k[0] != "cite" for k in kinds):
            # A group with at least one real cite-key must not silently drop
            # its non-citation tokens - that would lose citations quietly.
            failures.append(f"mixed citation group {bracket!r}: every token must be a cite-key")
            return bracket
        keys = []
        for _, ns, value in cites:
            key = resolve_key(led, ns, value)
            if key is None:
                suggestions = [k for k in sorted(led.by_key) if k.startswith(ns + ":")][:5]
                failures.append(
                    f"unknown citation key {ns}:{value}"
                    + (f" (did you mean: {', '.join(suggestions)}?)" if suggestions else "")
                )
                continue
            keys.append(key)
        if failures:
            return bracket
        for key in keys:
            if key not in numbers:
                numbers[key] = len(numbers) + 1
                order.append(key)
        return "[" + _compress_numbers([numbers[k] for k in keys]) + "]"

    # Marker substitution, fence-aware: scan the masked copy (offsets equal),
    # splice replacements into the real body.
    masked_body = mask_code_blocks(body)
    # Hand-typed numeric brackets in the DRAFT are the residual leak class:
    # render owns numbering, so warn loudly (non-fatal - prose ranges like
    # [140, 155] are legitimate; links/wikilinks/reference defs are excluded).
    hand_typed = [m.start() for m in HAND_TYPED_NUM_RE.finditer(masked_body)]
    if hand_typed:
        lines = sorted({masked_body.count("\n", 0, pos) + 1 for pos in hand_typed[:5]})
        warn(f"draft contains {len(hand_typed)} hand-typed numeric citation bracket(s) "
             f"(first at line(s) {lines}): render owns numbering - remove hand-typed [N] brackets from the draft")
    parts: list = []
    last = 0
    for m in MARKER_RE.finditer(masked_body):
        parts.append(body[last:m.start()])
        parts.append(render_marker(body[m.start():m.end()]))
        last = m.end()
    parts.append(body[last:])
    rendered_body = "".join(parts)

    # Double-render guard: an already-rendered document has no markers left.
    if not order and had_entries:
        banner("render", "FAILED: no [@key] citation markers found, but a References section with entries was present "
                         "(already-rendered document?); nothing written")
        return 1
    if failures:
        for f in failures:
            warn(f"unresolved citation: {f}")
        banner("render", f"FAILED: {len(failures)} unresolved citation key(s); nothing written")
        return 1

    entries = []
    missing = []
    for key in order:
        entry = render_record(led.by_key[key], args.expand_pages)
        if "[MISSING" in entry:
            missing.append(key)
        entries.append(f"[{numbers[key]}] {entry}")
    if missing:
        for key in missing:
            warn(f"record {key} would render with [MISSING ...] markers (incomplete ledger record)")
        banner("render", f"FAILED: {len(missing)} record(s) render with [MISSING ...] gaps "
                         f"({', '.join(missing[:5])}{' ...' if len(missing) > 5 else ''}); nothing written")
        return 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    refs = "\n".join(entries) if entries else "(no cited sources)"
    out_path.write_text(rendered_body + "\n## References\n\n" + refs + "\n", encoding="utf-8")
    banner("render", f"{len(order)} citation(s) numbered, {len(entries)} reference(s) rendered from {args.ledger} -> {args.out}")
    return 0


def _check_markers(led: Ledger, paths: list) -> int:
    """Cross-validate [@key] markers in markdown files against the ledger.

    Mirrors render's group semantics exactly: groups with zero cite tokens are
    prose (ignored); all-cite groups must fully resolve (direct or sec_index);
    groups mixing >=1 cite token with any non-cite token are failures;
    shape-kind tokens (recognized namespace, invalid shape) warn only.
    Returns the number of failures; a missing marker file counts as one
    (never a vacuous pass)."""
    failures = 0
    for raw in paths:
        p = Path(raw)
        if not p.is_file():
            banner("check", f"markers: marker file not found: {p}")
            failures += 1
            continue
        text = p.read_text(encoding="utf-8-sig")
        masked = mask_code_blocks(text)
        groups = resolved = 0
        for m in MARKER_RE.finditer(masked):
            tokens = [t for t in m.group(1).split(";") if t.strip()]
            kinds = [classify_token(t) for t in tokens]
            cites = [k for k in kinds if k[0] == "cite"]
            if not tokens or not cites:
                continue  # prose bracket - render leaves it verbatim
            line = masked.count("\n", 0, m.start()) + 1
            groups += 1
            if any(k[0] != "cite" for k in kinds):
                warn(f"{p.name}:{line}: mixed citation group {m.group(0)!r}: every token must be a cite-key")
                failures += 1
                continue
            for kind, ns, value in cites:
                if kind == "shape":
                    warn(f"{p.name}:{line}: bracket {m.group(0)!r} uses the {ns}: namespace but its value is not shape-valid (left verbatim)")
                    continue
                key = resolve_key(led, ns, value)
                if key is None:
                    warn(f"{p.name}:{line}: unresolved marker {ns}:{value} (no matching ledger record)")
                    failures += 1
                else:
                    resolved += 1
        print(f"markers[{p.name}]: {groups} citation group(s), {resolved} marker(s) resolved")
    return failures


def cmd_check(args) -> int:
    markers = getattr(args, "markers", None) or []
    led = read_ledger(Path(args.file))
    types: dict = {}
    for rec in led.records():
        types[rec.get("type", "?")] = types.get(rec.get("type", "?"), 0) + 1
    for k in sorted(led.by_key):
        print(k)
    status = "OK" if not led.quarantined else "FAIL"
    banner("check", f"{len(led.by_key)} record(s) across {len(types)} type(s) "
                    f"({', '.join(f'{t}:{c}' for t, c in sorted(types.items())) or 'none'}); "
                    f"quarantined {len(led.quarantined)}; {status}")
    if led.quarantined:
        for q in led.quarantined:
            warn(f"quarantined {q.get('file')}:{q.get('line')}: {q.get('error')}")
        return 1
    if markers:
        marker_failures = _check_markers(led, markers)
        banner("check", f"markers: {marker_failures} problem(s) across {len(markers)} file(s); "
                        f"{'FAIL' if marker_failures else 'OK'}")
        if marker_failures:
            return 1
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
                             "authors": [{"name": "Chapman PB", "authtype": "Author"}, {"name": "Hauschild A", "authtype": "Author"}],
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
            assert h["authors"] == ["Chapman PB", "Hauschild A"], f"authors not backfilled: {h['authors']}"
            assert "volume" in h["backfilled"] and "title" in h["backfilled"] and "authors" in h["backfilled"]
        check("verify-backfill", st_verify_backfill)

        # ---- verify mismatch (conflict detection) --------------------------------
        def st_verify_mismatch():
            f = d / "vm.jsonl"
            # Title mismatch: completely unrelated title put into article record
            bad_title = _fixture_article(pmid="540362", ids={"pmid": "540362", "doi": "10.1248/cpb.27.1942"},
                                         title="Unrelated Subject Matter on Plant Photosynthesis")
            # DOI mismatch
            bad_doi = _fixture_article(pmid="21639808", ids={"pmid": "21639808", "doi": "10.1000/wrong.doi"},
                                       title="Improved survival with vemurafenib in melanoma with BRAF V600E mutation")
            f.write_text(json.dumps(bad_title) + "\n" + json.dumps(bad_doi) + "\n", encoding="utf-8")
            docs = {
                "540362": {"pubdate": "1979", "volume": "27", "issue": "8", "pages": "1942-4",
                           "source": "Chem Pharm Bull (Tokyo)",
                           "title": "Solution structure of alpha-conotoxin EI from Conus ermineus.",
                           "articleids": [{"idtype": "doi", "value": "10.1248/cpb.27.1942"}]},
                "21639808": {"pubdate": "2011", "volume": "364", "issue": "26", "pages": "2507-16",
                             "source": "N Engl J Med",
                             "title": "Improved survival with vemurafenib in melanoma with BRAF V600E mutation.",
                             "articleids": [{"idtype": "doi", "value": "10.1056/nejmoa1103782"}]},
            }
            mod = sys.modules[__name__]
            original = mod.fetch_ncbi_summaries
            mod.fetch_ncbi_summaries = lambda pmids, timeout=15.0: docs
            try:
                rc, out = _capture(cmd_verify, argparse.Namespace(file=str(f), apply=True, timeout=1.0))
            finally:
                mod.fetch_ncbi_summaries = original
            assert rc == 0
            assert "2 metadata mismatch(es) (unverified)" in out
            led = read_ledger(f)
            rec_title = led.by_key["pmid:540362"]
            assert rec_title["verified"] is False, "title mismatch record must NOT be verified"
            assert "mismatch: title overlap" in rec_title.get("verification_notes", "")
            rec_doi = led.by_key["pmid:21639808"]
            assert rec_doi["verified"] is False, "doi mismatch record must NOT be verified"
            assert "mismatch: doi conflict" in rec_doi.get("verification_notes", "")
        check("verify-mismatch", st_verify_mismatch)

        # ---- bib -------------------------------------------------------------------
        def st_bib():
            # Vancouver initials: standard, particle surnames, group passthrough
            assert vancouver_author("Chapman Paul B") == "Chapman PB"
            assert vancouver_author("van der Berg Jan") == "van der Berg J", vancouver_author("van der Berg Jan")
            assert vancouver_author("De la Cruz Maria E") == "De la Cruz ME", vancouver_author("De la Cruz Maria E")
            assert vancouver_author("World Health Organization") == "World Health Organization"
            assert vancouver_author("Li Jiang") == "Li J"
            assert vancouver_author("WHO") == "WHO"
            # Idempotency of vancouver_author on pre-formatted initials & punctuation
            assert vancouver_author("Chapman PB") == "Chapman PB", vancouver_author("Chapman PB")
            assert vancouver_author("Taniguchi SH") == "Taniguchi SH", vancouver_author("Taniguchi SH")
            assert vancouver_author("Schmidberger, J.W.") == "Schmidberger JW", vancouver_author("Schmidberger, J.W.")
            assert vancouver_author("Smith JA Jr") == "Smith JA Jr", vancouver_author("Smith JA Jr")
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
            assert "Chapman PB, Hauschild A, Robert C, et al." in first, f"Vancouver initials / period wrong: {first}"
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
            assert "Takahashi M, Taniguchi SH." in line, f"author list period wrong: {line}"
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
            # newline-delimited JSON (.jsonl) batch via --stdin
            jsonl_batch = (json.dumps(_fixture_article(pmid="10000006", doi="10.1000/b6", title="Batch six", ids={"pmid": "10000006", "doi": "10.1000/b6", "pmcid": "PMC1000006"})) + "\n" +
                           json.dumps(_fixture_article(pmid="10000007", doi="10.1000/b7", title="Batch seven", ids={"pmid": "10000007", "doi": "10.1000/b7", "pmcid": "PMC1000007"})) + "\n")
            rc, out = add_stdin(f, jsonl_batch)
            assert rc == 0 and "add: 2 record(s) accepted, 0 rejected" in out, f"stdin jsonl batch failed: {out}"
            # @file with newline-delimited JSONL
            jf = d / "bt-lines.jsonl"
            jf.write_text(jsonl_batch, encoding="utf-8")
            rc, out = _capture(cmd_add, argparse.Namespace(file=str(f), record="@" + str(jf), stdin=False, aspect=None))
            assert rc == 0 and "add: 2 record(s) accepted" in out, f"@file jsonl batch failed: {out}"
            # markdown code-fenced payload in stdin
            fenced = "```json\n" + json.dumps([_fixture_article(pmid="10000008", doi="10.1000/b8", title="Batch eight", ids={"pmid": "10000008", "doi": "10.1000/b8", "pmcid": "PMC1000008"})]) + "\n```\n"
            rc, out = add_stdin(f, fenced)
            assert rc == 0 and "add: 1 record(s) accepted" in out, f"fenced payload failed: {out}"
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

        # ---- name -> title fold (biomcp `name`-shaped records) -------------
        def st_name_fold():
            f = d / "nf.jsonl"
            # drug carrying `name` instead of `title` (biomcp drug_get shape)
            drug = {"type": "drug", "ids": {"chembl": "CHEMBL1229517"}, "name": "vemurafenib",
                    "meta": {"indication": "BRAF V600E-mutant melanoma"}, "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(drug), stdin=False, aspect=None))
            led = read_ledger(f)
            assert "chembl:CHEMBL1229517" in led.by_key, "name-bearing drug not accepted"
            assert led.by_key["chembl:CHEMBL1229517"]["title"] == "vemurafenib", "name not folded into title"
            # fold is idempotent across re-reads and preserves the original field
            before = json.dumps(led.by_key["chembl:CHEMBL1229517"], sort_keys=True)
            after = json.dumps(read_ledger(f).by_key["chembl:CHEMBL1229517"], sort_keys=True)
            assert before == after, "name fold not idempotent on re-read"
            assert led.by_key["chembl:CHEMBL1229517"].get("name") == "vemurafenib", "original name field lost"
            # gene name-only now accepted too (acceptance widening, CHANGELOG-noted)
            gene = {"type": "gene", "ids": {"entrez_id": "673"}, "name": "B-Raf proto-oncogene",
                    "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(gene), stdin=False, aspect=None))
            assert "gene:673" in read_ledger(f).by_key, "name-bearing gene not accepted"
            # article keeps its hard id requirement: name-only rejected
            _capture(cmd_add, argparse.Namespace(file=str(f), record='{"type": "article", "name": "x", "ids": {}}', stdin=False, aspect=None))
            # web/dataset keep their hard identity fields: name-only rejected
            _capture(cmd_add, argparse.Namespace(file=str(f), record='{"type": "web", "name": "Just a page", "ids": {}}', stdin=False, aspect=None))
            _capture(cmd_add, argparse.Namespace(file=str(f), record='{"type": "dataset", "name": "Just a series", "ids": {}}', stdin=False, aspect=None))
            keys = set(read_ledger(f).by_key)
            assert not any(k.startswith("title:") for k in keys), "name-only article/web/dataset must not derive title keys"
            assert len(keys) == 2, f"name-fold acceptance boundary wrong: {sorted(keys)}"
            # renders clean (no [MISSING field: title])
            _, out = _capture(cmd_bib, argparse.Namespace(file=str(f), keys="chembl:CHEMBL1229517", expand_pages=False, offset=0))
            assert "[MISSING" not in out.splitlines()[0], f"drug still renders MISSING: {out.splitlines()[0]}"
            assert "Vemurafenib" in out.splitlines()[0] or "vemurafenib" in out.splitlines()[0], out.splitlines()[0]
        check("name-fold", st_name_fold)

        # ---- render: cite-key markers -> numbered citations + References ---
        def _render_ledger(d):
            f = d / "render.jsonl"
            batch = [
                _fixture_article(),
                _fixture_article(pmid="30000001", doi="10.1000/r1", title="Render one", ids={"pmid": "30000001", "doi": "10.1000/r1", "pmcid": "PMC3000001"}),
                _fixture_article(pmid="30000002", doi="10.1000/r2", title="Render two", ids={"pmid": "30000002", "doi": "10.1000/r2", "pmcid": "PMC3000002"}),
                _fixture_article(pmid="30000003", doi="10.1000/r3", title="Render three", ids={"pmid": "30000003", "doi": "10.1000/r3", "pmcid": "PMC3000003"}),
                {"key": "nct:NCT04280705", "type": "trial", "ids": {"nct": "NCT04280705"},
                 "title": "Encorafenib Plus Cetuximab", "meta": {"phase": "Phase 2", "sponsor": "Pfizer", "status": "Completed"},
                 "provenance": [{"aspect": "a"}]},
                {"type": "drug", "ids": {"chembl": "CHEMBL1229517"}, "name": "vemurafenib",
                 "meta": {"indication": "BRAF V600E-mutant melanoma"}, "provenance": [{"aspect": "a"}]},
            ]
            old_stdin, sys.stdin = sys.stdin, io.StringIO(json.dumps(batch))
            try:
                _capture(cmd_add, argparse.Namespace(file=str(f), record=None, stdin=True, aspect=None))
            finally:
                sys.stdin = old_stdin
            return f

        def st_render():
            f = _render_ledger(d)
            draft = d / "report.draft.md"
            draft.write_text(
                "# Report\n\n"
                "Vemurafenib [@chembl:CHEMBL1229517] improves survival [@pmid:21639808].\n\n"
                "Prose [@home] and pandoc [@Chapman2011] and symbol-ish [@gene:BRAF] stay verbatim.\n\n"
                "Trial plus article [@nct:NCT04280705; @pmid:21639808] group. Again [@pmid:21639808].\n\n"
                "Three more [@pmid:30000001; @pmid:30000002; @pmid:30000003] in one group.\n",
                encoding="utf-8",
            )
            out = d / "final.md"
            rc, stdout = _capture(cmd_render, argparse.Namespace(ledger=str(f), draft=str(draft), out=str(out), expand_pages=False))
            assert rc == 0, f"render failed: {stdout}"
            text = out.read_text(encoding="utf-8")
            assert "Vemurafenib [1] improves survival [2]." in text, f"numbering wrong:\n{text}"
            assert "[@home]" in text and "[@Chapman2011]" in text and "[@gene:BRAF]" in text, "prose brackets rewritten"
            assert "[2, 3]" in text, f"group not sorted/compressed: {text}"
            assert "Again [2]." in text, "duplicate key not reusing its number"
            assert "[4-6]" in text, f"consecutive run not range-compressed: {text}"
            assert "## References" in text and "[1] vemurafenib." in text and "[2] Chapman PB" in text
            # registry titles ending in a period never render doubled ("Title.. Status")
            # and corporate sponsors ending in periods (e.g. "Tesaro, Inc.") do not double
            tdot = d / "tdot.jsonl"
            tdot.write_text(json.dumps({
                "key": "nct:NCT01844986", "type": "trial", "ids": {"nct": "NCT01844986"},
                "title": "Olaparib Maintenance Monotherapy in Patients With BRCA Mutated Ovarian Cancer Following First Line Platinum Based Chemotherapy.",
                "meta": {"phase": "Phase 3.", "sponsor": "Tesaro, Inc.", "status": "ACTIVE_NOT_RECRUITING."},
                "provenance": [{"aspect": "a"}]}) + "\n", encoding="utf-8")
            _, tout = _capture(cmd_bib, argparse.Namespace(file=str(tdot), keys="nct:NCT01844986", expand_pages=False, offset=0))
            tline = tout.splitlines()[0]
            assert "Chemotherapy. Phase 3. Sponsor: Tesaro, Inc. Status: ACTIVE_NOT_RECRUITING." in tline and ".." not in tline, f"double period rendered: {tline}"
            assert "[MISSING" not in text
            refs = text.split("## References", 1)[1]
            nums = re.findall(r"(?m)^\[(\d+)\]", refs)
            assert nums == [str(i) for i in range(1, 7)], f"bibliography not 1..N contiguous: {nums}"
            # idempotent re-render of the SAME draft
            out2 = d / "final2.md"
            _capture(cmd_render, argparse.Namespace(ledger=str(f), draft=str(draft), out=str(out2), expand_pages=False))
            assert out2.read_text(encoding="utf-8") == text, "re-render of the same draft is not idempotent"
            # sec-index: doi: marker resolves to the promoted pmid twin
            doi_draft = d / "doi.draft.md"
            doi_draft.write_text("Only one [@doi:10.1056/nejmoa1103782].\n", encoding="utf-8")
            doi_out = d / "doi.md"
            rc, _ = _capture(cmd_render, argparse.Namespace(ledger=str(f), draft=str(doi_draft), out=str(doi_out), expand_pages=False))
            dtext = doi_out.read_text(encoding="utf-8")
            assert rc == 0 and "Only one [1]." in dtext and "PMID: 21639808." in dtext, f"doi twin resolution failed: {dtext}"
            assert len(re.findall(r"(?m)^\[\d+\]", dtext.split("## References", 1)[1])) == 1
            # unknown key: exit 1, output NOT written
            bad = d / "bad.draft.md"
            bad.write_text("Broken [@pmid:99999999].\n", encoding="utf-8")
            bad_out = d / "bad.md"
            rc, _ = _capture(cmd_render, argparse.Namespace(ledger=str(f), draft=str(bad), out=str(bad_out), expand_pages=False))
            assert rc != 0 and not bad_out.exists(), "unknown key must exit 1 without writing output"
            # [MISSING ...] entry: exit 1, output NOT written
            tonly = {"type": "trial", "title": "Title-only degraded trial", "provenance": [{"aspect": "a"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(tonly), stdin=False, aspect=None))
            tkey = next(k for k in read_ledger(f).by_key if k.startswith("title:"))
            miss = d / "miss.draft.md"
            miss.write_text(f"Degraded [@{tkey}] cite.\n", encoding="utf-8")
            miss_out = d / "miss.md"
            rc, _ = _capture(cmd_render, argparse.Namespace(ledger=str(f), draft=str(miss), out=str(miss_out), expand_pages=False))
            assert rc != 0 and not miss_out.exists(), "MISSING-rendering record must exit 1 without writing output"
            # double-render guard: rendering an already-rendered report fails
            rc, _ = _capture(cmd_render, argparse.Namespace(ledger=str(f), draft=str(out), out=str(d / "double.md"), expand_pages=False))
            assert rc != 0, "double-render must fail (no markers, References present)"
            assert not (d / "double.md").exists()
            # fence-awareness: a fenced example References section / marker is
            # never stripped and never numbered
            fence_draft = d / "fence.draft.md"
            fence_draft.write_text(
                "# F\n\nReal cite [@pmid:21639808].\n\nExample (do not touch):\n\n```\n"
                "## References\n\n[1] example entry.\n\nCite like [@pmid:21639808].\n```\n\nTail kept.\n",
                encoding="utf-8",
            )
            fence_out = d / "fence.md"
            rc, _ = _capture(cmd_render, argparse.Namespace(ledger=str(f), draft=str(fence_draft), out=str(fence_out), expand_pages=False))
            ftext = fence_out.read_text(encoding="utf-8")
            assert rc == 0, "fenced content must not break render"
            assert "## References\n\n[1] example entry." in ftext, "fenced References example was stripped"
            assert "[@pmid:21639808]" in ftext, "marker inside a fence was rewritten"
            assert "Tail kept." in ftext, "content after a fenced References example was truncated"
            assert "Real cite [1]." in ftext and ftext.rstrip().endswith("[1] Chapman PB, Hauschild A, Robert C, et al. Improved survival with vemurafenib in melanoma with BRAF V600E mutation. N Engl J Med. 2011;364(26):2507-16. DOI: 10.1056/nejmoa1103782. PMID: 21639808."), \
                f"real marker/References wrong:\n{ftext}"
            # mixed citation group: at least one cite-key + a non-citation token
            # must hard-fail (never silently drop the citation)
            mix = d / "mix.draft.md"
            mix.write_text("Mixed [@pmid:21639808; see note] group.\n", encoding="utf-8")
            mix_out = d / "mix.md"
            rc, _ = _capture(cmd_render, argparse.Namespace(ledger=str(f), draft=str(mix), out=str(mix_out), expand_pages=False))
            assert rc != 0 and not mix_out.exists(), "mixed citation group must exit 1 without writing output"
        check("render", st_render)

        # ---- check: worker validity gate -----------------------------------
        def st_check():
            f = d / "ck.jsonl"
            f.write_text("", encoding="utf-8")
            rc, out = _capture(cmd_check, argparse.Namespace(file=str(f)))
            assert rc == 0 and "0 record(s)" in out and "quarantined 0" in out, f"empty ledger must pass: {out}"
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(_fixture_article()), stdin=False, aspect=None))
            rc, out = _capture(cmd_check, argparse.Namespace(file=str(f)))
            assert rc == 0 and "1 record(s)" in out and "pmid:21639808" in out and "; OK" in out, out
            bad = d / "ck2.jsonl"
            bad.write_text(json.dumps(_fixture_article()) + "\nnot json\n", encoding="utf-8")
            rc, out = _capture(cmd_check, argparse.Namespace(file=str(bad)))
            assert rc == 1 and "quarantined 1" in out and "FAIL" in out, f"quarantined ledger must fail: {out}"
        check("check", st_check)

        # ---- check --markers: worker marker cross-validation gate ------------
        def st_check_markers():
            f = d / "ckm.jsonl"
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(_fixture_article()), stdin=False, aspect=None))
            good = d / "good.md"
            good.write_text(
                "Real [@pmid:21639808] plus its doi twin [@doi:10.1056/NEJMOA1103782].\n"
                "Prose [@home] and shape-ish [@gene:BRAF] stay verbatim.\n"
                "CI text [95% CI 78-89] and a link [1](http://x) are not citations.\n"
                "Fenced example:\n\n```\n[@pmid:99999999]\n```\n",
                encoding="utf-8",
            )
            rc, out = _capture(cmd_check, argparse.Namespace(file=str(f), markers=[str(good)]))
            assert rc == 0, f"resolvable markers must pass:\n{out}"
            assert "markers[good.md]: 2 citation group(s), 2 marker(s) resolved" in out
            assert "markers: 0 problem(s) across 1 file(s); OK" in out
            # unresolved marker -> exit 1
            bad = d / "bad.md"
            bad.write_text("Broken [@pmid:99999999] cite.\n", encoding="utf-8")
            buf = io.StringIO()
            with contextlib.redirect_stderr(buf):
                rc, out = _capture(cmd_check, argparse.Namespace(file=str(f), markers=[str(bad)]))
            assert rc == 1 and "unresolved marker pmid:99999999" in buf.getvalue(), out + buf.getvalue()
            # mixed group (cite + plain token) -> exit 1, mirroring render
            mix = d / "mix.md"
            mix.write_text("Mixed [@pmid:21639808; see note] group.\n", encoding="utf-8")
            buf = io.StringIO()
            with contextlib.redirect_stderr(buf):
                rc, out = _capture(cmd_check, argparse.Namespace(file=str(f), markers=[str(mix)]))
            assert rc == 1 and "mixed citation group" in buf.getvalue(), out + buf.getvalue()
            # missing marker file -> exit 1 (never a vacuous pass)
            rc, out = _capture(cmd_check, argparse.Namespace(file=str(f), markers=[str(d / "nope.md")]))
            assert rc == 1 and "marker file not found" in out, out
        check("check-markers", st_check_markers)

        # ---- render: hand-typed numeric bracket warning (non-fatal) ---------
        def st_render_handtyped_warning():
            f = d / "ht.jsonl"
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(_fixture_article()), stdin=False, aspect=None))
            draft = d / "ht.draft.md"
            draft.write_text(
                "Clean [@pmid:21639808] marker.\n\nBut a hand-typed [1] leak and [2, 3] too.\n\n"
                "Not citations: [95% CI 78-89], link [4](http://x), wiki [[5, 6]], fence:\n\n```\n[7]\n```\n",
                encoding="utf-8",
            )
            out_path = d / "ht.md"
            buf_err = io.StringIO()
            with contextlib.redirect_stderr(buf_err):
                rc, _ = _capture(cmd_render, argparse.Namespace(ledger=str(f), draft=str(draft), out=str(out_path), expand_pages=False))
            err = buf_err.getvalue()
            assert rc == 0, "hand-typed brackets must NOT fail render"
            assert "hand-typed numeric citation bracket" in err and "line(s) [3]" in err, err
            assert "[7]" not in err.replace("line(s)", ""), "fenced [7] must not warn"
            # clean draft: no warning at all
            clean = d / "ht2.draft.md"
            clean.write_text("Only [@pmid:21639808] here.\n", encoding="utf-8")
            buf_err2 = io.StringIO()
            with contextlib.redirect_stderr(buf_err2):
                rc, _ = _capture(cmd_render, argparse.Namespace(ledger=str(f), draft=str(clean), out=str(d / "ht2.md"), expand_pages=False))
            assert rc == 0 and "hand-typed" not in buf_err2.getvalue(), buf_err2.getvalue()
        check("render-handtyped-warning", st_render_handtyped_warning)

        # ---- pdb dataset support ---------------------------------------------
        def st_pdb_dataset():
            f = d / "pdb.jsonl"
            rec = {"type": "dataset", "ids": {"pdb": "6N65"}, "title": "KRAS G-quadruplex G16T mutant",
                   "meta": {"method": "X-RAY DIFFRACTION", "resolution": "1.6 Å"},
                   "provenance": [{"aspect": "pdb_aspect"}]}
            _capture(cmd_add, argparse.Namespace(file=str(f), record=json.dumps(rec), stdin=False, aspect=None))
            led = read_ledger(f)
            assert "pdb:6N65" in led.by_key, "pdb:6N65 key not derived"
            _, out = _capture(cmd_bib, argparse.Namespace(file=str(f), keys="pdb:6N65", expand_pages=False, offset=0))
            line = out.splitlines()[0]
            assert "PDB structure 6N65: KRAS G-quadruplex G16T mutant." in line
            assert "[X-RAY DIFFRACTION]" in line and "Resolution: 1.6 Å." in line
            assert "https://www.rcsb.org/structure/6N65" in line
        check("pdb-dataset", st_pdb_dataset)

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

    p = sub.add_parser("render", help="Number cite-key markers in a draft and append the References section")
    p.add_argument("ledger", help="merged ledger file (evidence/sources.jsonl)")
    p.add_argument("draft", help="markdown draft authored with [@key] markers")
    p.add_argument("-o", "--out", required=True, help="output report path (never written on failure)")
    p.add_argument("--expand-pages", action="store_true", help="expand abbreviated page ranges (2507-16 -> 2507-2516)")
    p.set_defaults(fn=cmd_render)

    p = sub.add_parser("check", help="Validate a ledger file (exit 1 on quarantined lines; with --markers also on unresolved/mixed markers)")
    p.add_argument("file")
    p.add_argument("--markers", nargs="+", metavar="MD",
                   help="markdown file(s) whose [@key] markers must resolve in this ledger")
    p.set_defaults(fn=cmd_check)

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

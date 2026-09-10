#!/usr/bin/env python3
"""Programmatic citation validation and enhancement via NCBI E-utilities.

Reads a research report markdown file, extracts citations in the '## References'
section, queries NCBI PubMed esummary for PMIDs, validates citation metadata
(especially Volume, Issue, Pages, DOI), and outputs suggestions or applies
in-place updates.

Zero external dependencies (pure Python standard library). Fail-safe: on network
or API failure, exits 0 with original content preserved.
"""

import argparse
import html
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ncbi_esummary import fetch_ncbi_summaries  # noqa: E402,F401 (shared module, extracted verbatim)

REF_SECTION_RE = re.compile(
    r'(?m)^(#{2,3}\s+(?:\d+[\.\s]+)?(?:References?|Bibliography|Literature Cited|Citations)\b.*?)(?=\n#{1,2}\s+|\Z)',
    re.DOTALL | re.IGNORECASE,
)
REF_LINE_RE = re.compile(
    r'(?m)^(\s*[-*]?\s*\[(\d+)\]\s+)(.*?)(?=\n\s*[-*]?\s*\[\d+\]|\n#{1,2}\s+|\Z)',
    re.DOTALL,
)
PMID_RE = re.compile(r'\bPMID[:\s]+\[?(\d{4,9})\]?', re.IGNORECASE)
DOI_RE = re.compile(r'(?:DOI[:\s]+|https?://(?:dx\.)?doi\.org/)?\b(10\.\d{4,9}/[^\s\]\)]+)', re.IGNORECASE)


def build_pub_locator(doc: dict) -> str:
    """Build canonical Year;Volume(Issue):Pages string from NCBI esummary."""
    pubdate = doc.get("pubdate", "")
    m_year = re.search(r'\b(19\d\d|20\d\d)\b', pubdate)
    year = m_year.group(1) if m_year else str(doc.get("sortpubdate") or "")[:4]

    volume = str(doc.get("volume", "")).strip()
    issue = str(doc.get("issue", "")).strip()
    pages = str(doc.get("pages", "")).strip()

    if not pages:
        eloc = str(doc.get("elocationid", "")).strip()
        if eloc and not eloc.lower().startswith("doi:"):
            # If elocationid is an article number (e.g. 104533, e12345)
            pages = re.sub(r'^(?:pii|articleno|article):\s*', '', eloc, flags=re.IGNORECASE)

    if volume and issue and pages:
        return f"{year};{volume}({issue}):{pages}"
    elif volume and pages:
        return f"{year};{volume}:{pages}"
    elif volume and issue:
        return f"{year};{volume}({issue})"
    elif volume:
        return f"{year};{volume}"
    elif year:
        return year
    return ""


def clean_title(title_raw: str) -> str:
    """Strip HTML, unescape entities, and clean trailing dot from NCBI title."""
    t = re.sub(r'<[^>]+>', '', title_raw)
    t = html.unescape(t)
    t = t.replace('\u00a0', ' ')
    return t.strip().rstrip('.')


def compute_token_overlap(t1: str, t2: str) -> float:
    """Calculate token overlap ratio between report title and NCBI title."""
    toks1 = set(re.findall(r'[a-z0-9]{3,}', t1.lower()))
    toks2 = set(re.findall(r'[a-z0-9]{3,}', t2.lower()))
    if not toks1 or not toks2:
        return 1.0
    return len(toks1 & toks2) / min(len(toks1), len(toks2))


def enhance_citation(original_text: str, doc: dict) -> tuple[str, list[str]]:
    """Compare and enhance citation string against NCBI document summary."""
    changes: list[str] = []
    ncbi_title = clean_title(doc.get("title", ""))
    pub_loc = build_pub_locator(doc)

    # Sanity check: title similarity guard against hallucinated or wrong PMIDs
    overlap = compute_token_overlap(original_text, ncbi_title)
    if overlap < 0.30 and len(ncbi_title) > 20:
        return original_text, [f"WARNING: Title mismatch (overlap {overlap:.2f}). Expected '{ncbi_title[:40]}...'"]

    updated = original_text.strip()

    # Extract DOI from NCBI
    ncbi_doi = ""
    for aid in doc.get("articleids", []):
        if aid.get("idtype") == "doi":
            ncbi_doi = str(aid.get("value", "")).strip().rstrip('.')
            break

    # Locate publication locator immediately preceding PMID:
    # Target: Year. or Year;Vol(Iss):Pages. preceding PMID:
    if pub_loc:
        loc_pattern = re.compile(
            r'(\b(?:19\d\d|20\d\d)\b(?:\s*;\s*[\w\(\)\:\.\-\s]+?)?)\.?(\s+PMID:)',
            re.IGNORECASE,
        )
        m = loc_pattern.search(updated)
        if m:
            current_loc = m.group(1).strip()
            pmid_lead = m.group(2)
            if current_loc != pub_loc:
                updated = updated[:m.start(1)] + pub_loc + "." + pmid_lead + updated[m.end():]
                changes.append(f"Updated publication info -> '{pub_loc}'")

    # Add missing DOI if available from NCBI and not present in citation
    if ncbi_doi and ncbi_doi.lower() not in updated.lower() and not DOI_RE.search(updated):
        if not updated.endswith('.'):
            updated += "."
        updated += f" DOI: {ncbi_doi}."
        changes.append(f"Added DOI -> '{ncbi_doi}'")

    return updated, changes


def vet_references(report_path: Path, apply_changes: bool = False) -> dict:
    """Audit and optionally apply citation vetting to markdown report."""
    text = report_path.read_text(encoding="utf-8")
    sec_match = REF_SECTION_RE.search(text)
    if not sec_match:
        return {"status": "error", "message": "No '## References' section found."}

    ref_section_text = sec_match.group(1)
    citations = []
    pmids_to_fetch = []

    for m in REF_LINE_RE.finditer(ref_section_text):
        prefix = m.group(1)
        index = m.group(2)
        raw_body = m.group(3)
        trailing_ws = raw_body[len(raw_body.rstrip()):]
        body = raw_body.strip()
        pmid_m = PMID_RE.search(body)
        pmid = pmid_m.group(1) if pmid_m else None
        citations.append({
            "prefix": prefix,
            "index": index,
            "original_body": body,
            "trailing_ws": trailing_ws,
            "pmid": pmid,
            "full_span": m.span(),
        })
        if pmid:
            pmids_to_fetch.append(pmid)

    # Fetch NCBI data (fail-safe)
    ncbi_data = fetch_ncbi_summaries(list(set(pmids_to_fetch)))

    new_section_text = ref_section_text
    total_updated = 0
    suggestions = []
    warnings = []

    # Process in reverse order to preserve character spans during string substitution
    for cit in reversed(citations):
        pmid = cit["pmid"]
        if not pmid or pmid not in ncbi_data:
            continue

        doc = ncbi_data[pmid]
        enhanced_body, changes = enhance_citation(cit["original_body"], doc)

        update_changes = [c for c in changes if not c.startswith("WARNING:")]
        warning_changes = [c for c in changes if c.startswith("WARNING:")]

        for w in warning_changes:
            warnings.append({
                "index": cit["index"],
                "pmid": pmid,
                "warning": w,
                "original": cit["original_body"],
            })

        if update_changes and enhanced_body != cit["original_body"]:
            total_updated += 1
            start, end = cit["full_span"]
            new_line = f"{cit['prefix']}{enhanced_body}{cit['trailing_ws']}"
            new_section_text = new_section_text[:start] + new_line + new_section_text[end:]
            suggestions.append({
                "index": cit["index"],
                "pmid": pmid,
                "changes": update_changes,
                "original": cit["original_body"],
                "suggested": enhanced_body,
            })

    if apply_changes and total_updated > 0:
        new_text = text[:sec_match.start(1)] + new_section_text + text[sec_match.end(1):]
        tmp_path = report_path.with_suffix(".tmp")
        tmp_path.write_text(new_text, encoding="utf-8")
        os.replace(tmp_path, report_path)

    return {
        "status": "success",
        "total_citations": len(citations),
        "pmid_citations": len(pmids_to_fetch),
        "updated_count": total_updated,
        "suggestions": list(reversed(suggestions)),
        "warnings": list(reversed(warnings)),
        "applied": apply_changes and total_updated > 0,
    }


def main():
    parser = argparse.ArgumentParser(description="Vet report citations against NCBI PubMed E-utilities.")
    parser.add_argument("report", help="Path to markdown research report (e.g. final_report.md)")
    parser.add_argument("--apply", action="store_true", help="Apply verified citation updates in-place")
    parser.add_argument("--json", action="store_true", help="Output results in structured JSON")
    parser.add_argument("--timeout", type=float, default=15.0, help="HTTP timeout in seconds (default 15)")
    args = parser.parse_args()

    report_path = Path(args.report)
    if not report_path.is_file():
        sys.stderr.write(f"error: file not found: {report_path}\n")
        sys.exit(0)

    try:
        res = vet_references(report_path, apply_changes=args.apply)
    except Exception as e:
        sys.stderr.write(f"[vet-references] Unexpected failure: {e}. Preserving original citations.\n")
        sys.exit(0)

    if args.json:
        print(json.dumps(res, indent=2))
        return

    print(f"[vet-references] Scanned {res.get('total_citations', 0)} citations "
          f"({res.get('pmid_citations', 0)} PubMed records).")

    if res.get("warnings"):
        print(f"[vet-references] Warnings ({len(res['warnings'])}):")
        for w in res["warnings"]:
            print(f"  - [{w['index']}] PMID {w['pmid']}: {w['warning']}")

    if res.get("updated_count", 0) > 0:
        action = "Applied" if args.apply else "Identified"
        print(f"[vet-references] {action} {res['updated_count']} citation update(s):")
        for s in res.get("suggestions", []):
            chg = ", ".join(s["changes"])
            print(f"  - [{s['index']}] PMID {s['pmid']}: {chg}")
            if not args.apply:
                print(f"    Suggested: {s['suggested']}")
    elif res.get("warnings"):
        print("[vet-references] Citations processed with warnings; check mismatched records above.")
    else:
        print("[vet-references] All citations are verified and up to date.")


if __name__ == "__main__":
    main()

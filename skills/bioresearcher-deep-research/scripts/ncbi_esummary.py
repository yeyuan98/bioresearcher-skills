#!/usr/bin/env python3
"""Shared NCBI PubMed esummary client for the bioresearcher-deep-research scripts.

Extracted verbatim from vet-references.py (DRY): both vet-references.py and
evidence-ledger.py import fetch_ncbi_summaries from here.

Zero external dependencies (pure Python standard library). Fail-safe: on
network or API failure, returns whatever was fetched (possibly {}); callers
treat missing records as "unverified" and never block on network errors.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

NCBI_ESUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
USER_AGENT = "bioresearcher-skills/1.2 (vet-references; +https://github.com/bioresearcher-agent)"


def fetch_ncbi_summaries(pmids: list, timeout: float = 15.0) -> dict:
    """Fetch esummary JSON for a list of PMIDs with rate-limiting and exponential backoff."""
    if not pmids:
        return {}

    api_key = os.environ.get("NCBI_API_KEY", "").strip()
    email = os.environ.get("NCBI_EMAIL", "bioresearcher-agent@noreply.github.com").strip()
    min_interval = 0.100 if api_key else 0.334

    results: dict = {}
    batch_size = 100

    for i in range(0, len(pmids), batch_size):
        if i > 0:
            time.sleep(min_interval)

        batch = pmids[i : i + batch_size]
        params = {
            "db": "pubmed",
            "id": ",".join(batch),
            "retmode": "json",
            "tool": "bioresearcher",
            "email": email,
        }
        if api_key:
            params["api_key"] = api_key

        data = urllib.parse.urlencode(params).encode("utf-8")
        req = urllib.request.Request(
            NCBI_ESUMMARY_URL,
            data=data,
            headers={"User-Agent": USER_AGENT},
        )

        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
                    result_data = payload.get("result", {})
                    for uid in batch:
                        doc = result_data.get(uid)
                        if doc and isinstance(doc, dict) and "error" not in doc:
                            results[uid] = doc
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                    retry_after_hdr = e.headers.get("Retry-After")
                    try:
                        retry_after = float(retry_after_hdr) if retry_after_hdr else float(1.5 * (2**attempt))
                    except ValueError:
                        retry_after = float(1.5 * (2**attempt))
                    time.sleep(retry_after)
                    continue
                sys.stderr.write(f"[ncbi-esummary] HTTP {e.code} querying NCBI for batch {i}: {e.reason}\n")
                break
            except Exception as e:
                if attempt < 3:
                    time.sleep(1.0 * (2**attempt))
                    continue
                sys.stderr.write(f"[ncbi-esummary] Network error querying NCBI: {e}\n")
                break

    return results

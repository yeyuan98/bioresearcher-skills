# Article & Literature Research

Literature search and retrieval via `article_search` / `article_get`
(PubMed, Europe PMC, Semantic Scholar, and more).

## Overview

`article_search` runs federated search across up to five backends with
deduplication; `article_get` retrieves one article by PMID/PMCID/DOI with
optional open-access full text, annotations, and citation graphs. Both tools
enforce a 30-second execution timeout.

## Tools

### article_search

| Parameter | Type | Notes |
|-----------|------|-------|
| query | string (required) | Search query (title, abstract, or keyword) |
| source | enum, optional | `pubmed`, `europepmc`, `semantic_scholar`, `pubtator`, `litsense`; omit for federated search over all |
| limit | int 1-50, default 10 | Applied to FINAL deduplicated results, not per-source |
| offset | int >= 0, default 0 | Result offset |
| dateRange | string, optional | `YYYY-MM-DD/YYYY-MM-DD`; open-ended `2020-01-01/` or `/2023-12-31`; at least one endpoint required. Only `pubmed`, `europepmc`, `semantic_scholar` support it - NOT `pubtator`/`litsense` |

Federated sources at a glance:

| Source | Strength |
|--------|----------|
| pubmed | Biomedical canon, MeSH-indexed |
| europepmc | Europe/PMC full text, citation lists |
| semantic_scholar | CS/ML-adjacent and citation graph (key optional) |
| pubtator | Biomedical entity-tagged (gene/disease/drug/variant/chemical) |
| litsense | Sentence-level semantic match to the query |

### article_get

| Parameter | Type | Notes |
|-----------|------|-------|
| id | string (required) | PMID (numeric, e.g. "12345"), PMCID ("PMC1234567"), or DOI ("10.1038/s41586-021-03819-2") |
| sections | enum array, optional | `core`, `oa`, `annotations`, `graph`, `citation`, `all`; omit for core metadata only |
| limit | int 1-100, default 20 | Max items per section (e.g. 20 citations) |
| citation_mode | `fast` (default) / `full` | fast ~4 s, 4 providers with auto-fallback to PubMed; full ~15-30 s, all 5 providers incl. PubMed |
| citation_direction | `forward` / `backward` / `both` (default) | forward = articles citing this one; backward = its references |

Section contents: `core` = title/authors/journal/abstract; `oa` = open-access
full text (PMC OA); `annotations` = PubTator entity annotations; `graph` =
citation graph; `citation` = forward citations + backward references.

## Worked examples

Recent BRAF resistance literature:

```json
{"query": "BRAF inhibitor melanoma resistance mechanisms",
 "dateRange": "2021-01-01/", "limit": 15}
```

Pin one backend and page through:

```json
{"query": "circulating tumor DNA minimal residual disease",
 "source": "pubmed", "limit": 20, "offset": 20}
```

Full metadata plus citations for a known PMID:

```json
{"id": "21639808", "sections": ["core", "citation"],
 "citation_mode": "fast", "citation_direction": "forward", "limit": 25}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Tool error "timed out after 30000ms" | federated fan-out exceeded 30 s | retry with a single `source`, narrower `dateRange`, or `limit` lowered |
| dateRange silently ignored | `source` was pubtator or litsense | filter dates client-side, or switch source to pubmed/europepmc/semantic_scholar |
| Fewer results than limit on federated search | dedup-then-limit semantics | page with `offset`; duplicates across sources collapse into one entry |
| citation section empty in fast mode | providers returned no items (fast auto-falls back to PubMed) | retry with `citation_mode: "full"` |

## Integration notes

- Citation chains: `article_get(sections:["citation"])` on a seminal paper is
  a fast way to find follow-up work (forward) or foundations (backward).
- DOI/PMCID inputs are normalized; `id` accepts any of the three forms.
- Semantic Scholar rate limits are higher with `S2_API_KEY`
  (see references/rate-limiting-auth.md).
- For citation formats of retrieved articles see references/citations.md
  (Vancouver style with PMID).

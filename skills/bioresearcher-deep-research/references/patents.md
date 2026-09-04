# Patent Research

Worldwide patent search and detail via `patent_search` / `patent_get`
(USPTO Public Search, USPTO ODP, EPO OPS, Google Patents backends).

## Overview

`patent_search` runs multi-backend patent search with automatic seminal
prior-art mining; `patent_get` retrieves one patent by publication number with
claims, citations, family, and classifications. These tools are slower than
the biomedical ones: search is bounded at 60 s, detail at 120 s.

## Tools

### patent_search

| Parameter | Type | Notes |
|-----------|------|-------|
| query | string (required) | Free text; QUOTE exact multi-word concepts, e.g. "\"mRNA display\"" - unquoted phrases drift off-topic |
| assignee | string, optional | Assignee/applicant org, e.g. "Moderna" |
| inventor | string, optional | Inventor name |
| cpc | string, optional | Full CPC symbol, e.g. "C12N15/11" |
| status | enum, optional | `granted` / `application` |
| date_range | string, optional | `YYYY-MM-DD/YYYY-MM-DD`, either side may be empty |
| limit | int 1-50, default 10 | Maximum results |
| offset | int >= 0, default 0 | Pagination |
| source | enum, optional | Force backend: `ppubs` (USPTO Public Search, US full-text, keyless, default US), `ops` (EPO OPS worldwide bibliographic; needs EPO keys), `uspto_odp` (US application metadata; needs USPTO_API_KEY), `google_patents` (best-effort, often unavailable) |
| sort_by | enum, optional | `relevance` (default) / `recency` - currently affects the ppubs backend only |
| seminal | boolean, optional, default true | Co-citation mining of top results to surface foundational prior art in `seminal_prior_art`; adds ~5-30 s - set `false` for the fastest bibliographic lookups |

Default (no `source`) "auto" mode: queries worldwide + ppubs concurrently; if
ppubs fails hard it falls back to uspto_odp once (tagged `_note`).

### patent_get

| Parameter | Type | Notes |
|-----------|------|-------|
| patent_id | string (required) | Publication number, e.g. "US11027025B2", "EP3904939B1", "US20260240819A1" |
| sections | enum array, optional | `core`, `abstract`, `claims`, `citations`, `family`, `classifications`, `all`; default core only |
| limit | int 1-100, default 20 | Max entries per section array |

Claims detail: US full text via USPTO Public Search; EP/WO claims via EPO OPS
which REQUIRES `EPO_OPS_CONSUMER_KEY` + `EPO_OPS_CONSUMER_SECRET` (both, set
together).

## Worked examples

Fast bibliographic landscape (skip seminal mining):

```json
{"query": "\"mRNA display\" peptide library", "assignee": "Moderna",
 "seminal": false, "limit": 20}
```

Foundational prior-art discovery (default behavior):

```json
{"query": "CRISPR base editing", "date_range": "2015-01-01/", "limit": 15}
```

Force worldwide search via EPO OPS (keys set):

```json
{"query": "chimeric antigen receptor", "source": "ops", "limit": 20}
```

Pull claims and citations for a specific patent:

```json
{"patent_id": "US11027025B2", "sections": ["abstract", "claims", "citations"]}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Search exceeds 60 s budget / times out | seminal mining + multi-backend fan-out on a broad query | set `seminal: false`, quote multi-word concepts, narrow with `assignee`/`cpc`/`date_range` |
| patent_get exceeds 120 s / times out | claims fetch across slow backends | request fewer sections (drop `family`/`citations` if unneeded), retry once |
| EP/WO claims missing or error mentioning EPO | EPO OPS keys absent | set `EPO_OPS_CONSUMER_KEY` + `EPO_OPS_CONSUMER_SECRET` together, or accept abstract-only detail |
| google_patents source fails | backend often unavailable | rely on ppubs (US) or ops (worldwide with keys) |
| Off-topic results | unquoted multi-word concepts | quote the exact phrase in `query` |

## Integration notes

- Auto-mode `_note` fields flag backend fallbacks - mention data lineage in
  the report when present.
- EPO OPS and USPTO are server-limited at ~1 s token buckets - no manual
  throttling; expect patent tools to be the slowest calls in an aspect.
- Cite patents by publication number with a Google Patents or Espacenet URL
  (references/citations.md).
- Link patents to literature: `seminal_prior_art` entries often carry patent
  and paper citations that map to `article_get` inputs.

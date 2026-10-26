# Article & Literature Research

Literature search and retrieval via `article_search` / `article_get`
(PubMed, Europe PMC, Semantic Scholar, and more).

## Overview

`article_search` runs federated search across up to six backends with
deduplication; `article_get` retrieves one article by PMID/PMCID/DOI (journal
or preprint DOI) with optional annotations, citation graphs, and opt-in
full text. `article_search` enforces a 30-second execution timeout,
`article_get` 60 seconds.

## Tools

### article_search

| Parameter | Type | Notes |
|-----------|------|-------|
| query | string (required) | Search query (title, abstract, or keyword) |
| source | enum, optional | `pubmed`, `europepmc`, `semantic_scholar`, `pubtator`, `litsense`, `preprint_only`, `arxiv`; omit for federated search (bioRxiv/medRxiv preprints are NOT included unless `preprint_only` is explicit; the default federation does include the `arxiv` leg) |
| limit | int 1-50, default 10 | Applied to FINAL deduplicated results, not per-source |
| offset | int >= 0, default 0 | Result offset |
| dateRange | string, optional | `YYYY-MM-DD/YYYY-MM-DD`; open-ended `2020-01-01/` or `/2023-12-31`; at least one endpoint required. Supported by `pubmed`, `europepmc`, `semantic_scholar`, `preprint_only`, `arxiv` - NOT `pubtator`/`litsense` |

Federated sources at a glance:

| Source | Strength |
|--------|----------|
| pubmed | Biomedical canon, MeSH-indexed |
| europepmc | Europe/PMC full text, citation lists |
| semantic_scholar | CS/ML-adjacent and citation graph (key optional) |
| pubtator | Biomedical entity-tagged (gene/disease/drug/variant/chemical) |
| litsense | Sentence-level semantic match to the query |
| preprint_only | bioRxiv/medRxiv preprints only (rows carry `preprint_server`, `ppr_id`) |
| arxiv | arXiv preprint server (rows carry `arxiv_id`) |

### article_get

| Parameter | Type | Notes |
|-----------|------|-------|
| id | string (required) | PMID (numeric, e.g. "12345"), PMCID ("PMC1234567"), journal DOI ("10.1038/s41586-021-03819-2"), or preprint DOI ("10.1101/YYYY.MM.NN.NNNNNN", new prefix "10.64898/...") |
| sections | enum array, optional | `core`, `oa`, `fulltext`, `annotations`, `graph`, `citation`, `all`; omit for core metadata only. `["all"]` = oa+annotations+graph+citation WITHOUT fulltext - request `["fulltext"]` separately |
| limit | int 1-100, default 20 | Max items per section (e.g. 20 citations) |
| citation_mode | `fast` (default) / `full` | fast ~4 s, 4 providers with auto-fallback to PubMed; full ~15-30 s, all 5 providers incl. PubMed |
| citation_direction | `forward` / `backward` / `both` (default) | forward = articles citing this one; backward = its references |
| fulltext_output | `file` (default) / `inline` | `sections:["fulltext"]` output mode - see below |
| fulltext_max_chars | int 1000-200000, default 40000 | Inline-mode only cap for `fulltext` text; ignored in file mode |

Section contents: `core` = title/authors/journal/abstract; `oa` =
license/access metadata and links ONLY - status vocabulary
`open_access | free_to_read | paywalled | not_in_pmc | unknown` (a pdf_url
does not by itself mean the text is fetchable); `fulltext` = the ACTUAL
text when freely readable in PMC/Europe PMC (opt-in, never triggered by
`"all"`); `annotations` = PubTator entity annotations; `graph` = citation
graph; `citation` = forward citations + backward references.

`fulltext` is file-first: by default the complete text is written to a
server-side markdown file and the reply carries `file_path` plus an outline
(Read/Grep the file selectively). Use `fulltext_output: "inline"` (capped by
`fulltext_max_chars`) only when the harness cannot read server-side files.
`oa`/`fulltext` do not apply to preprint DOIs.

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
| dateRange silently ignored | `source` was pubtator or litsense | filter dates client-side, or switch source to pubmed/europepmc/semantic_scholar/arxiv/preprint_only |
| Fewer results than limit on federated search | dedup-then-limit semantics | page with `offset`; duplicates across sources collapse into one entry |
| citation section empty in fast mode | providers returned no items (fast auto-falls back to PubMed) | retry with `citation_mode: "full"` |

## Field contract (biomcp >= 1.6.0)

Article records from every article tool path (`article_search`,
`article_get`, `batch_get`, `discover`) carry: `pmid`, `pmcid`, `doi`,
`title`, `authors` (full "LastName ForeName" strings - Vancouver initials are
computed by the evidence-ledger `bib` command), `journal`, `journal_issn`,
`publication_date` (raw string), `volume`, `issue`, `pages` (null when the
upstream record has none, e.g. epub-ahead-of-print), plus `mesh_headings`/
`publication_types`/`keywords`/`chemicals` on PubMed paths. HTML entities are
decoded to UTF-8.

Backend coverage notes:

- Only `pubmed` and `europepmc` return locator fields (volume/issue/pages).
- `semantic_scholar`, `pubtator`, and `litsense` records never carry
  locators.
- `preprint_only` rows carry `preprint_server`/`ppr_id` and `arxiv` rows
  carry `arxiv_id`; neither carries journal locator fields.
- LitSense hits are HINT records: `{pmid, pmcid, score, source}` only - no
  title, no abstract. Before citing a LitSense-only PMID, enrich it with
  `article_get(pmid)` (one sequential call; standard retry ladder on
  failure). If enrichment fails, the Step 5a ledger `verify` backfills the
  title from NCBI esummary.

When citation metadata matters most, pin `source: "pubmed"` or
`"europepmc"` so locators arrive directly in the search payload.

## Integration notes

- Citation chains: `article_get(sections:["citation"])` on a seminal paper is
  a fast way to find follow-up work (forward) or foundations (backward).
- DOI/PMCID inputs are normalized; `id` accepts any of the three forms.
- Semantic Scholar rate limits are higher with `S2_API_KEY`
  (see references/rate-limiting-auth.md).
- For citation formats of retrieved articles see references/citations.md
  (Vancouver style with PMID).

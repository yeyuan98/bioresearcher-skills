# Best Practices

Operational rules for efficient, reliable biomcp research. These apply to
every worker (parallel or sequential).

## Overview

biomcp queries are cheap but payloads are not: the cost center is context.
Filter at the source, request only needed sections, batch multi-entity
lookups, chain IDs between tools, and keep calls sequential.

## 1. Upfront filtering at the source

Always narrow results inside the tool call - never retrieve broadly and
filter in-context.

GOOD:

```json
{"query": "BRAF V600E melanoma acquired resistance",
 "dateRange": "2021-01-01/", "limit": 15}
```

```json
{"name": "vemurafenib", "sections": ["safety"], "limit": 10}
```

BAD: `article_search(query="BRAF")` then manually skimming hundreds of
abstracts; `drug_get(name, sections:["all"])` when only `safety` is needed.

## 2. Trim payloads with sections + limit

- `_get` tools (article/trial/gene/variant/drug/disease/patent): request ONLY
  the sections you need; `limit` (1-100) caps arrays inside them.
- Search tools: `limit` (1-50) + `offset`; stop when a page underfills or
  evidence suffices.
- genbank_get: request a `seq_start`/`seq_stop` region instead of whole
  records (2 Mb whole-record cap; 200k-char output truncation guard).

## 3. batch_get for multi-entity lookups

Fetching >= 5 known entities? ONE `batch_get` call beats N sequential `_get`
calls - parallel server-side, per-item failure rows instead of total failure.

```json
{"inputs": [
  {"entity": "article", "id": "21639808"},
  {"entity": "trial", "id": "NCT04280705", "sections": ["core"]},
  {"entity": "gene", "id": "BRAF", "sections": ["core", "druggability"]}
]}
```

## 4. ID chaining between tools

Cross-links returned by tools feed the next call:

| Chain | Path |
|-------|------|
| GEO <-> SRA | geo_get returns `sra_project` -> sra_get; sra results -> runs |
| GEO -> literature | geo_get `pubmed_ids` -> article_get |
| genbank <-> gene | genbank_genes(accession) -> entrez gene IDs -> gene_get/gene_search |
| article <-> citation graph | article_get(sections:["citation"]) forward/backward |
| trial -> detail | *_trials lists (nct_id) -> trial_get(sections) |
| disease -> drugs/trials | disease_drugs / disease_trials |
| Ensembl <-> gene | ensembl_lookup stable IDs <-> gene_get annotation |

## 5. Sequential, not concurrent, MCP calls

Within one worker, issue biomcp calls one at a time. Server-side limiters
already pace each source; concurrency multiplies effective load and gains
nothing (parallelism belongs at the aspect level: multiple workers).

## 6. Retries: at most 3

Per query: retry <= 3 times - original, simplified, alternate tool - then
record the evidence gap and continue (worker-protocol.md retry ladder).
Transient Ensembl 5xx and federated timeouts are the usual recoverable
failures.

## 7. Context hygiene

- Prefer summaries + identifiers over raw payloads in working memory; write
  full findings to the aspect file promptly.
- Big data (sequences, supplementary files, artifacts) stays on disk /
  server-side (artifact_id threading for biowasm pipelines).
- genbank sequence_text is truncated at 200k chars by design - do not re-fetch
  whole records trying to defeat the guard; use regions.

## 8. Data validation before writing

Before a finding enters a report: identifiers well-formed (PMID numeric; NCT
followed by 8 digits; GSE/GSM/GPL, SRP/SRX/SRR/SRS, DOID/MONDO/OMIM prefixes
correct), arrays non-empty, dates plausible, and values in sane ranges.

## Checklist (per aspect)

- [ ] Queries filtered at source (terms + limit + sections)
- [ ] Multi-entity lookups batched
- [ ] IDs chained via tool cross-links, not re-searched
- [ ] Calls sequential; no sleep timers (except HPA/GEO-download exceptions)
- [ ] Retries capped at 3; gaps recorded
- [ ] Findings + identifiers written to the aspect file

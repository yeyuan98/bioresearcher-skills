# Rate Limiting & Auth

biomcp enforces server-side per-source rate limiters, so workers do NOT need
manual sleep timers between calls. This file lists the limiters, the
exceptions that DO need pacing, and every auth variable.

## Overview

Every ConnectionManager-backed source has a token-bucket limiter applied
inside the server (src/connections/registry.ts). Sequential calls from a
worker are automatically paced. Manual `sleep`/timer logic between biomcp
calls is unnecessary and slows research down - drop the old 0.3 s/0.5 s
worker rules from earlier agent generations.

## Server-side limiter table (per source)

| Source (tools affected) | Interval | Notes |
|------------------------|----------|-------|
| eutils - SHARED by PubMed/GEO/SRA/GenBank (article_search, geo_*, sra_*, genbank_*) | 334 ms keyless; 100 ms with NCBI_API_KEY | One budget across ALL NCBI E-utilities databases (conditional limiter); server also retries 4x |
| pubtator (article_search source=pubtator) | 334 ms keyless; 100 ms keyed | |
| MyGene (gene_search/gene_get) | 100 ms | |
| MyVariant (variant_*) | 100 ms | |
| MyChem (drug_*) | 100 ms | |
| MyDisease (disease_*) | 100 ms | |
| OpenTargets (disease_drugs, gene_diseases fallback) | 500 ms | |
| ClinicalTrials.gov (trial_search/trial_get, *_trials) | 100 ms | |
| Ensembl REST (ensembl_*) | 100 ms | Server retries transient 500/503s 3x |
| RCSB PDB (pdb) | 100-200 ms | |
| Semantic Scholar (article_search source=semantic_scholar) | 2000 ms keyless; 1000 ms keyed (S2_API_KEY) | |
| LitSense / OpenCitations / NIH Reporter | 1000 ms | |
| Crossref (citation data) | 100 ms | Polite pool with CROSSREF_EMAIL |
| Google Patents (patent fallback backend) | 2000 ms | |
| EPO OPS (patent_search/patent_get ops backend) | ~1 s token bucket | |
| USPTO PPUBS + ODP (patent US backends) | ~1 s token bucket | |
| GTEx (gtex_*) | 100 ms | |

## Exceptions - pace these manually

1. **HPA raw fetch**: the `protein_atlas` and `expression` sections of
   `gene_get` call proteinatlas.org via a raw (unthrottled) fetch. When
   iterating these sections over many genes, space the calls yourself.
2. **GEO supplementary downloads**: `geo_get(download=true)` fetches files
   via raw fetch (not the limiter). Pace repeated downloads; each is also
   capped by `max_bytes` (default 50 MB).

Everything else: call sequentially, no timers.

## Timeout reference

| Tool | Budget |
|------|--------|
| article_search / article_get | 30 s |
| patent_search | 60 s |
| patent_get | 120 s |
| Per-source HTTP timeout (most sources) | 15 s |
| R analysis first call | minutes (cold start) - set client MCP timeout 120000 |

## Auth table

### Required (tool fails without them)

| Variable | Unlocks | Without it |
|----------|---------|-----------|
| `ONCOKB_TOKEN` | `variant_oncokb` precision-oncology annotations | Tool errors; use variant_get clinical section instead (register: oncokb.org/account/register) |
| `DISGENET_API_KEY` | DisGeNET disease-gene associations | `gene_diseases` falls back to OpenTargets associations (soft degradation, note lineage in reports) |

### Optional (higher limits / extra backends)

| Variable | Effect |
|----------|--------|
| `NCBI_API_KEY` | NCBI E-utilities rate: 3 -> 10 req/s (eutils limiter 334 -> 100 ms). Recommended for literature-heavy research |
| `NCBI_EMAIL` | Polite tool/email parameters on E-utilities requests |
| `S2_API_KEY` | Semantic Scholar higher limits (2 s -> 1 s interval) |
| `OPENFDA_API_KEY` | openFDA higher upstream limits (drug_get regulatory/FAERS sections; unlike NCBI_API_KEY this does not change the in-process limiter interval) |
| `CROSSREF_EMAIL` | Crossref polite pool - faster citation metadata |
| `EPO_OPS_CONSUMER_KEY` + `EPO_OPS_CONSUMER_SECRET` | EPO OPS patent backend: worldwide search + EP/WO claims (BOTH must be set together) |
| `USPTO_API_KEY` | USPTO Open Data Portal application search backend |

Set keys in the MCP client's env block (opencode: `environment`; Claude/
Codex: `env`), then restart the client - config changes never apply live.

## Keyless fallback behavior

- Patents: US search works keyless via USPTO Public Search (ppubs default US
  backend); Google Patents is a best-effort fallback.
- Drug regulatory/FAERS data works keyless (lower limits).
- Literature works keyless across all five federated sources.

## Integration notes

- The worker rule is simply: sequential calls, no sleep timers; pace only the
  HPA and GEO-download exceptions.
- If a client ever reports HTTP 429 despite the limiters, back off for a few
  seconds and retry once (see worker-protocol.md retry ladder).
- Keys live in the client env block, never in reports or committed files.

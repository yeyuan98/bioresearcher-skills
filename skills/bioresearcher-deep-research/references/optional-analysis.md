# Optional Analysis Tools

Environment-gated analysis: SQL database access (3 tools), R/Bioconductor
differential expression (4 tools), and biowasm BAM/VCF/BED pipelines
(8 tools). All register ONLY when their env gate is set at server start.

## Overview

These 15 tools extend biomcp beyond retrieval into local-data analysis. They
are optional: without `DB_TYPE`, `ANALYSIS_R=1`, or `ANALYSIS_BIOWASM=1` set
in the client env block, they do not exist (calls return `no_such_tool`).

## Database tools (gate: DB_TYPE=mysql or sqlite)

| Tool | Parameters | Notes |
|------|-----------|-------|
| db_list_tables | none | Lists databases/aliases, tables, row counts; call FIRST |
| db_describe_table | table_name | Column schema; qualify attached SQLite dbs as `alias.table` |
| db_query | sql, params? | READ-ONLY: only SELECT/SHOW/DESCRIBE/EXPLAIN/WITH allowed; named params `:name` passed via `params` |

```json
{"sql": "SELECT gene_symbol, COUNT(*) AS n FROM variants
 WHERE significance = :sig GROUP BY gene_symbol LIMIT 20",
 "params": {"sig": "pathogenic"}}
```

MySQL additionally needs DB_HOST/DB_USER/DB_PASSWORD/DB_DATABASE and the
`mysql2` peer dependency (`-p mysql2@3` in the client command); SQLite needs
DB_SQLITE_PATH (comma-separated; first = main, rest attached read-only,
enabling `alias.table` cross-database JOINs).

## R analysis tools (gate: ANALYSIS_R=1, needs webr peer `-p webr@0.6`)

| Tool | Purpose |
|------|---------|
| analysis_r_deseq2 | DESeq2 negative-binomial DE (params: alpha, fit_type, shrink) |
| analysis_r_edger | edgeR TMM + quasi-likelihood/exact (param: test=qlm/exact) |
| analysis_r_limma | limma-voom precision-weighted linear models |
| analysis_r_session_info | Runtime diagnostics (R/Wasm versions, package versions, memory) |

Shared input schema: `counts` (genes x samples integer matrix), `coldata`
(per-sample metadata), `design` (R formula, e.g. "batch + condition"),
`contrast` {variable, numerator, denominator} or `coef`, `top_n`
(default 50), `include_full`, `format` ("json" for structured output).

COLD START: the first call starts a ~1 GB WebAssembly R worker and downloads
a ~62 MB package bundle - MINUTES, not seconds. Set the client MCP timeout to
120000 (ms) once R analysis is enabled, or pre-warm from bash before asking
the client. Later calls reuse the warm worker (seconds).

## Biowasm tools (gate: ANALYSIS_BIOWASM=1; npx-only, nothing to install)

| Tool | Purpose |
|------|---------|
| analysis_bam_summary | Alignment triage: contigs, flagstat, idxstats |
| analysis_bam_view_region | Reads/depth/pileup in a region (mode=count/depth/pileup/reads) |
| analysis_bcf_summary | VCF/BCF triage: counts, samples, INFO/FORMAT inventory |
| analysis_bcf_view_region | Region variant projection (column pick, sample subset, filter) |
| analysis_bed_op | bedtools intersect/merge/subtract/coverage/jaccard/sort |
| analysis_biowasm_convert | Format plumbing: SAM/BAM/CRAM/VCF/BCF/TSV conversion |
| analysis_biowasm_session_info | Runtime report (tool versions, cache, artifacts) |
| analysis_biowasm_cli | Escape hatch: allowlisted samtools/bedtools/bcftools subcommand (max 32 args, no shell) |

Source inputs accept inline `content`, a prior `artifact_id`, or a
`host_path` under `ANALYSIS_BIOWASM_DATA_DIR` (unset = host files denied).
Output `format`: "table" (markdown, `top_n` rows, 2 MB cap), "json", or
"artifact" (handle + preview; reusable as the next call's `artifact_id`).
`top_n` max is 200 (default 50).

ARTIFACT THREADING: multi-step pipelines pass `artifact_id` between calls,
e.g. bam_view_region(format="artifact") -> biowasm_convert(to="SAM") ->
bam_summary. This keeps bulky data server-side and out of context.

## Worked examples

```json
{"sql": "SELECT * FROM gene_effect WHERE gene_symbol = :g LIMIT 50",
 "params": {"g": "KRAS"}}
```

```json
{"source": {"artifact_id": "art_abc123"}, "mode": "count", "region": "chr7:140453000-140453500"}
```

```json
{"source": {"content": "chr1\t10\t20\nchr1\t100\t200\n"}, "op": "merge"}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `no_such_tool` | env gate unset, or set after server start | set DB_TYPE/ANALYSIS_R/ANALYSIS_BIOWASM, restart client |
| First R call fails client-side despite healthy machine | cold bootstrap runs minutes; client timeout too low | raise client timeout to 120000 or pre-warm from bash |
| R bundle download times out | slow link vs download budget | raise `features.analysis_r.asset_timeout_ms` via biomcp_configure or self-fetch the bundle (see ENV-VARS docs) |
| db_query rejected | non-SELECT statement | only SELECT/SHOW/DESCRIBE/EXPLAIN/WITH are allowed |
| host_path denied | ANALYSIS_BIOWASM_DATA_DIR unset | set it to the allowlisted root directory |
| webr/mysql2 missing while install_mode is npx-cache | peers invisible to npx cache | use a client command carrying `-p webr@0.6` and/or `-p mysql2@3` |

## Integration notes

- GEO workflow: `geo_get(download=true)` -> load counts -> `analysis_r_*`.
- Large-input guards: estimate-gated tools return guidance; re-run with
  `proceed_on_large_input: true` to stream (progress reported).
- Worker pool: `ANALYSIS_BIOWASM_WORKERS` (default 1 = serial); memory limits
  default 2048 MB RSS watermark.
- Full guides: R-ANALYSIS.md / BIOWASM-ANALYSIS.md / DATABASE.md in the
  biomcp-ts docs.

# Variant Research

Variant search, annotation, oncology evidence, and trial cross-links via
`variant_search` / `variant_get` / `variant_oncokb` / `variant_trials`.

## Overview

`variant_search` queries MyVariant.info with STRUCTURED parameters (gene +
protein change as separate fields - not compound free text); `variant_get`
returns per-variant annotation with sections; `variant_oncokb` adds precision
oncology evidence (token-gated); `variant_trials` links to clinical trials.

## Tools

### variant_search

| Parameter | Type | Notes |
|-----------|------|-------|
| query | string, optional | rsid ("rs113488022") or HGVS ("NM_004333.4:c.1799T>A"). Do NOT put compound text like "BRAF V600E" here |
| gene | string, optional | Gene symbol filter, e.g. "BRAF" - pair with hgvsp |
| hgvsp | string, optional | Protein change, e.g. "V600E" - pair with gene |
| hgvsc | string, optional | cDNA change |
| rsid | string, optional | dbSNP rsID |
| significance | enum, optional | `benign`, `likely_benign`, `pathogenic`, `likely_pathogenic`, `uncertain` (ClinVar) |
| consequence | string, optional | e.g. "missense", "synonymous" |
| max_frequency | number, optional | Max allele frequency 0-1 (gnomAD-style rarity filter) |
| min_cadd | number, optional | Minimum CADD score |
| limit | int 1-50, default 10 | Maximum results |
| offset | int >= 0, default 0 | Result offset |

### variant_get

| Parameter | Type | Notes |
|-----------|------|-------|
| id | string (required) | rsid, HGVS, or ClinVar ID |
| sections | enum array, optional | `core`, `frequency`, `predictions`, `clinical`, `alphagenome_scores`, `all`. Core (id, gene, rsid, significance) is ALWAYS returned at top level |
| limit | int 1-100, default 20 | Caps arrays within sections |

Note: `alphagenome_scores` is currently UNAVAILABLE - it returns an error stub
pending reimplementation. Request the other sections instead.

### variant_oncokb

| Parameter | Type | Notes |
|-----------|------|-------|
| gene | string (required) | Gene symbol, e.g. "BRAF", "EGFR" |
| protein_change | string (required) | e.g. "V600E", "L858R" |

REQUIRES the `ONCOKB_TOKEN` environment variable (register at oncokb.org).
Returns OncoKB precision-oncology levels of evidence, oncogenic status, and
therapeutics.

### variant_trials

| Parameter | Type | Notes |
|-----------|------|-------|
| variant | string (required) | rsID, HGVS, or variant ID |

## Worked examples

The canonical BRAF V600E lookup (structured, never free text):

```json
{"gene": "BRAF", "hgvsp": "V600E", "limit": 5}
```

Pathogenic missense variants in a gene, rarity-filtered:

```json
{"gene": "TP53", "consequence": "missense",
 "significance": "pathogenic", "max_frequency": 0.001, "limit": 20}
```

By rsID directly:

```json
{"query": "rs113488022"}
```

Deep annotation of one variant:

```json
{"id": "rs113488022", "sections": ["frequency", "predictions", "clinical"]}
```

OncoKB evidence (token present):

```json
{"gene": "EGFR", "protein_change": "L858R"}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| variant_oncokb error mentioning token | `ONCOKB_TOKEN` not set | register/request access at oncokb.org and set it in the client env block, or skip OncoKB and rely on `variant_get` clinical section |
| 0 hits for "BRAF V600E" passed as query | compound free text is not an rsid/HGVS | use `gene` + `hgvsp` as separate parameters (the tool also auto-splits a bare "GENE V600E" string, but explicit params are reliable) |
| alphagenome_scores error stub | section currently unavailable | request `frequency`/`predictions`/`clinical` instead |
| Empty results with many filters | over-constrained combination | relax filters one at a time (drop `min_cadd` first, then `max_frequency`) |

## Integration notes

- Chain: variant_search -> variant_get (detail) -> variant_oncokb (oncology
  evidence, if token) -> variant_trials / trial_get (clinical relevance).
- For NOVEL variants (absent from databases) use `ensembl_consequence`
  (VEP on demand) instead of variant_get - see references/ensembl-pdb.md.
- `discover(query="BRAF V600E")` resolves ambiguous variant text to typed
  entities first when unsure.
- MyVariant is server-limited at 100 ms - no manual throttling.

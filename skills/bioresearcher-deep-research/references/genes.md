# Gene Research

Gene discovery, annotation, cross-links, and pathway enrichment via
`gene_search` / `gene_get` and the `gene_*` family.

## Overview

`gene_search` finds genes by symbol/name/keyword (MyGene-backed);
`gene_get` returns rich per-gene annotation with selectable sections;
cross-link tools connect a gene to diseases, drugs, trials, and articles;
`gene_enrich` runs Reactome pathway enrichment on a gene list.

## Tools

### gene_search

| Parameter | Type | Notes |
|-----------|------|-------|
| query | string (required) | Gene symbol, name, or keyword |
| chromosome | string, optional | e.g. "7", "X" |
| limit | int 1-50, default 10 | Maximum results |
| offset | int >= 0, default 0 | Result offset |

### gene_get

| Parameter | Type | Notes |
|-----------|------|-------|
| symbol | string (required) | OFFICIAL HGNC symbol only (e.g. "BRAF", "TP53", "ERBB2"); aliases like "HER2"/"NEU" rejected unless `smart: true` |
| sections | enum array, optional | `core`, `pathways`, `ontology`, `diseases`, `protein`, `go`, `interactions`, `clinical_evidence`, `expression`, `protein_atlas`, `druggability`, `dosage_sensitivity`, `constraint`, `disease_associations`, `funding`, `all` |
| limit | int 1-100, default 20 | Caps array lengths per section |
| smart | boolean, default false | When true, resolves aliases/common names to the official HGNC symbol first (e.g. "HER2" -> "ERBB2"); zero overhead for valid symbols |

Section highlights: `protein` (UniProt), `pathways` (Reactome),
`clinical_evidence` (CIViC variants), `expression` + `protein_atlas` (Human
Protein Atlas - see pacing note below), `druggability` (DGIdb),
`disease_associations` (DisGeNET - needs key), `dosage_sensitivity` (ClinGen),
`constraint` (gnomAD pLI), `funding` (NIH Reporter grants).

### Cross-link and enrichment tools

| Tool | Parameters | Notes |
|------|-----------|-------|
| gene_diseases | symbol, limit (1-50, default 10) | DisGeNET associations NEED `DISGENET_API_KEY`; without it the tool falls back to OpenTargets gene-disease associations |
| gene_drugs | symbol | Drugs targeting the gene |
| gene_trials | symbol | Clinical trials referencing the gene |
| gene_articles | symbol | Recent articles about the gene |
| gene_enrich | genes (list of HGNC symbols) | Reactome pathway enrichment; returns `_error` row on failure |

## Worked examples

Resolve an alias and pull focused annotation:

```json
{"symbol": "HER2", "smart": true, "sections": ["core", "druggability", "clinical_evidence"]}
```

Search by chromosome:

```json
{"query": "kinase", "chromosome": "7", "limit": 15}
```

Disease associations via the fallback path (no DisGeNET key):

```json
{"symbol": "BRCA1", "limit": 10}
```

Enrichment on a hit list:

```json
{"genes": ["BRAF", "NRAS", "MAP2K1", "MAPK1"]}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| gene_get error: not a valid HGNC symbol | alias or outdated name used | pass the official symbol, or set `smart: true` |
| gene_diseases returns `_error` re DisGeNET | `DISGENET_API_KEY` missing | the tool already fell back to OpenTargets data; add the key for DisGeNET-grade associations |
| HPA sections slow/erroring when iterating many genes | `protein_atlas`/`expression` use an unthrottled raw fetch | pace these calls manually; other sections are server-limited |
| gene_enrich single `_error` row | Reactome AnalysisService rejected the input | check symbols are valid HGNC; retry with a smaller list |

## Integration notes

- Typical chain: `gene_search` (discovery) -> `gene_get` (annotation) ->
  `gene_diseases`/`gene_drugs`/`gene_trials` (cross-links) -> `trial_get` /
  `article_get` for depth.
- `gtex_expression`/`gtex_eqtl` (references/functional-genomics.md) extend
  gene expression questions with tissue profiles.
- `ensembl_lookup` (references/ensembl-pdb.md) is the identifier/structure
  authority (stable IDs, coordinates, transcripts) for ANY Ensembl species.
- MyGene is server-limited at 100 ms - no manual throttling.

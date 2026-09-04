# Ensembl & PDB Research

Identifier/structure authority and variant consequence prediction via
`ensembl_*` tools, and macromolecular structures via the tri-mode `pdb` tool.

## Overview

The Ensembl tools cover any of 356 Ensembl species: stable-ID lookup,
cross-species homology, on-demand VEP consequence prediction (works for novel
variants), and region content. The single `pdb` tool switches between search,
metadata get, and file download by its arguments.

## Tools

### ensembl_lookup

| Parameter | Type | Notes |
|-----------|------|-------|
| gene_or_id | string (required) | HGNC symbol (BRAF) or Ensembl gene ID (ENSG00000157764, versioned or bare - versions resolve to current) |
| species | string, default "human" | Name or alias: "human", "mus_musculus", "mouse", "rat", ... (356 species) |
| expand | boolean, default false | Include all transcripts with translation/protein IDs |

Returns stable ID, symbol<->ID mapping, canonical transcript, coordinates on
the current assembly (GRCh38 human, GRCm39 mouse, ...). For rich HUMAN gene
annotation use `gene_get` (references/genes.md) - this tool is the
identifier/structure authority.

### ensembl_homology

| Parameter | Type | Notes |
|-----------|------|-------|
| gene | string (required) | Symbol or Ensembl gene ID |
| species | string, default "human" | Source species |
| type | `orthologues` (default) / `paralogues` | Homology type |
| target_species | string, optional | Restrict to one species, e.g. "mouse" |
| target_taxon | int, optional | Restrict to taxon ID, e.g. 10090 (Mus musculus) |
| limit | int 1-100, default 20 | Max homologies (sorted by percent identity) |

### ensembl_consequence

| Parameter | Type | Notes |
|-----------|------|-------|
| variant | string (required) | HGVS c./p./g. ("NM_004333:c.1799T>A", "ENST00000288602:c.1799T>A") or dbSNP rsID ("rs113488060"); prefer HGVS over rsIDs |
| species | string, default "human" | Species |
| limit | int 1-50, default 10 | Max transcript consequences (sorted by impact severity) |

Predicts functional consequence via Ensembl VEP - works even for NOVEL
variants absent from every database, and for non-human species. Returns most
severe consequence, per-transcript effects (impact, codon/amino-acid change,
SIFT/PolyPhen), and co-located known variants (ClinVar/COSMIC IDs,
gnomAD/1000G frequencies when present). For KNOWN human variants,
`variant_get` additionally provides pre-computed deep scores (CADD, REVEL,
ClinVar stars).

### ensembl_region

| Parameter | Type | Notes |
|-----------|------|-------|
| region | string (required) | `chr:start-end`, 1-based, e.g. "7:140450000-140480000" (GRCh38 for human) |
| features | array, default ["gene","variation"] | From `gene`, `transcript`, `variation` |
| species | string, default "human" | Species |
| limit | int 1-500, default 50 | Max features (output capped with a truncated marker) |

Ideal for locus triage ("what genes and known variants sit in this GWAS hit
interval?"). Keep spans modest (< 1 Mb recommended). For sequence TEXT use
`genbank_get`; for annotation chain IDs into `gene_get`/`variant_get`.

### pdb (tri-mode tool)

| Parameter | Type | Notes |
|-----------|------|-------|
| query | string, optional | SEARCH mode: free-text structure search; omit pdb_id |
| pdb_id | string, optional | GET mode: 4-char ID (e.g. "4HHB"); required for get/download |
| sections | enum array, optional | `core`, `polymer_entities`, `ligands`, `assembly`, `experiment`, `citation`, `all` |
| download | boolean, default false | DOWNLOAD mode: saves the structure file, returns file path (only with pdb_id) |
| format | `cif` (default) / `pdb` | Download format; cif always available, legacy pdb may not exist for some entries |
| limit / offset | int | Search result paging (limit 1-50, default 10) |

Providing NEITHER query nor pdb_id is an error.

## Worked examples

All human BRAF transcripts:

```json
{"gene_or_id": "BRAF", "expand": true}
```

Mouse orthologues of BRAF:

```json
{"gene": "BRAF", "type": "orthologues", "target_species": "mouse"}
```

Consequence of a novel HGVS variant:

```json
{"variant": "NM_004333.4:c.1799T>A"}
```

What lives in a GWAS interval:

```json
{"region": "7:140450000-140480000", "features": ["gene", "variation"]}
```

Structure workflow:

```json
{"query": "BRAF kinase inhibitor"}
```

```json
{"pdb_id": "4HHB", "sections": ["core", "experiment"]}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Transient Ensembl 5xx errors | upstream REST occasionally 500/503s | the server retries 3x with backoff; one client retry is reasonable if it still fails |
| pdb error "Provide either query or pdb_id" | neither argument given | pass `query` for search or `pdb_id` for get/download |
| Legacy `format: "pdb"` download fails | not all entries have the legacy format | use `format: "cif"` |
| ensembl_region output truncated | span or feature count too high | narrow the region (< 1 Mb) or raise `limit` toward 500 |
| ensembl_consequence vague for an rsID | rsID coordinate mapping is less specific | prefer HGVS notation input |

## Integration notes

- Ensembl REST is server-limited at 100 ms; RCSB data endpoints at 100-200 ms
  - no manual throttling.
- `pdb` download writes to disk (readOnlyHint false) - clean up large files if
  the workspace matters.
- Chain ensembl_lookup -> gene_get for human annotation; ensembl_region ->
  variant_get for variant detail; pdb citation sections -> article_get.

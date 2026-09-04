# Functional Genomics Research

Dataset and sequence research via GEO (`geo_search`/`geo_get`), SRA
(`sra_search`/`sra_get`), GenBank (`genbank_search`/`genbank_get`/
`genbank_genes`), and GTEx (`gtex_expression`/`gtex_eqtl`).

## Overview

These tools find and retrieve functional genomics studies (expression,
RNA-seq, sequencing runs, sequence records) and tissue expression genetics,
with rich cross-links (accession chaining) between them.

## Tools

### geo_search / geo_get

`geo_search`: `query` (free text or NCBI field syntax like
`GSE183947[Accession]`), `entry_type` (`gse` study default / `gsm` sample /
`gpl` platform / `gds` curated dataset), `organism`, `limit` (1-50, default
10), `offset`. Results carry chaining fields: `sra_project` -> sra_get,
`bioproject`, `pubmed_ids` -> article_get, `accession` -> geo_get.

`geo_get`: `accession` (matches `^(GSE|GSM|GPL|GDS)\d+$`), `download`
(boolean; saves the FIRST supplementary file .gz/.csv/.txt to a local temp
path and returns path/size/URL), `max_bytes` (min 1,000,000; default
52428800 = 50 MB). GDS accessions return guidance pointing at the underlying
GSE/GSM.

### sra_search / sra_get

`sra_search`: `query` (free text, an accession SRP/SRX/SRR/SRS, or field
syntax like `RNA-SEQ AND Homo sapiens[Organism]`), `limit`, `offset`.

`sra_get`: `accession` - SRP study / SRX experiment / SRR run / SRS sample.
European (ERP/ERR) and DDBJ (DRP/DRR) accessions are REJECTED - NCBI SRA does
not index them; the error points at ENA (https://www.ebi.ac.uk/ena).

### genbank_search / genbank_get / genbank_genes

`genbank_search`: `query` (terms, accession, or field syntax like
`TP53[Gene Name] AND Homo sapiens[Organism]`), `organism`, `limit`, `offset`.

`genbank_get`: `accession` (versioned or bare, e.g. NC_000023.11),
`format` (`genbank` default / `fasta`), `seq_start`/`seq_stop` (1-based
inclusive region), `strand` (1 plus; 2 minus, allows seq_start > seq_stop for
reverse slices), `max_response_bytes` (default 30,000,000; oversized errors
rather than truncates). Caps: whole-record fetches max 2,000,000 bp - larger
records REQUIRE a seq_start/seq_stop region (up to 10 Mb span); output
`sequence_text` is truncated to its first 200,000 characters when oversized.

`genbank_genes`: maps a nucleotide accession to NCBI Gene IDs (elink
nuccore->gene) usable directly with gene_get/gene_search (entrezgene IDs) -
the bridge from sequence records to gene annotation.

### gtex_expression / gtex_eqtl

`gtex_expression`: `gene` (HGNC symbol or Ensembl gene ID, versioned or
bare), `tissue` (optional tissueSiteDetailId filter, e.g. Brain_Cortex,
Whole_Blood), `limit` (1-54, default 20; tissues sorted highest TPM first).
GTEx Analysis v10, 54 tissue sites, median TPM.

`gtex_eqtl`: `gene`, `tissue` (REQUIRED tissueSiteDetailId), `limit`
(1-100, default 20). Significant cis-eQTLs sorted by ascending p-value:
variant_id, p_value, NES.

## Worked examples

Find melanoma single-cell studies:

```json
{"query": "melanoma single cell", "organism": "Homo sapiens", "limit": 10}
```

Series detail with supplementary download:

```json
{"accession": "GSE183947", "download": true, "max_bytes": 100000000}
```

Runs for a study:

```json
{"query": "SRP123456"}
```

A 5 kb region slice of a big chromosome record:

```json
{"accession": "NC_000023.11", "seq_start": 43070000, "seq_stop": 43075000,
 "format": "fasta"}
```

Expression profile across tissues:

```json
{"gene": "TP53", "limit": 10}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| sra_get error: European/DDBJ accession | ERP/ERR/DRP/DRR not in NCBI SRA | use ENA (https://www.ebi.ac.uk/ena) for those accessions |
| genbank_get error requiring region | record > 2,000,000 bp without seq_start/seq_stop | supply a 1-based inclusive region (max 10 Mb span) |
| sequence_text ends with "...[truncated N of M chars ...]" | output guard caps at 200,000 chars | request a narrower region for the full text |
| geo_get download refused | non-NCBI host or file exceeds max_bytes | raise `max_bytes` (cap applies) or download manually from the returned URL |
| GEO supplementary downloads slow | unthrottled raw downloads | pace download calls manually; only download when analysis truly needs the file |
| gtex_eqtl error about tissue | missing/invalid tissueSiteDetailId | tissue is required - use e.g. "Whole_Blood", "Brain_Cortex" |

## Integration notes

- Chaining map: geo -> sra (`sra_project`/first_run), geo -> literature
  (`pubmed_ids` -> article_get), genbank -> genes (`genbank_genes`), gene ->
  GTEx (symbol or Ensembl ID), geo sample/platform -> geo_get.
- E-utilities (PubMed/GEO/SRA/GenBank) share ONE server-side limiter: 334 ms
  keyless, 100 ms with NCBI_API_KEY - no manual throttling.
- GEO SOFT record fetches are separately limited at 300 ms; supplementary
  file downloads are unthrottled.

# Tool Selection

Route a research question to the correct biomcp tool, then shape the call with
`sections` / `limit` / pagination so payloads stay small.

## Overview

biomcp (npm `biomcp`, pinned `biomcp@1.1`) exposes 56 tools: 41 core plus 15
environment-gated optional tools (3 database, 4 R analysis, 8 biowasm). This
file routes question types to tools; per-domain parameter detail lives in the
domain reference files.

> In MCP clients that prefix server tools (e.g. opencode with server name
> 'biomcp'), tools appear as biomcp_article_search etc.

## Domain routing decision tree

```
QUESTION TYPE
├─ Literature / papers / PubMed
│   → article_search (query, source?, dateRange?, limit, offset)
│   → article_get (id: PMID/PMCID/DOI, sections?, citation_mode?)
│   → details: references/article-literature.md
│
├─ Clinical trials / NCT IDs
│   → trial_search (query, status?, phase?, intervention_type?, page_token?)
│   → trial_get (nct_id, sections?)   # no "protocol" section exists
│   → details: references/clinical-trials.md
│
├─ Genes
│   → gene_search (query, chromosome?, limit, offset)   # discovery
│   → gene_get (symbol, sections?, smart?)               # annotation
│   → gene_diseases / gene_drugs / gene_trials / gene_articles  # cross-links
│   → gene_enrich (genes[])                              # Reactome pathways
│   → details: references/genes.md
│
├─ Variants / mutations
│   → variant_search (gene + hgvsp as SEPARATE params - never free text)
│   → variant_get (id, sections?)
│   → variant_oncokb (gene, protein_change)   # needs ONCOKB_TOKEN
│   → variant_trials (variant)
│   → details: references/variants.md
│
├─ Drugs / compounds
│   → drug_search (query, limit, offset)
│   → drug_get (name, sections?)   # safety = labels; adverse_events = FAERS
│   → drug_trials (drug)
│   → details: references/drugs.md
│
├─ Diseases
│   → disease_search (query, limit, offset)
│   → disease_get (disease_id, sections?)   # DOID/MONDO/OMIM/EFO/Orphanet/CUI
│   → disease_drugs / disease_trials
│   → details: references/diseases.md
│
├─ Patents / prior art
│   → patent_search (query, assignee?, source?, seminal?, sort_by?)
│   → patent_get (patent_id, sections?)
│   → details: references/patents.md
│
├─ Functional genomics datasets / sequences
│   → geo_search / geo_get        # expression & sequencing studies
│   → sra_search / sra_get        # sequencing runs (NCBI accessions only)
│   → genbank_search / genbank_get / genbank_genes
│   → gtex_expression / gtex_eqtl
│   → details: references/functional-genomics.md
│
├─ Orthologues / consequences / regions / structures
│   → ensembl_lookup / ensembl_homology / ensembl_consequence / ensembl_region
│   → pdb (query | pdb_id | pdb_id+download)
│   → details: references/ensembl-pdb.md
│
├─ Ambiguous / multi-entity free text ("BRAF V600E melanoma")
│   → discover (query)            # resolves concepts to typed entities
│
├─ Many entities at once
│   → batch_get (inputs: [{entity, id, sections?}])
│
├─ Local SQL database (DB_TYPE set)
│   → db_list_tables → db_describe_table → db_query
│   → details: references/optional-analysis.md
│
└─ Differential expression / BAM/VCF/BED analysis (opt-in features)
    → analysis_r_* / analysis_bam_* / analysis_bcf_* / analysis_bed_op / ...
    → details: references/optional-analysis.md
```

## The `sections` pattern (payload trimming, part 1)

The `_get` tools for article, trial, gene, variant, drug, disease, and patent
accept `sections` (array of enum strings) plus `limit` (1-100, default 20):

- Omit `sections` -> core metadata only (smallest payload).
- Request only the sections you need, e.g. `drug_get` with
  `sections: ["safety"]` instead of `["all"]`.
- `"all"` expands to every non-core section - use it only when most sections
  are genuinely needed.
- `limit` caps array lengths within requested sections (e.g. top 20 citations,
  top 20 adverse-event reaction rows).

Valid section enums per tool are tabulated in the domain reference files.

## Pagination (payload trimming, part 2)

- Most search tools (`article_search`, `gene_search`, `variant_search`,
  `drug_search`, `disease_search`, `patent_search`, `geo_search`,
  `sra_search`, `genbank_search`): offset-based - `limit` (1-50, default 10)
  plus `offset` (>= 0).
- `trial_search` is the exception: CURSOR-based only - pass the `page_token`
  string from the previous response; there is no `offset` parameter.
- Stop paging when a page returns fewer than `limit` results, or when you have
  enough sources for the claim at hand (typically 5-15 per aspect).

## Worked example: routing a compound question

Question: "What evidence links BRAF V600E to melanoma drug resistance?"

1. `discover(query="BRAF V600E")` - confirm entity types (gene + variant).
2. `article_search(query="BRAF V600E melanoma treatment resistance",
   dateRange="2018-01-01/", limit=15)` - recent literature.
3. `variant_search(gene="BRAF", hgvsp="V600E")` - variant IDs/coordinates.
4. `drug_get(name="vemurafenib", sections=["core","safety"])` - approved BRAF
   inhibitor label data.
5. `trial_search(query="BRAF melanoma", phase="Phase 3")` - trial landscape.

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `no_such_tool` for a db/analysis tool | feature not enabled, or enabled after server start (tools register at startup only) | set `DB_TYPE`/`ANALYSIS_R`/`ANALYSIS_BIOWASM` in the client env block, restart the client |
| Tool error mentioning OncoKB token | `variant_oncokb` without `ONCOKB_TOKEN` | get a token (oncokb.org registration) and set it, or skip OncoKB |
| gene_diseases returns an `_error` about DisGeNET | no `DISGENET_API_KEY` | the tool falls back to OpenTargets associations; add the key for DisGeNET data |
| variant_search returns nothing for "BRAF V600E" as `query` | compound free text is not a variant ID | use `gene="BRAF"`, `hgvsp="V600E"` as separate params (the tool also auto-splits a bare "GENE V600E" query, but explicit params are reliable) |
| Trial pages repeat or skip | offset paging used on trial_search | use `page_token` cursor paging |

## Integration notes

- Confirm the server is connected before fan-out: any cheap call (e.g.
  `gene_search(query="BRAF", limit=1)`) suffices as a smoke test.
- `biomcp_configure` with `{}` reports feature availability and config health
  in one call (see `references/utility-config.md`).
- Rate limits, timeouts, and auth requirements: `references/rate-limiting-auth.md`.

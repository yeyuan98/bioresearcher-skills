# Analysis Methods

Decision matrix for research aspects: when evidence is sufficient, which
sources count, and how to choose synthesis depth.

## Overview

Each research aspect needs a deliberate evidence plan: which entity types and
tools answer it, how many sources are enough, and when to stop. This file
ports the analysis decision matrix from the plugin, retargeted to biomcp.

## Evidence sufficiency per aspect

An aspect is DONE when ALL of these hold:

1. The aspect question is answered by at least 2-5 independent sources (or 1
   authoritative registry + 1 corroborating source - e.g. FDA status +
   label text).
2. Every quantitative claim has a source (prevalence, counts, percentages).
3. Conflicting evidence between sources is explicitly noted, not silently
   resolved.
4. Remaining gaps are named ("no Phase 3 data post-2024 found via
   trial_search").

| Aspect type | Typical evidence bar | Primary tools |
|-------------|---------------------|---------------|
| Literature landscape | 5-15 articles, mix of original + review | article_search, article_get |
| Trial landscape | All matching trials (paged), status breakdown | trial_search (+page_token), trial_get |
| Drug evidence | Regulatory status + label + top FAERS events | drug_get (us_regulatory, safety, adverse_events) |
| Gene/disease association | Registry associations + key publications | gene_diseases / disease_get + article_search |
| Variant evidence | Variant annotation + (if token) OncoKB + trials | variant_search, variant_get, variant_oncokb |
| Patent landscape | 10-30 patents incl. seminal prior art | patent_search, patent_get |
| Dataset hunt | Candidate accessions + linked publication | geo_search, sra_search, genbank_search |

## Source-quality rules

Evidence tiers (only the first two are citable as findings):

1. biomcp tool results (PubMed, ClinicalTrials.gov, FDA/openFDA, MyGene/
   MyVariant/MyChem/MyDisease, Ensembl, GTEx, DisGeNET, OpenTargets,
   OncoKB, CIViC, EPO/USPTO, RCSB, GEO/SRA/GenBank).
2. Official biotech/pharma/regulatory websites when biomcp lacks coverage
   (cite with URL + access date).
3. General web search results - acceptable ONLY as leads; verify before
   citing, never cite alone for a factual claim.

NEVER cite: internal model knowledge, blogs/forums, promotional material,
or unverifiable claims. If only tier-3 material exists, mark the finding as
"unverified" in the report.

## Approach selection by data volume

| Situation | Approach |
|-----------|----------|
| Question answered by tool results directly | Synthesize from tool output |
| Many entities to fetch (>= 5 known IDs) | ONE batch_get call, then synthesize |
| Local table/spreadsheet analysis | Prefer harness file tools or a small Python script; only ask biomcp analysis tools if data is genomic (counts matrix, BAM/VCF/BED) |
| Deep dive on one entity | Domain `_get` tool with targeted `sections` |

## Analysis step rules

1. Filter at the source (specific query terms, `limit`, `sections`) - never
   retrieve broadly and filter in-context.
2. Sequential MCP calls within a worker; no concurrent biomcp calls.
3. Validate results before writing: check IDs are well-formed (PMID numeric,
   NCT + 8 digits, accessions match expected patterns), arrays non-empty,
   and dates plausible.
4. Record the query provenance in each aspect file: tool + key arguments
   (e.g. `trial_search(query="melanoma", phase="Phase 3")`).

## Synthesis rules (orchestrator)

1. Read ALL aspect files before writing the final report.
2. Structure findings by research question, not by aspect file order, when
   the aspects overlap.
3. Re-number citations across aspects into one bibliography for
   final_report.md.
4. Contradictions between aspects: present both with sources and, if
   unresolvable, list under Limitations.
5. Confidence marking: state High/Medium/Low confidence per key finding
   based on source count and tier.

## Failure modes

| Symptom | Fix |
|---------|-----|
| Aspect spiraling into 50+ tool calls | Apply the sufficiency bar; stop at the evidence threshold |
| Findings rest on a single low-tier source | Note in Limitations; attempt one corroborating query |
| Synthesis just concatenates aspect summaries | Restructure around the user's question; deduplicate overlapping findings |
| Numbers in report lack citations | Every quantitative claim needs [N] provenance |

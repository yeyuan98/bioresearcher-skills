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

## Evidence verification discipline

Applies to every claim a worker or the orchestrator writes. Each rule guards
a distinct general LLM failure mode. Topic-specific inclusion/exclusion
boundaries are authored per-run by the orchestrator into each aspect
ABSTRACT; these rules govern how workers apply any such criteria.

1. Direction of causality: keyword overlap is not direction. Verify the
   cited source shows the direction asserted (causes vs prevents/attenuates
   vs merely correlates / serves as a marker) before using it for a causal
   claim - protective and causal findings share vocabulary.
2. Quantitative fidelity: tie every number (effect size, rate, count,
   percent) to its specific source record at capture time, keyed by its
   ledger key; never transcribe a value for one entity from prose about a
   related entity - dense multi-entity summaries invite cross-contamination.
3. Criterion vs keyword: matching the search terms is not satisfying the
   research criterion. Check the source shows the entity meets the aspect's
   inclusion definition; exclusion criteria in the plan are binding, and
   keyword-matching candidates that fail them are noted as excluded, never
   admitted to boost yield.
4. Axis discipline: when the plan classifies findings along an axis, every
   admitted finding must genuinely instantiate that axis; observations of a
   different kind attach as secondary attributes, never as improvised
   categories (e.g. an organism-level endpoint vs a molecular mechanism in
   a mechanistic survey, or a legal-claim scope vs a technical feature in a
   patent analysis). New categories are a plan change (orchestrator +
   user), not a per-finding decision.
5. Primary vs downstream: when attributing an effect to a mechanism, verify
   the source establishes it as the initiating/primary cause rather than a
   downstream consequence or a late-stage marker of an upstream process -
   cascades share endpoints, so late-stage observations do not localize
   origins.

## Synthesis rules (orchestrator)

1. Read ALL aspect files before writing the final report.
2. Structure findings by research question, not by aspect file order, when
   the aspects overlap.
3. Cite with the workers' semantic cite-key markers in
   `final_report.draft.md`; numbering and the bibliography come from
   `render` (SKILL.md Step 5b) - never hand-number.
4. Contradictions between aspects: present both with sources and, if
   unresolvable, list under Limitations.
5. Confidence marking: state High/Medium/Low confidence per key finding
   based on source count and tier.
6. Apply the evidence-verification discipline at merge time: rules 3-5 gate
   framework adherence (unplaceable findings go to Limitations, never into
   improvised categories); re-check rules 1-2 whenever synthesis rewords a
   claim or transcribes a number from an aspect report.

## Failure modes

| Symptom | Fix |
|---------|-----|
| Aspect spiraling into 50+ tool calls | Apply the sufficiency bar; stop at the evidence threshold |
| Findings rest on a single low-tier source | Note in Limitations; attempt one corroborating query |
| Synthesis just concatenates aspect summaries | Restructure around the user's question; deduplicate overlapping findings |
| Numbers in report lack citations | Every quantitative claim needs [N] provenance |

# Research Plan: BRCA1 DNA Repair — Recent Article Landscape

TOPIC: brca1_dna_repair_landscape
Mode: no-interview light-research (user-requested defaults; 2 aspects, ≤10 biomcp tool calls per aspect worker, cite PMIDs)
Generated: 2026-09-11

## Research question

Survey the recent (roughly 2023–2026) article landscape on BRCA1 in DNA repair,
covering both molecular mechanism and the therapeutic/clinical exploitation of
BRCA1 deficiency.

## Aspects

### Aspect 1: hr_mechanisms

BRCA1 mechanisms in homologous recombination (HR) DNA double-strand break
repair and replication fork protection: RING E3 ubiquitin ligase activity,
BRCT phospho-peptide interactions, PALB2/BRCA2/RAD51 partner recruitment,
RAP80/Abraxas damage-site targeting, fork stabilization, and recent
structural/mechanistic insights.

- Inclusion: articles substantially about BRCA1 DNA repair function/mechanism;
  primary research or authoritative reviews; 2023–preferred, landmark older
  work acceptable.
- Exclusion: purely clinical outcome studies without mechanistic data;
  BRCA2-only or PALB2-only studies without explicit BRCA1 focus;
  germline-risk/epidemiology-only studies.
- Primary tools: article_search (dateRange-filtered), article_get for
  enrichment. Evidence bar: 5–15 articles (mix of original + review).

### Aspect 2: parpi_resistance_clinical

BRCA1 deficiency in cancer: PARP inhibitor (PARPi) sensitivity and resistance
mechanisms (reversion mutations, fork-protection regain, shieldin/53BP1-pathway
alterations), HR restoration, combination strategies, and the recent
trial/clinical landscape in BRCA1-deficient settings.

- Inclusion: BRCA1 (or BRCA1/2 with explicit BRCA1 relevance)
  therapy-response/resistance studies, mechanistic-clinical bridges, and
  high-profile recent trials; 2023–preferred.
- Exclusion: purely biochemical mechanism studies without therapy relevance
  (owned by Aspect 1); non-BRCA HR-gene-only studies; epidemiology-only.
- Primary tools: article_search (dateRange-filtered), article_get for
  enrichment, optionally trial_search. Evidence bar: 5–15 sources.

## Binding execution constraints (user-imposed, relayed verbatim to workers)

- At most 2 research aspects (light-research).
- At most 10 biomcp tool calls per aspect worker — HARD CAP, binding; every
  biomcp_* call counts, including enrichment article_get calls.
- Cite sources with PMIDs (semantic markers `[@pmid:...]`).

## Dispatch

Tier B (generic subagent via task tool), 2 workers in parallel. Sequential
biomcp calls within each worker. Worker outputs:
`reports/brca1_dna_repair_landscape/{hr_mechanisms,parpi_resistance_clinical}.md`
plus per-aspect evidence ledgers under `evidence/`.

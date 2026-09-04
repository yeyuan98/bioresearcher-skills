# Migrating from opencode-bioresearcher-plugin

The plugin (`@yeyuan98/opencode-bioresearcher-plugin` ≤ 1.7.2) embeds
biomcp-**python**-era tool names in its prompts. This repo's skills target
biomcp-**ts**. Map your muscle memory as follows.

## Tool-name map (biomcp-python → biomcp-ts)

| Old (plugin prompts) | New (biomcp-ts) | Notes |
|---|---|---|
| `biomcp_article_searcher` | `article_search` | Federated: pubmed/europepmc/semantic_scholar/pubtator/litsense |
| `biomcp_article_getter` | `article_get` | PMID/PMCID/DOI; `citation_mode` fast/full + direction |
| `biomcp_trial_searcher` | `trial_search` | Cursor pagination via `page_token` (no offset) |
| `biomcp_trial_getter` | `trial_get` | `sections`: core/eligibility/locations/outcomes/all |
| `biomcp_trial_protocol_getter` | `trial_get` `sections:["core","eligibility"]` | **No `protocol` section exists** in biomcp-ts |
| `biomcp_trial_outcomes_getter` | `trial_get` `sections:["outcomes"]` | |
| `biomcp_gene_getter` | `gene_get` | HGNC symbol only; `smart:true` resolves aliases (HER2→ERBB2) |
| `biomcp_variant_searcher` | `variant_search` | Use structured `gene`+`hgvsp`, not free text like "BRAF V600E" |
| `biomcp_variant_getter` | `variant_get` | |
| `biomcp_drug_getter` | `drug_get` | |
| `biomcp_openfda_adverse_searcher` | `drug_get` `sections:["adverse_events"]` | FDA FAERS ranked reactions; **no patient/age/sex/date filters** (downgrade) |
| `biomcp_openfda_label_searcher` | `drug_get` `sections:["safety"]` | Label text (boxed warnings, warnings, adverse reactions) lives in `safety`; `us_regulatory` yields only brand name + `fda_status` |
| `biomcp_openfda_approval_searcher` | — | **No equivalent** (downgrade): only the derived `fda_status` in `us_regulatory` |
| `biomcp_search` | `discover` | Free-text concept resolution |
| `biomcp_fetch` | per-entity `*_get` tools | |

New capabilities the plugin never covered: patents, GEO/SRA/GenBank/GTEx,
Ensembl, PDB, `batch_get`/`discover`/`biomcp_configure`, optional db /
R-analysis / biowasm tool groups. See
`skills/bioresearcher-deep-research/references/`.

## What stayed in the plugin

The plugin's custom opencode tools (table/db/JSON/calculator/parser), agent
registrations, and permission gating are opencode-plugin features and are not
part of this skills repo. `parse_pubmed_articleSet` is replaced by the
pure-Python parser in `bioresearcher-pubmed-weekly` (which also handles
`<DeleteCitation>` records the old parser ignored).

## Behavioral changes to unlearn

- **No manual throttling**: the old `blockingTimer(0.3/0.5)` discipline is
  obsolete — biomcp-ts rate-limits per source in-process (see
  `docs/biomcp-ts-setup.md`). HPA sections and GEO downloads are the paced
  exceptions.
- Reports now land in `reports/<topic>/` (was `reports_biomcp/<topic>/`).
- HTML rendering: use the skill's `markdown-to-html.py` fallback or pandoc
  (was the plugin's `markdownToHtml` tool).

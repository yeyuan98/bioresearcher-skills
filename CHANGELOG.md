# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Each skill carries an independent semver tracked in `skills.json` and its
`metadata.version`; the repository-level `VERSION` drives release tagging.

## [1.0.0] - 2026-09-04

### bioresearcher-deep-research 1.0.0
- Initial release. Harness-agnostic deep biomedical research skill: interview →
  aspect decomposition → parallel-or-sequential per-aspect research → synthesis
  with citations. `no-interview` and `light-research` prefixes.
- 18 reference guides retargeted from the opencode-bioresearcher-plugin v1.7.2
  pattern library to the biomcp-ts v1.1.1 tool surface (56 tools): tool
  selection, per-domain query recipes (articles, trials, genes, variants,
  drugs, diseases, patents, GEO/SRA/GenBank/GTEx, Ensembl/PDB, utility/config,
  optional db/R/biowasm), analysis methods, report template, citation formats,
  rate-limit/auth guidance (server-side per-source limiters replace manual
  sleep timers; HPA and GEO-download exceptions documented), best practices.
- `scripts/markdown-to-html.py` portable HTML report fallback (python-markdown).

### bioresearcher-python-setup-uv 1.0.0
- Initial release. Ported from opencode-bioresearcher-plugin v1.7.2
  `python-setup-uv`; frontmatter conformed to the Agent Skills spec strict-6
  schema; opencode-specific phrasing genericized; `.scripts/py/` path convention.

### bioresearcher-pubmed-weekly 1.0.0
- Initial release. Weekly PubMed updatefiles downloader with a NEW pure-Python
  streaming parser (`scripts/parse_updatefiles.py`) replacing the retired
  plugin-only `parse_pubmed_articleSet` tool: handles interleaved
  `<PubmedArticle>` and `<DeleteCitation>` records via `xml.etree.iterparse`
  with openpyxl write-only output. Frozen output schema: sheets
  `PubMed Articles` (PMID, DOI, Title, Journal, ISSN, PubDate, FirstAuthor,
  LastAuthor, PublicationTypes) and `Deleted PMIDs` (PMID).

### Infrastructure
- Agent Skills spec strict-6 conformance gate, drift checks (skills.json ↔
  metadata.version ↔ CHANGELOG), link/duplicate-heading lint, legacy-name grep
  gate (16 retired biomcp-python tool names), biomcp-ts tool-name drift gate
  (pinned 56-tool registry), per-skill bundle caps, Claude Code marketplace
  validation (`.claude-plugin/marketplace.json` + `plugin.json`).
- Release automation: push-to-main version-compare → `gh release create` with
  CHANGELOG-extracted notes (biomcp-ts release pattern).
- `agent-test/`: empirical, manually-run opencode CLI test suite (unified
  `run.mjs` runner ported from biomcp-ts `agent-test`; 6 cases: 3 skill
  discovery, 1 biomcp MCP light research, 1 fixture parse, 1 uv setup).
- Docs: biomcp-ts MCP setup, plugin→skills migration map (including openFDA
  semantic downgrades), exposure checklist.

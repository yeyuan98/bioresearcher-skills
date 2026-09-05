# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Each skill carries an independent semver tracked in `skills.json` and its
`metadata.version`; the repository-level `VERSION` drives release tagging.

## [1.2.0] - 2026-09-05

### bioresearcher-plot-making 1.0.0
- Initial release. Routing dispatcher and publication-grade scientific plotting engine:
  - Central routing document (`SKILL.md`) directing requests via declarative decision matrix.
  - Structural biology binder visualization specification (`references/structural-biology-binder-visualization.md`): headless PyMOL 3D ray-tracing, contact-fragment pruning, site-normal camera orientation, 2D vector text anchors via probe pass, conformational dynamics, and triple-encoded interface matrices.
  - Literature search method summary specification (`references/literature-search-method-summary.md`): primary source verification via NCBI E-utilities, Three-Panel Composite architecture (mechanistic concept + case register + detection cascade), and Single-Panel Structured Evidence Table layout with dynamic text measurement.
  - QA gates and gotchas specification (`references/qa-gates-and-gotchas.md`): comprehensive catalog of 17 hard-earned gotchas and 3-layer QA verification architecture.
  - Bundled standalone QA auditors in `scripts/`: `audit_panel_alignment.py` (≤1.5 pt tolerance), `audit_figure_collisions.py` (vector PDF overlap detection), and `audit_pdf_text.py` (≥5.0 pt font floor).
- Keep all reference data-contract examples fully synthetic (conformer dynamics, hotspot matrices, binder summary metrics, render anchors, literature registers, and evidence tables use non-proprietary values and non-assignable sentinel PMIDs).
- Pin dependency installation and script execution to the project `./.venv` (`VIRTUAL_ENV` pin or `./.venv/bin/python` / `./.venv/bin/pymol`) so host environments are never mutated.

### bioresearcher-python-setup-uv 1.1.0
- Add explicit Scientific Visualization profile (`pymol-open-source`, `matplotlib`, `pymupdf`, `numpy`, `pillow`, `biopython`, `pandas`).
- Support headless 3D macromolecular rendering via `pymol-open-source` Python API and standalone `./.venv/bin/pymol` CLI without system GUI/X11 requirements.
- Add visualization stack verification instructions.
- Replace the manual mirror question with an autonomous timed mirror race (PyPI, Aliyun, Tsinghua, USTC) exported as `UV_INDEX_URL` for the whole session; document `UV_DOWNLOAD_URL` and `UV_PYTHON_INSTALL_MIRROR` fallbacks for slow networks.
- Pin all installs and invocations to the project `./.venv` (`VIRTUAL_ENV="$(pwd)/.venv"` / `./.venv/bin/python`); document uv interpreter precedence (`--python` > `VIRTUAL_ENV` > `CONDA_PREFIX` > `./.venv`) so an active host conda environment can never capture or be mutated by installs; steer `uv add` to venv-pinned pip installs.

### bioresearcher-onboard 1.1.0
- Add explicit onboarding support for four additional AI coding agent harnesses:
  - ZCode (`.zcode/config.json` with `mcp.servers.biomcp`).
  - Pi Coding Agent (`.pi/mcp.json`).
  - CodeBuddy (`.mcp.json` + pre-approval in `.codebuddy/settings.json`).
  - WorkBuddy (`.workbuddy/mcp.json`).
- Rescope auto-detection strictly to workspace-local footprints to eliminate global HOME directory pollution.
- Harden JSONC handling (inline comments and trailing commas) with fail-safe error handling to prevent config loss.
- Guarantee recursive parent directory creation (`mkdirSync`) across all client config writes.

### Infrastructure
- agent-test: add `plot-making-q01-structural` and `plot-making-q02-literature` (L2 procedural) plus `skills-q05-discovery-plot-making` (L0 discovery) empirical cases, growing the suite from 8 to 11 cases.
- agent-test: hermetic child environments — `sanitizeChildEnv()` strips conda/mamba/virtualenv/uv-override variables and conda-family PATH entries at both spawn sites so agent `uv pip`/`uv run` can only target the run-local `./.venv` (mirror/index variables preserved); plot-making timeouts raised to 25 min for hermetic cold-start runs; `resources.tar.bz2` archives regenerated without `__pycache__`.
- ci: extend the `ci.yml` gate with `py_compile` of the plot-making auditor scripts.
- Update `README.md` skills catalog with the `bioresearcher-plot-making` entry.
- Bump repository VERSION to 1.2.0 and keep `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `CITATION.cff` in lockstep so existing plugin users receive the new skill.

## [1.1.0] - 2026-09-04

### bioresearcher-onboard 1.0.0
- Initial release. Automated project-local onboarding skill for BioMCP:
  - Two-stage zero-dependency bootstrap (POSIX shell / PowerShell) for hosts without Node.js >= 22.13.
  - Portable Node.js v22.14.0 vendoring into `.bioresearcher-runtime/node/` with SHA256 verification and automatic pruning (-49 MB).
  - Adaptive 1.2s mirror probe (official distribution vs. npmmirror in mainland China).
  - Hermetic local npm installation of `biomcp@1.1.1` into `.bioresearcher-runtime/node_modules/` (sub-100ms startup, 100% offline resilient).
  - Non-destructive deep-merging of harness configs (OpenCode, Claude Code, Cursor, Codex).
  - Pre-flight diagnostic verification via `biomcp doctor --json`.

### Infrastructure & Docs
- Bump repository VERSION to 1.1.0.
- agent-test: add `onboard-q01-bootstrap` (L1 side-effect) and `skills-q04-discovery-onboard` (L0 discovery) empirical cases, growing the suite from 6 to 8 cases.
- Update `README.md` skills catalog and installation guide.
- Update `docs/biomcp-ts-setup.md` with the automated onboarding pathway.

## [1.0.1] - 2026-09-04

### bioresearcher-deep-research 1.0.1
- Security hardening: clarify npm package `biomcp` canonical repository provenance (`yeyuan98/biomcp-ts`) pinned to `1.1.1`.
- Add data boundary and literature prompt injection defense guidelines.

### bioresearcher-python-setup-uv 1.0.1
- Security hardening: eliminate piped shell execution (`curl | sh` / `Invoke-Expression`) in favor of verified disk download and local execution.
- Remove unverified third-party mirror; add standard regional PyPI mirror acceleration configuration (`UV_INDEX_URL`).
- Add machine-readable boundary comments and explicit user consent for `AGENTS.md` environment rules.

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

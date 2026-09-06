# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Each skill carries an independent semver tracked in `skills.json` and its
`metadata.version`; the repository-level `VERSION` drives release tagging.
Top-level `## [x.y.z]` headings cover BOTH repository releases and per-skill
releases; the `###` subsection under a heading names the skill (or
"Infrastructure") it belongs to.

## [1.1.1] - 2026-09-06

Skill-level release; repository VERSION unchanged at 1.4.0.

### bioresearcher-deep-research 1.1.1
- Step 1 interview hardened against harness autonomy hints (observed on the
  ZCode desktop harness, whose auto-accept mode injects "operate
  autonomously / user not watching" guidance that made agents skip the
  interview and proceed on silent defaults): the Workflow preamble now
  reconciles such hints (they govern permission confirmations, not the
  interview turn), Step 1 is explicitly mandatory with a single-batch ask,
  a one-re-ask cap, an explicit BAD/GOOD example, and an
  observation-triggered non-interactive degradation path that writes loud
  defaults to `reports/<TOPIC>/assumptions.md` instead of silent ones
  (merely being headless is explicitly NOT a waiver; one-shot runs correctly
  end their turn with the questions).
- Step 6 HTML rendering is now deterministic: `final_report.html` is
  produced by default (was "optional" - the primary cause of markdown-only
  runs), with a new leading `no-html` prefix opt-out, the `<skill_dir>`
  absolute-path convention for the conversion script (was a relative path
  that only worked with cwd == skill dir), a fixed
  uv → python3 → pandoc → explicit-gap conversion ladder with anti-spin
  rules (no installs, one attempt per rung, verify output non-empty), and a
  final-summary contract naming the artifacts produced.
- New "Request prefixes" section defining `no-interview`, `light-research`,
  and `no-html` as case-sensitive leading tokens (mid-query matches never
  trigger).
- Worker protocol: workers never interview the user - clarification is
  exclusively the orchestrator's Step 1.
- Agent tests: `deep-research-q01-light` now asserts the HTML artifact; new
  manual case `deep-research-q02-interview` verifies the interview fires in
  non-interactive `opencode run --auto` mode (suite grows 11 → 12).
- Docs: README skill row and `docs/migration-from-plugin.md` note the
  Markdown + HTML default output.

## [1.4.0] - 2026-09-06

### Infrastructure
- Bundle the pinned core-only biomcp MCP server in the Claude Code plugin
  (`.claude-plugin/mcp.json`, referenced from `plugin.json` `mcpServers`;
  tools surface as `mcp__plugin_bioresearcher_biomcp__*`, 120 s tool
  timeout): marketplace installs auto-start `biomcp@1.1.1` over stdio with
  no manual `.mcp.json`; a manual registration and the bundled server do
  not deduplicate, so disable one via `/mcp`.
- Ship the `bioresearcher-dr-worker` plugin subagent
  (`.claude-plugin/agents/`, referenced from `plugin.json` `agents`) for the
  deep-research fan-out: tool pool limited to the biomcp servers plus
  read/write file tools; self-loads the skill's worker protocol and
  cheatsheets via `${CLAUDE_PLUGIN_ROOT}`.
- CI: new `lint-agents.mjs` gate; `check-marketplace.mjs` pins the bundled
  server args to `scripts/ci/biomcp-tools.json`; `lint-frontmatter.mjs`
  accepts `mcp__*` server rules in `allowed-tools`; the tool-name and
  legacy-name gates now also scan `.claude-plugin/agents/`;
  `check-drift.mjs` gates `CITATION.cff` version (fixing a pre-existing
  1.2.0-vs-1.3.0 drift).
- New manual empirical suite `agent-test/claude-plugin-specific/` (6 cases;
  hermetic `--list`/`--dry-run` in CI). Empirical findings on Claude Code
  2.1.261: Tier A worker dispatch confirmed (three `bioresearcher-dr-worker`
  subagents spawned for a light-research run), and the skill `allowed-tools`
  turn grant does NOT cover MCP server rules in headless manual mode —
  docs now present the `permissions.allow` snippet as the dependable
  prompt-free path.
- WorkBuddy connector: the v1.4.0 tarball (built and attached by the
  release workflow) carries the deep-research 1.1.0 staged skill.
- Bump repository VERSION to 1.4.0 and keep `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`, `connector/workbuddy/connector-meta.json`,
  and `CITATION.cff` in lockstep so existing plugin users receive the
  bundled MCP server and worker agent.

### bioresearcher-deep-research 1.1.0
- Step 4 worker dispatch is now three-tier and capability-based: dedicated
  `bioresearcher-dr-worker` subagent when installed (no prompt inlining),
  generic subagent with the inlined worker cheatsheets otherwise
  (harness-agnostic path preserved), sequential fallback unchanged; new MCP
  availability pre-check degrades to sequential with an explicit notice.
- `allowed-tools` additionally lists the Claude Code biomcp server rules
  (`mcp__plugin_bioresearcher_biomcp`, `mcp__biomcp`) as a best-effort
  turn grant; inert strings on other harnesses.
- Prerequisites document the plugin-bundled core-only server, the
  all-features divergence (manual `-p webr@0.6 -p mysql2@3` variant), and
  `/mcp` coexistence.

## [1.3.0] - 2026-09-06

### Infrastructure
- Add the WorkBuddy connector flavor under `connector/workbuddy/`
  (`connector-meta.json`, `mcp.json`, `icon.jpg`, `skill-locales.json`):
  the pinned core-only biomcp stdio server (Node 22 runtime, npmmirror,
  120 s timeout) plus four skills — `bioresearcher-onboard` intentionally
  excluded (conflicts with the connector's own registration; see
  docs/connector-workbuddy.md).
- Add `scripts/ci/build-connector-workbuddy.mjs`: stages the bundle under
  `dist/bioresearcher/`, augments only the staged SKILL.md frontmatter with
  the WorkBuddy-required keys (`description_zh`/`description_en`/`version`/
  `author`, derived from skill-locales.json, SKILL.md, skills.json, and
  plugin.json), validates it, and emits a reproducible
  `bioresearcher-connector_workbuddy-v<VERSION>.tar.gz`.
- CI: new "WorkBuddy connector build smoke" gate; `check-drift.mjs` now also
  enforces `connector-meta.json` version == repo `VERSION`.
- Release: every GitHub release from a commit containing `connector/workbuddy/`
  attaches the versioned connector tarball (idempotent, old tags skip).
- Icon: 512x512 optimized progressive JPEG prepared from the uncommitted
  Bioresearcher-Logo-v2.jpg master (sha256 recorded in
  docs/connector-workbuddy.md).

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

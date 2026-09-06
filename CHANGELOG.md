# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Each skill carries an independent semver tracked in `skills.json` and its
`metadata.version`; the repository-level `VERSION` drives release tagging.
Top-level `## [x.y.z]` headings are repository releases ONLY. Per-skill
changes appear as `### <skill-name> <x.y.z>` subsections under the repo
release that ships them; a skill bump that lands between repo releases goes
under `## [Unreleased]` and is folded into the next `## [x.y.z]` section
when that release PR is cut (the release workflow extracts only the
`## [<VERSION>]` section for the release notes).

## [1.5.0] - 2026-09-06

### Demos (partner publication pack)

- New `demos/` directory: bilingual (zh/en) partner-facing documents for the
  Agent (skills + plugin + connector) and the biomcp MCP server — each
  covering functionality, technical architecture/API docs, core features,
  onboarding, application cases, demo links, and FAQ — backed by **true-run
  demo artifacts** (7 scenarios, all PASS — two via recorded manual review; commit +
  sha256 provenance per artifact directory).
- `demos/run-demo.mjs`: self-contained runner + 12-check grader vendored from
  `agent-test/run.mjs` (scenarios under `demos/scenarios/` with an
  `agent`/`mcp-probe` kind discriminator; `--publish` curates graded reps
  into `demos/artifacts/`; CI-safe `--list`/`--dry-run`).
- `demos/lib/mcp-probe.mjs`: zero-dependency stdio JSON-RPC MCP client
  (initialize -> notifications/initialized -> paginated tools/list ->
  scripted tools/call) capturing true request/response pairs for the MCP API
  tables; `--check` asserts the 41 pinned core tools against the vendored
  registry copy `demos/lib/biomcp-tools@1.1.1.json` (CI-diffed against
  `scripts/ci/biomcp-tools.json`).
- `demos/check-demos.mjs`: hermetic gate for the pack — relative links,
  zh/en section-numbering parity, canonical + retired biomcp tool-name scan
  (no other gate covers `demos/`), vendored-registry identity, scenario
  schema, self-containment lint, size caps (<= 3 MiB / <= 150 files), and
  artifact completeness; wired into CI.
- Docs: `demos/docs/{agent,mcp}.{zh,en}.md` + `glossary.md` (terminology
  anchored to the WorkBuddy connector locale assets); root README links the
  pack under Docs.

### Website (GitHub Pages showroom)

- `demos/website/` — zero-dependency static showroom for GitHub Pages
  (bilingual splash + zh/en mirror trees; homepage highlights,
  get-started, FAQ, per-skill pages, MCP catalog, and per-case report pages
  embedding the byte-exact committed report artifacts via iframe). Built by
  `demos/website/build.mjs` (function templates, esc-by-default; internal
  link check + artifact self-containment tripwire; `_site/` never committed
  and skipped by `check-demos.mjs`); deployed by
  `.github/workflows/pages.yml` (official Pages actions, GITHUB_TOKEN only;
  requires the one-time Settings → Pages → Source: GitHub Actions). CI gains
  a hermetic `node --check` + temp-dir dry build of the site.

### Tooling (version-coupling registry)

- `scripts/ci/version-coupling.json`: the single opt-in registry of
  repo-VERSION-coupled locations (plugin/marketplace/connector/CITATION
  slots plus the partner-doc version literals). `check-drift.mjs` enforces
  live-slot equality — every registered slot must capture exactly the
  current VERSION (all marketplace plugin entries; missing keys fail) —
  plus CITATION `date-released` ⇄ CHANGELOG release-date consistency.
  Two version series never share a mechanism: the per-skill semver axis
  (skills.json ⇄ SKILL.md ⇄ CHANGELOG subsections) keeps its own
  structural checks, untouched; there is deliberately NO repository-wide
  version scan. New `.github/PULL_REQUEST_TEMPLATE.md` surfaces the
  register-in-the-same-PR rule to the human merger.

### Release

- Version 1.5.0 (minor, per the 1.3.0 precedent — new user-facing capability
  on a distributed surface): five coupled files bumped together
  (`VERSION`, `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`,
  `connector/workbuddy/connector-meta.json`, `CITATION.cff`); the
  partner-doc version literals refreshed to v1.5.0.
- Plugin-visible payload is functionally identical to 1.4.1 (skills,
  bundled biomcp server, dr-worker agent unchanged) — Claude-plugin users receive a
  docs/demos cache refresh only; the bump exists to tag the partner
  publication milestone and keep the coupled registry consistent.
- WorkBuddy: the connector tarball
  `bioresearcher-connector_workbuddy-v1.5.0.tar.gz` is attached to this
  release automatically; market resubmission is intentionally deferred —
  connector content is identical to 1.4.1 apart from the version field, so
  it rides the next release that actually changes connector content.
- Showroom: <https://yeyuan98.github.io/bioresearcher-skills/> goes live
  with this release (requires the one-time repo setting Settings → Pages →
  Source: GitHub Actions, then a `pages` workflow re-run; the site footer
  renders the version dynamically from `VERSION`).

## [1.4.1] - 2026-09-06

### Infrastructure
- Bump `VERSION`, `.claude-plugin/plugin.json`,
  `.claude-plugin/marketplace.json`,
  `connector/workbuddy/connector-meta.json`, and `CITATION.cff` to 1.4.1 so
  existing Claude-plugin users receive deep-research 1.1.1 (plugin updates
  ship only when `plugin.json` `version` changes) and the WorkBuddy
  connector tarball rebuilds for resubmission (`minWorkbuddyVersion`
  unchanged - no runtime requirement change).
- CHANGELOG heading convention fixed: top-level `## [x.y.z]` headings are
  repo releases only. The short-lived `## [1.1.1]` heading (a skill-level
  release authored 2026-09-06 in PR #10; skills-CLI installs received
  1.1.1 immediately) is folded into this section; `check-drift.mjs` now
  enforces per-skill coverage via `### <skill> <version>` subsection lines
  (exactly one per version) instead of `## [x.y.z]` substrings, and anchors
  the repo-VERSION heading check. Skill bumps landing between repo
  releases now go under `## [Unreleased]`.
- Patch (not minor) rationale: the plugin-visible payload of this release
  is a skill patch (deep-research 1.1.0 -> 1.1.1) plus CI/docs hygiene.
- Refresh `plugin.json` / `marketplace.json` descriptions and keywords to
  name all five skills (they omitted `bioresearcher-plot-making`, shipped
  in 1.2.0; they now cover the plotting skill the connector descriptions
  already advertise).

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

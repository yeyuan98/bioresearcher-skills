You are working in bioresearcher-skills: an Agent Skills package (open
standard, strict-6 frontmatter) for biomedical research with the biomcp-ts
MCP server.

Principles: DRY, separation of concerns, no premature optimization. Base all
biomcp-ts tool guidance on TRUE source (the pinned checkout or upstream
repo), never memory.

## Skill standards (CI-enforced, binding)

- Frontmatter keys exactly: name, description, license (Apache-2.0),
  compatibility, metadata, allowed-tools. No other keys.
- name == directory name, ^[a-z0-9]+(-[a-z0-9]+)*$, <=64 chars.
- description 1-500 chars (repo policy), front-loaded with triggers.
- `allowed-tools` may additionally contain Claude Code MCP server rules
  (`mcp__<server>` or `mcp__<server>__*`); harnesses that ignore them treat
  the entries as inert strings.
- metadata: string values only (quote versions).
- SKILL.md <= 500 lines; references/scripts one directory level deep.
- UTF-8 without BOM; no duplicate headings; <=1000 files / <=10 MiB per skill.
- Never use retired biomcp-python tool names (the 16 listed in
  scripts/ci/check-legacy-names.sh). Use canonical biomcp-ts names
  (scripts/ci/biomcp-tools.json is the pinned registry).
- Fan-out workflows must include a sequential fallback for harnesses without
  subagent tools.

## Versioning & release

Two version series never share a mechanism: **Series 1** is the single repo
`VERSION` (the agent/connector/plugin product), **Series 2** is each skill's
independent semver. Series 1 is governed by an opt-in slot registry; Series
2 by structural checks. Nothing scans the repository for version strings.

- Per-skill independent semver (Series 2, structurally gated, NOT
  manifest-governed): bump `skills/<name>/SKILL.md` `metadata.version` AND
  `skills.json` AND add a `### <skill-name> <x.y.z>` CHANGELOG subsection in
  the same PR. Top-level `## [x.y.z]` CHANGELOG headings are reserved for
  repo releases only; a skill bump that lands between repo releases goes
  under `## [Unreleased]` and is folded into the next `## [x.y.z]` section
  when that release PR is cut.
- Repo `VERSION` (drives tags/releases) bumps in a `chore(release): vX.Y.Z —
  summary` PR, human-merged; CI cuts the GitHub release on push to main.
- Every repo-VERSION-coupled location (Series 1) is registered in exactly
  one place: `scripts/ci/version-coupling.json` (live slots only — the
  manifest carries no zones or exemptions, and there is deliberately no
  repository-wide version scan). When you add a new VERSION mention to the
  repo, register a slot there in the same PR (the PR template surfaces this
  to the human merger). `check-drift.mjs` enforces slot equality (every live
  slot must capture the current VERSION) plus the structural checks
  (CHANGELOG `## [VERSION]` heading, per-skill subsections, CITATION
  `date-released` ⇄ CHANGELOG date). Tri-state governance:

  | Class | Locations | Governance |
  |---|---|---|
  | Manifest-governed | plugin.json, marketplace `plugins.*.version`, connector-meta.json, CITATION.cff `version:`, partner-doc version literals | `scripts/ci/version-coupling.json` + check-drift |
  | Structurally gated | CHANGELOG `## [VERSION] - date` heading; `### <skill> <x.y.z>` lines; per-skill axis (skills.json ⇄ SKILL.md); date-released ⇄ CHANGELOG date | Hardcoded semantic checks in check-drift.mjs |
  | Dynamic / automation | VERSION itself; git tag `vX.Y.Z`; release + tarball names; website footer | Derived at release/deploy time (website reads VERSION at build) — nothing to hand-edit |

- `.claude-plugin/plugin.json` version must equal repo `VERSION` (manifest
  slot; users only receive plugin updates when it changes).
- Deviation from plan (documented): the Claude Code plugin is rooted at the
  repo root (`source: "./"` + root `.claude-plugin/plugin.json`) instead of a
  `plugins/bioresearcher/` subtree — legal per the marketplace docs and keeps
  `skills/` at the root for skills-CLI/hub discovery. Install copies the whole
  repo into the plugin cache; keep the repo lean.
- Inline version pins (`skills@…` and `opencode-ai@…` in workflows, the
  `uvx` commit pin, `scripts/ci/biomcp-tools.json`, the
  `connector/workbuddy/mcp.json` pins — `biomcp@x.y.z` + npm registry URL —
  and `.claude-plugin/mcp.json` — `biomcp@x.y.z`) are pin management, NOT
  VERSION coupling (nothing scans them), and are NOT covered by dependabot —
  bump them manually when warranted.

## Claude plugin components

- ALL Claude Code-specific plugin components live under `.claude-plugin/`,
  never at the repo root: the bundled MCP server config
  (`.claude-plugin/mcp.json`, referenced from `plugin.json` `mcpServers`) and
  plugin subagents (`.claude-plugin/agents/*.md`, referenced from
  `plugin.json` `agents`). Claude Code only auto-scans plugin-root default
  locations, so every component there must be manifest-declared.
- `check-marketplace.mjs` pins the bundled server to the
  `scripts/ci/biomcp-tools.json` version; `lint-agents.mjs` validates agent
  frontmatter (no `hooks`/`mcpServers`/`permissionMode` — ignored for plugin
  agents) and exact `plugin.json` <-> directory agreement; the tool-name and
  legacy-name gates also scan `.claude-plugin/agents/`.

## WorkBuddy connector

- Sources live in `connector/workbuddy/` only (`connector/` is reserved for
  future marketplace flavors). Never commit build output (`dist/`).
- `connector/workbuddy/connector-meta.json` `version` must equal repo
  `VERSION` (check-drift gate); every WorkBuddy resubmission therefore rides
  a repo release PR.
- The bundled-skill list is defined exactly once: keys of
  `connector/workbuddy/skill-locales.json`. `bioresearcher-onboard` is
  intentionally excluded (conflicts with the connector; see
  docs/connector-workbuddy.md) — extend, never duplicate, that rationale.
- Repo SKILL.md files stay strict-6; WorkBuddy-required frontmatter keys are
  added to STAGED copies only by
  `scripts/ci/build-connector-workbuddy.mjs`.
- Icon source of truth: `connector/workbuddy/icon.jpg` (512x512 JPG
  prepared from the uncommitted logo master; provenance + prep command in
  docs/connector-workbuddy.md).
- No credentials, tokens, or real API keys in any connector file.

## OpenCode connector / plugin

- Sources live in `connector/opencode/` only. Never commit build output (`dist/`).
- `connector/opencode/connector-meta.json` and `package.json` `version` must
  equal repo `VERSION` (check-drift gate); release workflow attaches
  `bioresearcher-connector_opencode-v<VERSION>.tar.gz` to GitHub releases.
- The bundled-skill list is defined in `connector/opencode/skill-bundle.json`.
  `bioresearcher-onboard` is intentionally excluded (the plugin's config hook
  automatically registers `biomcp` into OpenCode's runtime).
- Built by `scripts/ci/build-connector-opencode.mjs`. No credentials, tokens, or
  real API keys in any connector file.

## DeepSeek Harness (dsh) connector / plugin

- Sources live in `connector/dsh/` only. Never commit build output (`dist/`).
- `connector/dsh/connector-meta.json` and `package.json` `version` must
  equal repo `VERSION` (check-drift gate); release workflow attaches
  `bioresearcher-connector_dsh-v<VERSION>.tar.gz` to GitHub releases.
- The bundled-skill list is defined in `connector/dsh/skill-bundle.json`.
  `bioresearcher-onboard` is intentionally excluded (the plugin's apply hook
  automatically registers `biomcp` into dsh's runtime).
- Built by `scripts/ci/build-connector-dsh.mjs`. No credentials, tokens, or
  real API keys in any connector file.

## Branching

- After bootstrap: all work on `agent/coder/<issue-description>` branches,
  PR into main, `ci` check required, conventional commits
  (`feat(skill):`, `fix(skill):`, `feat(connector):`, `fix(connector):`,
  `feat(plugin):`, `fix(plugin):`, `test(agent-test):`, `docs:`,
  `chore(release):`, `chore(deps):`).

## Testing

- Fast static checks: `node scripts/ci/*.mjs` + shell scripts (see README).
- Empirical agent tests in `agent-test/` are MANUAL-ONLY (real opencode CLI +
  LLM tokens + network). CI only validates them with `--list` / `--dry-run`.
- `agent-test/claude-plugin-specific/` is the Claude Code plugin sibling
  suite (real `claude` CLI; bundled MCP server, plugin skills, dr-worker
  agent). Also MANUAL-ONLY; CI validates hermetically with `--list` /
  `--dry-run` (no claude binary, no `~/.claude` reads). Isolation: per-rep
  `CLAUDE_CONFIG_DIR` seeded from the host's `~/.claude/settings.json`
  (auth lands only in gitignored `.runs/`), disposable project cwd, and
  process-group kill. See its README before running.
- `agent-test/opencode-plugin-specific/` and `agent-test/dsh-plugin-specific/`
  are the OpenCode and DeepSeek Harness connector plugin sibling suites
  (MANUAL-ONLY; CI validates hermetically with `--list` / `--dry-run`).
- When editing biomcp guidance, re-verify tool names against the pinned
  registry and update `scripts/ci/biomcp-tools.json` when bumping the
  biomcp-ts pin.

## Website (GitHub Pages showroom)

- `demos/website/` is a zero-dep static site (build.mjs; no SSG, no client
  JS). The built `_site/` output is NEVER committed (gitignored + skipped by
  check-demos) and is deployed by `.github/workflows/pages.yml` on push to
  main. Deploying requires the one-time repo setting Settings → Pages →
  Source: GitHub Actions (then re-run the workflow); builds read committed
  repo data only (VERSION, skills.json, SKILL.md frontmatter, connector
  locales, scenarios/artifacts, demos/docs anchors — asserted at build time)
  — never `agent-test/` paths. Internal links are relative-only (subpath
  safety, enforced by the build link check); absolute site URLs are confined
  to sitemap.xml and `<meta>`/`<link>` tags (og:image, hreflang alternates).

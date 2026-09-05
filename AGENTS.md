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
- metadata: string values only (quote versions).
- SKILL.md <= 500 lines; references/scripts one directory level deep.
- UTF-8 without BOM; no duplicate headings; <=1000 files / <=10 MiB per skill.
- Never use retired biomcp-python tool names (the 16 listed in
  scripts/ci/check-legacy-names.sh). Use canonical biomcp-ts names
  (scripts/ci/biomcp-tools.json is the pinned registry).
- Fan-out workflows must include a sequential fallback for harnesses without
  subagent tools.

## Versioning & release

- Per-skill independent semver: bump `skills/<name>/SKILL.md`
  `metadata.version` AND `skills.json` AND add a CHANGELOG `## [x.y.z]`
  heading in the same PR.
- Repo `VERSION` (drives tags/releases) bumps in a `chore(release): vX.Y.Z —
  summary` PR, human-merged; CI cuts the GitHub release on push to main.
- `.claude-plugin/plugin.json` version must equal repo `VERSION` (users only
  receive plugin updates when it changes).
- Deviation from plan (documented): the Claude Code plugin is rooted at the
  repo root (`source: "./"` + root `.claude-plugin/plugin.json`) instead of a
  `plugins/bioresearcher/` subtree — legal per the marketplace docs and keeps
  `skills/` at the root for skills-CLI/hub discovery. Install copies the whole
  repo into the plugin cache; keep the repo lean.
- Inline version pins (`skills@…` and `opencode-ai@…` in workflows, the
  uvx commit pin, `scripts/ci/biomcp-tools.json`, and the
  `connector/workbuddy/mcp.json` pins — `biomcp@x.y.z` + npm registry URL)
  are NOT covered by dependabot — bump them manually when warranted.

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

## Branching

- After bootstrap: all work on `agent/coder/<issue-description>` branches,
  PR into main, `ci` check required, conventional commits
  (`feat(skill):`, `fix(skill):`, `feat(connector):`, `fix(connector):`,
  `docs:`, `chore(release):`, `chore(deps):`).

## Testing

- Fast static checks: `node scripts/ci/*.mjs` + shell scripts (see README).
- Empirical agent tests in `agent-test/` are MANUAL-ONLY (real opencode CLI +
  LLM tokens + network). CI only validates them with `--list` / `--dry-run`.
- When editing biomcp guidance, re-verify tool names against the pinned
  registry and update `scripts/ci/biomcp-tools.json` when bumping the
  biomcp-ts pin.

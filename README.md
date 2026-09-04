# bioresearcher-skills

[![skills.sh](https://www.skills.sh/b/yeyuan98/bioresearcher-skills)](https://www.skills.sh/yeyuan98/bioresearcher-skills)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](./LICENSE)

Agent Skills ([agentskills.io](https://agentskills.io) open standard) for
**biomedical research with the [biomcp-ts](https://github.com/yeyuan98/biomcp-ts)
MCP server** — deep multi-aspect research with citations, PubMed weekly
update processing, uv Python environment bootstrap, and automated local
runtime onboarding. Works in opencode, Claude Code, Codex, Cursor, Gemini CLI,
and every harness that reads `SKILL.md`.

## Skills

| Skill | What it does |
|---|---|
| [`bioresearcher-onboard`](./skills/bioresearcher-onboard/SKILL.md) | Bootstraps a project-local biomcp MCP server runtime in `.bioresearcher-runtime/`: downloads portable Node.js 22 (if missing), vendors biomcp with fast mirror support (official or npmmirror), configures optional features (R, Biowasm, SQLite), and registers the server in OpenCode, Claude Code, Cursor, or Codex. |
| [`bioresearcher-deep-research`](./skills/bioresearcher-deep-research/SKILL.md) | Orchestrates multi-aspect biomedical research (literature, trials, genes, variants, drugs, diseases, patents, omics) through biomcp-ts: interview → decompose → parallel-or-sequential research → cited report. 18 domain reference guides included. |
| [`bioresearcher-pubmed-weekly`](./skills/bioresearcher-pubmed-weekly/SKILL.md) | Downloads the past week's PubMed updatefiles from NCBI and parses them (pure-Python streaming parser, handles `<PubmedArticle>` **and** `<DeleteCitation>`) into one Excel workbook. |
| [`bioresearcher-python-setup-uv`](./skills/bioresearcher-python-setup-uv/SKILL.md) | Bootstraps a project-local uv-managed Python environment (official or China mirror). |

## Install

Requires the biomcp-ts MCP server — either bootstrap it automatically with
the [`bioresearcher-onboard`](./skills/bioresearcher-onboard/SKILL.md) skill, or
see [docs/biomcp-ts-setup.md](./docs/biomcp-ts-setup.md) for manual wiring.

**Any harness (skills CLI):**

```bash
npx skills add yeyuan98/bioresearcher-skills
```

To run onboarding immediately:

```bash
npx skills add yeyuan98/bioresearcher-skills --skill bioresearcher-onboard
```

**Claude Code (plugin marketplace):**

```
/plugin marketplace add yeyuan98/bioresearcher-skills
/plugin install bioresearcher@bioresearcher-skills
```

**Plain git clone** (pick the directory your harness reads):
`.opencode/skills/`, `.claude/skills/`, `.agents/skills/`, `.codex/skills/`,
or `.gemini/skills/`:

```bash
git clone https://github.com/yeyuan98/bioresearcher-skills .opencode/skills/bioresearcher-skills
```

Gemini CLI: `gemini skills install https://github.com/yeyuan98/bioresearcher-skills` (skills install is currently a preview-channel command).

## Development

```bash
node scripts/ci/lint-frontmatter.mjs   # strict-6 Agent Skills conformance
node scripts/ci/check-drift.mjs        # skills.json <-> metadata <-> CHANGELOG
node scripts/ci/check-links.mjs        # links + duplicate headings
bash scripts/ci/check-bundle.sh        # <=1000 files / <=10 MiB per skill
bash scripts/ci/check-legacy-names.sh  # no retired biomcp-python tool names
node scripts/ci/check-tool-names.mjs   # biomcp tool refs match pinned registry
node scripts/ci/check-marketplace.mjs  # .claude-plugin validation
```

CI (`.github/workflows/ci.yml`) runs all of the above plus the official
`skills-ref` validator and a local `npx skills add ./ --list` discovery
smoke. Releases are cut automatically on push to `main` when `VERSION`
changes (notes extracted from `CHANGELOG.md`).

### Empirical agent tests

`agent-test/` holds a unified, **manually-run** test suite that drives the
real opencode CLI against these skills and a live keyless biomcp-ts MCP
server (costs LLM tokens; never run in CI):

```bash
node agent-test/run.mjs --list
node agent-test/run.mjs --only skills-q01-discovery
node agent-test/run.mjs            # all cases
```

See [agent-test/README.md](./agent-test/README.md) for the case schema and
the 12 mechanical check types.

## Docs

- [biomcp-ts MCP setup](./docs/biomcp-ts-setup.md) — wiring, auth, rate limits
- [Migration from the opencode plugin](./docs/migration-from-plugin.md) — tool-name map + openFDA downgrades
- [Exposure checklist](./docs/exposure.md) — directory submission mechanics

## License

Apache-2.0. Extracted and retargeted from
[opencode-bioresearcher-plugin](https://github.com/yeyuan98/opencode-bioresearcher-plugin) v1.7.2
(personal project of the same author).

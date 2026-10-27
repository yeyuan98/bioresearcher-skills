# OpenCode connector / plugin

`connector/opencode/` is the OpenCode flavor of this package, providing an
automatic plugin and connector bundle for the [OpenCode AI coding agent](https://opencode.ai)
(CLI, TUI, and desktop). It targets **opencode v2 ONLY**.

## Requirements

- opencode >= 2.0.29 (tested through 2.1.4; the v1 config-hook plugin is
  gone — v1 users should stay on `opencode-bioresearcher@1.11.1`).
- Node.js 22+ on PATH (the `npx`-launched biomcp server requires it).

## Bundle contents

Five bundled skills plus the `bioresearcher-dr-worker` subagent:

| Bundled |
|---|
| bioresearcher-deep-research |
| bioresearcher-onboard |
| bioresearcher-plot-making |
| bioresearcher-pubmed-weekly |
| bioresearcher-python-setup-uv |

`bioresearcher-onboard` is bundled on purpose: on v2 the plugin no longer
registers MCP servers programmatically, so onboard is the piece that writes
the biomcp `mcp.servers` entry into `opencode.json` (or you write it by
hand — see MCP setup below).

The bundled skill list is defined in `connector/opencode/skill-bundle.json`.

## Architecture & runtime behavior

The plugin entry point (`index.js`) is a v2 framework plugin
(`@opencode/plugin`): `Plugin.define({ id, setup })`. On every config load,
`setup(ctx)`:

1. **Skill transforms**: reads the packaged `skills/` directory once and
   registers each `SKILL.md` through `ctx.skill.transform` (`ed.add` with
   id/name/description/path/content — v2 requires the content). Idempotent
   and non-throwing.
2. **Global agent file**: installs the subagent prompt as
   `<config>/opencode/agents/bioresearcher-dr-worker.md` (opencode v2
   auto-loads agent markdown files from that directory; the frontmatter
   uses v2 permission triples — the v1 shorthand silently drops the file).
   The file carries a `<!-- bioresearcher-stamp vX.Y.Z -->` marker
   (injected at build time): same stamp → skipped (idempotent), different
   stamp → overwritten (plugin upgrade), **no stamp → user-owned file that
   is never touched**. `${PLUGIN_ROOT}` placeholders in the body are
   resolved to the actual install path. Cleanup is a no-op: removing the
   file on cleanup would flap on every location reload. Uninstall by hand:
   `rm <config>/opencode/agents/bioresearcher-dr-worker.md`.
3. **No programmatic MCP registration**: opencode v2's `mcp.transform` hook
   is broken upstream (TODO: link the upstream issue once filed), so the
   plugin never touches `mcp` config — see the next section.

## MCP setup (config-driven)

Add the biomcp server to `opencode.json` (project or global) — canonical
v2 shape:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-bioresearcher"],
  "mcp": {
    "servers": {
      "biomcp": {
        "type": "local",
        "command": ["npx", "-y", "-p", "biomcp@1.6.0", "biomcp"],
        "environment": {},
        "timeout": { "startup": 120000, "catalog": 120000, "execution": 120000 }
      }
    }
  }
}
```

The legacy flat shape (`mcp.biomcp = {...}` with a scalar `timeout`) is
still accepted by opencode, but canonical is preferred. The bundled
`bioresearcher-onboard` skill automates this: it writes the canonical entry
and migrates any existing flat entry (environment preserved, scalar timeout
mapped to the triple form).

## Build

```bash
node scripts/ci/build-connector-opencode.mjs            # dist/
node scripts/ci/build-connector-opencode.mjs --out DIR
```

Stages `dist/bioresearcher/` (root dir inside the tarball) and writes a
reproducible `dist/bioresearcher-connector_opencode-v<VERSION>.tar.gz` (GNU tar
`--sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner` piped through
`gzip -n`). At stage time the agent prompt's `bioresearcher-stamp vDEV`
marker is rewritten to the repo VERSION. CI runs this build script as a
smoke gate (`.github/workflows/ci.yml`), and the release workflow attaches
the tarball to every GitHub release.

## Version policy

`connector-meta.json` and `package.json` `version` must equal the repo `VERSION`
(Series 1, manifest-governed via `scripts/ci/version-coupling.json` and enforced by
`scripts/ci/check-drift.mjs`). Release PRs bump them in unison with `VERSION`.
The `@opencode/plugin` dependency range is pin management (bump manually when
warranted), not VERSION coupling.

## Installation & usage

### Method A: Config declaration via npm (Recommended)

Declare `opencode-bioresearcher` in your project or global `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-bioresearcher"]
}
```

OpenCode automatically installs the plugin and its dependencies from npm on
startup.

### Method B: Local / offline install from a release tarball

`opencode plugin add` REJECTS local paths, so wire the extracted directory
through config instead:

```bash
tar -xzf bioresearcher-connector_opencode-v<VERSION>.tar.gz
cd bioresearcher && npm install --omit=dev && cd ..
```

```json
{ "plugins": ["/abs/path/to/bioresearcher"] }
```

The `npm install` step is REQUIRED: a plugin directory without
`node_modules` (i.e. without `@opencode/plugin`) fails SILENTLY — the
plugin loads nothing and opencode reports no error.

## Troubleshooting

- **Plugin loads nothing, no error**: the extracted dir is missing its
  dependencies — run `npm install --omit=dev` inside it (Method B).
- **First `opencode mcp list` shows biomcp as not connected**: the npx
  cold-start can lose the first race; retry once.
- **Free-tier default model**: opencode's free tier defaults to a provider
  model that may not suit biomedical workloads; select one explicitly, e.g.
  `opencode --model zhipuai-coding-plan/glm-5.3-flash` (or your provider's
  model id).
- **`Unknown tool 'biomcp.…'` from the `execute` tool**: the tool catalog
  lags behind a freshly connected server. Call
  `search({ query: "<what you need>" })` first to refresh the catalog,
  then retry.
- **`--standalone` vs `serve --service` daemons**: a one-shot
  `opencode --standalone` run spawns its own server for that invocation;
  persistent headless use should run `opencode serve --service` so config
  reloads (and thus plugin setup) hit one long-lived daemon instead of a
  new process per call.
- **`~/.claude/skills` auto-pickup**: opencode also reads
  `~/.claude/skills`, so skills installed there (e.g. by the Claude Code
  plugin) may show up in opencode skill lists even without this plugin —
  dedupe before debugging the bundle.

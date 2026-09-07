# OpenCode connector / plugin

`connector/opencode/` is the OpenCode flavor of this package, providing an
automatic plugin and connector bundle for the [OpenCode AI coding agent](https://opencode.ai)
(CLI, TUI, and desktop).

## Bundle contents

A single `biomcp` stdio MCP server (pinned `biomcp@1.1.1`, 120 s connection
timeout, automatic China mirror fallback) plus four bundled skills and the
`bioresearcher-dr-worker` subagent:

| Bundled | Not bundled |
|---|---|
| bioresearcher-deep-research | **bioresearcher-onboard** |
| bioresearcher-plot-making | |
| bioresearcher-pubmed-weekly | |
| bioresearcher-python-setup-uv | |

`bioresearcher-onboard` is excluded on purpose: its purpose — installing and
registering the biomcp server in harness configs — is exactly what the plugin's
`config` hook already performs automatically on startup.

The bundled skill list is defined in `connector/opencode/skill-bundle.json`.

## Architecture & runtime behavior

The plugin entry point (`index.js`) exports an OpenCode `Plugin` factory function.
On startup, OpenCode executes its `config` lifecycle hook:

1. **Automatic MCP Server Registration**: Injects `mcp.biomcp` into OpenCode's
   active configuration (`type: "local"`, command `npx -y -p biomcp@1.1.1 biomcp`,
   timeout 120000 ms). OpenCode spawns the server, completes the MCP handshake,
   and exposes its 41 tools under the `biomcp_<tool>` namespace. Existing
   user-configured `biomcp` servers are respected and not overwritten.
2. **Dynamic Skills Discovery**: Non-destructively appends the packaged `skills/`
   directory to `cfg.skills.paths`.
3. **Subagent Provisioning**: Injects `agent["bioresearcher-dr-worker"]` with
   `mode: "subagent"`, aspect worker prompt, and permissions (`bash: "deny"`,
   `task: "deny"`).

## Build

```bash
node scripts/ci/build-connector-opencode.mjs            # dist/
node scripts/ci/build-connector-opencode.mjs --out DIR
```

Stages `dist/bioresearcher/` (root dir inside the tarball) and writes a
reproducible `dist/bioresearcher-connector_opencode-v<VERSION>.tar.gz` (GNU tar
`--sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner` piped through
`gzip -n`). CI runs this build script as a smoke gate (`.github/workflows/ci.yml`),
and the release workflow attaches the tarball to every GitHub release.

## Version policy

`connector-meta.json` and `package.json` `version` must equal the repo `VERSION`
(Series 1, manifest-governed via `scripts/ci/version-coupling.json` and enforced by
`scripts/ci/check-drift.mjs`). Release PRs bump them in unison with `VERSION`.

## Installation & usage

Users can install the plugin through any of the following methods:

### Method A: Config declaration via npm (Recommended)

Declare `opencode-bioresearcher` in your project or global `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "opencode-bioresearcher"
  ]
}
```

OpenCode automatically installs and loads the plugin from npm on startup.

### Method B: CLI installation

```bash
opencode plugin opencode-bioresearcher          # Local project scope
opencode plugin -g opencode-bioresearcher       # Global scope (~/.config/opencode)
```

Or from an extracted release tarball:

```bash
tar -xzf bioresearcher-connector_opencode-v<VERSION>.tar.gz
opencode plugin ./bioresearcher            # Local (project) scope
opencode plugin -g /path/to/bioresearcher   # Global scope (~/.config/opencode)
```

### Method C: Drop-in to `.opencode/plugins/` (Offline Zero Config)

```bash
tar -xzf bioresearcher-connector_opencode-v<VERSION>.tar.gz -C .opencode/plugins/
cp .opencode/plugins/bioresearcher/loader.js .opencode/plugins/bioresearcher.js
```

OpenCode's shallow directory scanner discovers `bioresearcher.js`, which imports
and activates `./bioresearcher/index.js`.

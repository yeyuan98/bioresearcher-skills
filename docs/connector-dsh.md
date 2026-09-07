# DeepSeek Harness (dsh) connector / plugin

`connector/dsh/` is the DeepSeek Harness (dsh) flavor of this package, providing
an automated Cordis plugin and connector bundle for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(CLI, TUI, and Web UI).

## Bundle contents

A single `biomcp` stdio MCP server (pinned `biomcp@1.1.1`, 120 s connection
timeout, automatic China npm mirror detection via `Intl.DateTimeFormat` or env)
plus four bundled skills and the `bioresearcher-dr-worker` subagent prompt:

| Bundled | Not bundled |
|---|---|
| bioresearcher-deep-research | **bioresearcher-onboard** |
| bioresearcher-plot-making | |
| bioresearcher-pubmed-weekly | |
| bioresearcher-python-setup-uv | |

`bioresearcher-onboard` is excluded on purpose: its purpose — installing and
registering the biomcp server in harness configs — is performed automatically by
the plugin's `apply` hook on startup.

The bundled skill list is defined in `connector/dsh/skill-bundle.json`.

## Architecture & runtime behavior

The plugin entry point (`index.js`) is an ESM module exporting a Cordis plugin:

```javascript
export const name = "bioresearcher";
export const inject = ["tools", "skills"];
export async function apply(ctx, config) { ... }
```

When booted in a `dsh` profile (e.g. `web`, `headless`, `tui`), the plugin performs:

1. **Automatic MCP Server Registration**:
   Dynamically mounts `@deepseek-ai/dsh-mcp-client` with `serverName: "biomcp"`,
   launching `npx -y -p biomcp@1.1.1 biomcp` over stdio with timeout 120000 ms.
   DeepSeek Harness automatically registers the tools under the `mcp__biomcp__<tool>`
   namespace (e.g. `mcp__biomcp__article_search`).
2. **Dynamic Skills Discovery**:
   Reads the packaged `skills/` directory and registers bundled skills on
   `ctx.skills.register(...)` with `source: "bioresearcher"` and `resourceBase`
   pointing to the local skill directory so relative paths in instructions
   resolve cleanly.
3. **Subagent Worker Provisioning**:
   If an agent roster service (`ctx.agents`) is present, registers `bioresearcher-dr-worker`
   with the specialized prompt (with `${CLAUDE_PLUGIN_ROOT}` replaced by the
   installed plugin root). If absent, `bioresearcher-deep-research` transparently
   uses generic subagent delegation (Tier B) or sequential execution (Tier C).

## Build

```bash
node scripts/ci/build-connector-dsh.mjs            # dist/
node scripts/ci/build-connector-dsh.mjs --out DIR
```

Stages `dist/bioresearcher/` (root directory inside the tarball) and writes a
reproducible `dist/bioresearcher-connector_dsh-v<VERSION>.tar.gz` (GNU tar
`--sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner` piped through
`gzip -n -9`). CI runs this build script as a gate (`.github/workflows/ci.yml`),
and the release workflow attaches the tarball to every GitHub release.

## Version policy

`connector-meta.json` and `package.json` `version` must equal the repo `VERSION`
(Series 1, manifest-governed via `scripts/ci/version-coupling.json` and enforced by
`scripts/ci/check-drift.mjs`). Release PRs bump them in unison with `VERSION`.

## Installation & usage

Users can install the release archive through either of two methods:

### Method A: Profile plugin installation (Recommended)

Install the package bundle directly into the target profile (e.g. `web`, `headless`, or custom profile):

```bash
dsh plugin --profile web add /path/to/bioresearcher-connector_dsh-v<VERSION>.tar.gz
```

`dsh` installs the package into the profile environment and automatically mounts the bundled `cordis.patch.yml`.

### Method B: Standalone overlay patch

Extract the archive and load it directly via an overlay patch specifying the local package root:

```bash
tar -xzf bioresearcher-connector_dsh-v<VERSION>.tar.gz
dsh --profile web --patch <(echo "- insert: [{ id: bioresearcher, name: $(pwd)/bioresearcher/index.js }]")
```

Or add the entry to `$DSH_HOME/cordis.patch.yml` (`~/.dsh/cordis.patch.yml`)
to enable it across all profiles on the machine.

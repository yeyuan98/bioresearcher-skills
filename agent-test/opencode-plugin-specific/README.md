# OpenCode Plugin Tests (Empirical & Manual-Run)

Empirical test suite for the **OpenCode bioresearcher connector/plugin**
(opencode v2 only, >= 2.0.29): verifies plugin loading via the config
`plugins` entry, bundled-skill delivery through the v2 skill transforms, and
the stamped `bioresearcher-dr-worker` global agent file.

Sibling of `agent-test/claude-plugin-specific/run.mjs` and `agent-test/run.mjs`.

## Fast Hermetic Checks (CI-Safe)

CI validates the suite hermetically (zero external binary dependencies, no tokens spent):

```bash
node agent-test/opencode-plugin-specific/run.mjs --list
node agent-test/opencode-plugin-specific/run.mjs --dry-run
```

## Live Empirical Execution (Local Host)

Requires `opencode` CLI >= 2.0.29 on host (and network for the staged
`npm install` of the plugin's `@opencode/plugin` dependency — a plugin dir
without `node_modules` fails silently):

```bash
node agent-test/opencode-plugin-specific/run.mjs
node agent-test/opencode-plugin-specific/run.mjs --only plugin-startup
```

The harness stages the built connector into the workspace, installs its
dependencies, wires it through `opencode.json` (`plugins: [<dir>]`), and
isolates `XDG_CONFIG_HOME` so the plugin's global agent-file install never
touches the host's real config.

## Case set status (v2 refresh pending)

The `cases/` expectations are still v1-era and DO NOT pass on opencode v2:
v2 dropped the `debug skill`/`debug agent` subcommands, the resolved config
no longer carries `mcp.biomcp`/`agent.*` injected by the plugin (MCP is
config-driven; the agent is a markdown file), and in-process CLI commands
now spawn a managed background service on a fixed port that conflicts with
any running `serve --service` daemon. The verified v2 surface for the
refresh is `opencode serve --port N` + `opencode api --server ... GET
/api/plugin | /api/skill` plus filesystem asserts on the stamped agent file
under `<XDG_CONFIG_HOME>/opencode/agents/` — the load test used for the v2
connector rewrite is the reference procedure. Case JSONs are kept for that
refresh and are NOT expected to pass as-is.

## Case Index

| ID | Level | Purpose (v1-era, see status above) |
|----|-------|---------|
| `plugin-debug-config` | L0 | Asserts resolved config contains biomcp local MCP server (timeout 120000), skills.paths, and dr-worker subagent |
| `plugin-mcp-list` | L0 | Asserts `opencode mcp list` connects to biomcp over stdio |
| `plugin-debug-skill` | L0 | Asserts `opencode debug skill` discovers bundled skills |
| `plugin-debug-agent` | L0 | Asserts `opencode debug agent bioresearcher-dr-worker` resolves subagent mode and tool permissions |
| `plugin-startup` | L0 | Asserts clean boot with zero plugin initialization errors |

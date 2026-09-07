# DeepSeek Harness (dsh) Plugin Tests (Empirical & Manual-Run)

Empirical test suite for the **DeepSeek Harness (`dsh`) bioresearcher connector/plugin**:
verifies profile bundle integration, Cordis plugin composition, automatic `biomcp` MCP server
registration (`serverName: "biomcp"`, `toolCallTimeoutMs: 120000`), bundled skills discovery,
and `bioresearcher-dr-worker` subagent prompt path interpolation.

Sibling of `agent-test/opencode-plugin-specific/run.mjs` and `agent-test/claude-plugin-specific/run.mjs`.

## Fast Hermetic Checks (CI-Safe)

CI validates the suite hermetically (zero external binary dependencies, no tokens spent):

```bash
node agent-test/dsh-plugin-specific/run.mjs --list
node agent-test/dsh-plugin-specific/run.mjs --dry-run
```

## Live Empirical Execution (Local Host)

Requires `dsh` CLI and `pnpm` installed on host:

```bash
node agent-test/dsh-plugin-specific/run.mjs
node agent-test/dsh-plugin-specific/run.mjs --only plugin-config-dump
node agent-test/dsh-plugin-specific/run.mjs --only plugin-skills-discovery
```

## Case Index

| ID | Level | Purpose |
|----|-------|---------|
| `plugin-config-dump` | L0 | Asserts resolved Cordis patch tree contains bioresearcher plugin entry and dsh-bioresearcher package |
| `plugin-pnpm-list` | L0 | Asserts `dsh plugin --profile headless ls` lists dsh-bioresearcher as an installed dependency |
| `plugin-skills-discovery` | L0 | Asserts dsh skills registry discovers bundled skills and excludes bioresearcher-onboard |
| `plugin-subagent-worker` | L0 | Asserts bioresearcher-dr-worker prompt resolves CLAUDE_PLUGIN_ROOT with real plugin root |
| `plugin-startup` | L0 | Asserts dsh headless profile boots cleanly with zero loader or syntax errors |

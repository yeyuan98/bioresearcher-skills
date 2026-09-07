# OpenCode Plugin Tests (Empirical & Manual-Run)

Empirical test suite for the **OpenCode bioresearcher connector/plugin**:
verifies local plugin loading, automatic `biomcp` MCP server registration (`timeout: 120000`),
bundled skills discovery, and `bioresearcher-dr-worker` subagent registration.

Sibling of `agent-test/claude-plugin-specific/run.mjs` and `agent-test/run.mjs`.

## Fast Hermetic Checks (CI-Safe)

CI validates the suite hermetically (zero external binary dependencies, no tokens spent):

```bash
node agent-test/opencode-plugin-specific/run.mjs --list
node agent-test/opencode-plugin-specific/run.mjs --dry-run
```

## Live Empirical Execution (Local Host)

Requires `opencode` CLI installed on host (tested with v1.18.29):

```bash
node agent-test/opencode-plugin-specific/run.mjs
node agent-test/opencode-plugin-specific/run.mjs --only plugin-mcp-list
node agent-test/opencode-plugin-specific/run.mjs --only plugin-debug-config
```

## Case Index

| ID | Level | Purpose |
|----|-------|---------|
| `plugin-debug-config` | L0 | Asserts resolved config contains biomcp local MCP server (timeout 120000), skills.paths, and dr-worker subagent |
| `plugin-mcp-list` | L0 | Asserts `opencode mcp list` connects to biomcp over stdio |
| `plugin-debug-skill` | L0 | Asserts `opencode debug skill` discovers bundled skills |
| `plugin-debug-agent` | L0 | Asserts `opencode debug agent bioresearcher-dr-worker` resolves subagent mode and tool permissions |
| `plugin-startup` | L0 | Asserts clean boot with zero plugin initialization errors |

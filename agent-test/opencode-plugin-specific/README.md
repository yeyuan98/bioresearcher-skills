# OpenCode Plugin Tests (Empirical & Manual-Run, opencode v2)

Empirical test suite for the **OpenCode bioresearcher connector/plugin**
(opencode v2 only, **>= 2.0.29**): verifies plugin loading via the config
`plugins` entry (`/api/plugin`), bundled-skill delivery through the v2 skill
transforms (`/api/skill`), the stamped `bioresearcher-dr-worker` global agent
file (`/api/agent`), and the config-driven canonical `mcp.servers.biomcp`
entry connecting over stdio (`/api/mcp`).

Sibling of `agent-test/claude-plugin-specific/run.mjs` and
`agent-test/run.mjs`.

## Fast Hermetic Checks (CI-Safe, Binary-Free)

CI validates the suite hermetically (zero external binary dependencies, no
tokens, no network):

```bash
node agent-test/opencode-plugin-specific/run.mjs --list
node agent-test/opencode-plugin-specific/run.mjs --dry-run
```

`--dry-run` validates every case spec: step types (`serve_setup` / `api` /
`cli` / `config_file` / `serve_teardown`), required fields, and check
types/ops. Unknown step or check shapes are ERRORS — a malformed case can
never degrade into a vacuous pass.

## Live Empirical Execution (Local Host)

Requires `opencode` CLI >= 2.0.29 on PATH, network (the staged `npm install`
of the plugin's `@opencode/plugin` dependency — a plugin dir without
`node_modules` fails silently — plus `npx -y -p biomcp@1.6.0 biomcp` for the
mcp-connected case), and **no LLM tokens**:

```bash
node agent-test/opencode-plugin-specific/run.mjs
node agent-test/opencode-plugin-specific/run.mjs --only plugin-active
```

Per case the harness:

1. builds the connector into `.runs/.stage/` and stages it into an isolated
   git-init workspace (`.runs/workspace/`) with `npm install`;
2. wires it through the workspace `opencode.json` (`plugins: [<dir>]`);
3. starts an isolated `opencode serve --port <free>` with a fresh
   `OPENCODE_PASSWORD` and an isolated `HOME` + `XDG_{CONFIG,DATA,STATE,CACHE}_HOME`
   (v2 reads `~/.claude/skills` and the plugin stamps its agent file under
   `<config>/opencode/agents` — both must stay away from the host);
4. **bootstrap guard**: after serve readiness it polls `/api/plugin` until
   `bioresearcher` appears (HTTP 200 can precede plugin init; 240 s budget) —
   if the plugin never loads, the SUITE aborts loudly instead of recording
   vacuous results;
5. runs the case's steps (`api` calls via `opencode api --server`, with
   polling retry for plugin/MCP init races) and evaluates the per-step
   checks;
6. tears the serve instance down **by PID** (SIGTERM -> 3 s -> SIGKILL).

### Daemon hygiene

- Every `opencode serve --port N` the harness starts is killed by PID before
  the case ends (also on failure paths). After a run, verify with
  `pgrep -af "opencode serve"`.
- **`opencode mcp list` is intentionally not used as case evidence**: v2 CLI
  commands resolve a *background service* and spawn unmanaged
  `opencode serve --service` daemons on the machine-global managed port
  (49374). Whenever any other opencode service already holds that port (very
  common on a dev machine), the command times out with
  `Timed out waiting for the background service to start` and leaks two
  daemons. The `cli` step type supports it (with a retry-once hook for the
  `No MCP servers configured` first-call race) for manual debugging on clean
  hosts, but case evidence goes through `opencode api --server` against the
  harness-owned serve instance (`GET /api/mcp` reports
  `{"name":"biomcp","status":{"status":"connected"}}` after the real stdio
  handshake).

## Case Index

| ID | Level | Purpose |
|----|-------|---------|
| `plugin-active` | L0 | `/api/plugin` lists `bioresearcher` from the workspace plugins entry with `state: active` |
| `skills-bundled` | L0 | `/api/skill` delivers the bundled skills, including `bioresearcher-deep-research` AND `bioresearcher-onboard` |
| `agent-registered` | L0 | `/api/agent` lists `bioresearcher-dr-worker` with `mode: subagent` (the stamped global agent file) |
| `mcp-connected` | L0 | Workspace `opencode.json` gains the canonical `mcp.servers.biomcp` entry (validated shape, timeout triple 120000) and `/api/mcp` reports `biomcp connected` over stdio |

Artifacts land in `.runs/logs/` (`serve-<case>-<port>.log`,
`<case>.artifact.json`). `.runs/` is gitignored.

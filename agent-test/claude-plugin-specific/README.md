# Claude plugin tests (empirical, manual-run)

Empirical, **manual-run** end-to-end tests for the bioresearcher **Claude Code
plugin**: the marketplace plugin rooted at the repo root, which bundles the
pinned core-only biomcp MCP server (`.claude-plugin/mcp.json`), the five
plugin skills, and the `bioresearcher-dr-worker` plugin agent
(`.claude-plugin/agents/`). The runner drives the real `claude` CLI headless
(`-p --output-format stream-json`), grades the recorded event stream
mechanically, and never touches the repo working tree.

Sibling of the opencode suite (`../run.mjs`); same philosophy (per-case
`test.json` + prompt + objective checks, disposable per-rep run dirs, resume,
PASS / PASS* / FAIL / ERROR ladder), different harness.

**NOT run in CI.** Every `session`/`install` rep spends real LLM tokens (and,
for MCP cases, network). CI only validates statically, hermetically:

```bash
node agent-test/claude-plugin-specific/run.mjs --list     # index table, exit 0
node agent-test/claude-plugin-specific/run.mjs --dry-run  # discovery + schema + plan; no claude needed
```

## Requirements

- Claude Code **>= 2.1.261** installed (evaluated floor; `--plugin-dir`,
  stream-json `system/init` fields, `--permission-prompts`, and
  `--max-budget-usd` all verified on 2.1.261).
- Auth provisioning (one of):
  - **default**: the runner copies the host's `~/.claude/settings.json` into
    each rep's isolated config dir (proven recipe on hosts whose auth — e.g.
    `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` — lives in that file's
    `env` block);
  - or `ANTHROPIC_API_KEY` in the environment;
  - or run `claude` once interactively inside a kept config dir
    (`--keep-config`, see below).
- node >= 22 (plain ESM, `node:` stdlib only, zero npm deps).
- Network: the bundled server runs `npx -y -p biomcp@1.4.0 biomcp` (keyless;
  first tool call pays the npx download).

## Isolation model

Every rep gets, under `.runs/<case>/<ts>-r<N>/`:

- `claude-config/` — its own `CLAUDE_CONFIG_DIR` (mode 0700) seeded with the
  copied host `settings.json`; removed on completion unless `--keep-config`.
  Auth material therefore lands only inside gitignored `.runs/`.
- `project/` — empty cwd for the run; prompts that write files (e.g.
  `reports/`) land here, never in the repo.
- `stream.jsonl` (+ `install.log` for the install driver) and `result.json`.

Children are spawned detached and killed **by process group** on timeout
(SIGTERM -> 3 s -> SIGKILL), so `npx`/biomcp stdio children never orphan.
Child env overrides `API_TIMEOUT_MS=600000` so a copied host setting cannot
dwarf the kill ladder. Cases never share config dirs, so an installed plugin
in one case cannot leak into another case's `--plugin-dir` session.

The process exit code is deliberately ignored (empirically unreliable);
grading keys off parsed events only.

## Cost

`--max-budget-usd` is passed to every session (default 0.5, per-case
override via `budgetUsd`). Under gateways that report usage oddly it is
**advisory**, not a hard cap; the real guards are small per-case budgets,
the timeout ladder, and `--reps` defaulting to 1. `total_cost_usd` from the
`result` event is recorded in `result.json` and `summary.json`. Ballpark on
a GLM gateway: no-tool L0 runs ~$0.08; the full 6-case suite roughly $1-3.

## Running

```bash
node agent-test/claude-plugin-specific/run.mjs --list
node agent-test/claude-plugin-specific/run.mjs                          # all (spends tokens!)
node agent-test/claude-plugin-specific/run.mjs --only plugin-l1-mcp-call
node agent-test/claude-plugin-specific/run.mjs --filter 'plugin-l0-*' --reps 2
```

Flags: `--only <id>` / `--filter <glob>`, `--reps <N>`, `--force` (ignore
reusable prior reps), `--model <ID>`, `--timeout <ms>`, `--claude <BIN>`,
`--repo <DIR>` (default `../..`), `--keep-config` (keep isolated config dirs
— they contain copied auth; inspect then delete manually),
`--dry-run`, `--list`. Exit codes: 0 PASS/PASS*/SKIP-only, 1 any FAIL,
2 harness ERROR/INTERRUPTED. Resume: a rep whose prior dir has a terminal
`result` event plus `result.json` is reused unless `--force`.

## Drivers

| Driver | What runs | Graded against |
|---|---|---|
| `session` (default) | `claude --plugin-dir <repo> -p <prompt> --output-format stream-json --verbose --no-session-persistence --max-budget-usd <b> [--permission-mode m] [extraArgs...]` in the rep project dir | parsed event stream |
| `install` | `claude plugin validate <repo>` -> `plugin marketplace add <repo>` -> `plugin install bioresearcher@bioresearcher-skills` -> `plugin list` -> one session **without** `--plugin-dir` | session stream (steps assert exit 0 / output patterns; failure = ERROR with install.log tail) |
| `cli` | one plain `claude <cliArgs...>` | combined stdout+stderr via `cli_output` checks (free for `plugin validate`) |

`{REPO}` and `{PROJECT_DIR}` placeholders in `cliArgs`/`prompt` are
substituted by the runner.

## test.json schema

| Field | Required | Description |
|---|---|---|
| `id` | | Stable identifier; defaults to the directory name |
| `name` / `level` / `purpose` | | Label, L0-L2, one-line purpose |
| `driver` | | `session` (default) \| `install` \| `cli` |
| `prompt` | session/install | Sent via `-p` (install defaults to a no-tool "OK" prompt) |
| `cliArgs` | cli | Argv after `claude`; `{REPO}`/`{PROJECT_DIR}` substituted |
| `budgetUsd` | | `--max-budget-usd` (default 0.5; advisory) |
| `timeoutMs` | | Per-rep timeout (default 300000) |
| `permissionMode` | | `--permission-mode` value (e.g. `bypassPermissions`, `manual`, `acceptEdits`) |
| `extraArgs` | | Extra session argv (e.g. `["--permission-prompts","none"]`) |
| `checks` | yes | Non-empty array; every check must hold for a PASS |

### Check vocabulary

| Type | Key fields | Semantics |
|---|---|---|
| `init_mcp` | `name`, `status` (default `connected`) | `system/init` mcp_servers entry matches name+status |
| `init_tool` | `name`, `regex?`, `op: present\|absent` | tool name in `init.tools` |
| `init_tool_count` | `min`/`max`, `pattern?` | bounded count of `init.tools` (optionally regex-filtered) |
| `init_skill` / `init_agent` | `name`, `regex?` | skill/agent name in the init lists |
| `tool_use` | `name`, `regex?`, `occurrence?`, `path?`, `op: exists\|equals\|regex\|contains`, `expect?` | a tool_use event matched by (regex) name; with `path`, dot-path assertion on its input; without `path` and with `op`, contains/regex match the serialized whole input (models vary parameter names) |
| `tool_result_ok` | `name`, `regex?`, `occurrence?` | the matched call has a non-error tool_result (joined by `tool_use_id`) |
| `text` | `expect`, `op: contains\|not_contains\|regex`, `source: final\|assistant` | text assertion; `final` = result text (falls back to last assistant text) |
| `permission_denials` | `op: empty` \| `op: not_containing` + `pattern` | the `result` event's `permission_denials` array |
| `subagent_by_type` | `agent`, `min?=1` | `result.subagent_stats.by_type` keys containing `agent` (count from numeric values, fallback key count) |
| `file_exists` | `pattern` | glob (`**`/`*`/`?`) matched against files under the rep project dir |
| `cli_output` | `expect`, `op: contains\|regex` | combined cli stdout+stderr (cli driver) |
| `group` | `anyOf` \| `allOf` | composition; the fired anyOf arm index is recorded in `result.json` as `firedArms` |
| `rubric` | `manual: true`, `flag` | never machine-graded; rep stays PASS* pending human adjudication |

Notes: `tool_result` events are joined to their `tool_use` by `tool_use_id`
(never by name — parallel worker calls interleave). A missing tool call,
path, or source **fails** the check (it is false, not an error).

## Case index

| ID | Level | Driver | Purpose | Cost |
|----|-------|--------|---------|------|
| `plugin-validate` | L0 | cli | `claude plugin validate` accepts the manifests | free |
| `plugin-l0-load` | L0 | session | `--plugin-dir` init: server connected, 30-45 namespaced tools, plugin skill + dr-worker agent | ~$0.1 |
| `plugin-l0-marketplace-install` | L0 | install | local marketplace add + install; components present without `--plugin-dir` | ~$0.1 |
| `plugin-l1-mcp-call` | L1 | session | keyless `article_search` through the bundled server, zero denials | ~$0.3 |
| `plugin-l2-dr-light` | L2 | session | light-research via the plugin skill; Tier A/B dispatch (anyOf + rubric), reports under the project dir | ~$1-2 |
| `plugin-l2-manual-mode-grants` | L2 | session | manual+`--permission-prompts none` canary (Skill pre-allowed so the skill's turn actually starts): allowed-tools turn grant observed NOT to cover plugin MCP calls (rubric counts mcp__plugin denials) | ~$0.3 |

The dispatch `anyOf` in `plugin-l2-dr-light` is intentionally easy to pass
(Tier B generic subagents count): the *rubric* adjudicates which tier fired,
using `firedArms` in `result.json`, and specifically watches for the masked
failure mode where the worker cannot read its `${CLAUDE_PLUGIN_ROOT}`
references and silently degrades. Record verdicts in the rep's
`result.json` `adjudications` array (`{flag, verdict, note, by, at}`).

## Deliberately not cases (manual one-offs)

- `dontAsk`-mode behavior, neither-server degradation (needs a repo copy
  with `.claude-plugin/mcp.json` stripped), and opencode/Cross-harness
  regression — the last is the parent suite's domain.
- `claude plugin eval` (Claude Code's own plugin eval runner,
  `evals/**/case.yaml` + LLM-graded `graders/*.md`) was considered as the
  suite backbone and rejected: opaque grading, no parity with this repo's
  objective-check philosophy. It remains a fine complementary tool.

## Adding a case

1. `mkdir cases/<case-name>` and write `test.json` (schema above).
2. Validate hermetically: `node agent-test/claude-plugin-specific/run.mjs
   --list` then `--dry-run` (also run in CI).
3. Run manually with `--only <id>`; adjudicate any `rubric` flags in the
   rep's `result.json`.

# Agent tests (empirical skill + MCP harness)

Empirical, **manual-run** end-to-end tests for the bioresearcher skills. Each
test defines a prompt plus objective checks; the runner injects the real skill
files from `../skills` into a disposable run dir, executes the prompt through
the host `opencode` CLI (with per-case MCP wiring, e.g. the keyless `biomcp`
server), and grades the recorded session log mechanically — no human in the
grading loop except for explicit `rubric` flags.

A sibling suite for the **Claude Code plugin** (bundled MCP server, plugin
skills, `bioresearcher-dr-worker` agent) lives in
[`claude-plugin-specific/`](./claude-plugin-specific/README.md) — same
philosophy, driven against the real `claude` CLI; also manual-run only.

Ported from `biomcp-ts/agent-test/` (runner + 12-check grader); see
*Deltas vs the source harness* below.

**NOT run in CI.** Every spawned rep costs real LLM tokens (and, for MCP
cases, network calls). CI only validates the suite statically:

```bash
node agent-test/run.mjs --list     # index table, exit 0
node agent-test/run.mjs --dry-run  # discovery + schema validation + provisioning simulation
```

## Requirements

- `opencode` >= 1.18 installed and authenticated (the `{env:VAR}` config
  substitution used in `opencode.json` is verified on >= 1.18; evaluated on
  1.18.x). The runner spawns `opencode run --dir <run-dir> --auto <prompt>
  --format json` per rep.
- node >= 22 (plain ESM, `node:` stdlib only, zero npm deps).
- Network for MCP cases (`deep-research-q01-light` runs `npx -y -p biomcp@1.4.0
  biomcp`, keyless — no credentials anywhere; exact pin avoids npm range
  revalidation delays so startup completes well within opencode's 30s
  MCP connection window). Works through proxies honoring HTTP(S)_PROXY via
  undici's EnvHttpProxyAgent.
- `uv` + `python3` for `groundtruth/generate.py`; the host probe also records
  `pandoc`.
- Skills to test: `../skills/` relative to this directory (override with
  `--skills-dir`).

## Layout

```
agent-test/
├── README.md                  this file
├── run.mjs                    runner + objective grader (plain ESM, node:stdlib only)
├── claude-plugin-specific/    sibling suite: Claude Code plugin (own runner, cases/, README)
├── <TEST-NAME>/
│   ├── test.json              spec: prompt, externalData pins, checks, timeout
│   ├── opencode.json          per-run config (credential-free, {env:}-substituted)
│   ├── fixtures/              per-rep data seeded into <runDir>/data ({DATA_DIR})
│   ├── expected/              reference outputs for human/rubric review
│   ├── groundtruth/           generators for expected/
│   └── resources.tar.bz2      archived fixtures/ + expected/ + groundtruth (<= 1 MB)
├── data/                      (gitignored) default externalData root
└── .runs/                     (gitignored) logs, per-rep result.json, summary,
                               provenance
```

Never commit run artifacts or downloaded data — `.runs/` and `data/` are
gitignored.

## Running

```bash
node agent-test/run.mjs --list                          # index table, no runs
node agent-test/run.mjs                                 # full suite (spends tokens!)
node agent-test/run.mjs --only skills-q01-discovery     # single test
node agent-test/run.mjs --filter 'skills-q*' --reps 2   # glob + repetitions
```

Flags: `--only <id>` / `--filter <glob>` (mutually exclusive), `--reps <N>`,
`--force` (ignore reusable prior reps), `--dry-run` (discovery + schema
validation + provisioning simulation, never spawns opencode and does not
require it installed), `--extract-subagents <DIR>` (postmortem subagent
re-capture for a finished run dir, then exit), `--data-root <DIR>` (default
`$AGENT_TEST_DATA` or `agent-test/data`), `--skills-dir <DIR>` (default
`../skills`), `--model <ID>`, `--timeout <ms>`.

### Outcome ladder

| Outcome | Meaning |
|---------|---------|
| `ERROR` | Harness/session problem: unparseable log, no terminal `step_finish(stop)`, check spec errors, timeout, spawn failure |
| `FAIL` | Session completed but >= 1 objective check failed |
| `PASS` | Session completed, all machine checks hold |
| `PASS*` | All machine checks hold AND unadjudicated `rubric` flags remain (human verdict pending) |

- Exit codes: `0` all selected tests PASS / PASS* / SKIP-only; `1` any FAIL;
  `2` harness ERROR / INTERRUPTED (takes precedence over `1`).
- Results live in `agent-test/.runs/<TEST>/<YYYYMMDD-HHMMSS>-r<rep>/` with
  `prompt.txt`, `opencode.json`, `log.jsonl`, `result.json`, the subagent
  capture (`subagents/`, `timeline.jsonl`, `subagents.json`, live
  `progress.jsonl`; see *Subagent observability*), plus the injected
  `.opencode/skills/` and seeded `data/`; `.runs/summary.json` and one
  `.runs/provenance.json` per invocation (git HEAD if available, opencode
  version, global-config hash, host-tool probe, per-skill `SKILL.md` sha256).
- Resume: a rep whose prior dir has a log ending in a terminal
  `step_finish(reason="stop")` and a `result.json` is reused (no respawn)
  unless `--force`; incomplete rep dirs are cleaned up before each run.
- An `APIError` event in a session that never reached a terminal stop triggers
  a global stop-loss: remaining tests are marked INTERRUPTED and the run
  exits 2.
- Rubric adjudication: `rubric` checks leave a rep at `PASS*` with
  `rubricFlags` in `result.json`; record the human verdict in that file's
  `adjudications` array (`{flag, verdict, note, by, at}`, verdicts such as
  `SATISFIED` / `SATISFIED_WITH_NOTE`). The deep-research ladder rubrics
  consume the captured worker transcripts: `subagents/<sid>.jsonl` (full
  normalized events), `subagents.json` (per-session toolHistogram +
  `evidenceLedgerBanners`), and the run's `reports/<TOPIC>/` artifacts;
  `--extract-subagents <DIR>` re-captures streams postmortem. Adjudicate only
  after the final live rep for a test - re-grading overwrites `result.json`
  wholesale, so snapshot `adjudications` before any `--force` re-run.

## test.json schema

| Field | Required | Description |
|-------|----------|-------------|
| `id` | | Stable identifier; defaults to the directory name |
| `name` | | Human label |
| `level` | | Difficulty tier, `L0`–`L3` |
| `purpose` | | One line: what is being tested |
| `prompt` | yes | Sent verbatim; `{DATA_DIR}` is replaced with the per-rep `<runDir>/data` directory |
| `externalData` | | Array of `{path, sha256, bytes}` pins verified against the data root before the run |
| `inlineResources` | | Fixture files whose content is embedded in the prompt (shipped inside `resources.tar.bz2`) |
| `timeoutMs` | | Per-rep timeout override (default 300000; kill ladder SIGTERM -> 3 s -> SIGKILL) |
| `checks` | yes | Array; every check must hold for a PASS |
| `expectedOutputs` | | Reference paths under `expected/` for human review |

### Check vocabulary (13 types)

| Type | Key fields | Semantics |
|------|------------|-----------|
| `tool_seq` | `seq: [[name, status\|*], …]`, `mode: subsequence\|exact` (default `subsequence`) | Ordered match over the `biomcp_*` call stream only; a name matches by equality or unambiguous suffix; `exact` requires the whole stream to match, `subsequence` just a subsequence |
| `group` | `anyOf: […]` or `allOf: […]` (exactly one) | Composes nested checks; `anyOf` passes if any arm passes and is ERROR only when every arm errors; `allOf` fails on any failing arm |
| `text` | `expect`, `op: contains\|not_contains\|regex`, `source` | Substring / negated substring / regex over the source text (default `final`) |
| `number_near` | `expect`, `tolerance` (default 0), `context` (regex, optional), `source` | Some tokenized number within tolerance; the tokenizer strips thousands separators (`1,103,547` -> 1103547); `context` restricts matching to sentence-like fragments containing a case-insensitive regex match |
| `text_number_count` | `expect`, `tolerance`, `context`, `source` | Count of *distinct* tokenized numbers within tolerance of `expect` (same `context` semantics as `number_near`) |
| `args` | `tool`, `occurrence` (default 1), `path`, `op: equals\|regex\|contains\|exists`, `expect` | Asserts on a tool call's input at a dot-path (`a.b.0.c`; array indices are numeric segments) |
| `args_rel` | `tool`, `path`, `occA`, `occB`, `op: lt\|le\|gt\|ge\|eq` | Compares the same dot-path across two occurrences of one tool |
| `json_path` | `tool`, `occurrence`, `path`, `op: equals\|near\|exists`, `expect`, `tolerance` | Asserts on a tool call's parsed output JSON; non-JSON output fails the check (not an error) |
| `tool_count` | `min` and/or `max`, optional `tool` | Bounded call count; without `tool` it counts every non-pending call (MCP and host tools alike) |
| `no_such_tool` | `tool` (name or array) | Passes only if none of the named tools was ever called |
| `status` | `tool`, `occurrence`, `status` | Exact terminal status of one call (`completed`, `error`, …) |
| `subagent_count` | `min` and/or `max`, optional `agent` | Bounded count of captured worker-subagent sessions (see *Subagent observability*); grades the capture, not the parent log |
| `rubric` | `manual: true`, `flag` | Never machine-graded; marks the rep `PASS*` pending human adjudication |

### Sources

Checks that read text (`text`, `number_near`, `text_number_count`) accept a
`source` (default `final`):

| Source | Value |
|--------|-------|
| `final` | Last assistant text event |
| `assistant` | All assistant text events, joined |
| `tool:<name>[#occ]` | That call's output, or its error text if it errored |
| `tool:*` | Every non-pending call's output/error, joined |
| `args:<name>[#occ]` | That call's raw input object (as text) |

Normative notes:

- Occurrences (1-based) index the calls of the resolved *full* tool name.
- Tool references match equality-or-suffix; an ambiguous suffix is a check
  ERROR — write full tool names wherever suffixes are ambiguous.
- A missing source (or missing tool call / path) fails the check; it is
  false, not a harness error.
- Only `tool_seq` is `biomcp_`-scoped by construction; other checks may
  reference any tool by full name (e.g. the host `skill` tool).

### Check scope (`parent` | `subagents` | `all`)

Any non-`rubric` check may set `scope` (default `parent` = legacy semantics:
the top-level session's `log.jsonl` only). Because `opencode run` never
streams worker-subagent events into the parent log, dispatched worker
behavior (every Tier A/B `article_search`, evidence write, ledger append) is
only visible through the subagent capture (next section):

- `scope: "subagents"` — the check evaluates over the merged captured worker
  streams (tool calls in execution order; text sources concatenate worker
  texts by session start time).
- `scope: "all"` — parent + captured streams merged, tool calls interleaved
  by event timestamp.
- A non-`parent` scope with no capture available **fails loudly** (never
  silently passes against an empty stream).

## Subagent observability

Dispatched worker subagents are invisible in `log.jsonl` (long delegations
are minutes of log silence, and none of their tool calls reach the grader).
opencode persists every session — parent-linked, with full parts — in its
host SQLite DB (`$XDG_DATA_HOME/opencode/opencode.db`, default
`~/.local/share/opencode/opencode.db`), so the runner reads that DB
**read-only** (node:sqlite, WAL-safe next to live opencode processes) and
produces, per rep dir:

| Artifact | Content |
|----------|---------|
| `progress.jsonl` | Live poller trace (written during the run): subagent session starts, bursts of worker activity, poller notes. Console mirrors it (one line per event for small bursts, a `+N events` catch-up line for larger ones) and prints a `STALL` warning when neither the parent stream nor any subagent produced activity for 120 s. |
| `subagents/<sid>.jsonl` | One file per worker session: a `subagent_meta` header (id, parent, agent, title, timing) followed by normalized events (tool_use with full input/output, text, reasoning, step_finish with tokens) in the same envelope as `opencode run --format json`. |
| `timeline.jsonl` | Parent log events + subagent events interleaved by timestamp (`origin: parent\|subagent`); tool outputs truncated to 240 chars for readability — full fidelity lives in `subagents/`. |
| `subagents.json` / `result.json.subagents` | Summary: per-worker agent/title, duration, message/part counts, tool histogram, token totals, and any `[evidence-ledger] …` banner lines the worker emitted. |

Rules and caveats:

- **Best-effort, never outcome-changing**: any DB failure (missing file,
  locked, node:sqlite unavailable) degrades to a note in
  `result.json.subagents`; the run and all `scope: "parent"` checks grade
  exactly as before.
- **Privacy**: the DB is host-global (every opencode session on the machine),
  so the extractor only ever queries sessions for the exact per-rep run dir
  under `agent-test/.runs/` (plus their `parent_id` closure) and refuses
  other directories.
- **Hermetic CI stays hermetic**: `--list` and `--dry-run` never touch the
  DB; `node:sqlite` is imported lazily so its one-time ExperimentalWarning
  appears only in live/postmortem invocations.
- **Postmortem re-capture**: `node agent-test/run.mjs --extract-subagents
  <run-dir>` (re)builds the capture for any finished run dir and prints the
  summary — sessions persist in the DB, so pre-capture runs can be
  retrofitted. Resume reuses an existing `subagents/` capture and only
  re-extracts when the dir predates capture support.
- **STALL semantics (diagnostic, not a failure)**: the warning fires on 120s
  with no new *and* no updated parts across parent + workers. It correctly
  flags hung networks but can also fire on legitimately slow single LLM
  turns (observed: 119-164s parent synthesis turns on large post-worker
  contexts). The `last:` label names the most recent event of any session.
- **Live poller coverage**: the poller queries sessions by
  `directory == runDir`; a nested subagent whose cwd differs from the run
  dir is invisible live but IS captured post-run via the extractor's
  `parent_id` closure.

## Skill injection (hermeticity)

Before spawn, the runner copies every directory under the skills root
(default `../skills`, `--skills-dir` to override) into
`<runDir>/.opencode/skills/` so opencode's project-level skill discovery finds
the **real** skill files; the sha256 of each `SKILL.md` is recorded in
`.runs/provenance.json`. The discovery cases additionally assert via
`text not_contains ".config/opencode"` that the loaded skill comes from the
injected project copy, not a globally installed one.

## opencode.json

Each test ships a minimal, credential-free config; the runner copies it into
the run dir before spawning and substitutes generic `{env:VAR}` placeholders
(exported env: `AGENT_TEST_DATA` = resolved data root). Skill-only cases ship
the bare schema; MCP cases wire servers explicitly, e.g. the keyless biomcp
server:

```json
{"$schema":"https://opencode.ai/config.json","mcp":{"biomcp":{"type":"local","command":["npx","-y","-p","biomcp@1.4.0","biomcp"]}}}
```

- Never rename it to `opencode.jsonc` — root `.gitignore` patterns commonly
  ignore that filename everywhere, so the file would silently never be
  committed.
- Config merge semantics: opencode merges this project config over the global
  `~/.config/opencode/opencode.jsonc`; the project wins per conflicting key.
  The harness records the global config's sha256 in `provenance.json` to keep
  conclusions scoped.

## Fixtures and data

- A case's `fixtures/` tree is copied verbatim into each rep's
  `<runDir>/data/`; `{DATA_DIR}` in the prompt resolves to that directory
  (per-rep disposable, resume-safe).
- `externalData` pins (`{path, sha256, bytes}`) are verified against the data
  root (`--data-root`, default `$AGENT_TEST_DATA` or `agent-test/data`,
  created if needed); a missing pin plus a `resources.download.sh` triggers
  the downloader (max 2 attempts, 15 min timeout), else the test SKIPs.
- `pubmed-weekly-q01-parse` ships `fixtures/pubmed-sample.xml.gz` (6
  `<PubmedArticle>` entries + a `<DeleteCitation>` block with PMIDs
  99999991/99999992), trimmed from the plugin test-resources sample, < 5 KB.
  Expected output is frozen in `expected/summary.json` via
  `groundtruth/generate.py`, which invokes the skill's own parser through
  `uv run --with openpyxl python`.

## Test index

| ID | Level | Purpose | Data | Status |
|----|-------|---------|------|--------|
| `skills-q01-discovery` | L0 | Load injected skill `bioresearcher-deep-research`, report its first instruction | — | manual-run |
| `skills-q02-discovery-uv` | L0 | Load injected skill `bioresearcher-python-setup-uv` (no installation) | — | manual-run |
| `skills-q03-discovery-pubmed` | L0 | Load injected skill `bioresearcher-pubmed-weekly` | — | manual-run |
| `skills-q04-discovery-onboard` | L0 | Load injected skill `bioresearcher-onboard` (no installation) | — | manual-run |
| `skills-q05-discovery-plot-making` | L0 | Load injected skill `bioresearcher-plot-making` (no plotting) | — | manual-run |
| `deep-research-q01-light` | L2 | deep-research skill + keyless biomcp MCP: BRCA1 survey citing PMIDs (+ default-on HTML artifact) | MCP | manual-run |
| `deep-research-q02-interview` | L2 | deep-research interview precedence: clarifying questions fire (no report) in non-interactive auto mode | — | manual-run |
| `deep-research-q03-plan-review` | L2 | deep-research plan review precedence: 2–5 research aspects proposed for feedback before subagents fire | — | manual-run |
| `deep-research-q04-evidence-ledger` | L2 | evidence-ledger light happy path over articles + trials: worker ledger written via the script, `check`/`verify`/`render` banners + tier-independent `pmid:`/`nct:` key anchors reported | MCP | manual-run (PASS*, rubric) |
| `deep-research-q05-ledger-merge` | L3 | multi-source flagship (drugs + trials + articles): per-aspect ledgers merge → verify --apply → render; mixed-type References generated by render; transcript-keyed rubrics (worker script usage, boundaries, quantitative fidelity) | MCP | manual-run (PASS*, rubric) |
| `deep-research-q06-ledger-drill` | L2 | deterministic CLI feature drill: secondary-id dedupe + key promotion, quarantine, `[MISSING record]` non-zero exit, `--expand-pages`, epub rendering, Vancouver initials, name→title fold, render hard-fail contract, check gate | — | manual-run |
| `deep-research-q07-citation-fidelity` | L3 | citation-fidelity regression over trials + articles (drugs opportunistic): References generated by `render` (by construction) + vet structural audit PASS + re-render diff `MISMATCH COUNT: 0` (no post-render hand edits) + quantitative-claims spot-check | MCP | manual-run (PASS*, rubric) |
| `pubmed-weekly-q01-parse` | L1 | Parse trimmed updatefiles sample into combined.xlsx via the skill | fixture | manual-run (PASS*, rubric) |
| `python-setup-uv-q01` | L1 | Create uv-managed `.venv` in the disposable run dir via the skill | — | manual-run (PASS*, rubric; mutates run dir only) |
| `onboard-q01-bootstrap` | L1 | Bootstrap project-local BioMCP runtime in run dir via skill | — | manual-run (PASS*, rubric; mutates run dir only) |
| `plot-making-q01-structural` | L2 | Structural binder visualization: KRAS Switch I/II dynamics + multi-inhibitor convergence with 3-layer QA | fixture | manual-run (PASS*, rubric) |
| `plot-making-q02-literature` | L2 | Literature method summary: PROTAC translational risk cascade + preclinical assay matrix with 3-layer QA | fixture | manual-run (PASS*, rubric) |

"Data": `MCP` = wires the keyless biomcp server (network), `fixture` = shipped
in `fixtures/` + archived in `resources.tar.bz2`, `—` = none.

## Deltas vs the source harness (biomcp-ts/agent-test)

1. **Skill injection**: every dir under the skills root is copied into
   `<runDir>/.opencode/skills/` before spawn; `SKILL.md` sha256 recorded in
   `provenance.json` (new `--skills-dir` flag, default `../skills`).
2. **biomcp-bundle logic stripped**: no `{env:AGENT_TEST_BUNDLE}`, no
   `dist/bundle.js` warning, no `AGENT_TEST_BUNDLE` env, no `distBundle*`
   provenance fields. MCP wiring is per-case in `opencode.json`.
3. **Host-tool probe** records `python3`/`uv`/`pandoc` (was
   samtools/bcftools/bedtools/pysam); `globalConfigSha256` kept (hashes
   `~/.config/opencode/opencode.jsonc`, falling back to `opencode.json`).
4. **Data root** default is `agent-test/data` (was `agent-test/.runs/data`),
   still exported as `AGENT_TEST_DATA` for `{env:}` substitution.
5. **`{DATA_DIR}`** resolves to the per-rep `<runDir>/data` seeded from the
   case's `fixtures/` (the source pointed it at the shared data root).
6. **Subagent observability**: `opencode run` streams only the top-level
   session, so worker subagents are captured separately (live progress
   poller + post-run extraction from opencode's host session DB, read-only);
   checks gained `scope: parent|subagents|all` and a `subagent_count` type;
   `--extract-subagents <DIR>` re-captures a finished run dir. See
   *Subagent observability*.

The grader core (the 12 ported check types), NDJSON parsing, stop-loss,
resume, artifacts, and exit-code semantics are ported unchanged; the 13th
check type and `scope` are additive and default to the legacy behavior.

## Adding a new test

1. `mkdir agent-test/<test-name>` and write `test.json` (`id`, `level`,
   `purpose`, `prompt` with `{DATA_DIR}`, `checks`, `timeoutMs`; pin
   `externalData` or use `fixtures/`).
2. Copy `opencode.json` from an existing test (credential-free; do not rename
   to `.jsonc`).
3. Ship fixtures under `fixtures/`, reference outputs in `expected/`,
   generators in `groundtruth/`; refresh the archive from the test dir:
   `tar cjf resources.tar.bz2 fixtures expected groundtruth` (keep it <= 1 MB).
4. Validate in CI-safe mode: `node agent-test/run.mjs --list`, then
   `--dry-run`; then run manually with `--only <id>` and adjudicate any
   `rubric` flags in the rep's `result.json`.

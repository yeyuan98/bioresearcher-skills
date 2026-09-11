#!/usr/bin/env node
/*
 * demos/run-demo.mjs — self-contained demo runner for the bioresearcher-skills
 * partner-publication pack. Faithful port of agent-test/run.mjs (runner +
 * 13-check grader incl. subagent capture and scope-aware checks; the grader,
 * NDJSON parsing, stop-loss, resume, artifacts and exit-code semantics are
 * ported UNCHANGED), adapted to drive the demo scenarios in demos/scenarios/
 * and — with --publish — to curate true-run artifacts into demos/artifacts/.
 *
 * Single-file plain ESM JavaScript. node:stdlib only; zero npm dependencies.
 *
 * DELIBERATE DELTAS vs agent-test/run.mjs (each marked "// DELTA:" inline):
 *   1. DISCOVERY: scenarios live in demos/scenarios/<name>/scenario.json
 *      (not <agent-test>/<name>/test.json) and carry a `kind` discriminator:
 *        - kind "agent"      : prompt + checks, executed via the host
 *                              `opencode` CLI exactly like agent-test;
 *        - kind "mcp-probe"  : no prompt/checks; dispatched to
 *                              demos/lib/mcp-probe.mjs (deterministic stdio
 *                              JSON-RPC calls against the biomcp server; no
 *                              LLM tokens). Probe scenarios never hit the
 *                              grader; their result.json comes from the probe.
 *   2. EXTERNALDATA PROVISIONING REMOVED: all demo scenarios are fixture-only
 *      (fixtures/ copied into <runDir>/data); no resources.download.sh path.
 *   3. PATHS: runs root = demos/.runs/, default data root = demos/data/,
 *      default skills root = ../skills (demos/ sits exactly ONE level below
 *      the repo root — REPO_ROOT below relies on that).
 *   4. NEW --publish: after a rep reaches a graded terminal outcome
 *      (PASS / PASS-with-rubric / FAIL for agent kind, PASS / FAIL for
 *      mcp-probe) — including REUSED (resumed) reps — curate the rep into
 *      demos/artifacts/<id>/ via demos/lib/publish.mjs (transcript.md,
 *      outputs/, result.json, provenance.json, bilingual README.md).
 *   5. COST PROBE (additive): step_finish events carrying opencode cost data
 *      are summed into parsed.costTotal for the artifact provenance; absent
 *      cost fields leave it null (never an error).
 *   6. Timeout ladder, hermetic env sanitization, {env:VAR} substitution,
 *      skill injection with per-SKILL.md sha256 provenance: ported unchanged.
 *   7. SUBAGENT CAPTURE (ported from agent-test/run.mjs DELTA 8): `opencode
 *      run` streams ONLY the top-level session's events, so deep-research
 *      Tier A/B worker subagents (mandatory parallel dispatch since
 *      deep-research 1.7.0) are absent from log.jsonl. opencode persists all
 *      sessions (parent-linked, full parts) in its host SQLite DB, so the
 *      runner reads it READ-ONLY (node:sqlite, WAL-safe): a live progress
 *      poller during the spawn (sidecar progress.jsonl + console lines +
 *      stall warnings), a post-run extractor into <runDir>/subagents/ +
 *      timeline.jsonl + subagents.json, `scope: parent|subagents|all` on
 *      checks, and a subagent_count check type. Best-effort by design: any
 *      DB failure degrades to a note in result.json and never changes the
 *      run outcome; --list and --dry-run never touch the DB (lazy import
 *      keeps node:sqlite — and its ExperimentalWarning — out of hermetic
 *      CI). --extract-subagents <DIR> re-captures any finished run dir
 *      postmortem. The privacy guard only ever reads the host DB for per-rep
 *      dirs this runner created under demos/.runs.
 *
 * CI-safe modes: --list and --dry-run never spawn opencode, never touch the
 * network, and do not require opencode installed. Real runs are MANUAL-ONLY
 * (agent kinds spend LLM tokens; every kind may hit the network).
 */
import { createReadStream } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const AGENT_ROOT = path.dirname(path.resolve(process.argv[1]));
// DELTA 3: demos/ must sit exactly one level below the repo root for this
// derivation to hold (git provenance + default skills dir depend on it).
const REPO_ROOT = path.dirname(AGENT_ROOT);
const RUNS_DIR = path.join(AGENT_ROOT, ".runs");
const SCENARIOS_DIR = path.join(AGENT_ROOT, "scenarios");
const DEFAULT_DATA_ROOT = path.join(AGENT_ROOT, "data");
const DEFAULT_SKILLS_DIR = path.resolve(AGENT_ROOT, "..", "skills");
const DEFAULT_TIMEOUT_MS = 300000;
const TERM_GRACE_MS = 3000;
// DELTA 7: subagent-capture knobs (live poller of opencode's host session DB).
const SUBAGENT_POLL_MS = 10000;
const SUBAGENT_STALL_WARN_MS = 120000;
const SUBAGENT_STALL_REWARN_MS = 60000;

class UsageError extends Error {}
class HarnessError extends Error {}

/* ================================================================ SECTION: CLI */

function parseArgs(argv) {
  const a = {
    only: null,
    filter: null,
    reps: 1,
    force: false,
    dataRoot: null,
    skillsDir: null,
    model: null,
    timeout: null,
    publish: false,
    dryRun: false,
    list: false,
    help: false,
    extractSubagents: null, // DELTA 7
  };
  const need = (flag, v) => {
    if (v === undefined) throw new UsageError(`${flag} requires a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    switch (t) {
      case "--only": a.only = need(t, argv[++i]); break;
      case "--filter": a.filter = need(t, argv[++i]); break;
      case "--reps": a.reps = Number(need(t, argv[++i])); break;
      case "--force": a.force = true; break;
      case "--data-root": a.dataRoot = need(t, argv[++i]); break;
      case "--skills-dir": a.skillsDir = need(t, argv[++i]); break;
      case "--model": a.model = need(t, argv[++i]); break;
      case "--timeout": a.timeout = Number(need(t, argv[++i])); break;
      case "--publish": a.publish = true; break;
      case "--dry-run": a.dryRun = true; break;
      case "--list": a.list = true; break;
      case "--extract-subagents": a.extractSubagents = need(t, argv[++i]); break; // DELTA 7
      case "--help": case "-h": a.help = true; break;
      default: throw new UsageError(`unknown argument: ${t}`);
    }
  }
  if (!Number.isInteger(a.reps) || a.reps < 1) throw new UsageError("--reps must be an integer >= 1");
  if (a.timeout !== null && (!Number.isFinite(a.timeout) || a.timeout <= 0)) throw new UsageError("--timeout must be a positive number of ms");
  if (a.only && a.filter) throw new UsageError("--only and --filter are mutually exclusive");
  return a;
}

function usage() {
  return [
    "usage: node demos/run-demo.mjs [options]",
    "  --only <id>         run a single scenario (dir name or scenario.json id)",
    "  --filter <glob>     run scenarios whose id matches glob (* and ?)",
    "  --reps <N>          repetitions per scenario (default 1)",
    "  --force             re-run even if a complete prior rep exists",
    "  --data-root <DIR>   fixture data root (default demos/data)",
    "  --skills-dir <DIR>  skills injected into each run dir (default ../skills)",
    "  --model <ID>        passed to `opencode run --model` (optional; agent kind)",
    "  --timeout <ms>      per-rep timeout override (default: scenario timeoutMs else 300000)",
    "  --publish           curate each graded rep into demos/artifacts/<id>/",
    "  --dry-run           discovery + schema validation + provisioning simulation, never spawn",
    "  --extract-subagents <DIR>  postmortem: (re)capture subagent streams for a finished",
    "                      run dir (read-only DB read; prints subagents.json summary), then exit",
    "  --list              print the scenario index table and exit",
    "exit codes: 0 all PASS/PASS*/SKIP-only; 1 any FAIL; 2 harness ERROR/INTERRUPTED",
  ].join("\n");
}

function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${esc}$`);
}

/* ============================================================ SECTION: discovery */

// DELTA 1: scenario manifests live under demos/scenarios/<name>/scenario.json
// and carry kind "agent" | "mcp-probe".
function loadScenarioEntry(name) {
  const dir = path.join(SCENARIOS_DIR, name);
  const sj = path.join(dir, "scenario.json");
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return null;
  if (!fs.existsSync(sj)) return null;
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(sj, "utf8"));
  } catch (e) {
    return { id: name, dirName: name, dir, kind: "?", error: `unparseable scenario.json: ${e.message}` };
  }
  const id = typeof spec.id === "string" && spec.id ? spec.id : name;
  const kind = spec.kind ?? "agent";
  if (kind !== "agent" && kind !== "mcp-probe") {
    return { id, dirName: name, dir, kind, error: `scenario.json has unsupported kind ${JSON.stringify(kind)} (agent|mcp-probe)` };
  }
  if (kind === "agent") {
    if (typeof spec.prompt !== "string" || !spec.prompt) {
      return { id, dirName: name, dir, kind, error: "scenario.json missing string field: prompt" };
    }
    if (!Array.isArray(spec.checks)) {
      return { id, dirName: name, dir, kind, error: "scenario.json missing array field: checks" };
    }
  } else {
    if (!Array.isArray(spec.probe) || spec.probe.length === 0) {
      return { id, dirName: name, dir, kind, error: "mcp-probe scenario.json missing non-empty array field: probe" };
    }
    for (const [i, call] of spec.probe.entries()) {
      if (!call || typeof call.tool !== "string" || !call.tool) {
        return { id, dirName: name, dir, kind, error: `probe[${i}] missing string field: tool` };
      }
      for (const rx of ["expect_regex", "expect_not_regex"]) {
        if (call[rx] !== undefined) {
          try { new RegExp(call[rx]); } catch (e) {
            return { id, dirName: name, dir, kind, error: `probe[${i}].${rx} does not compile: ${e.message}` };
          }
        }
      }
    }
    if (spec.server !== undefined) {
      const cmd = spec.server.command;
      if (cmd !== undefined && (!Array.isArray(cmd) || cmd.length === 0 || cmd.some((c) => typeof c !== "string"))) {
        return { id, dirName: name, dir, kind, error: "server.command must be a non-empty array of strings" };
      }
    }
  }
  const timeoutMs = spec.timeoutMs ?? spec.timeout ?? null;
  return {
    id,
    dirName: name,
    dir,
    kind,
    spec,
    level: spec.level ?? null,
    purpose: spec.purpose ?? "",
    lang: spec.lang ?? null,
    timeoutMs: typeof timeoutMs === "number" ? timeoutMs : null,
  };
}

function discoverScenarios() {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(SCENARIOS_DIR, { withFileTypes: true });
  } catch (e) {
    throw new HarnessError(`cannot read scenarios root ${SCENARIOS_DIR}: ${e.message}`);
  }
  for (const de of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const t = loadScenarioEntry(de.name);
    if (t) out.push(t);
  }
  return out;
}

function selectScenarios(scenarios, args) {
  let sel = scenarios;
  if (args.only) {
    sel = scenarios.filter((t) => t.id === args.only || t.dirName === args.only);
    if (sel.length === 0) throw new HarnessError(`no scenario matches --only ${args.only}`);
  } else if (args.filter) {
    const re = globToRegExp(args.filter);
    sel = scenarios.filter((t) => re.test(t.id) || re.test(t.dirName));
    if (sel.length === 0) throw new HarnessError(`no scenario matches --filter ${args.filter}`);
  }
  return sel;
}

function printListTable(scenarios) {
  const cols = [
    ["ID", 34], ["KIND", 9], ["LEVEL", 5], ["PURPOSE", 42], ["LANG", 4], ["TIMEOUT", 8],
  ];
  const head = cols.map(([h, w]) => h.padEnd(w)).join("  ");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const t of scenarios) {
    const purpose = t.error ? `ERROR: ${t.error}` : String(t.purpose ?? "");
    const row = [
      (t.id ?? "").slice(0, 34).padEnd(34),
      String(t.kind ?? "-").slice(0, 9).padEnd(9),
      String(t.level ?? "-").slice(0, 5).padEnd(5),
      purpose.slice(0, 42).padEnd(42),
      String(t.lang ?? "-").slice(0, 4).padEnd(4),
      String(t.timeoutMs ?? DEFAULT_TIMEOUT_MS).padEnd(8),
    ].join("  ");
    console.log(row);
  }
}

/* =========================================================== SECTION: skills + fixtures */

function statFile(file) {
  const st = fs.statSync(file, { throwIfNoEntry: false });
  return st ?? null;
}

function listSkillDirs(skillsDir) {
  const st = statFile(skillsDir);
  if (!st || !st.isDirectory()) return [];
  try {
    return fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((de) => de.isDirectory())
      .map((de) => de.name)
      .sort();
  } catch {
    return [];
  }
}

function countFixtureFiles(fixturesDir) {
  let n = 0;
  const walk = (d) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const de of entries) {
      if (de.isDirectory()) walk(path.join(d, de.name));
      else n++;
    }
  };
  if (statFile(fixturesDir)?.isDirectory()) walk(fixturesDir);
  return n;
}

/* Hermetic child env: host shells often run inside a conda/mamba env. uv
 * resolves interpreters as --python > VIRTUAL_ENV > CONDA_PREFIX > ./.venv,
 * so an inherited CONDA_PREFIX (or a conda bin dir on PATH) makes agent-run
 * `./uv pip install` / `./uv run` mutate the HOST env instead of the run dir.
 * Mirror/PyPI index vars (UV_INDEX_URL, PIP_INDEX_URL) and NO_PROXY are
 * deliberately preserved. (Ported unchanged from the source harness.) */
const HERMETIC_STRIP_ENV = [
  "CONDA_PREFIX", "CONDA_DEFAULT_ENV", "CONDA_PROMPT_MODIFIER", "CONDA_SHLVL", "CONDA_EXE",
  "_CE_CONDA", "_CE_M", "MAMBA_EXE", "MAMBA_ROOT_PREFIX",
  "VIRTUAL_ENV", "UV_PYTHON", "UV_PROJECT_ENVIRONMENT", "PYTHONPATH",
];
const CONDA_PATH_RE = /(^|\/)(miniforge3|miniconda3?|anaconda3?|micromamba|conda)(\/|$)/;

function sanitizeChildEnv() {
  const env = { ...process.env };
  for (const k of HERMETIC_STRIP_ENV) delete env[k];
  if (typeof env.PATH === "string") {
    env.PATH = env.PATH
      .split(path.delimiter)
      .filter((seg) => seg && !CONDA_PATH_RE.test(seg))
      .join(path.delimiter);
  }
  return env;
}

/* ============================================ SECTION: subagent capture (DELTA 7) */
/*
 * Ported from the source harness: `opencode run --format json` emits only the
 * top-level session's events, so dispatched worker subagents are invisible:
 * their tool calls never reach log.jsonl and long delegations are minutes of
 * log silence (deep-research 1.7.0 makes parallel dispatch mandatory whenever
 * a subagent tool exists, so every flagship demo run now dispatches workers).
 * opencode itself persists EVERY session in its host SQLite DB
 * (session.parent_id links workers to the parent; part rows carry full tool
 * inputs/outputs, text, reasoning and per-step tokens; session.directory holds
 * the run dir), so the runner recovers subagent behavior from there — strictly
 * read-only (WAL-safe next to live opencode processes), best-effort (failures
 * become notes, never run-outcome changes), and never on --list/--dry-run
 * (node:sqlite is lazily imported so hermetic CI never loads it).
 */

const SESSION_COLS = "id, parent_id, directory, title, agent, time_created, time_updated";

function opencodeDbPath() {
  const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, "opencode", "opencode.db");
}

async function openOpencodeDb() {
  const dbPath = opencodeDbPath();
  if (!fs.existsSync(dbPath)) return { error: `opencode DB not found: ${dbPath}` };
  let DatabaseSync;
  try {
    ({ DatabaseSync } = await import("node:sqlite"));
  } catch (e) {
    return { error: `node:sqlite unavailable on this node build: ${e.message}` };
  }
  try {
    return { db: new DatabaseSync(dbPath, { readOnly: true }), dbPath };
  } catch (e) {
    return { error: `cannot open ${dbPath} read-only: ${e.message}` };
  }
}

/* Privacy guard: only ever read the host DB for per-rep dirs this runner
 * created under demos/.runs — never for arbitrary host directories. */
function isUnderRunsDir(runDir) {
  const root = path.resolve(path.join(AGENT_ROOT, ".runs")) + path.sep;
  return path.resolve(runDir).startsWith(root);
}

/* "TIL manufacturing biology aspect (@general subagent)" -> "general/TIL manufacturing biology…" */
function shortSessionLabel(title, agent) {
  const base = String(title ?? "").replace(/\s*\(@[^)]*\)\s*$/, "").trim() || "subagent";
  return `${agent ?? "?"}/${base.length > 28 ? base.slice(0, 27) + "…" : base}`;
}

/* DB part row -> normalized event mirroring the `opencode run --format json`
 * envelope ({type, timestamp, sessionID, part}) so downstream consumers can
 * treat parent and subagent streams identically. */
function subagentPartToEvent(sid, timeCreated, p) {
  const t = p?.type;
  const type = t === "tool" ? "tool_use" : t === "step-start" ? "step_start" : t === "step-finish" ? "step_finish" : t;
  let part = p;
  if (t === "tool") part = { tool: p.tool, state: p.state ?? {} };
  else if (t === "step-finish") part = { reason: p.reason, tokens: p.tokens ?? null };
  else if (t === "text" || t === "reasoning") part = { text: p.text ?? "" };
  return { type, timestamp: timeCreated, sessionID: sid, origin: "subagent", part };
}

/* All sessions belonging to a run: roots have directory == runDir; the worker
 * closure follows parent_id (nested subagents included, any cwd). */
function collectRunSessions(db, runDir) {
  const byId = new Map();
  for (const s of db.prepare(`SELECT ${SESSION_COLS} FROM session WHERE directory = ?`).all(runDir)) byId.set(s.id, s);
  let frontier = [...byId.keys()];
  for (let depth = 0; depth < 16 && frontier.length; depth++) {
    const ph = frontier.map(() => "?").join(",");
    const children = db.prepare(`SELECT ${SESSION_COLS} FROM session WHERE parent_id IN (${ph})`).all(...frontier);
    frontier = [];
    for (const c of children) {
      if (byId.has(c.id)) continue;
      byId.set(c.id, c);
      frontier.push(c.id);
    }
  }
  return [...byId.values()];
}

function scanLedgerBanners(p, into) {
  const blobs = [typeof p?.text === "string" ? p.text : null, typeof p?.state?.output === "string" ? p.state.output : null, typeof p?.state?.input === "string" ? p.state.input : null];
  for (const blob of blobs) {
    if (!blob) continue;
    for (const m of blob.matchAll(/^\[evidence-ledger\][^\n]*/gm)) into.add(m[0].slice(0, 120));
  }
}

/* Post-run capture: writes <runDir>/subagents/<sid>.jsonl (one normalized
 * event per line, preceded by a subagent_meta line), <runDir>/timeline.jsonl
 * (parent log events + subagent events interleaved by timestamp, tool outputs
 * truncated to keep the file readable), and returns the summary dict stored
 * as result.json `subagents` (also printed by --extract-subagents). */
async function extractSubagents(runDir) {
  const summary = {
    extractedAt: new Date().toISOString(),
    runDir: path.resolve(runDir),
    dbPath: opencodeDbPath(),
    parentSessions: [],
    sessions: [],
    error: null,
  };
  if (!isUnderRunsDir(runDir)) {
    summary.error = "run dir is not under demos/.runs — refusing to read the host opencode DB";
    return summary;
  }
  if (!fs.existsSync(runDir)) {
    summary.error = `run dir does not exist: ${path.resolve(runDir)}`;
    return summary;
  }
  const open = await openOpencodeDb();
  if (open.error) {
    summary.error = open.error;
    return summary;
  }
  const { db, dbPath } = open;
  summary.dbPath = dbPath;
  try {
    const sessions = collectRunSessions(db, path.resolve(runDir));
    summary.parentSessions = sessions.filter((s) => !s.parent_id).map((s) => s.id);
    const subs = sessions.filter((s) => s.parent_id);
    const outDir = path.join(runDir, "subagents");
    fs.mkdirSync(outDir, { recursive: true });

    const timeline = [];
    const logText = (() => {
      try {
        return fs.readFileSync(path.join(runDir, "log.jsonl"), "utf8");
      } catch {
        return "";
      }
    })();
    for (const line of logText.split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      let ev;
      try {
        ev = JSON.parse(s);
      } catch {
        continue;
      }
      timeline.push({ origin: "parent", ...ev });
    }

    for (const s of subs) {
      const parts = db.prepare("SELECT time_created, data FROM part WHERE session_id = ? ORDER BY time_created").all(s.id);
      const messages = db.prepare("SELECT COUNT(*) AS n FROM message WHERE session_id = ?").get(s.id).n;
      const toolHistogram = {};
      const banners = new Set();
      let tokensTotal = 0;
      let textChars = 0;
      const fd = fs.openSync(path.join(outDir, `${s.id}.jsonl`), "w");
      try {
        fs.writeSync(fd, JSON.stringify({
          type: "subagent_meta",
          sessionID: s.id,
          parentID: s.parent_id,
          title: s.title ?? null,
          agent: s.agent ?? null,
          directory: s.directory ?? null,
          timeCreated: s.time_created ?? null,
          timeUpdated: s.time_updated ?? null,
        }) + "\n");
        for (const row of parts) {
          let p;
          try {
            p = JSON.parse(row.data);
          } catch {
            continue;
          }
          const ev = subagentPartToEvent(s.id, row.time_created, p);
          timeline.push(ev);
          if (ev.type === "tool_use") {
            const key = `${ev.part.tool}:${ev.part.state?.status ?? "?"}`;
            toolHistogram[key] = (toolHistogram[key] ?? 0) + 1;
          } else if (ev.type === "step_finish" && Number.isFinite(Number(ev.part?.tokens?.total))) {
            tokensTotal += Number(ev.part.tokens.total);
          } else if ((ev.type === "text" || ev.type === "reasoning") && typeof ev.part?.text === "string") {
            textChars += ev.part.text.length;
          }
          scanLedgerBanners(p, banners);
          fs.writeSync(fd, JSON.stringify(ev) + "\n");
        }
      } finally {
        fs.closeSync(fd);
      }
      summary.sessions.push({
        id: s.id,
        parentID: s.parent_id,
        agent: s.agent ?? null,
        title: s.title ?? null,
        timeCreated: s.time_created ?? null,
        timeUpdated: s.time_updated ?? null,
        durationMs: s.time_updated && s.time_created ? s.time_updated - s.time_created : null,
        messages,
        parts: parts.length,
        toolHistogram,
        tokensTotal,
        textChars,
        evidenceLedgerBanners: [...banners].slice(0, 100),
      });
    }

    timeline.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    const tlFd = fs.openSync(path.join(runDir, "timeline.jsonl"), "w");
    try {
      for (const ev of timeline) {
        const out = ev.type === "tool_use" && typeof ev.part?.state?.output === "string" && ev.part.state.output.length > 240
          ? { ...ev, part: { ...ev.part, state: { ...ev.part.state, output: ev.part.state.output.slice(0, 240) + `… (+${ev.part.state.output.length - 240} chars)` } } }
          : ev;
        fs.writeSync(tlFd, JSON.stringify(out) + "\n");
      }
    } finally {
      fs.closeSync(tlFd);
    }
    fs.writeFileSync(path.join(runDir, "subagents.json"), JSON.stringify(summary, null, 2) + "\n");
    try {
      db.close();
    } catch {}
    return summary;
  } catch (e) {
    summary.error = `extraction failed: ${e.message}`;
    try {
      db.close();
    } catch {}
    return summary;
  }
}

/* Grader-side loader for the captured streams (same normalization as parseLog:
 * non-pending tool_use calls, text parts). Returns {available:false, reason}
 * when no capture exists — scope!=parent checks then FAIL loudly instead of
 * silently passing against empty streams. */
function loadSubagentEvents(runDir) {
  const out = { available: false, reason: null, events: [], toolCalls: [], texts: [], sessions: [] };
  const dir = path.join(runDir, "subagents");
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    out.reason = `no ${path.relative(path.dirname(dir), dir)} capture (absent or extraction failed)`;
    return out;
  }
  if (!files.length) {
    out.reason = "subagents/ capture is empty";
    return out;
  }
  /* Text events are collected with their session's start time so the merged
   * text sources concatenate by session start (documented semantics), not by
   * lexicographic file name. */
  const textEntries = [];
  for (const f of files) {
    let text = "";
    try {
      text = fs.readFileSync(path.join(dir, f), "utf8");
    } catch {
      continue;
    }
    let sessStart = null;
    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      let ev;
      try {
        ev = JSON.parse(s);
      } catch {
        continue;
      }
      if (ev.type === "subagent_meta") {
        const meta = { id: ev.sessionID, parentID: ev.parentID, title: ev.title, agent: ev.agent, timeCreated: ev.timeCreated, timeUpdated: ev.timeUpdated };
        out.sessions.push(meta);
        sessStart = meta.timeCreated ?? null;
        continue;
      }
      out.events.push(ev);
      if (ev.type === "tool_use") {
        const part = ev.part ?? {};
        const state = part.state ?? {};
        if (state.status === "pending") continue;
        out.toolCalls.push({
          tool: part.tool,
          status: state.status ?? null,
          input: state.input ?? null,
          output: state.output ?? null,
          error: state.error ?? null,
          ts: ev.timestamp ?? null,
          sessionID: ev.sessionID ?? null,
        });
      } else if (ev.type === "text" && typeof ev.part?.text === "string" && ev.part.text) {
        textEntries.push({ text: ev.part.text, sessStart: sessStart ?? 0, ts: ev.timestamp ?? 0 });
      }
    }
  }
  out.sessions.sort((a, b) => (a.timeCreated ?? 0) - (b.timeCreated ?? 0));
  out.toolCalls.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  textEntries.sort((a, b) => (a.sessStart - b.sessStart) || (a.ts - b.ts));
  out.texts = textEntries.map((e) => e.text);
  out.available = out.sessions.length > 0 || out.toolCalls.length > 0 || out.texts.length > 0;
  if (!out.available) out.reason = "subagents/ capture parsed but contains no events";
  return out;
}

/* Live progress poller: every SUBAGENT_POLL_MS, read NEW part rows for this
 * run's sessions from the host DB and (a) append compact records to
 * <runDir>/progress.jsonl, (b) print one console line per burst of subagent
 * activity, (c) warn when NOTHING moved (neither DB parts nor parent stdout)
 * for SUBAGENT_STALL_WARN_MS. Degrades to a recorded note on the first DB
 * failure; never throws; log.jsonl is not touched. */
function startSubagentProgressPoller(label, runDir) {
  const state = {
    db: null,
    disabled: false,
    watermark: 0,
    updatedWatermark: 0,
    known: new Map(),
    lastActivityAt: Date.now(),
    lastDesc: "run start",
    lastStallWarnAt: 0,
  };
  let fd;
  try {
    fd = fs.openSync(path.join(runDir, "progress.jsonl"), "a");
  } catch {
    fd = null;
  }
  const record = (msg, extra = {}) => {
    if (!fd) return;
    try {
      fs.writeSync(fd, JSON.stringify({ t: new Date().toISOString(), msg, ...extra }) + "\n");
    } catch {}
  };
  const clock = () => new Date().toISOString().slice(11, 19);
  const disable = (reason) => {
    if (state.disabled) return;
    state.disabled = true;
    clearInterval(timer);
    try {
      state.db?.close();
    } catch {}
    state.db = null;
    record(`poller disabled: ${reason}`);
    console.error(`[${label}] subagent progress poller disabled: ${reason}`);
  };
  const tick = async () => {
    if (state.disabled) return;
    try {
      if (!state.db) {
        const open = await openOpencodeDb();
        if (state.disabled) {
          // stop() raced the async DB open: close what we just opened.
          try {
            open.db?.close();
          } catch {}
          return;
        }
        if (open.error) {
          disable(open.error);
          return;
        }
        state.db = open.db;
        record(`poller started (db: ${open.dbPath})`);
      }
      const db = state.db;
      const sessions = db.prepare(`SELECT ${SESSION_COLS} FROM session WHERE directory = ?`).all(path.resolve(runDir));
      const ids = [];
      for (const s of sessions) {
        ids.push(s.id);
        if (!state.known.has(s.id)) {
          state.known.set(s.id, s);
          if (s.parent_id) {
            const sessLabel = shortSessionLabel(s.title, s.agent);
            record(`subagent session started: ${sessLabel}`, { sid: s.id });
            console.log(`[${label}] ${clock()} sub[${sessLabel}] session started`);
          }
        }
      }
      if (!ids.length) return;
      const ph = ids.map(() => "?").join(",");
      /* Activity = new parts OR updated parts (a long-running tool call
       * transitions pending -> running -> completed via row updates that
       * never bump time_created). Reporting still keys on time_created so a
       * part is printed once. */
      const createdBefore = state.watermark;
      const rows = db.prepare(`SELECT session_id, time_created, time_updated, data FROM part WHERE session_id IN (${ph}) AND (time_created > ? OR time_updated > ?) ORDER BY time_created`).all(...ids, state.watermark, state.updatedWatermark);
      const grouped = new Map();
      for (const r of rows) {
        if (r.time_created > state.watermark) state.watermark = r.time_created;
        if ((r.time_updated ?? 0) > state.updatedWatermark) state.updatedWatermark = r.time_updated;
        state.lastActivityAt = Date.now();
        let p;
        try {
          p = JSON.parse(r.data);
        } catch {
          continue;
        }
        const meta = state.known.get(r.session_id);
        const kind = p.type === "tool" ? `tool ${p.tool} ${p.state?.status ?? ""}`.trim() : String(p.type ?? "?");
        const sessLabel = meta ? shortSessionLabel(meta.title, meta.agent) : r.session_id.slice(-6);
        /* lastDesc covers parent AND subagent activity so the stall banner
         * names the true last event, not just the last subagent one. */
        state.lastDesc = `${meta?.parent_id ? `sub[${sessLabel}]` : "parent"} ${kind} @${clock()}`;
        if (!meta?.parent_id) continue; // parent stream already lands in log.jsonl
        if (r.time_created <= createdBefore) continue; // update-only re-report guard
        const g = grouped.get(r.session_id) ?? { label: sessLabel, items: [] };
        g.items.push({ ts: r.time_created, kind });
        grouped.set(r.session_id, g);
      }
      for (const [, g] of grouped) {
        record(`subagent activity`, { label: g.label, events: g.items });
        if (g.items.length <= 6) {
          for (const it of g.items) console.log(`[${label}] ${clock()} sub[${g.label}] ${it.kind}`);
        } else {
          console.log(`[${label}] ${clock()} sub[${g.label}] +${g.items.length} events (catch-up)`);
        }
      }
      const quiet = Date.now() - state.lastActivityAt;
      if (quiet > SUBAGENT_STALL_WARN_MS && Date.now() - state.lastStallWarnAt > SUBAGENT_STALL_REWARN_MS) {
        state.lastStallWarnAt = Date.now();
        console.error(`[${label}] STALL: no parent or subagent activity for ${Math.round(quiet / 1000)}s — last: ${state.lastDesc} (opencode may be hung or retrying; inspect progress.jsonl, timeline, network)`);
        record(`stall warning: ${Math.round(quiet / 1000)}s quiet, last: ${state.lastDesc}`);
      }
    } catch (e) {
      disable(`poll failed: ${e.message}`);
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, SUBAGENT_POLL_MS);
  if (typeof timer.unref === "function") timer.unref();
  return {
    /* Parent-stream output also counts as activity (runSession hooks child
     * stdout/stderr into this) so the stall detector only fires on TRUE
     * silence across parent + subagents. */
    noteActivity() {
      state.lastActivityAt = Date.now();
    },
    stop(reason) {
      if (state.disabled) {
        if (fd) {
          try {
            fs.closeSync(fd);
          } catch {}
        }
        return;
      }
      clearInterval(timer);
      record(`poller stopped: ${reason}`);
      if (fd) {
        try {
          fs.closeSync(fd);
        } catch {}
      }
      try {
        state.db?.close();
      } catch {}
      state.disabled = true;
    },
  };
}

/* ============================================================ SECTION: session exec */

function timestampDirName() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function readLogFile(file) {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  return parseLog(text);
}

function findResumeDir(scenario, rep) {
  const scenarioRunsDir = path.join(RUNS_DIR, scenario.dirName);
  let dirs = [];
  try {
    dirs = fs.readdirSync(scenarioRunsDir).sort().reverse();
  } catch {
    return null;
  }
  const complete = [];
  for (const name of dirs) {
    const m = name.match(/^(\d{8}-\d{6})(?:-\d+)?-r(\d+)$/);
    if (!m || Number(m[2]) !== rep) continue;
    const dir = path.join(scenarioRunsDir, name);
    const log = path.join(dir, "log.jsonl");
    const result = path.join(dir, "result.json");
    if (!fs.existsSync(log) || !fs.existsSync(result)) continue;
    if (scenario.kind === "mcp-probe") {
      // Probe log.jsonl is the probe's plain-text stdout, never opencode
      // NDJSON: a probe rep is complete iff BOTH result files exist.
      if (!fs.existsSync(path.join(dir, "probe-result.json"))) continue;
      complete.push(dir);
      continue;
    }
    const parsed = readLogFile(log);
    if (parsed && parsed.endsWithStop) complete.push(dir);
  }
  return complete[0] ?? null;
}

function dropIncompleteRepDirs(scenario, rep) {
  const scenarioRunsDir = path.join(RUNS_DIR, scenario.dirName);
  let dirs = [];
  try {
    dirs = fs.readdirSync(scenarioRunsDir);
  } catch {
    return;
  }
  for (const name of dirs) {
    const m = name.match(/^(\d{8}-\d{6})(?:-\d+)?-r(\d+)$/);
    if (!m || Number(m[2]) !== rep) continue;
    const dir = path.join(scenarioRunsDir, name);
    const log = path.join(dir, "log.jsonl");
    const result = path.join(dir, "result.json");
    const repComplete = (() => {
      if (!fs.existsSync(log) || !fs.existsSync(result)) return false;
      if (scenario.kind === "mcp-probe") return fs.existsSync(path.join(dir, "probe-result.json"));
      const p = readLogFile(log);
      return !!(p && p.endsWithStop);
    })();
    if (!repComplete) fs.rmSync(dir, { recursive: true, force: true });
  }
}

function substituteEnvPlaceholders(text, env) {
  return String(text).replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(env, name) && env[name] !== undefined ? String(env[name]) : m);
}

function prepareRunDir(scenario, rep, dataRoot, skillsDir) {
  const scenarioRunsDir = path.join(RUNS_DIR, scenario.dirName);
  fs.mkdirSync(scenarioRunsDir, { recursive: true });
  dropIncompleteRepDirs(scenario, rep);
  const ts = timestampDirName();
  let runDir = path.join(scenarioRunsDir, `${ts}-r${rep}`);
  for (let k = 2; fs.existsSync(runDir); k++) runDir = path.join(scenarioRunsDir, `${ts}-${k}-r${rep}`);
  fs.mkdirSync(runDir, { recursive: true });

  // Skill injection — copy every directory from the skills root into
  // <runDir>/.opencode/skills/ so opencode's project-level discovery finds
  // the real skill files (fs.cp recursive).
  const injectRoot = path.join(runDir, ".opencode", "skills");
  fs.mkdirSync(injectRoot, { recursive: true });
  for (const skillName of listSkillDirs(skillsDir)) {
    fs.cpSync(path.join(skillsDir, skillName), path.join(injectRoot, skillName), { recursive: true });
  }

  // {DATA_DIR} resolves to the per-rep <runDir>/data directory, seeded from
  // the scenario's fixtures/ tree. Always created so {DATA_DIR} is valid.
  const runDataDir = path.join(runDir, "data");
  fs.mkdirSync(runDataDir, { recursive: true });
  const fixturesDir = path.join(scenario.dir, "fixtures");
  if (statFile(fixturesDir)?.isDirectory()) {
    fs.cpSync(fixturesDir, runDataDir, { recursive: true });
  }

  const sessionEnv = {
    ...sanitizeChildEnv(),
    DEMOS_DATA_ROOT: path.resolve(dataRoot),
    PYTHONDONTWRITEBYTECODE: "1",
  };
  const cfgSrc = path.join(scenario.dir, "opencode.json");
  if (fs.existsSync(cfgSrc)) {
    // Copy with generic {env:VAR} substitution (belt-and-braces fallback: the
    // committed file keeps {env:...} placeholders, the run-dir copy works
    // even if an opencode upgrade drops native command/env substitution).
    const cfgText = substituteEnvPlaceholders(fs.readFileSync(cfgSrc, "utf8"), sessionEnv);
    fs.writeFileSync(path.join(runDir, "opencode.json"), cfgText);
  }
  return { runDir, runDataDir, sessionEnv };
}

function runSession(scenario, rep, args, prepared) {
  const { runDir, runDataDir, sessionEnv } = prepared;
  return new Promise((resolve) => {
    const prompt = scenario.spec.prompt.split("{DATA_DIR}").join(runDataDir);
    fs.writeFileSync(path.join(runDir, "prompt.txt"), prompt + "\n");

    const logPath = path.join(runDir, "log.jsonl");
    const fd = fs.openSync(logPath, "a");
    const timeoutMs = args.timeout ?? scenario.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = new Date().toISOString();

    const argv = ["run", "--dir", runDir, "--auto", prompt, "--format", "json"];
    if (args.model) argv.push("--model", args.model);
    const child = spawn("opencode", argv, { cwd: runDir, env: sessionEnv, stdio: ["ignore", "pipe", "pipe"] });

    // DELTA 7: live subagent-progress poller (sidecar progress.jsonl + console
    // lines + stall warnings). Best-effort; never touches log.jsonl.
    const poller = startSubagentProgressPoller(scenario.id, runDir);

    let timedOut = false;
    let settled = false;
    let killTimer;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), TERM_GRACE_MS);
    }, timeoutMs);

    const finish = (spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      poller.stop(spawnError ? `spawn failed: ${spawnError?.message ?? "?"}` : timedOut ? "run timed out" : "run finished");
      fs.closeSync(fd);
      resolve({ runDir, logPath, timedOut, spawnError: spawnError ?? null, startedAt, endedAt: new Date().toISOString(), prompt });
    };
    child.stdout.on("data", (c) => { try { fs.writeSync(fd, c); } catch {} poller.noteActivity(); });
    child.stderr.on("data", (c) => { try { fs.writeSync(fd, c); } catch {} poller.noteActivity(); });
    child.on("error", (e) => finish(e));
    child.on("close", () => finish(null));
  });
}

// DELTA 1: mcp-probe scenarios dispatch to demos/lib/mcp-probe.mjs — a
// deterministic stdio JSON-RPC client (initialize -> notifications/initialized
// -> tools/list -> scripted tools/call). No opencode, no LLM tokens; the probe
// writes log.jsonl, capture.jsonl, tools-list.json, probe-result.json into
// the run dir and we normalize probe-result.json into the canonical
// result.json shape afterwards.
function runProbeSession(scenario, rep, args, prepared) {
  const { runDir } = prepared;
  return new Promise((resolve) => {
    const manifest = path.join(scenario.dir, "scenario.json");
    const probeScript = path.join(AGENT_ROOT, "lib", "mcp-probe.mjs");
    const logPath = path.join(runDir, "log.jsonl");
    const fd = fs.openSync(logPath, "a");
    const timeoutMs = args.timeout ?? scenario.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = new Date().toISOString();

    const argv = [probeScript, "--manifest", manifest, "--out-dir", runDir];
    // detached: own process group — the kill ladder below signals the whole
    // group so a SIGTERMed probe cannot orphan its detached npx/biomcp child
    // (node's default SIGTERM handler exits without running finally blocks).
    const child = spawn(process.execPath, argv, {
      cwd: AGENT_ROOT,
      env: sanitizeChildEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });

    let timedOut = false;
    let settled = false;
    let killTimer;
    const stopGroup = (sig) => {
      try { process.kill(-child.pid, sig); } catch {
        try { child.kill(sig); } catch {}
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stopGroup("SIGTERM");
      killTimer = setTimeout(() => stopGroup("SIGKILL"), TERM_GRACE_MS);
    }, timeoutMs);

    const finish = (spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      fs.closeSync(fd);
      resolve({ runDir, logPath, timedOut, spawnError: spawnError ?? null, startedAt, endedAt: new Date().toISOString(), prompt: null });
    };
    child.stdout.on("data", (c) => { try { fs.writeSync(fd, c); } catch {} });
    child.stderr.on("data", (c) => { try { fs.writeSync(fd, c); } catch {} });
    child.on("error", (e) => finish(e));
    child.on("close", () => finish(null));
  });
}

// Normalize lib/mcp-probe.mjs output into the canonical result.json shape.
function gradeProbeRun(runDir, scenario, rep) {
  const probeResultPath = path.join(runDir, "probe-result.json");
  let probe;
  try {
    probe = JSON.parse(fs.readFileSync(probeResultPath, "utf8"));
  } catch (e) {
    return { outcome: "ERROR", reason: `cannot read probe-result.json: ${e.message}`, results: [], rubrics: [], failing: [] };
  }
  const results = Array.isArray(probe.checks) ? probe.checks : [];
  const failing = results.filter((r) => r.status === "fail" || r.status === "error");
  let outcome;
  if (probe.outcome === "PASS") outcome = "PASS";
  else if (probe.outcome === "FAIL") outcome = "FAIL";
  else outcome = "ERROR";
  return { outcome, reason: probe.reason ?? null, results, rubrics: [], failing, probe };
}

/* ============================================================= SECTION: NDJSON parse */

function isApiErrorEvent(ev) {
  if (ev?.type !== "error") return false;
  const err = ev.error ?? ev.part?.error ?? ev.data ?? null;
  if (!err || typeof err !== "object") return false;
  if (err.name === "APIError") return true;
  const sc = err.data?.statusCode ?? err.statusCode ?? null;
  return Number.isFinite(Number(sc)) && Number(sc) >= 400;
}

function parseLog(text) {
  const events = [];
  let parsedCount = 0;
  for (const line of String(text).split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    let ev;
    try {
      ev = JSON.parse(s);
    } catch {
      continue;
    }
    parsedCount++;
    events.push(ev);
  }
  const toolCalls = [];
  const texts = [];
  let endsWithStop = false;
  let lastApiError = null;
  let lastWasTerminalStop = false;
  let costTotal = null; // DELTA 5: sum of step_finish cost.total, when present
  for (const ev of events) {
    lastWasTerminalStop = false;
    if (ev.type === "tool_use") {
      const part = ev.part ?? {};
      const state = part.state ?? {};
      const status = state.status;
      if (status === "pending") continue;
      toolCalls.push({
        tool: part.tool,
        status: status ?? null,
        input: state.input ?? null,
        output: state.output ?? null,
        error: state.error ?? null,
        /* DELTA 7: event timestamp (ms epoch) — lets scope:"all" interleave
         * parent and captured subagent tool calls in true execution order. */
        ts: ev.timestamp ?? null,
      });
    } else if (ev.type === "text" && typeof ev.part?.text === "string") {
      if (ev.part.text) texts.push(ev.part.text);
    } else if (ev.type === "message" && typeof ev.part?.text === "string") {
      if (ev.part.text) texts.push(ev.part.text);
    } else if (ev.type === "step_finish") {
      if (ev.part?.reason === "stop") lastWasTerminalStop = true;
      const c = ev.part?.cost?.total;
      if (typeof c === "number" && Number.isFinite(c)) costTotal = (costTotal ?? 0) + c;
    } else if (isApiErrorEvent(ev)) {
      lastApiError = ev.error ?? ev.part?.error ?? ev.data ?? null;
    }
  }
  endsWithStop = lastWasTerminalStop && events.length > 0;
  return { events, parsedCount, toolCalls, texts, endsWithStop, apiError: lastApiError, costTotal };
}

/* ================================================================= SECTION: grader */
/* Ported from the source harness (13 check types, incl. the DELTA 8/7
 * subagent_count type and scope-aware evaluation). */

function toText(v) {
  if (Array.isArray(v)) return JSON.stringify(v);
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return Number.isNaN(a) && Number.isNaN(b);
  }
  const aArr = Array.isArray(a);
  const bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

function resolveToolRef(parsed, name) {
  if (typeof name !== "string" || name.length === 0) return { error: "empty tool name" };
  const distinct = [...new Set(parsed.toolCalls.map((c) => c.tool))].filter((t) => t === name || t.endsWith(name));
  if (distinct.length === 0) return { missing: true };
  if (distinct.length > 1) return { error: `ambiguous tool ref "${name}" matches [${distinct.join(", ")}] — use the full name` };
  return { full: distinct[0], calls: parsed.toolCalls.filter((c) => c.tool === distinct[0]) };
}

function parseOccurrence(ref) {
  const m = String(ref).match(/^(.*)#(\d+)$/);
  if (!m) return { name: String(ref), occ: 1 };
  return { name: m[1], occ: Number(m[2]) };
}

function getSource(parsed, source) {
  const src = source ?? "final";
  if (src === "final") {
    return parsed.texts.length ? { ok: true, value: parsed.texts[parsed.texts.length - 1] } : { ok: false };
  }
  if (src === "assistant") {
    return parsed.texts.length ? { ok: true, value: parsed.texts.join("\n") } : { ok: false };
  }
  if (typeof src !== "string") return { error: `source must be a string, got ${typeof src}` };
  if (src.startsWith("tool:")) {
    const rest = src.slice(5);
    if (rest === "*") {
      const parts = parsed.toolCalls.map((c) => (c.status === "completed" ? c.output : c.error)).filter((v) => v !== null && v !== undefined);
      return parts.length ? { ok: true, value: parts.map(toText).join("\n") } : { ok: false };
    }
    const { name, occ } = parseOccurrence(rest);
    const r = resolveToolRef(parsed, name);
    if (r.error) return { error: r.error };
    if (r.missing) return { ok: false };
    if (!Number.isInteger(occ) || occ < 1) return { error: `invalid occurrence in source "${src}"` };
    const call = r.calls[occ - 1];
    if (!call) return { ok: false };
    const v = call.status === "completed" ? call.output : call.error;
    if (v === null || v === undefined) return { ok: false };
    return { ok: true, value: v };
  }
  if (src.startsWith("args:")) {
    const { name, occ } = parseOccurrence(src.slice(6));
    const r = resolveToolRef(parsed, name);
    if (r.error) return { error: r.error };
    if (r.missing) return { ok: false };
    if (!Number.isInteger(occ) || occ < 1) return { error: `invalid occurrence in source "${src}"` };
    const call = r.calls[occ - 1];
    if (!call || call.input === null || call.input === undefined) return { ok: false };
    return { ok: true, value: call.input };
  }
  return { error: `unknown source "${src}"` };
}

function walkPath(obj, p) {
  if (typeof p !== "string" || p.length === 0) return { error: `malformed path ${JSON.stringify(p)}` };
  const segs = p.split(".");
  if (segs.some((s) => s === "")) return { error: `malformed path "${p}" (empty segment)` };
  let cur = obj;
  for (const s of segs) {
    if (cur === null || cur === undefined) return { missing: true };
    if (Array.isArray(cur)) {
      const i = Number(s);
      if (!Number.isInteger(i) || String(i) !== s || i < 0 || i >= cur.length) return { missing: true };
      cur = cur[i];
    } else if (typeof cur === "object") {
      if (!Object.prototype.hasOwnProperty.call(cur, s)) return { missing: true };
      cur = cur[s];
    } else {
      return { missing: true };
    }
  }
  return { value: cur };
}

const NUM_TOKEN_RE = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g;
function extractNumbers(text) {
  const out = [];
  for (const m of toText(text).matchAll(NUM_TOKEN_RE)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

function textFragments(text) {
  return toText(text)
    .split(/\r?\n/)
    .flatMap((line) => line.split(/(?<=[.!?;])\s+/))
    .filter((f) => f.trim().length > 0);
}

function compileContext(context) {
  if (context === undefined || context === null) return null;
  if (typeof context !== "string" || context.length === 0) return { error: "context must be a non-empty regex string" };
  try {
    return { re: new RegExp(context, "i") };
  } catch (e) {
    return { error: `invalid context regex ${JSON.stringify(context)}: ${e.message}` };
  }
}

function numbersInContext(text, context) {
  const c = compileContext(context);
  if (c && c.error) return c;
  const frags = context === undefined || context === null
    ? [toText(text)]
    : textFragments(text).filter((f) => c.re.test(f));
  return { nums: frags.flatMap(extractNumbers) };
}

function existsValue(v) {
  if (v === null || v === undefined) return false;
  if (v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === "object" && Object.keys(v).length === 0) return false;
  return true;
}

function getOccurrence(check, parsed, key = "tool") {
  const r = resolveToolRef(parsed, check[key]);
  if (r.error) return r;
  if (r.missing) return { missing: true };
  const occ = check.occurrence ?? 1;
  if (!Number.isInteger(occ) || occ < 1) return { error: `invalid occurrence ${JSON.stringify(check.occurrence)} (must be integer >= 1)` };
  const call = r.calls[occ - 1];
  if (!call) return { missing: true, note: `occurrence ${occ} of ${r.full} not found (${r.calls.length} call(s))` };
  return { call, full: r.full, occ };
}

const result = (check, status, detail) => ({
  type: check?.type ?? "?",
  desc: typeof check?.desc === "string" && check.desc ? check.desc : null,
  status,
  detail,
});

function describeCheck(check) {
  return typeof check?.desc === "string" && check.desc ? check.desc : `<${check?.type ?? "?"}>`;
}

function evalCheck(check, parsed, subParsed) {
  if (!check || typeof check !== "object" || Array.isArray(check)) {
    return result(check, "error", "check is not an object");
  }
  try {
    const fn = CHECK_TYPES[check.type];
    if (!fn) return result(check, "error", `unknown check type ${JSON.stringify(check.type)}`);
    /* DELTA 7: optional check scope. "parent" (default) keeps the legacy
     * semantics exactly (log.jsonl only); "subagents" addresses the captured
     * worker streams; "all" merges both (tool calls interleaved by event
     * timestamp). A non-parent scope without a capture FAILS loudly rather
     * than silently passing against empty streams. */
    const scope = check.scope ?? "parent";
    if (scope !== "parent" && scope !== "subagents" && scope !== "all") {
      return result(check, "error", `invalid scope ${JSON.stringify(check.scope)} (parent|subagents|all)`);
    }
    if (scope === "parent") return fn(check, parsed, subParsed);
    if (scope === "subagents" && !subParsed?.available) {
      return result(check, "fail", `scope "subagents" requires subagent capture, none available (${subParsed?.reason ?? "subagents/ absent"}); run live or use --extract-subagents`);
    }
    const subEvents = subParsed?.available ? subParsed.events : [];
    const subCalls = subParsed?.available ? subParsed.toolCalls : [];
    const subTexts = subParsed?.available ? subParsed.texts : [];
    const eff = scope === "subagents"
      ? { events: subEvents, parsedCount: subEvents.length, toolCalls: subCalls, texts: subTexts, endsWithStop: true, apiError: null }
      : {
          events: [...parsed.events, ...subEvents],
          parsedCount: parsed.parsedCount + subEvents.length,
          toolCalls: [...parsed.toolCalls, ...subCalls].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
          texts: [...parsed.texts, ...subTexts],
          endsWithStop: parsed.endsWithStop,
          apiError: parsed.apiError,
        };
    return fn(check, eff, subParsed);
  } catch (e) {
    return result(check, "error", `grader exception: ${e.message}`);
  }
}

function checkToolSeq(check, parsed) {
  const seq = check.seq;
  if (!Array.isArray(seq) || seq.length === 0) return result(check, "error", "tool_seq requires non-empty seq: [[tool, status|*], ...]");
  const norm = [];
  for (const e of seq) {
    if (!Array.isArray(e) || e.length < 1 || typeof e[0] !== "string" || e[0].length === 0) {
      return result(check, "error", `malformed tool_seq entry ${JSON.stringify(e)}`);
    }
    const st = e[1] ?? "*";
    if (st !== "*" && st !== "completed" && st !== "error") {
      return result(check, "error", `invalid status ${JSON.stringify(st)} in tool_seq entry (completed|error|*)`);
    }
    norm.push([e[0], st]);
  }
  const mode = check.mode ?? "subsequence";
  if (mode !== "subsequence" && mode !== "exact") return result(check, "error", `invalid tool_seq mode ${JSON.stringify(check.mode)}`);
  const stream = parsed.toolCalls.filter((c) => typeof c.tool === "string" && c.tool.startsWith("biomcp_"));
  const matches = (call, [name, st]) => (call.tool === name || call.tool.endsWith(name)) && (st === "*" || call.status === st);
  let ok;
  if (mode === "exact") {
    ok = stream.length === norm.length && norm.every((entry, i) => matches(stream[i], entry));
  } else {
    ok = true;
    let i = 0;
    for (const entry of norm) {
      while (i < stream.length && !matches(stream[i], entry)) i++;
      if (i >= stream.length) { ok = false; break; }
      i++;
    }
  }
  const streamStr = stream.map((c) => `${c.tool}:${c.status}`).join(" -> ") || "(empty)";
  return result(check, ok ? "pass" : "fail",
    ok ? `tool_seq ${mode} matched (${stream.length} biomcp call(s))`
       : `tool_seq ${mode} not matched; biomcp stream: ${streamStr}`);
}

function checkGroup(check, parsed, subParsed) {
  const hasAny = Array.isArray(check.anyOf);
  const hasAll = Array.isArray(check.allOf);
  if (hasAny === hasAll) return result(check, "error", "group requires exactly one of anyOf|allOf (non-empty array)");
  const arms = hasAny ? check.anyOf : check.allOf;
  if (arms.length === 0) return result(check, "error", "group requires a non-empty anyOf/allOf array");
  const armResults = arms.map((a) => evalCheck(a, parsed, subParsed));
  const summary = armResults.map((r, i) => `arm${i + 1}[${r.status}]${r.detail ? ` ${r.detail}` : ""}`).join("; ");
  if (hasAny) {
    if (armResults.some((r) => r.status === "pass")) {
      return { ...result(check, "pass", `anyOf matched: ${summary}`), arms: armResults };
    }
    if (armResults.every((r) => r.status === "error")) {
      return { ...result(check, "error", `anyOf: all arms ERROR: ${summary}`), arms: armResults };
    }
    return { ...result(check, "fail", `anyOf: no arm matched: ${summary}`), arms: armResults };
  }
  if (armResults.some((r) => r.status === "fail")) {
    return { ...result(check, "fail", `allOf: failing arm(s): ${summary}`), arms: armResults };
  }
  if (armResults.some((r) => r.status === "error")) {
    return { ...result(check, "error", `allOf: error arm(s): ${summary}`), arms: armResults };
  }
  return { ...result(check, "pass", `allOf matched: ${summary}`), arms: armResults };
}

function checkText(check, parsed) {
  const op = check.op ?? "contains";
  if (!["contains", "not_contains", "regex"].includes(op)) return result(check, "error", `invalid text op ${JSON.stringify(check.op)}`);
  if (typeof check.expect !== "string") return result(check, "error", "text requires string expect");
  const s = getSource(parsed, check.source);
  if (s.error) return result(check, "error", `source: ${s.error}`);
  if (!s.ok) return result(check, "fail", `missing source ${JSON.stringify(check.source ?? "final")}`);
  const hay = toText(s.value);
  let ok;
  if (op === "contains") ok = hay.includes(check.expect);
  else if (op === "not_contains") ok = !hay.includes(check.expect);
  else {
    try { ok = new RegExp(check.expect).test(hay); } catch (e) { return result(check, "error", `invalid regex: ${e.message}`); }
  }
  return result(check, ok ? "pass" : "fail",
    `${op} ${JSON.stringify(check.expect)} on ${JSON.stringify(check.source ?? "final")} (${hay.length} chars)`);
}

function checkNumberNear(check, parsed) {
  if (!Number.isFinite(Number(check.expect))) return result(check, "error", "number_near requires numeric expect");
  const expect = Number(check.expect);
  const tol = check.tolerance === undefined ? 0 : Number(check.tolerance);
  if (!Number.isFinite(tol) || tol < 0) return result(check, "error", "tolerance must be a finite number >= 0");
  const s = getSource(parsed, check.source);
  if (s.error) return result(check, "error", `source: ${s.error}`);
  if (!s.ok) return result(check, "fail", `missing source ${JSON.stringify(check.source ?? "final")}`);
  const r = numbersInContext(s.value, check.context);
  if (r.error) return result(check, "error", r.error);
  const ok = r.nums.some((n) => Math.abs(n - expect) <= tol);
  return result(check, ok ? "pass" : "fail",
    `${ok ? "found" : "no"} number within ${tol} of ${expect}${check.context ? ` in context ${JSON.stringify(check.context)}` : ""}; numbers: [${r.nums.slice(0, 12).join(", ")}${r.nums.length > 12 ? ", …" : ""}]`);
}

function checkTextNumberCount(check, parsed) {
  if (!Number.isFinite(Number(check.expect))) return result(check, "error", "text_number_count requires numeric expect");
  const expect = Number(check.expect);
  const tol = check.tolerance === undefined ? 0 : Number(check.tolerance);
  if (!Number.isFinite(tol) || tol < 0) return result(check, "error", "tolerance must be a finite number >= 0");
  const s = getSource(parsed, check.source);
  if (s.error) return result(check, "error", `source: ${s.error}`);
  if (!s.ok) return result(check, "fail", `missing source ${JSON.stringify(check.source ?? "final")}`);
  const r = numbersInContext(s.value, check.context);
  if (r.error) return result(check, "error", r.error);
  const distinct = [...new Set(r.nums)];
  const ok = Math.abs(distinct.length - expect) <= tol;
  return result(check, ok ? "pass" : "fail",
    `${distinct.length} distinct number(s)${check.context ? ` in context ${JSON.stringify(check.context)}` : ""}, expected ${expect}±${tol}; got [${distinct.slice(0, 12).join(", ")}${distinct.length > 12 ? ", …" : ""}]`);
}

function checkArgs(check, parsed) {
  const op = check.op;
  if (!["equals", "regex", "contains", "exists"].includes(op)) return result(check, "error", `invalid args op ${JSON.stringify(check.op)}`);
  const g = getOccurrence(check, parsed);
  if (g.error) return result(check, "error", g.error);
  if (g.missing) return result(check, "fail", `no matching tool call: ${g.note ?? JSON.stringify(check.tool)}`);
  const input = g.call.input ?? {};
  if (typeof input !== "object" || Array.isArray(input)) return result(check, "fail", `call ${g.full}#${g.occ} input is not an object`);
  const w = walkPath(input, check.path);
  if (w.error) return result(check, "error", w.error);
  if (w.missing) return result(check, "fail", `path "${check.path}" missing in ${g.full}#${g.occ} input`);
  const v = w.value;
  if (op === "exists") {
    const ok = existsValue(v);
    return result(check, ok ? "pass" : "fail", `path "${check.path}" in ${g.full}#${g.occ}: ${ok ? "exists" : `empty/null (${toText(v)})`}`);
  }
  if (check.expect === undefined) return result(check, "error", `${op} requires expect`);
  if (op === "equals") {
    const ok = deepEqual(v, check.expect);
    return result(check, ok ? "pass" : "fail", `path "${check.path}" in ${g.full}#${g.occ}: ${JSON.stringify(v)} ${ok ? "==" : "!="} ${JSON.stringify(check.expect)}`);
  }
  const hay = toText(v);
  if (op === "contains") {
    const ok = hay.includes(String(check.expect));
    return result(check, ok ? "pass" : "fail", `path "${check.path}" in ${g.full}#${g.occ}: ${ok ? "contains" : "does not contain"} ${JSON.stringify(String(check.expect))}`);
  }
  try {
    const ok = new RegExp(String(check.expect)).test(hay);
    return result(check, ok ? "pass" : "fail", `path "${check.path}" in ${g.full}#${g.occ}: regex ${JSON.stringify(String(check.expect))} ${ok ? "matched" : "no match"}`);
  } catch (e) {
    return result(check, "error", `invalid regex: ${e.message}`);
  }
}

function checkArgsRel(check, parsed) {
  const op = check.op;
  if (!["lt", "le", "gt", "ge", "eq"].includes(op)) return result(check, "error", `invalid args_rel op ${JSON.stringify(check.op)}`);
  for (const k of ["occA", "occB"]) {
    if (!Number.isInteger(check[k]) || check[k] < 1) return result(check, "error", `args_rel requires integer ${k} >= 1`);
  }
  const r = resolveToolRef(parsed, check.tool);
  if (r.error) return result(check, "error", r.error);
  if (r.missing) return result(check, "fail", `no matching tool call: ${JSON.stringify(check.tool)}`);
  const pick = (occ) => r.calls[occ - 1];
  const a = pick(check.occA);
  const b = pick(check.occB);
  if (!a || !b) return result(check, "fail", `occurrences not found: occA=${check.occA}${a ? "" : " (missing)"} occB=${check.occB}${b ? "" : " (missing)"} of ${r.full} (${r.calls.length} call(s))`);
  const wa = walkPath(a.input ?? {}, check.path);
  const wb = walkPath(b.input ?? {}, check.path);
  if (wa.error) return result(check, "error", `occA: ${wa.error}`);
  if (wb.error) return result(check, "error", `occB: ${wb.error}`);
  if (wa.missing || wb.missing) return result(check, "fail", `path "${check.path}" missing in occA or occB input of ${r.full}`);
  const va = Number(wa.value);
  const vb = Number(wb.value);
  if (!Number.isFinite(va) || !Number.isFinite(vb)) return result(check, "fail", `non-numeric value(s) at "${check.path}": occA=${JSON.stringify(wa.value)} occB=${JSON.stringify(wb.value)}`);
  const cmp = { lt: va < vb, le: va <= vb, gt: va > vb, ge: va >= vb, eq: va === vb }[op];
  const sym = { lt: "<", le: "<=", gt: ">", ge: ">=", eq: "==" }[op];
  return result(check, cmp ? "pass" : "fail", `${r.full} "${check.path}": occA(${check.occA})=${va} ${sym} occB(${check.occB})=${vb} -> ${cmp}`);
}

function checkJsonPath(check, parsed) {
  const op = check.op;
  if (!["equals", "near", "exists"].includes(op)) return result(check, "error", `invalid json_path op ${JSON.stringify(check.op)}`);
  const g = getOccurrence(check, parsed);
  if (g.error) return result(check, "error", g.error);
  if (g.missing) return result(check, "fail", `no matching tool call: ${g.note ?? JSON.stringify(check.tool)}`);
  const raw = g.call.output;
  if (raw === null || raw === undefined) return result(check, "fail", `${g.full}#${g.occ} has no output`);
  let obj;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return result(check, "fail", `${g.full}#${g.occ} output is not JSON`);
    }
  } else if (typeof raw === "object") {
    obj = raw;
  } else {
    return result(check, "fail", `${g.full}#${g.occ} output is not an object/string`);
  }
  const w = walkPath(obj, check.path);
  if (w.error) return result(check, "error", w.error);
  if (w.missing) return result(check, "fail", `path "${check.path}" missing in ${g.full}#${g.occ} output JSON`);
  const v = w.value;
  if (op === "exists") {
    const ok = existsValue(v);
    return result(check, ok ? "pass" : "fail", `json_path "${check.path}" in ${g.full}#${g.occ}: ${ok ? "exists" : `empty/null (${toText(v)})`}`);
  }
  if (check.expect === undefined) return result(check, "error", `${op} requires expect`);
  if (op === "equals") {
    const ok = deepEqual(v, check.expect);
    return result(check, ok ? "pass" : "fail", `json_path "${check.path}": ${JSON.stringify(v)} ${ok ? "==" : "!="} ${JSON.stringify(check.expect)}`);
  }
  const tol = check.tolerance === undefined ? 0 : Number(check.tolerance);
  if (!Number.isFinite(tol) || tol < 0) return result(check, "error", "tolerance must be a finite number >= 0");
  const nv = Number(v);
  const ne = Number(check.expect);
  if (!Number.isFinite(nv) || !Number.isFinite(ne)) return result(check, "fail", `non-numeric value at "${check.path}": ${JSON.stringify(v)}`);
  const ok = Math.abs(nv - ne) <= tol;
  return result(check, ok ? "pass" : "fail", `json_path "${check.path}" = ${nv}, expect ${ne}±${tol}`);
}

function checkToolCount(check, parsed) {
  if (check.min === undefined && check.max === undefined) return result(check, "error", "tool_count requires min and/or max");
  for (const k of ["min", "max"]) {
    if (check[k] !== undefined && !Number.isInteger(check[k])) return result(check, "error", `tool_count ${k} must be an integer`);
  }
  let count;
  if (check.tool === undefined) {
    count = parsed.toolCalls.length;
  } else {
    const r = resolveToolRef(parsed, check.tool);
    if (r.error) return result(check, "error", r.error);
    count = r.missing ? 0 : r.calls.length;
  }
  const ok = (check.min === undefined || count >= check.min) && (check.max === undefined || count <= check.max);
  return result(check, ok ? "pass" : "fail",
    `count=${count} of ${check.tool === undefined ? "(any tool)" : JSON.stringify(check.tool)}; bounds [${check.min ?? "-inf"}, ${check.max ?? "inf"}]`);
}

function checkNoSuchTool(check, parsed) {
  const tools = Array.isArray(check.tool) ? check.tool : [check.tool];
  if (tools.length === 0 || tools.some((t) => typeof t !== "string" || t.length === 0)) {
    return result(check, "error", "no_such_tool requires a non-empty tool name or array of names");
  }
  const found = [...new Set(parsed.toolCalls.map((c) => c.tool))].filter((t) => tools.some((n) => t === n || t.endsWith(n)));
  return result(check, found.length === 0 ? "pass" : "fail",
    found.length === 0 ? `none of [${tools.join(", ")}] was called` : `forbidden tool(s) called: [${found.join(", ")}]`);
}

function checkStatus(check, parsed) {
  if (typeof check.status !== "string") return result(check, "error", "status requires string status");
  const g = getOccurrence(check, parsed);
  if (g.error) return result(check, "error", g.error);
  if (g.missing) return result(check, "fail", `no matching tool call: ${g.note ?? JSON.stringify(check.tool)}`);
  const ok = g.call.status === check.status;
  return result(check, ok ? "pass" : "fail", `${g.full}#${g.occ} status ${g.call.status}${ok ? " ==" : " !="} ${check.status}`);
}

function checkSubagentCount(check, parsed, subParsed) {
  if (check.min === undefined && check.max === undefined) return result(check, "error", "subagent_count requires min and/or max");
  for (const k of ["min", "max"]) {
    if (check[k] !== undefined && !Number.isInteger(check[k])) return result(check, "error", `subagent_count ${k} must be an integer`);
  }
  if (check.agent !== undefined && typeof check.agent !== "string") return result(check, "error", "subagent_count agent must be a string");
  /* Without a capture, count=0 is indistinguishable from "no capture" — fail
   * loudly like every other subagent-addressed check (never vacuously pass a
   * max-only bound against nothing). */
  if (!subParsed?.available) {
    return result(check, "fail", `subagent_count requires subagent capture, none available (${subParsed?.reason ?? "subagents/ absent"}); run live or use --extract-subagents`);
  }
  const sessions = subParsed.sessions;
  const sel = check.agent === undefined ? sessions : sessions.filter((s) => s.agent === check.agent);
  const count = sel.length;
  const ok = (check.min === undefined || count >= check.min) && (check.max === undefined || count <= check.max);
  const who = sel.map((s) => `${s.agent ?? "?"}/${String(s.title ?? "").replace(/\s*\(@[^)]*\)\s*$/, "").slice(0, 30)}`).join(", ");
  return result(check, ok ? "pass" : "fail",
    `count=${count} of ${check.agent === undefined ? "(any agent)" : JSON.stringify(check.agent)} subagent session(s); bounds [${check.min ?? "-inf"}, ${check.max ?? "inf"}]${who ? `; captured: ${who}` : "; none captured"}`);
}

function checkRubric(check) {
  if (check.manual !== true) return result(check, "error", "rubric requires manual: true");
  if (typeof check.flag !== "string" || !check.flag) return result(check, "error", "rubric requires string flag");
  return { ...result(check, "manual", `unadjudicated rubric flag: ${check.flag}`), flag: check.flag };
}

/* 13 check types (the source's "13" counted group.anyOf/group.allOf as two;
 * they are the two composition modes of a single `group` type). subagent_count
 * is a DELTA 7 addition ported from the source harness. */
const CHECK_TYPES = {
  tool_seq: checkToolSeq,
  group: checkGroup,
  text: checkText,
  number_near: checkNumberNear,
  text_number_count: checkTextNumberCount,
  args: checkArgs,
  args_rel: checkArgsRel,
  json_path: checkJsonPath,
  tool_count: checkToolCount,
  no_such_tool: checkNoSuchTool,
  status: checkStatus,
  subagent_count: checkSubagentCount,
  rubric: checkRubric,
};

function gradeRep(parsed, scenario, subParsed) {
  const results = scenario.spec.checks.map((c) => evalCheck(c, parsed, subParsed));
  const rubrics = results.filter((r) => r.status === "manual");
  let outcome;
  let reason = null;
  if (parsed.parsedCount === 0) {
    outcome = "ERROR";
    reason = "log has no parseable NDJSON events";
  } else if (!parsed.endsWithStop) {
    outcome = "ERROR";
    reason = "no terminal step_finish(reason=stop) at end of log";
  } else if (results.some((r) => r.status === "error")) {
    outcome = "ERROR";
    reason = `${results.filter((r) => r.status === "error").length} check(s) ERROR`;
  } else if (results.some((r) => r.status === "fail")) {
    outcome = "FAIL";
  } else {
    outcome = rubrics.length ? "PASS*" : "PASS";
  }
  const failing = results.filter((r) => r.status === "fail" || r.status === "error");
  return { outcome, reason, results, rubrics, failing };
}

/* DELTA 7: hermetic spec validation (check types, scope values,
 * subagent_count bounds; group arms validated recursively). Used by --dry-run
 * and re-checked before a live spawn so malformed specs never spend tokens.
 * (check-demos.mjs carries a mirror of this validator so CI catches the same
 * class of typos without executing the runner.) */
function validateSpec(spec) {
  if (!Array.isArray(spec.checks)) return "checks must be an array";
  const walk = (check, where) => {
    if (!check || typeof check !== "object" || Array.isArray(check)) return `${where}: check is not an object`;
    if (check.scope !== undefined && !["parent", "subagents", "all"].includes(check.scope)) {
      return `${where}: invalid scope ${JSON.stringify(check.scope)} (parent|subagents|all)`;
    }
    if (check.type === "group") {
      const hasAny = Array.isArray(check.anyOf);
      const hasAll = Array.isArray(check.allOf);
      if (hasAny === hasAll) return `${where}: group requires exactly one of anyOf|allOf (non-empty array)`;
      const arms = hasAny ? check.anyOf : check.allOf;
      for (let i = 0; i < arms.length; i++) {
        const e = walk(arms[i], `${where}.arm${i + 1}`);
        if (e) return e;
      }
      return null;
    }
    if (!CHECK_TYPES[check.type]) return `${where}: unknown check type ${JSON.stringify(check.type)}`;
    if (check.type === "subagent_count") {
      if (check.min === undefined && check.max === undefined) return `${where}: subagent_count requires min and/or max`;
      for (const k of ["min", "max"]) {
        if (check[k] !== undefined && !Number.isInteger(check[k])) return `${where}: subagent_count ${k} must be an integer`;
      }
      if (check.agent !== undefined && typeof check.agent !== "string") return `${where}: subagent_count agent must be a string`;
    }
    return null;
  };
  for (let i = 0; i < spec.checks.length; i++) {
    const e = walk(spec.checks[i], `checks[${i}]`);
    if (e) return e;
  }
  return null;
}

/* ================================================================ SECTION: report */

function whichPath(tool) {
  try {
    const r = spawnSync("which", [tool], { encoding: "utf8", timeout: 15000 });
    const out = (r.stdout ?? "").trim();
    return r.status === 0 && out ? out.split(/\r?\n/)[0] : null;
  } catch {
    return null;
  }
}

function captureProvenance(args, dataRoot, skillsDir) {
  const prov = {
    gitCommit: null,
    opencodeVersion: null,
    model: args.model ?? null,
    dataRoot: path.resolve(dataRoot),
    skillsDir: path.resolve(skillsDir),
    skills: {},
    timestamp: new Date().toISOString(),
    globalConfigSha256: null,
    hostTools: {},
  };
  try {
    const g = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8", timeout: 15000 });
    if (g.status === 0) prov.gitCommit = g.stdout.trim();
  } catch {}
  try {
    const v = spawnSync("opencode", ["--version"], { encoding: "utf8", timeout: 30000 });
    if (v.status === 0) prov.opencodeVersion = (v.stdout ?? "").trim().split(/\r?\n/)[0];
  } catch {}
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (homeDir) {
    for (const name of ["opencode.jsonc", "opencode.json"]) {
      const gcfg = path.join(homeDir, ".config", "opencode", name);
      if (!fs.existsSync(gcfg)) continue;
      try {
        prov.globalConfigSha256 = crypto.createHash("sha256").update(fs.readFileSync(gcfg)).digest("hex");
        break;
      } catch {}
    }
  }
  for (const t of ["python3", "uv", "pandoc"]) prov.hostTools[t] = whichPath(t);
  for (const skillName of listSkillDirs(skillsDir)) {
    const skmd = path.join(skillsDir, skillName, "SKILL.md");
    if (fs.existsSync(skmd)) {
      try {
        prov.skills[skillName] = crypto.createHash("sha256").update(fs.readFileSync(skmd)).digest("hex");
      } catch {}
    }
  }
  return prov;
}

function truncate(s, n) {
  s = String(s ?? "");
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function printReportTable(rows) {
  const cols = [["SCENARIO", 30], ["REP", 3], ["OUTCOME", 11], ["DETAIL", 80]];
  const head = cols.map(([h, w]) => h.padEnd(w)).join("  ");
  console.log("\n" + head);
  console.log("-".repeat(head.length));
  for (const r of rows) {
    console.log([
      truncate(r.test, 30).padEnd(30),
      String(r.rep).padEnd(3),
      String(r.outcome).padEnd(11),
      truncate(r.detail, 80),
    ].join("  "));
  }
}

function exitCodeFor(rows) {
  if (rows.some((r) => r.outcome === "ERROR" || r.outcome === "INTERRUPTED")) return 2;
  if (rows.some((r) => r.outcome === "FAIL")) return 1;
  return 0;
}

/* ======================================================================= SECTION: main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return 0;
  }
  // DELTA 7: postmortem mode — (re)capture subagent streams for one finished
  // run dir, print the summary, exit. Never spawns opencode, never discovers
  // scenarios, and refuses directories outside demos/.runs.
  if (args.extractSubagents) {
    const summary = await extractSubagents(args.extractSubagents);
    console.log(JSON.stringify(summary, null, 2));
    return summary.error ? 2 : 0;
  }
  const scenarios = discoverScenarios();
  if (args.list) {
    printListTable(scenarios);
    return 0;
  }
  const selected = selectScenarios(scenarios, args);

  const dataRoot = path.resolve(args.dataRoot ?? DEFAULT_DATA_ROOT);
  const skillsDir = path.resolve(args.skillsDir ?? DEFAULT_SKILLS_DIR);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.mkdirSync(dataRoot, { recursive: true });
  const provenance = captureProvenance(args, dataRoot, skillsDir);
  fs.writeFileSync(path.join(RUNS_DIR, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");

  const injectableSkills = listSkillDirs(skillsDir);
  if (injectableSkills.length === 0) {
    console.error(`warning: no skill directories found under ${skillsDir}; skill-dependent scenarios will fail (see --skills-dir)`);
  }

  // DELTA 4: --publish loads the curator lazily (keeps --list/--dry-run usable
  // even if the artifact tree is absent).
  const publishFn = args.publish
    ? (await import(path.join(AGENT_ROOT, "lib", "publish.mjs"))).publishScenario
    : null;

  const rows = [];
  const scenarioSummaries = [];
  let interrupted = false;

  for (const scenario of selected) {
    const entry = { id: scenario.id, dirName: scenario.dirName, reps: [], skipReason: null, errorReason: null };
    scenarioSummaries.push(entry);
    if (scenario.error) {
      entry.errorReason = scenario.error;
      rows.push({ test: scenario.id, rep: "-", outcome: "ERROR", detail: scenario.error });
      continue;
    }
    // DELTA 7: hermetic spec validation shared by --dry-run and live runs —
    // malformed checks must never reach a token-spawning spawn.
    if (scenario.kind === "agent") {
      const specErr = validateSpec(scenario.spec);
      if (specErr) {
        entry.errorReason = `invalid spec: ${specErr}`;
        rows.push({ test: scenario.id, rep: "-", outcome: "ERROR", detail: `invalid spec: ${specErr}` });
        continue;
      }
    }
    if (interrupted) {
      entry.errorReason = "INTERRUPTED: APIError stop-loss in an earlier scenario";
      rows.push({ test: scenario.id, rep: "-", outcome: "INTERRUPTED", detail: entry.errorReason });
      continue;
    }
    if (args.dryRun) {
      const fixtureCount = countFixtureFiles(path.join(scenario.dir, "fixtures"));
      const detail = scenario.kind === "mcp-probe"
        ? `provisioned ok; ${scenario.spec.probe.length} probe call(s) parsed; ${fixtureCount} fixture file(s); ${injectableSkills.length} skill(s) injectable`
        : `provisioned ok; ${scenario.spec.checks.length} check(s) parsed; ${fixtureCount} fixture file(s); ${injectableSkills.length} skill(s) injectable; prompt ${scenario.spec.prompt.length} chars`;
      rows.push({ test: scenario.id, rep: "-", outcome: "DRY", detail });
      continue;
    }
    for (let rep = 1; rep <= args.reps; rep++) {
      if (interrupted) {
        entry.reps.push({ rep, outcome: "INTERRUPTED", runDir: null, detail: "APIError stop-loss" });
        rows.push({ test: scenario.id, rep, outcome: "INTERRUPTED", detail: "APIError stop-loss" });
        continue;
      }
      let runDir;
      let logPath;
      let reused = false;
      let sessionMeta = null;
      const writeResult = (outcome, reason, extra = {}) => {
        const doc = {
          test: scenario.id,
          rep,
          runDir,
          reused,
          outcome,
          reason,
          rubricPending: false,
          rubricFlags: [],
          checks: [],
          gradedAt: new Date().toISOString(),
          ...extra,
        };
        fs.writeFileSync(path.join(runDir, "result.json"), JSON.stringify(doc, null, 2) + "\n");
        return doc;
      };
      const resumeDir = args.force ? null : findResumeDir(scenario, rep);
      if (resumeDir) {
        runDir = resumeDir;
        logPath = path.join(runDir, "log.jsonl");
        reused = true;
      } else {
        const prepared = prepareRunDir(scenario, rep, dataRoot, skillsDir);
        const r = scenario.kind === "mcp-probe"
          ? await runProbeSession(scenario, rep, args, prepared)
          : await runSession(scenario, rep, args, prepared);
        runDir = r.runDir;
        logPath = r.logPath;
        sessionMeta = r;
        if (r.spawnError) {
          writeResult("ERROR", `spawn failed: ${r.spawnError.message}`, { subagents: { note: "spawn failed; no subagent capture attempted" } });
          entry.reps.push({ rep, outcome: "ERROR", runDir, detail: `spawn failed: ${r.spawnError.message}` });
          rows.push({ test: scenario.id, rep, outcome: "ERROR", detail: `spawn failed: ${r.spawnError.message}` });
          continue;
        }
      }
      // DELTA 7: subagent capture for agent kind (best-effort). Fresh runs
      // capture right after the spawn closes (also on timeout — that is
      // exactly when the worker telemetry matters most); resumed runs reuse
      // an existing capture and only re-extract when the dir predates capture
      // support (attribution is directory-keyed, so re-extraction is
      // idempotent). Probe runs never touch the opencode DB.
      let subSummary = null;
      let subParsed = null;
      if (scenario.kind === "agent") {
        if (!fs.existsSync(path.join(runDir, "subagents"))) {
          subSummary = await extractSubagents(runDir);
        } else {
          subSummary = { note: "subagents/ already present (capture reused)", runDir: path.resolve(runDir) };
        }
        subParsed = loadSubagentEvents(runDir);
        if (subSummary.error && !subParsed.available) subParsed.reason = subSummary.error;
      }
      if (sessionMeta?.timedOut) {
        const reason = `timeout after ${args.timeout ?? scenario.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms (SIGTERM -> ${TERM_GRACE_MS} ms -> SIGKILL)`;
        writeResult("ERROR", reason, { subagents: subSummary });
        entry.reps.push({ rep, outcome: "ERROR", runDir, detail: reason });
        rows.push({ test: scenario.id, rep, outcome: "ERROR", detail: "timeout (killed)" });
        continue;
      }
      if (scenario.kind === "mcp-probe") {
        const graded = gradeProbeRun(runDir, scenario, rep);
        writeResult(graded.outcome, graded.reason, {
          rubricPending: false,
          rubricFlags: [],
          checks: graded.results,
        });
        const failDescs = graded.failing.map((f) => describeCheck(f)).join("; ");
        const detailParts = [];
        if (graded.reason) detailParts.push(graded.reason);
        if (failDescs) detailParts.push(failDescs);
        entry.reps.push({ rep, outcome: graded.outcome, runDir, detail: detailParts.join(" | "), reused });
        rows.push({ test: scenario.id, rep, outcome: graded.outcome, detail: truncate(detailParts.join(" | "), 200) });
        if (args.publish && ["PASS", "PASS*", "FAIL"].includes(graded.outcome)) {
          await publishFn({ scenario, runDir, args, provenance, skillsDir, sessionMeta });
          rows.push({ test: scenario.id, rep, outcome: "PUBLISH", detail: `artifacts -> demos/artifacts/${scenario.id}/` });
        }
        continue;
      }
      const parsed = readLogFile(logPath) ?? { events: [], parsedCount: 0, toolCalls: [], texts: [], endsWithStop: false, apiError: null, costTotal: null };
      // Stop-loss only when the session never reached a terminal stop: a
      // transient APIError that opencode retried (session completed) grades
      // normally instead of halting the whole run.
      if (parsed.apiError && !parsed.endsWithStop) {
        const detail = `APIError stop-loss: ${JSON.stringify(parsed.apiError).slice(0, 200)}`;
        writeResult("INTERRUPTED", detail, { subagents: subSummary });
        entry.reps.push({ rep, outcome: "INTERRUPTED", runDir, detail });
        rows.push({ test: scenario.id, rep, outcome: "INTERRUPTED", detail });
        interrupted = true;
        continue;
      }
      const graded = gradeRep(parsed, scenario, subParsed);
      writeResult(graded.outcome, graded.reason, {
        rubricPending: graded.rubrics.length > 0,
        rubricFlags: graded.rubrics.map((r2) => r2.flag),
        checks: graded.results,
        subagents: subSummary,
      });
      const failDescs = graded.failing.map((f) => describeCheck(f)).join("; ");
      const detailParts = [];
      if (graded.reason) detailParts.push(graded.reason);
      if (failDescs) detailParts.push(failDescs);
      entry.reps.push({ rep, outcome: graded.outcome, runDir, detail: detailParts.join(" | "), reused });
      rows.push({ test: scenario.id, rep, outcome: graded.outcome, detail: truncate(detailParts.join(" | "), 200) });
      if (args.publish && ["PASS", "PASS*", "FAIL"].includes(graded.outcome)) {
        await publishFn({ scenario, runDir, args, provenance, skillsDir, sessionMeta, parsed });
        rows.push({ test: scenario.id, rep, outcome: "PUBLISH", detail: `artifacts -> demos/artifacts/${scenario.id}/` });
      }
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    args: { ...args, dataRoot, skillsDir },
    provenanceFile: path.join(RUNS_DIR, "provenance.json"),
    exitCode: exitCodeFor(rows),
    scenarios: scenarioSummaries,
  };
  fs.writeFileSync(path.join(RUNS_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  printReportTable(rows);
  const counts = {};
  for (const r of rows) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  console.log(`\noutcomes: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ") || "none"}`);
  console.log(`summary: ${path.join(RUNS_DIR, "summary.json")}`);
  console.log(`provenance: ${path.join(RUNS_DIR, "provenance.json")}`);
  return exitCodeFor(rows);
}

process.exitCode = await (async () => {
  try {
    return await main();
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`error: ${e.message}\n\n${usage()}`);
      return 2;
    }
    console.error(`harness error: ${e?.stack ?? e}`);
    return 2;
  }
})();

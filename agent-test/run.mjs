#!/usr/bin/env node
/*
 * agent-test/run.mjs — runner + objective grader for the bioresearcher-skills
 * empirical agent-test suite. Faithful port of
 * biomcp-ts/agent-test/run.mjs (runner + 12-check grader), adapted to test
 * the real bioresearcher skills (injected per run) plus optional keyless
 * biomcp MCP wiring.
 *
 * Single-file plain ESM JavaScript. node:stdlib only (fs, path, crypto,
 * child_process, process); zero npm dependencies.
 *
 * Pipeline per (test, rep):
 *   1. Discover per-test dirs with a test.json (--only/--filter select, --list prints index).
 *   2. Provision externalData pins (bytes-then-streaming-sha256). Missing data +
 *      resources.download.sh -> run script (max 2 attempts), else SKIP.
 *   3. Prepare .runs/<TEST>/<YYYYMMDD-HHMMSS>-r<rep>/: inject skills, seed
 *      <runDir>/data from the case fixtures/, copy the test's opencode.json
 *      into the run dir BEFORE spawn (generic {env:VAR} substitution), export
 *      AGENT_TEST_DATA, spawn `opencode run --dir <run-dir> --auto <prompt>
 *      --format json`; stdout+stderr appended to log.jsonl.
 *      Timeout: SIGTERM -> 3 s -> SIGKILL -> harness ERROR.
 *      DELTA 8 during the spawn: a read-only poller of opencode's host
 *      session DB surfaces worker-subagent progress live (sidecar
 *      progress.jsonl + console lines + stall warnings) — log.jsonl itself is
 *      never touched.
 *   4. Parse NDJSON (skip unparseable lines): tool_use events (ignore pending),
 *      assistant text events, terminal step_finish(reason=="stop"), APIError
 *      events -> global stop-loss (remaining tests INTERRUPTED, exit 2).
 *      DELTA 8 after the spawn closes: worker-subagent sessions (invisible in
 *      log.jsonl) are extracted read-only from the same host DB into
 *      <runDir>/subagents/<sid>.jsonl + timeline.jsonl + subagents.json.
 *   5. Grade checks (13 types, incl. subagent_count; any check may set
 *      scope: parent|subagents|all to address the captured subagent streams)
 *      -> result.json per rep.
 *   6. Report: .runs/summary.json + stdout table; .runs/provenance.json once
 *      per invocation.
 *
 * Resume: a rep is reused (no spawn, re-graded from the existing log) when a
 * prior dir for that rep index has a log ending in a terminal step_finish(stop)
 * AND a result.json, unless --force.
 *
 * Exit codes: 0 = all selected tests PASS (or SKIP-only / PASS*); 1 = >=1 FAIL;
 * 2 = harness ERROR / INTERRUPTED (takes precedence over 1).
 *
 * DELIBERATE DELTAS vs the source harness (each also marked "// DELTA:" inline):
 *   1. SKILL INJECTION: before spawn, every directory under the skills root
 *      (default ../skills, override --skills-dir) is copied into
 *      <runDir>/.opencode/skills/ so opencode's project-level discovery finds
 *      the real skill files; sha256 of each SKILL.md goes into provenance.json.
 *   2. ALL biomcp-bundle logic stripped: no {env:AGENT_TEST_BUNDLE}
 *      substitution, no dist/bundle.js dangling-file warning, no
 *      AGENT_TEST_BUNDLE env export, no distBundle* provenance fields.
 *   3. Provenance host-tool probe is python3/uv/pandoc (was
 *      samtools/bcftools/bedtools/pysam); globalConfigSha256 kept (hashes
 *      ~/.config/opencode/opencode.jsonc, falling back to opencode.json).
 *   4. Data-root mechanism generalized: --data-root default = <agent-test>/data
 *      (created if needed), still overridable via $AGENT_TEST_DATA, exported as
 *      AGENT_TEST_DATA for {env:AGENT_TEST_DATA} substitution in opencode.json.
 *   5. NEW --skills-dir flag (default ../skills relative to agent-test/).
 *   6. {DATA_DIR} in prompts resolves to the per-rep <runDir>/data directory,
 *      seeded from the case's fixtures/ tree at provisioning (the source
 *      resolved {DATA_DIR} to the shared data root instead).
 *   7. --dry-run = discovery + schema validation + provisioning simulation
 *      only; it never spawns opencode and does not require it installed (the
 *      source also never spawned on --dry-run; this port additionally reports
 *      injectable-skill and fixture counts and skips nothing else).
 *   8. SUBAGENT CAPTURE: `opencode run` streams ONLY the top-level session's
 *      events, so Tier A/B worker subagents (every dispatched article_search,
 *      ledger append, worker write) are absent from log.jsonl — long
 *      delegations are minutes of silence. opencode persists all sessions
 *      (parent-linked, full parts) in its host SQLite DB, so the runner reads
 *      it READ-ONLY (node:sqlite, WAL-safe): a live progress poller during the
 *      spawn, a post-run extractor into <runDir>/subagents/ + timeline.jsonl +
 *      subagents.json, `scope: parent|subagents|all` on checks, and a
 *      subagent_count check. Best-effort by design: any DB failure degrades to
 *      a note in result.json and never changes the run outcome; --list and
 *      --dry-run never touch the DB (lazy import keeps node:sqlite — and its
 *      ExperimentalWarning — out of hermetic CI). --extract-subagents <DIR>
 *      re-captures any finished run dir postmortem.
 *
 * Spec-ambiguity resolutions inherited from the source are marked AMBIGUITY:
 * in comments where a normative choice was required.
 */
import { createReadStream } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const AGENT_ROOT = path.dirname(path.resolve(process.argv[1]));
const REPO_ROOT = path.dirname(AGENT_ROOT);
const RUNS_DIR = path.join(AGENT_ROOT, ".runs");
// DELTA 4: default data root is <agent-test>/data (source used
// agent-test/.runs/data); still overridable via --data-root / $AGENT_TEST_DATA.
const DEFAULT_DATA_ROOT = path.join(AGENT_ROOT, "data");
// DELTA 5: skills root used by the injection step; override with --skills-dir.
const DEFAULT_SKILLS_DIR = path.resolve(AGENT_ROOT, "..", "skills");
const DEFAULT_TIMEOUT_MS = 300000;
const TERM_GRACE_MS = 3000;
const PROVISION_SCRIPT_TIMEOUT_MS = 15 * 60 * 1000;
// DELTA 8: subagent-capture knobs (live poller of opencode's host session DB).
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
    skillsDir: null, // DELTA 5
    model: null,
    timeout: null,
    dryRun: false,
    list: false,
    help: false,
    extractSubagents: null, // DELTA 8
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
      case "--skills-dir": a.skillsDir = need(t, argv[++i]); break; // DELTA 5
      case "--model": a.model = need(t, argv[++i]); break;
      case "--timeout": a.timeout = Number(need(t, argv[++i])); break;
      case "--dry-run": a.dryRun = true; break;
      case "--list": a.list = true; break;
      case "--extract-subagents": a.extractSubagents = need(t, argv[++i]); break; // DELTA 8
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
    "usage: node agent-test/run.mjs [options]",
    "  --only <id>         run a single test (dir name or test.json id)",
    "  --filter <glob>     run tests whose id matches glob (* and ?)",
    "  --reps <N>          repetitions per test (default 1)",
    "  --force             re-run even if a complete prior rep exists",
    "  --data-root <DIR>   externalData root (default $AGENT_TEST_DATA or agent-test/data)",
    "  --skills-dir <DIR>  skills injected into each run dir (default ../skills)",
    "  --model <ID>        passed to `opencode run --model` (optional)",
    "  --timeout <ms>      per-rep timeout override (default: test timeoutMs else 300000)",
    "  --dry-run           discovery + schema validation + provisioning simulation, never spawn",
    "  --extract-subagents <DIR>  postmortem: (re)capture subagent streams for a finished",
    "                      run dir (read-only DB read; prints subagents.json summary), then exit",
    "  --list              print the test index table and exit",
    "exit codes: 0 all PASS/PASS*/SKIP-only; 1 any FAIL; 2 harness ERROR/INTERRUPTED",
  ].join("\n");
}

function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${esc}$`);
}

/* ============================================================ SECTION: discovery */

function loadTestEntry(name) {
  const dir = path.join(AGENT_ROOT, name);
  const tj = path.join(dir, "test.json");
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return null;
  if (!fs.existsSync(tj)) return null;
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(tj, "utf8"));
  } catch (e) {
    return { id: name, dirName: name, dir, error: `unparseable test.json: ${e.message}` };
  }
  const id = typeof spec.id === "string" && spec.id ? spec.id : name;
  if (typeof spec.prompt !== "string" || !spec.prompt) {
    return { id, dirName: name, dir, error: "test.json missing string field: prompt" };
  }
  if (!Array.isArray(spec.checks)) {
    return { id, dirName: name, dir, error: "test.json missing array field: checks" };
  }
  const timeoutMs = spec.timeoutMs ?? spec.timeout ?? null;
  return {
    id,
    dirName: name,
    dir,
    spec,
    level: spec.level ?? null,
    purpose: spec.purpose ?? "",
    externalData: Array.isArray(spec.externalData) ? spec.externalData : [],
    hasDownloadScript: fs.existsSync(path.join(dir, "resources.download.sh")),
    timeoutMs: typeof timeoutMs === "number" ? timeoutMs : null,
  };
}

function discoverTests() {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(AGENT_ROOT, { withFileTypes: true });
  } catch (e) {
    throw new HarnessError(`cannot read agent-test root ${AGENT_ROOT}: ${e.message}`);
  }
  for (const de of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const t = loadTestEntry(de.name);
    if (t) out.push(t);
  }
  return out;
}

function selectTests(tests, args) {
  let sel = tests;
  if (args.only) {
    sel = tests.filter((t) => t.id === args.only || t.dirName === args.only);
    if (sel.length === 0) throw new HarnessError(`no test matches --only ${args.only}`);
  } else if (args.filter) {
    const re = globToRegExp(args.filter);
    sel = tests.filter((t) => re.test(t.id) || re.test(t.dirName));
    if (sel.length === 0) throw new HarnessError(`no test matches --filter ${args.filter}`);
  }
  return sel;
}

function printListTable(tests) {
  const cols = [
    ["ID", 34], ["LEVEL", 5], ["PURPOSE", 46], ["EXT", 3], ["DL", 2], ["TIMEOUT", 8],
  ];
  const head = cols.map(([h, w]) => h.padEnd(w)).join("  ");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const t of tests) {
    const purpose = t.error ? `ERROR: ${t.error}` : String(t.purpose ?? "");
    const row = [
      (t.id ?? "").slice(0, 34).padEnd(34),
      String(t.level ?? "-").slice(0, 5).padEnd(5),
      purpose.slice(0, 46).padEnd(46),
      String(t.externalData?.length ?? 0).padEnd(3),
      (t.hasDownloadScript ? "y" : "n").padEnd(2),
      String(t.timeoutMs ?? DEFAULT_TIMEOUT_MS).padEnd(8),
    ].join("  ");
    console.log(row);
  }
}

/* =========================================================== SECTION: provisioning */

async function sha256File(file) {
  return await new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const rs = createReadStream(file);
    rs.on("data", (c) => h.update(c));
    rs.on("error", reject);
    rs.on("end", () => resolve(h.digest("hex")));
  });
}

function statFile(file) {
  const st = fs.statSync(file, { throwIfNoEntry: false });
  return st ?? null;
}

async function verifyEntry(dataRoot, entry) {
  if (typeof entry?.path !== "string" || !entry.path) return { ok: false, reason: "entry missing path" };
  if (typeof entry.sha256 !== "string" || entry.sha256.length !== 64) return { ok: false, reason: `entry ${entry.path}: sha256 must be a 64-hex pin` };
  if (!Number.isInteger(entry.bytes) || entry.bytes < 0) return { ok: false, reason: `entry ${entry.path}: bytes must be a non-negative integer` };
  const file = path.resolve(dataRoot, entry.path);
  const st = statFile(file);
  if (!st || !st.isFile()) return { ok: false, reason: "missing", file };
  if (st.size !== entry.bytes) return { ok: false, reason: `size mismatch (expected ${entry.bytes}, got ${st.size})`, file };
  const hex = await sha256File(file);
  if (hex.toLowerCase() !== entry.sha256.toLowerCase()) return { ok: false, reason: `sha256 mismatch (expected ${entry.sha256}, got ${hex})`, file };
  return { ok: true, file };
}

/* Hermetic child env: host shells often run inside a conda/mamba env. uv
 * resolves interpreters as --python > VIRTUAL_ENV > CONDA_PREFIX > ./.venv,
 * so an inherited CONDA_PREFIX (or a conda bin dir on PATH) makes agent-run
 * `./uv pip install` / `./uv run` mutate the HOST env instead of the run dir.
 * The opencode bash tool spawns `bash -l -c`; the ~/.bashrc mamba hook only
 * defines functions (no re-activation once these vars are unset), but conda
 * bin dirs must ALSO be filtered from PATH or `python3` keeps resolving to
 * the host env. Mirror/PyPI index vars (UV_INDEX_URL, PIP_INDEX_URL) and
 * NO_PROXY are deliberately preserved. */
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

function runScriptToLog(script, dataRoot, logPath) {
  return new Promise((resolve) => {
    const fd = fs.openSync(logPath, "a");
    fs.writeSync(fd, `\n[${new Date().toISOString()}] running: bash ${script} ${dataRoot}\n`);
    const child = spawn("bash", [script, dataRoot], { cwd: path.dirname(script), env: sanitizeChildEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let done = false;
    const finish = (code, signal, timedOut) => {
      if (done) return;
      done = true;
      clearTimeout(killTimer);
      clearTimeout(timer);
      fs.writeSync(fd, `\n[${new Date().toISOString()}] script exit: code=${code} signal=${signal ?? "-"}${timedOut ? " (timed out)" : ""}\n`);
      fs.closeSync(fd);
      resolve({ code, signal, timedOut });
    };
    child.stdout.on("data", (c) => fs.writeSync(fd, c));
    child.stderr.on("data", (c) => fs.writeSync(fd, c));
    child.on("error", (e) => {
      fs.writeSync(fd, `spawn error: ${e.message}\n`);
      finish(-1, null, false);
    });
    child.on("close", (code, signal) => finish(code, signal, false));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), TERM_GRACE_MS);
    }, PROVISION_SCRIPT_TIMEOUT_MS);
    let killTimer;
  });
}

async function provisionTest(test, dataRoot) {
  if (!test.externalData.length) return { status: "ok", notes: [] };
  const testRunsDir = path.join(RUNS_DIR, test.dirName);
  fs.mkdirSync(testRunsDir, { recursive: true });
  const logPath = path.join(testRunsDir, "provision.log");
  const logNote = (msg) => { try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`); } catch {} };
  const notes = [];
  const note = (msg) => { notes.push(msg); logNote(msg); };
  for (const entry of test.externalData) {
    let v = await verifyEntry(dataRoot, entry);
    if (v.ok) continue;
    if (v.reason !== "missing") note(`${entry.path}: ${v.reason}`);
    const script = path.join(test.dir, "resources.download.sh");
    if (!test.hasDownloadScript) {
      /* AMBIGUITY (inherited): file present but hash-mismatched with no download
       * script -> SKIP (never FAIL); treat like the missing+no-script path. */
      return { status: "skip", reason: `externalData "${entry.path}" ${v.reason} and no resources.download.sh`, notes };
    }
    for (let attempt = 1; attempt <= 2; attempt++) {
      note(`${entry.path}: ${v.reason}; running resources.download.sh (attempt ${attempt})`);
      const r = await runScriptToLog(script, dataRoot, logPath);
      if (r.timedOut) return { status: "error", reason: `resources.download.sh timed out for ${entry.path}`, notes };
      v = await verifyEntry(dataRoot, entry);
      if (v.ok) break;
    }
    if (!v.ok) return { status: "error", reason: `externalData "${entry.path}" failed verification after 2 download attempts: ${v.reason}`, notes };
  }
  return { status: "ok", notes };
}

/* ============================================================ SECTION: skills + fixtures */

// DELTA 1: list injectable skill directories (one level under the skills root).
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

/* ============================================ SECTION: subagent capture (DELTA 8) */
/*
 * `opencode run --format json` emits only the top-level session's events, so
 * dispatched worker subagents are invisible: their tool calls never reach
 * log.jsonl and long delegations are minutes of log silence. opencode itself
 * persists EVERY session in its host SQLite DB (session.parent_id links
 * workers to the parent; part rows carry full tool inputs/outputs, text,
 * reasoning and per-step tokens; session.directory holds the run dir), so the
 * runner recovers subagent behavior from there — strictly read-only (WAL-safe
 * next to live opencode processes), best-effort (failures become notes, never
 * run-outcome changes), and never on --list/--dry-run (node:sqlite is lazily
 * imported so hermetic CI never loads it).
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
 * created under agent-test/.runs — never for arbitrary host directories. */
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
    summary.error = "run dir is not under agent-test/.runs — refusing to read the host opencode DB";
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
  for (const f of files) {
    let text = "";
    try {
      text = fs.readFileSync(path.join(dir, f), "utf8");
    } catch {
      continue;
    }
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
        out.sessions.push({ id: ev.sessionID, parentID: ev.parentID, title: ev.title, agent: ev.agent, timeCreated: ev.timeCreated, timeUpdated: ev.timeUpdated });
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
        out.texts.push(ev.part.text);
      }
    }
  }
  out.sessions.sort((a, b) => (a.timeCreated ?? 0) - (b.timeCreated ?? 0));
  out.toolCalls.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
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
function startSubagentProgressPoller(test, runDir) {
  const state = {
    db: null,
    disabled: false,
    watermark: 0,
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
    record(`poller disabled: ${reason}`);
    console.error(`[${test.id}] subagent progress poller disabled: ${reason}`);
  };
  const tick = async () => {
    if (state.disabled) return;
    try {
      if (!state.db) {
        const open = await openOpencodeDb();
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
            const label = shortSessionLabel(s.title, s.agent);
            record(`subagent session started: ${label}`, { sid: s.id });
            console.log(`[${test.id}] ${clock()} sub[${label}] session started`);
          }
        }
      }
      if (!ids.length) return;
      const ph = ids.map(() => "?").join(",");
      const rows = db.prepare(`SELECT session_id, time_created, data FROM part WHERE session_id IN (${ph}) AND time_created > ? ORDER BY time_created`).all(...ids, state.watermark);
      const grouped = new Map();
      for (const r of rows) {
        let p;
        try {
          p = JSON.parse(r.data);
        } catch {
          continue;
        }
        if (r.time_created > state.watermark) state.watermark = r.time_created;
        state.lastActivityAt = Date.now();
        const meta = state.known.get(r.session_id);
        if (!meta?.parent_id) continue; // parent stream already lands in log.jsonl
        const label = shortSessionLabel(meta.title, meta.agent);
        const kind = p.type === "tool" ? `tool ${p.tool} ${p.state?.status ?? ""}`.trim() : String(p.type ?? "?");
        state.lastDesc = `sub[${label}] ${kind} @${clock()}`;
        const g = grouped.get(r.session_id) ?? { label, items: [] };
        g.items.push({ ts: r.time_created, kind });
        grouped.set(r.session_id, g);
      }
      for (const [, g] of grouped) {
        record(`subagent activity`, { label: g.label, events: g.items });
        if (g.items.length <= 6) {
          for (const it of g.items) console.log(`[${test.id}] ${clock()} sub[${g.label}] ${it.kind}`);
        } else {
          console.log(`[${test.id}] ${clock()} sub[${g.label}] +${g.items.length} events (catch-up)`);
        }
      }
      const quiet = Date.now() - state.lastActivityAt;
      if (quiet > SUBAGENT_STALL_WARN_MS && Date.now() - state.lastStallWarnAt > SUBAGENT_STALL_REWARN_MS) {
        state.lastStallWarnAt = Date.now();
        console.error(`[${test.id}] STALL: no parent or subagent activity for ${Math.round(quiet / 1000)}s — last: ${state.lastDesc} (opencode may be hung or retrying; inspect progress.jsonl, timeline, network)`);
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

function findResumeDir(test, rep) {
  const testRunsDir = path.join(RUNS_DIR, test.dirName);
  let dirs = [];
  try {
    dirs = fs.readdirSync(testRunsDir).sort().reverse();
  } catch {
    return null;
  }
  const complete = [];
  for (const name of dirs) {
    const m = name.match(/^(\d{8}-\d{6})(?:-\d+)?-r(\d+)$/);
    if (!m || Number(m[2]) !== rep) continue;
    const dir = path.join(testRunsDir, name);
    const log = path.join(dir, "log.jsonl");
    const result = path.join(dir, "result.json");
    if (!fs.existsSync(log) || !fs.existsSync(result)) continue;
    const parsed = readLogFile(log);
    if (parsed && parsed.endsWithStop) complete.push(dir);
  }
  return complete[0] ?? null;
}

function dropIncompleteRepDirs(test, rep) {
  const testRunsDir = path.join(RUNS_DIR, test.dirName);
  let dirs = [];
  try {
    dirs = fs.readdirSync(testRunsDir);
  } catch {
    return;
  }
  for (const name of dirs) {
    const m = name.match(/^(\d{8}-\d{6})(?:-\d+)?-r(\d+)$/);
    if (!m || Number(m[2]) !== rep) continue;
    const dir = path.join(testRunsDir, name);
    const log = path.join(dir, "log.jsonl");
    const result = path.join(dir, "result.json");
    const logOk = (() => {
      const p = readLogFile(log);
      return !!(p && p.endsWithStop);
    })();
    if (!(logOk && fs.existsSync(result))) fs.rmSync(dir, { recursive: true, force: true });
  }
}

// DELTA 2: generic {env:VAR} substitution for opencode.json values. The source
// substituted only {env:AGENT_TEST_BUNDLE}/{env:AGENT_TEST_DATA}; this port
// resolves any {env:NAME} against the session env (process.env plus
// AGENT_TEST_DATA). Unknown variables are left as literal placeholders.
function substituteEnvPlaceholders(text, env) {
  return String(text).replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(env, name) && env[name] !== undefined ? String(env[name]) : m);
}

function runSession(test, rep, args, dataRoot, skillsDir) {
  return new Promise((resolve) => {
    const testRunsDir = path.join(RUNS_DIR, test.dirName);
    fs.mkdirSync(testRunsDir, { recursive: true });
    dropIncompleteRepDirs(test, rep);
    const ts = timestampDirName();
    let runDir = path.join(testRunsDir, `${ts}-r${rep}`);
    for (let k = 2; fs.existsSync(runDir); k++) runDir = path.join(testRunsDir, `${ts}-${k}-r${rep}`);
    fs.mkdirSync(runDir, { recursive: true });

    // DELTA 1: SKILL INJECTION — copy every directory from the skills root
    // into <runDir>/.opencode/skills/ so opencode's project-level skill
    // discovery finds the real skill files (fs.cp recursive). Provenance
    // (SKILL.md sha256) is captured once per invocation in provenance.json.
    const injectRoot = path.join(runDir, ".opencode", "skills");
    fs.mkdirSync(injectRoot, { recursive: true });
    for (const skillName of listSkillDirs(skillsDir)) {
      fs.cpSync(path.join(skillsDir, skillName), path.join(injectRoot, skillName), { recursive: true });
    }

    // DELTA 6: {DATA_DIR} resolves to the per-rep <runDir>/data directory,
    // seeded from the case's fixtures/ tree (the source pointed {DATA_DIR} at
    // the shared data root). Always created so {DATA_DIR} is always valid.
    const runDataDir = path.join(runDir, "data");
    fs.mkdirSync(runDataDir, { recursive: true });
    const fixturesDir = path.join(test.dir, "fixtures");
    if (statFile(fixturesDir)?.isDirectory()) {
      fs.cpSync(fixturesDir, runDataDir, { recursive: true });
    }

    const sessionEnv = {
      ...sanitizeChildEnv(),
      // DELTA 4: AGENT_TEST_DATA = resolved data root, exported for
      // {env:AGENT_TEST_DATA} substitution (DELTA 2 removed AGENT_TEST_BUNDLE).
      AGENT_TEST_DATA: path.resolve(dataRoot),
      // DELTA: never write __pycache__ into skills/ during provisioning —
      // the strict layout lint walks the filesystem and would see it.
      PYTHONDONTWRITEBYTECODE: "1",
    };
    const cfgSrc = path.join(test.dir, "opencode.json");
    if (fs.existsSync(cfgSrc)) {
      // Copy with generic {env:VAR} substitution (belt-and-braces fallback: the
      // committed file keeps {env:...} placeholders, the run-dir copy works
      // even if an opencode upgrade drops native command/env substitution).
      const cfgText = substituteEnvPlaceholders(fs.readFileSync(cfgSrc, "utf8"), sessionEnv);
      fs.writeFileSync(path.join(runDir, "opencode.json"), cfgText);
    }

    // DELTA 6: {DATA_DIR} -> <runDir>/data (see above).
    const prompt = test.spec.prompt.split("{DATA_DIR}").join(runDataDir);
    fs.writeFileSync(path.join(runDir, "prompt.txt"), prompt + "\n");

    const logPath = path.join(runDir, "log.jsonl");
    const fd = fs.openSync(logPath, "a");
    const timeoutMs = args.timeout ?? test.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const argv = ["run", "--dir", runDir, "--auto", prompt, "--format", "json"];
    if (args.model) argv.push("--model", args.model);
    const child = spawn("opencode", argv, { cwd: runDir, env: sessionEnv, stdio: ["ignore", "pipe", "pipe"] });

    // DELTA 8: live subagent-progress poller (sidecar progress.jsonl + console
    // lines + stall warnings). Best-effort; never touches log.jsonl.
    const poller = startSubagentProgressPoller(test, runDir);

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
      resolve({ runDir, logPath, timedOut, spawnError: spawnError ?? null });
    };
    child.stdout.on("data", (c) => { try { fs.writeSync(fd, c); } catch {} poller.noteActivity(); });
    child.stderr.on("data", (c) => { try { fs.writeSync(fd, c); } catch {} poller.noteActivity(); });
    child.on("error", (e) => finish(e));
    child.on("close", () => finish(null));
  });
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
        /* DELTA 8: event timestamp (ms epoch) — lets scope:"all" interleave
         * parent and captured subagent tool calls in true execution order. */
        ts: ev.timestamp ?? null,
      });
    } else if (ev.type === "text" && typeof ev.part?.text === "string") {
      /* AMBIGUITY (inherited): real `opencode run --format json` logs emit
       * assistant text as top-level type "text" with part.text; no role field.
       * "message"-typed part.text events are accepted as well for forward
       * compatibility. */
      if (ev.part.text) texts.push(ev.part.text);
    } else if (ev.type === "message" && typeof ev.part?.text === "string") {
      if (ev.part.text) texts.push(ev.part.text);
    } else if (ev.type === "step_finish") {
      if (ev.part?.reason === "stop") lastWasTerminalStop = true;
    } else if (isApiErrorEvent(ev)) {
      lastApiError = ev.error ?? ev.part?.error ?? ev.data ?? null;
    }
  }
  endsWithStop = lastWasTerminalStop && events.length > 0;
  return { events, parsedCount, toolCalls, texts, endsWithStop, apiError: lastApiError };
}

/* ================================================================= SECTION: grader */

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
    /* Case-insensitive by default: context regexes gate number matching inside
     * sentence-like fragments, and LLM capitalization at fragment start
     * ("Variants in slice: 269" vs "269 variants") must not decide the grade. */
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
    /* DELTA 8: optional check scope. "parent" (default) keeps the legacy
     * semantics exactly (log.jsonl only); "subagents" addresses the captured
     * worker streams; "all" merges both (tool calls interleaved by event
     * timestamp). A non-parent scope without a capture FAILS loudly rather
     * than silently passing against empty streams. */
    const scope = check.scope ?? "parent";
    if (scope !== "parent" && scope !== "subagents" && scope !== "all") {
      return result(check, "error", `invalid scope ${JSON.stringify(check.scope)} (parent|subagents|all)`);
    }
    if (scope === "parent") return fn(check, parsed, subParsed);
    if (!subParsed?.available) {
      return result(check, "fail", `scope "${scope}" requires subagent capture, none available (${subParsed?.reason ?? "subagents/ absent"}); run live or use --extract-subagents`);
    }
    const eff = scope === "subagents"
      ? { events: subParsed.events, parsedCount: subParsed.events.length, toolCalls: subParsed.toolCalls, texts: subParsed.texts, endsWithStop: true, apiError: null }
      : {
          events: [...parsed.events, ...subParsed.events],
          parsedCount: parsed.parsedCount + subParsed.events.length,
          toolCalls: [...parsed.toolCalls, ...subParsed.toolCalls].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)),
          texts: [...parsed.texts, ...subParsed.texts],
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
  /* Kept from the source: tool_seq matches over the biomcp_-prefixed tool
   * stream only (skills / host tools are graded with other check types). */
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

function checkGroup(check, parsed) {
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
    /* AMBIGUITY (inherited): spec defines ERROR-arm handling only for anyOf;
     * for allOf an ERROR arm with no failing arm propagates ERROR. */
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
  /* AMBIGUITY (inherited): text_number_count has no explicit source in the
   * spec; the shared source field defaults to "final". */
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
  return result(check, cmp ? "pass" : "fail",
    /* AMBIGUITY (inherited): natural A-op-B ordering (value(occA) OP value(occB)). */
    `${r.full} "${check.path}": occA(${check.occA})=${va} ${sym} occB(${check.occB})=${vb} -> ${cmp}`);
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
    /* AMBIGUITY (inherited): tool omitted -> count ALL non-pending tool calls
     * (MCP and non-MCP alike). */
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
  const sessions = subParsed?.available ? subParsed.sessions : [];
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
 * is a DELTA 8 addition. */
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

function gradeRep(parsed, test, subParsed) {
  const results = test.spec.checks.map((c) => evalCheck(c, parsed, subParsed));
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

/* DELTA 8: hermetic spec validation (check types, scope values,
 * subagent_count bounds; group arms validated recursively). Used by --dry-run
 * and re-checked before a live spawn so malformed specs never spend tokens. */
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
    skillsDir: path.resolve(skillsDir), // DELTA 1
    skills: {},                         // DELTA 1: sha256 per injectable SKILL.md
    timestamp: new Date().toISOString(),
    globalConfigSha256: null,
    hostTools: {},                      // DELTA 3: host-tool probe (renamed from hostBioTools)
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
  // DELTA 3: global-config hash kept; probe opencode.jsonc first, then
  // opencode.json (the source only hashed opencode.jsonc).
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
  // DELTA 3: python3/uv/pandoc probe (source probed samtools/bcftools/bedtools/pysam).
  for (const t of ["python3", "uv", "pandoc"]) prov.hostTools[t] = whichPath(t);
  // DELTA 1: record sha256 of every skill's SKILL.md that the injection step
  // would copy (run-dir content is exactly these bytes).
  for (const skillName of listSkillDirs(skillsDir)) {
    const skmd = path.join(skillsDir, skillName, "SKILL.md");
    if (fs.existsSync(skmd)) {
      try {
        prov.skills[skillName] = crypto.createHash("sha256").update(fs.readFileSync(skmd)).digest("hex");
      } catch {}
    }
  }
  // DELTA 2: dist/bundle.js provenance fields removed along with all
  // AGENT_TEST_BUNDLE logic.
  return prov;
}

function truncate(s, n) {
  s = String(s ?? "");
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function printReportTable(rows) {
  const cols = [["TEST", 30], ["REP", 3], ["OUTCOME", 11], ["DETAIL", 80]];
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
  // DELTA 8: postmortem mode — (re)capture subagent streams for one finished
  // run dir, print the summary, exit. Never spawns opencode, never discovers
  // tests, and refuses directories outside agent-test/.runs.
  if (args.extractSubagents) {
    const summary = await extractSubagents(args.extractSubagents);
    console.log(JSON.stringify(summary, null, 2));
    return summary.error ? 2 : 0;
  }
  const tests = discoverTests();
  if (args.list) {
    printListTable(tests);
    return 0;
  }
  const selected = selectTests(tests, args);

  // DELTA 4: data-root default = <agent-test>/data (created if needed).
  const dataRoot = path.resolve(args.dataRoot ?? process.env.AGENT_TEST_DATA ?? DEFAULT_DATA_ROOT);
  // DELTA 5: skills root (default ../skills relative to agent-test/).
  const skillsDir = path.resolve(args.skillsDir ?? DEFAULT_SKILLS_DIR);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.mkdirSync(dataRoot, { recursive: true });
  const provenance = captureProvenance(args, dataRoot, skillsDir);
  fs.writeFileSync(path.join(RUNS_DIR, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");

  const injectableSkills = listSkillDirs(skillsDir);
  if (injectableSkills.length === 0) {
    // DELTA 1: warn loudly — every skill case would otherwise fail discovery.
    console.error(`warning: no skill directories found under ${skillsDir}; skill-dependent cases will fail (see --skills-dir)`);
  }

  const rows = [];
  const testSummaries = [];
  let interrupted = false;

  for (const test of selected) {
    const entry = { id: test.id, dirName: test.dirName, reps: [], skipReason: null, errorReason: null };
    testSummaries.push(entry);
    if (test.error) {
      entry.errorReason = test.error;
      rows.push({ test: test.id, rep: "-", outcome: "ERROR", detail: test.error });
      continue;
    }
    if (interrupted) {
      entry.errorReason = "INTERRUPTED: APIError stop-loss in an earlier test";
      rows.push({ test: test.id, rep: "-", outcome: "INTERRUPTED", detail: entry.errorReason });
      continue;
    }
    const prov = await provisionTest(test, dataRoot);
    if (prov.status === "skip") {
      entry.skipReason = prov.reason;
      rows.push({ test: test.id, rep: "-", outcome: "SKIP", detail: prov.reason });
      continue;
    }
    if (prov.status === "error") {
      entry.errorReason = prov.reason;
      rows.push({ test: test.id, rep: "-", outcome: "ERROR", detail: prov.reason });
      continue;
    }
    // DELTA 8: hermetic spec validation shared by --dry-run and live runs —
    // malformed checks must never reach a token-spawning spawn.
    const specErr = validateSpec(test.spec);
    if (specErr) {
      entry.errorReason = `invalid spec: ${specErr}`;
      rows.push({ test: test.id, rep: "-", outcome: "ERROR", detail: `invalid spec: ${specErr}` });
      continue;
    }
    if (args.dryRun) {
      // DELTA 7: dry-run = discovery + schema validation + provisioning
      // simulation only — never spawns opencode (and does not require it
      // installed); additionally reports fixture + injectable-skill counts.
      const fixtureCount = countFixtureFiles(path.join(test.dir, "fixtures"));
      rows.push({
        test: test.id,
        rep: "-",
        outcome: "DRY",
        detail: `provisioned ok; ${test.spec.checks.length} check(s) parsed; ${fixtureCount} fixture file(s); ${injectableSkills.length} skill(s) injectable; prompt ${test.spec.prompt.length} chars`,
      });
      continue;
    }
    for (let rep = 1; rep <= args.reps; rep++) {
      if (interrupted) {
        entry.reps.push({ rep, outcome: "INTERRUPTED", runDir: null, detail: "APIError stop-loss" });
        rows.push({ test: test.id, rep, outcome: "INTERRUPTED", detail: "APIError stop-loss" });
        continue;
      }
      let runDir;
      let logPath;
      let reused = false;
      let timedOut = false;
      const writeResult = (outcome, reason, extra = {}) => {
        const doc = {
          test: test.id,
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
      };
      const resumeDir = args.force ? null : findResumeDir(test, rep);
      if (resumeDir) {
        runDir = resumeDir;
        logPath = path.join(runDir, "log.jsonl");
        reused = true;
      } else {
        const r = await runSession(test, rep, args, dataRoot, skillsDir);
        runDir = r.runDir;
        logPath = r.logPath;
        timedOut = r.timedOut;
        if (r.spawnError) {
          writeResult("ERROR", `spawn failed: ${r.spawnError.message}`, { subagents: { note: "spawn failed; no subagent capture attempted" } });
          entry.reps.push({ rep, outcome: "ERROR", runDir, detail: `spawn failed: ${r.spawnError.message}` });
          rows.push({ test: test.id, rep, outcome: "ERROR", detail: `spawn failed: ${r.spawnError.message}` });
          continue;
        }
      }
      // DELTA 8: subagent capture (best-effort). Fresh runs capture right
      // after the spawn closes (also on timeout — that is exactly when the
      // worker telemetry matters most); resumed runs reuse an existing
      // capture and only re-extract when the dir predates capture support
      // (attribution is directory-keyed, so re-extraction is idempotent).
      let subSummary = null;
      if (!fs.existsSync(path.join(runDir, "subagents"))) {
        subSummary = await extractSubagents(runDir);
      } else {
        subSummary = { note: "subagents/ already present (capture reused)", runDir: path.resolve(runDir) };
      }
      const subParsed = loadSubagentEvents(runDir);
      if (subSummary.error && !subParsed.available) subParsed.reason = subSummary.error;
      if (timedOut) {
        const reason = `timeout after ${args.timeout ?? test.timeoutMs ?? DEFAULT_TIMEOUT_MS} ms (SIGTERM -> ${TERM_GRACE_MS} ms -> SIGKILL)`;
        writeResult("ERROR", reason, { subagents: subSummary });
        entry.reps.push({ rep, outcome: "ERROR", runDir, detail: reason });
        rows.push({ test: test.id, rep, outcome: "ERROR", detail: "timeout (killed)" });
        continue;
      }
      const parsed = readLogFile(logPath) ?? { events: [], parsedCount: 0, toolCalls: [], texts: [], endsWithStop: false, apiError: null };
      // Stop-loss only when the session never reached a terminal stop: a
      // transient APIError that opencode retried (session completed) grades
      // normally instead of halting the whole run.
      if (parsed.apiError && !parsed.endsWithStop) {
        const detail = `APIError stop-loss: ${JSON.stringify(parsed.apiError).slice(0, 200)}`;
        writeResult("INTERRUPTED", detail, { subagents: subSummary });
        entry.reps.push({ rep, outcome: "INTERRUPTED", runDir, detail });
        rows.push({ test: test.id, rep, outcome: "INTERRUPTED", detail });
        interrupted = true;
        continue;
      }
      const graded = gradeRep(parsed, test, subParsed);
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
      rows.push({ test: test.id, rep, outcome: graded.outcome, detail: truncate(detailParts.join(" | "), 200) });
    }
  }

  const summary = {
    timestamp: new Date().toISOString(),
    args: { ...args, dataRoot, skillsDir },
    provenanceFile: path.join(RUNS_DIR, "provenance.json"),
    exitCode: exitCodeFor(rows),
    tests: testSummaries,
  };
  fs.writeFileSync(path.join(RUNS_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  printReportTable(rows);
  const counts = {};
  for (const r of rows) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  console.log(`\noutcomes: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ") || "none"}`);
  const rubricRows = testSummaries.flatMap((t) => t.reps.filter((r) => r.outcome === "PASS*"));
  if (rubricRows.length) console.log(`unadjudicated rubric flags: ${rubricRows.length} rep(s) marked PASS* (see result.json)`);
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

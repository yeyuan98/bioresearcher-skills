#!/usr/bin/env node
/*
 * agent-test/opencode-plugin-specific/run.mjs — empirical test runner for
 * the bioresearcher OpenCode connector/plugin (opencode v2 only, >= 2.0.29).
 *
 * Zero-dependency plain ESM (node:stdlib only).
 *
 * Each case is a SEQUENCE of steps against ONE isolated `opencode serve`
 * instance:
 *   - serve_setup    : start `opencode serve --port <free>` with an isolated
 *                      HOME/XDG env + OPENCODE_PASSWORD, wait for readiness,
 *                      then run the bootstrap GUARD (bioresearcher must show
 *                      up in /api/plugin within 90s — otherwise the suite
 *                      aborts LOUDLY, never vacuously).
 *   - api            : `<bin> api --server <url> METHOD PATH` with polling
 *                      retry (HTTP 200 can precede plugin/MCP init) and
 *                      per-step checks (contains/regex/not_contains/
 *                      json_path).
 *   - cli            : direct CLI command (e.g. `mcp list`) with timeout and
 *                      retry-once on a configurable race string. WARNING:
 *                      service-backed CLI commands spawn unmanaged
 *                      `serve --service` daemons on the machine-global
 *                      managed port (49374) and time out when another host
 *                      service holds it — prefer `api` steps.
 *   - config_file    : assertions on a JSON file in the test workspace (e.g.
 *                      the canonical mcp.servers.biomcp shape).
 *   - serve_teardown : kill the serve instance BY PID (SIGTERM -> 3s ->
 *                      SIGKILL) — no orphaned daemons.
 *
 * CI Mode (Hermetic, BINARY-FREE):
 *   node agent-test/opencode-plugin-specific/run.mjs --list
 *   node agent-test/opencode-plugin-specific/run.mjs --dry-run
 *   (--dry-run validates step types, required fields, and check types/ops —
 *   it never spawns anything and does not require the opencode binary.)
 *
 * Live Mode (requires opencode >= 2.0.29 on PATH + network for the staged
 * npm install and npx biomcp; no LLM tokens):
 *   node agent-test/opencode-plugin-specific/run.mjs
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const SUITE_ROOT = path.dirname(path.resolve(process.argv[1]));
const CASES_DIR = path.join(SUITE_ROOT, "cases");
const RUNS_DIR = path.join(SUITE_ROOT, ".runs");
const ROOT = path.resolve(SUITE_ROOT, "..", "..");

const STEP_TYPES = ["serve_setup", "api", "cli", "config_file", "serve_teardown"];
const CHECK_TYPES = {
  contains: { expect: true },
  not_contains: { expect: true },
  regex: { expect: true },
  json_path: { path: true, ops: ["equals", "exists"] },
  /* Structural assertion over one element of a JSON array (e.g. /api/plugin
   * data[]): find elements whose match.key equals match.equals, then assert
   * assert.key equals assert.equals (or exists). Immune to field order and
   * to substring leakage from echoed paths. */
  array_item: { path: true, ops: ["equals", "exists"] },
};
const TERM_GRACE_MS = 3000;
const SERVE_READY_BUDGET_MS = 60000;
/* Cold-boot plugin init (fresh XDG dirs, first-ever hashing of the plugin's
 * node_modules) was measured at ~2.5-3 min; warm boots take ~10 s. The guard
 * budget must cover the cold path — a vacuously short wait would let every
 * case run against a plugin-less server. */
const PLUGIN_GUARD_BUDGET_MS = 240000;
const PLUGIN_GUARD_INTERVAL_MS = 5000;
const API_TIMEOUT_MS = 60000;
const CLI_TIMEOUT_MS = 30000;

function parseArgs(argv) {
  const a = {
    only: null,
    filter: null,
    opencodeBin: "opencode",
    dryRun: false,
    list: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    switch (t) {
      case "--only": a.only = argv[++i]; break;
      case "--filter": a.filter = argv[++i]; break;
      case "--opencode": a.opencodeBin = argv[++i]; break;
      case "--dry-run": a.dryRun = true; break;
      case "--list": a.list = true; break;
      case "--help": case "-h": a.help = true; break;
      default: console.error(`unknown argument: ${t}`); process.exit(2);
    }
  }
  return a;
}

function loadCases() {
  if (!fs.existsSync(CASES_DIR)) return [];
  const entries = fs.readdirSync(CASES_DIR, { withFileTypes: true });
  const cases = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const testJsonPath = path.join(CASES_DIR, e.name, "test.json");
    if (!fs.existsSync(testJsonPath)) continue;
    const data = JSON.parse(fs.readFileSync(testJsonPath, "utf8"));
    data.id = data.id || e.name;
    data.dir = path.join(CASES_DIR, e.name);
    cases.push(data);
  }
  cases.sort((a, b) => a.id.localeCompare(b.id));
  return cases;
}

function stripAnsi(str) {
  return String(str ?? "").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

/* ---------------------------------------------------------------- validation */

/* Hermetic spec validation: unknown step types, missing required fields, and
 * unknown check types/ops are ERRORS (exit 1) — a typo can never degrade into
 * a vacuous pass. */
function validateCheck(check, where) {
  if (!check || typeof check !== "object" || Array.isArray(check)) return `${where}: check is not an object`;
  const spec = CHECK_TYPES[check.type];
  if (!spec) return `${where}: unknown check type ${JSON.stringify(check.type)}`;
  if (check.desc !== undefined && typeof check.desc !== "string") return `${where}: desc must be a string`;
  if (check.type === "json_path") {
    if (typeof check.path !== "string" || !check.path) return `${where}: json_path requires a string path`;
    const op = check.op ?? "equals";
    if (!spec.ops.includes(op)) return `${where}: unknown json_path op ${JSON.stringify(check.op)} (${spec.ops.join("|")})`;
    if (op === "equals" && check.expect === undefined) return `${where}: json_path equals requires expect`;
  } else if (check.type === "array_item") {
    if (typeof check.path !== "string" || !check.path) return `${where}: array_item requires a string path (to the array)`;
    for (const k of ["match", "assert"]) {
      const o = check[k];
      if (!o || typeof o !== "object" || Array.isArray(o) || typeof o.key !== "string" || !o.key) {
        return `${where}: array_item requires ${k} objects with a string key`;
      }
    }
    if (check.match.equals === undefined) return `${where}: array_item match requires equals`;
    const aop = check.assert.op ?? "equals";
    if (!spec.ops.includes(aop)) return `${where}: unknown array_item assert op ${JSON.stringify(check.assert.op)}`;
    if (aop === "equals" && check.assert.equals === undefined) return `${where}: array_item assert equals requires equals`;
  } else {
    if (typeof check.expect !== "string" || !check.expect) return `${where}: ${check.type} requires a non-empty string expect`;
    if (check.op !== undefined) return `${where}: ${check.type} does not take an op`;
  }
  return null;
}

function validateStep(step, where) {
  if (!step || typeof step !== "object" || Array.isArray(step)) return `${where}: step is not an object`;
  if (!STEP_TYPES.includes(step.type)) return `${where}: unknown step type ${JSON.stringify(step.type)} (${STEP_TYPES.join("|")})`;
  if (step.type === "serve_setup" || step.type === "serve_teardown") return null;
  if (step.type === "api") {
    const method = (step.method ?? "GET").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) return `${where}: invalid api method ${JSON.stringify(step.method)}`;
    if (typeof step.path !== "string" || !step.path.startsWith("/")) return `${where}: api step requires a path starting with "/"`;
    if (step.poll !== undefined) {
      const p = step.poll;
      if (!p || typeof p !== "object" || typeof p.untilContains !== "string" || !p.untilContains) {
        return `${where}: api poll requires a non-empty string untilContains`;
      }
      for (const k of ["budgetMs", "intervalMs"]) {
        if (p[k] !== undefined && (!Number.isInteger(p[k]) || p[k] <= 0)) return `${where}: api poll ${k} must be a positive integer`;
      }
    }
  } else if (step.type === "cli") {
    if (!Array.isArray(step.args) || step.args.length === 0 || step.args.some((x) => typeof x !== "string")) {
      return `${where}: cli step requires a non-empty args array of strings`;
    }
    if (step.retryOnContains !== undefined && typeof step.retryOnContains !== "string") return `${where}: cli retryOnContains must be a string`;
    if (step.timeoutMs !== undefined && (!Number.isInteger(step.timeoutMs) || step.timeoutMs <= 0)) return `${where}: cli timeoutMs must be a positive integer`;
  } else if (step.type === "config_file") {
    if (typeof step.file !== "string" || !step.file || path.isAbsolute(step.file) || step.file.includes("..")) {
      return `${where}: config_file requires a relative file name inside the workspace`;
    }
  }
  if (step.checks !== undefined) {
    if (!Array.isArray(step.checks)) return `${where}: checks must be an array`;
    for (let i = 0; i < step.checks.length; i++) {
      const e = validateCheck(step.checks[i], `${where}.checks[${i}]`);
      if (e) return e;
    }
  }
  return null;
}

function validateCase(c) {
  if (!c.id || !Array.isArray(c.steps) || c.steps.length === 0) return `case ${c.id ?? "?"} missing id or non-empty steps array`;
  const hasServe = c.steps.some((s) => s.type === "serve_setup");
  const hasTeardown = c.steps.some((s) => s.type === "serve_teardown");
  if (hasServe !== hasTeardown) return `case ${c.id}: serve_setup and serve_teardown must appear together`;
  if (hasServe && c.steps.filter((s) => s.type === "serve_setup").length !== 1) return `case ${c.id}: at most one serve_setup per case`;
  if (hasServe && c.steps[0].type !== "serve_setup") return `case ${c.id}: serve_setup must be the first step`;
  if (hasTeardown && c.steps[c.steps.length - 1].type !== "serve_teardown") return `case ${c.id}: serve_teardown must be the last step`;
  for (let i = 0; i < c.steps.length; i++) {
    const e = validateStep(c.steps[i], `case ${c.id} steps[${i}]`);
    if (e) return e;
  }
  if (c.mcp !== undefined && typeof c.mcp !== "boolean") return `case ${c.id}: mcp must be a boolean`;
  return null;
}

/* ------------------------------------------------------------------ evaluate */

function walkJsonPath(obj, p) {
  const segs = String(p).split(".");
  let cur = obj;
  for (const s of segs) {
    if (cur === null || cur === undefined) return { missing: true };
    if (Array.isArray(cur)) {
      const i = Number(s);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return { missing: true };
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

/* Evaluates one step's checks against that step's captured artifact.
 * Unknown check types/ops are hard ERRORS (pass: false + error: true) so a
 * malformed case can never pass vacuously. */
function evaluateChecks(checks, rawOutput, json) {
  const output = stripAnsi(rawOutput);
  const results = [];
  for (const c of checks ?? []) {
    const spec = CHECK_TYPES[c?.type];
    if (!spec) {
      results.push({ desc: c?.desc ?? "<unnamed>", pass: false, error: true, detail: `unknown check type ${JSON.stringify(c?.type)}` });
      continue;
    }
    if (c.type === "json_path") {
      const op = c.op ?? "equals";
      if (!spec.ops.includes(op)) {
        results.push({ desc: c.desc ?? c.path, pass: false, error: true, detail: `unknown json_path op ${JSON.stringify(c.op)}` });
        continue;
      }
      if (json === null || typeof json !== "object") {
        results.push({ desc: c.desc ?? c.path, pass: false, detail: "step artifact is not JSON" });
        continue;
      }
      const w = walkJsonPath(json, c.path);
      if (w.missing) {
        results.push({ desc: c.desc ?? c.path, pass: false, detail: `path "${c.path}" missing` });
        continue;
      }
      if (op === "exists") {
        const v = w.value;
        const ok = v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
        results.push({ desc: c.desc ?? c.path, pass: ok, detail: ok ? `path "${c.path}" exists` : `path "${c.path}" is empty/null` });
        continue;
      }
      const ok = JSON.stringify(w.value) === JSON.stringify(c.expect);
      results.push({ desc: c.desc ?? c.path, pass: ok, detail: `path "${c.path}": ${JSON.stringify(w.value)} ${ok ? "==" : "!="} ${JSON.stringify(c.expect)}` });
      continue;
    }
    if (c.type === "array_item") {
      if (json === null || typeof json !== "object") {
        results.push({ desc: c.desc ?? c.path, pass: false, detail: "step artifact is not JSON" });
        continue;
      }
      const w = walkJsonPath(json, c.path);
      if (w.missing || !Array.isArray(w.value)) {
        results.push({ desc: c.desc ?? c.path, pass: false, detail: `path "${c.path}" is missing or not an array` });
        continue;
      }
      const hit = w.value.find((item) => {
        const m = item && typeof item === "object" ? walkJsonPath(item, c.match.key) : { missing: true };
        return !m.missing && JSON.stringify(m.value) === JSON.stringify(c.match.equals);
      });
      if (!hit) {
        results.push({ desc: c.desc ?? c.path, pass: false, detail: `no element with ${c.match.key} == ${JSON.stringify(c.match.equals)} under "${c.path}"` });
        continue;
      }
      const a = walkJsonPath(hit, c.assert.key);
      if (a.missing) {
        results.push({ desc: c.desc ?? c.path, pass: false, detail: `matched element has no "${c.assert.key}"` });
        continue;
      }
      if ((c.assert.op ?? "equals") === "exists") {
        const v = a.value;
        const ok = v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
        results.push({ desc: c.desc ?? c.path, pass: ok, detail: ok ? `${c.assert.key} exists on matched element` : `${c.assert.key} is empty/null` });
        continue;
      }
      const ok = JSON.stringify(a.value) === JSON.stringify(c.assert.equals);
      results.push({ desc: c.desc ?? c.path, pass: ok, detail: `matched element ${c.assert.key}: ${JSON.stringify(a.value)} ${ok ? "==" : "!="} ${JSON.stringify(c.assert.equals)}` });
      continue;
    }
    if (typeof c.expect !== "string" || !c.expect) {
      results.push({ desc: c?.desc ?? "<unnamed>", pass: false, error: true, detail: `${c.type} requires a non-empty string expect` });
      continue;
    }
    if (c.type === "contains") {
      const pass = output.includes(c.expect);
      results.push({ desc: c.desc ?? c.expect, pass, detail: pass ? "matched" : `expected to contain "${c.expect}"` });
    } else if (c.type === "not_contains") {
      const pass = !output.includes(c.expect);
      results.push({ desc: c.desc ?? c.expect, pass, detail: pass ? "absent as expected" : `expected NOT to contain "${c.expect}"` });
    } else if (c.type === "regex") {
      let pass = false;
      let err = null;
      try {
        pass = new RegExp(c.expect, "i").test(output);
      } catch (e) {
        err = e.message;
      }
      results.push(err
        ? { desc: c.desc ?? c.expect, pass: false, error: true, detail: `invalid regex: ${err}` }
        : { desc: c.desc ?? c.expect, pass, detail: pass ? "matched" : `expected to match /${c.expect}/i` });
    } else {
      results.push({ desc: c?.desc ?? "<unnamed>", pass: false, error: true, detail: `unhandled check type ${JSON.stringify(c.type)}` });
    }
  }
  return results;
}

/* ---------------------------------------------------------------- serve mgmt */

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForPort(port, budgetMs) {
  const deadline = Date.now() + budgetMs;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const sock = net.connect({ port, host: "127.0.0.1" });
      sock.setTimeout(2000);
      sock.on("connect", () => { sock.destroy(); resolve(true); });
      sock.on("error", () => { sock.destroy(); retry(); });
      sock.on("timeout", () => { sock.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(tryOnce, 500);
    };
    tryOnce();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class SuiteAbort extends Error {}

/* One isolated serve instance per case: own port, own password, shared
 * isolated HOME/XDG dirs (per suite invocation). Killed BY PID. */
class ServeInstance {
  constructor(bin, workspaceDir, isoEnv, logDir, label) {
    this.bin = bin;
    this.workspaceDir = workspaceDir;
    this.env = isoEnv;
    this.logDir = logDir;
    this.label = label;
    this.port = null;
    this.child = null;
    this.logPath = null;
  }

  async start() {
    this.port = await freePort();
    this.logPath = path.join(this.logDir, `serve-${this.label}-${this.port}.log`);
    const fd = fs.openSync(this.logPath, "a");
    try {
      this.child = spawn(this.bin, ["serve", "--port", String(this.port)], {
        cwd: this.workspaceDir,
        env: this.env,
        stdio: ["ignore", fd, fd],
      });
    } finally {
      fs.closeSync(fd);
    }
    const ready = await waitForPort(this.port, SERVE_READY_BUDGET_MS);
    if (!ready) {
      await this.stop();
      throw new SuiteAbort(`serve did not become ready on port ${this.port} within ${SERVE_READY_BUDGET_MS}ms (log: ${this.logPath})`);
    }
    return this;
  }

  apiUrl() {
    return `http://127.0.0.1:${this.port}`;
  }

  async stop() {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    if (!child.kill("SIGTERM")) return;
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {}
        resolve();
      }, TERM_GRACE_MS);
      child.once("exit", () => { clearTimeout(t); resolve(); });
    });
  }
}

/* `opencode api` call against a ServeInstance. Returns {status, body, json}. */
function apiCall(bin, serve, method, apiPath, env, timeoutMs) {
  const r = spawnSync(bin, ["api", "--server", serve.apiUrl(), method, apiPath], {
    cwd: serve.workspaceDir,
    env,
    encoding: "buffer",
    timeout: timeoutMs ?? API_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
  });
  const out = `${r.stdout ? r.stdout.toString() : ""}${r.stderr ? r.stderr.toString() : ""}`;
  const body = out.trim();
  let json = null;
  try { json = JSON.parse(body); } catch {}
  return { status: r.status, body, json };
}

/* Plugin-ready predicate: the /api/plugin payload must list a data[] entry
 * with id "bioresearcher". NEVER substring-match "bioresearcher" against the
 * raw body — the response echoes the workspace path, and the repo is named
 * "bioresearcher-skills", so a substring test would pass vacuously. */
function pluginReady(res) {
  if (res.status !== 0 || !Array.isArray(res.json?.data)) return false;
  return res.json.data.some((p) => p && typeof p === "object" && p.id === "bioresearcher");
}

/* Canonical v2 biomcp entry (docs/connector-opencode.md) — merged
 * idempotently into the workspace opencode.json for cases with mcp: true. */
function ensureCanonicalMcpConfig(workspaceDir) {
  const cfgPath = path.join(workspaceDir, "opencode.json");
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  } catch {}
  cfg.mcp = cfg.mcp && typeof cfg.mcp === "object" ? cfg.mcp : {};
  cfg.mcp.servers = cfg.mcp.servers && typeof cfg.mcp.servers === "object" ? cfg.mcp.servers : {};
  cfg.mcp.servers.biomcp = {
    type: "local",
    command: ["npx", "-y", "-p", "biomcp@1.6.0", "biomcp"],
    environment: {},
    timeout: { startup: 120000, catalog: 120000, execution: 120000 },
  };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
}

/* --------------------------------------------------------------------- main */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = loadCases();

  if (args.help) {
    console.log("Usage: node run.mjs [--list] [--dry-run] [--only <id>] [--filter <glob>] [--opencode <bin>]");
    process.exit(0);
  }

  if (args.list) {
    console.log(`Discovered ${cases.length} case(s):`);
    for (const c of cases) {
      const mcp = c.mcp ? " [mcp]" : "";
      console.log(`  [${c.level || "L0"}] ${c.id.padEnd(24)} ${(c.purpose || c.name || "").slice(0, 90)}${mcp}`);
    }
    process.exit(0);
  }

  if (args.dryRun) {
    let bad = 0;
    console.log(`ok dry-run: validating ${cases.length} case definition(s)`);
    for (const c of cases) {
      const err = validateCase(c);
      if (err) {
        console.error(`FAIL ${err}`);
        bad++;
      } else {
        const kinds = c.steps.map((s) => s.type).join(" -> ");
        const checks = c.steps.reduce((n, s) => n + (s.checks ? s.checks.length : 0), 0);
        console.log(`ok   ${c.id}: ${kinds} (${checks} check(s))`);
      }
    }
    process.exit(bad ? 1 : 0);
  }

  // Live execution mode:
  let selected = cases;
  if (args.only) {
    selected = cases.filter((c) => c.id === args.only);
    if (selected.length === 0) {
      console.error(`No case matching --only "${args.only}"`);
      process.exit(2);
    }
  } else if (args.filter) {
    const re = new RegExp(args.filter.replace(/\*/g, ".*"));
    selected = cases.filter((c) => re.test(c.id));
  }

  for (const c of selected) {
    const err = validateCase(c);
    if (err) {
      console.error(`ERROR ${err}`);
      process.exit(2);
    }
  }

  // Verify opencode binary exists (v2 only).
  const checkBin = spawnSync(args.opencodeBin, ["--version"], { encoding: "utf8" });
  if (checkBin.error || checkBin.status !== 0) {
    console.error(`ERROR: opencode binary "${args.opencodeBin}" not available or failed: ${checkBin.error?.message || checkBin.stderr}`);
    process.exit(2);
  }
  const versionRaw = (checkBin.stdout || "").trim().split(/\r?\n/)[0] || "?";
  if (!/v?2\./.test(versionRaw.replace(/^opencode\s+/i, ""))) {
    console.error(`ERROR: this suite targets opencode v2 (>= 2.0.29); detected "${versionRaw}"`);
    process.exit(2);
  }
  console.log(`Running ${selected.length} OpenCode v2 empirical test case(s) (opencode ${versionRaw})...`);

  const outLogDir = path.join(RUNS_DIR, "logs");
  fs.mkdirSync(outLogDir, { recursive: true });

  // Build connector to a temporary staging directory.
  const testStage = path.join(RUNS_DIR, ".stage");
  fs.rmSync(testStage, { recursive: true, force: true });
  fs.mkdirSync(testStage, { recursive: true });
  const buildResult = spawnSync("node", [path.join(ROOT, "scripts", "ci", "build-connector-opencode.mjs"), "--out", testStage], {
    encoding: "utf8",
    cwd: ROOT,
  });
  if (buildResult.status !== 0) {
    console.error(`ERROR building connector for tests:\n${buildResult.stderr}`);
    process.exit(2);
  }

  // Setup isolated test workspace (v2: plugins are loaded via the config
  // "plugins" entry pointing at a directory WITH node_modules).
  const workspaceDir = path.join(RUNS_DIR, "workspace");
  fs.rmSync(workspaceDir, { recursive: true, force: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  spawnSync("git", ["init"], { cwd: workspaceDir });

  // Copy built bioresearcher plugin package into the workspace and install
  // its dependencies — a plugin dir without node_modules fails SILENTLY.
  const pluginDir = path.join(workspaceDir, "bioresearcher");
  fs.cpSync(path.join(testStage, "bioresearcher"), pluginDir, { recursive: true });
  const npmInstall = spawnSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: pluginDir, encoding: "utf8" });
  if (npmInstall.status !== 0) {
    console.error(`ERROR installing plugin dependencies in ${pluginDir}:\n${npmInstall.stdout || npmInstall.stderr}`);
    process.exit(2);
  }
  fs.writeFileSync(path.join(workspaceDir, "opencode.json"), `${JSON.stringify({ plugins: [pluginDir] }, null, 2)}\n`);

  // Isolated HOME + XDG dirs for every spawned opencode process: the plugin
  // stamps its agent file under <config>/opencode/agents and opencode v2 also
  // reads skills from ~/.claude/skills — both must stay away from the host.
  const isoHome = path.join(RUNS_DIR, "isohome");
  fs.rmSync(isoHome, { recursive: true, force: true });
  const isoEnv = {
    ...process.env,
    HOME: isoHome,
    XDG_CONFIG_HOME: path.join(isoHome, ".config"),
    XDG_DATA_HOME: path.join(isoHome, ".local", "share"),
    XDG_STATE_HOME: path.join(isoHome, ".local", "state"),
    XDG_CACHE_HOME: path.join(isoHome, ".cache"),
    OPENCODE_PASSWORD: crypto.randomBytes(12).toString("hex"),
  };
  fs.mkdirSync(isoEnv.XDG_CONFIG_HOME, { recursive: true });
  fs.mkdirSync(isoEnv.XDG_DATA_HOME, { recursive: true });

  const mcpNeeded = selected.some((c) => c.mcp === true);

  let failed = 0;
  let aborted = null;
  for (const c of selected) {
    process.stdout.write(`  ${c.id.padEnd(28)} ... `);
    const artifact = { steps: [] };
    let serve = null;
    const results = [];
    const stepFail = (desc, detail) => results.push({ desc, pass: false, detail });

    try {
      for (const [idx, step] of c.steps.entries()) {
        if (step.type === "serve_setup") {
          if (mcpNeeded && c.mcp === true) ensureCanonicalMcpConfig(workspaceDir);
          serve = new ServeInstance(args.opencodeBin, workspaceDir, isoEnv, outLogDir, c.id);
          await serve.start();
          /* BOOTSTRAP GUARD: HTTP 200 can precede plugin init, so poll
           * /api/plugin until its data[] really lists the bioresearcher
           * plugin (JSON-structural match — see pluginReady); if it never
           * shows up the SUITE aborts loudly (a silently dead plugin must
           * not produce vacuous case results). */
          const guardDeadline = Date.now() + PLUGIN_GUARD_BUDGET_MS;
          let guardOk = false;
          while (Date.now() < guardDeadline) {
            if (pluginReady(apiCall(args.opencodeBin, serve, "GET", "/api/plugin", isoEnv))) { guardOk = true; break; }
            await sleep(PLUGIN_GUARD_INTERVAL_MS);
          }
          if (!guardOk) {
            throw new SuiteAbort(
              `bootstrap guard: plugin id "bioresearcher" not present in /api/plugin data[] within ${PLUGIN_GUARD_BUDGET_MS}ms ` +
              `(serve log: ${serve.logPath}; workspace: ${workspaceDir}; plugin deps installed at ${pluginDir}) — plugin not loading; aborting suite`,
            );
          }
          artifact.steps.push({ type: "serve_setup", port: serve.port, pid: serve.child?.pid ?? null });
          continue;
        }
        if (step.type === "serve_teardown") {
          if (!serve) {
            stepFail("serve_teardown", "no serve instance to tear down");
            continue;
          }
          const pid = serve.child?.pid ?? null;
          await serve.stop();
          const pidAlive = async (p) => {
            if (p === null) return false;
            /* A just-killed pid can read alive for a moment (kernel teardown /
             * zombie before reap) — re-check a few times before failing. */
            for (let i = 0; i < 4; i++) {
              try { process.kill(p, 0); } catch { return false; }
              await sleep(500);
            }
            try { process.kill(p, 0); return true; } catch { return false; }
          };
          if (await pidAlive(pid)) stepFail("serve_teardown", `serve pid ${pid} still alive after teardown`);
          artifact.steps.push({ type: "serve_teardown", pid, killed: !(await pidAlive(pid)) });
          serve = null;
          continue;
        }
        if (step.type === "api") {
          if (!serve) {
            stepFail(`api ${step.path}`, "no serve instance (missing serve_setup?)");
            continue;
          }
          let body = "";
          let status = null;
          if (step.poll) {
            const budget = step.poll.budgetMs ?? PLUGIN_GUARD_BUDGET_MS;
            const interval = step.poll.intervalMs ?? PLUGIN_GUARD_INTERVAL_MS;
            const deadline = Date.now() + budget;
            for (;;) {
              const r = apiCall(args.opencodeBin, serve, step.method ?? "GET", step.path, isoEnv);
              status = r.status;
              body = r.body;
              /* untilContains must be a string that CANNOT appear in the
               * echoed workspace path (the repo dir is "bioresearcher-skills"
               * — plain "bioresearcher" would pass vacuously). */
              if (r.status === 0 && r.body.includes(step.poll.untilContains)) break;
              if (Date.now() >= deadline) break;
              await sleep(interval);
            }
          } else {
            const r = apiCall(args.opencodeBin, serve, step.method ?? "GET", step.path, isoEnv);
            status = r.status;
            body = r.body;
          }
          if (status !== 0) stepFail(`api ${step.path}`, `opencode api exited ${status}: ${body.slice(0, 200)}`);
          let json = null;
          try { json = JSON.parse(body); } catch {}
          results.push(...evaluateChecks(step.checks, body, json));
          artifact.steps.push({ type: "api", path: step.path, status, bodyChars: body.length });
          continue;
        }
        if (step.type === "cli") {
          /* Direct CLI command with optional one-shot retry on a race string
           * (e.g. `mcp list` racing config discovery: "No MCP servers
           * configured"). NOTE: service-backed commands spawn unmanaged
           * `serve --service` daemons on the machine-global managed port —
           * see the suite README before adding cli steps. */
          const run = () => spawnSync(args.opencodeBin, step.args, {
            cwd: workspaceDir,
            env: isoEnv,
            encoding: "utf8",
            timeout: step.timeoutMs ?? CLI_TIMEOUT_MS,
            maxBuffer: 32 * 1024 * 1024,
          });
          let r = run();
          const combined0 = `${r.stdout ?? ""}${r.stderr ?? ""}`;
          if ((r.error?.code === "ETIMEDOUT" || (step.retryOnContains && combined0.includes(step.retryOnContains)))) {
            await sleep(2000);
            r = run();
          }
          const combined = `${r.stdout ?? ""}${r.stderr ?? ""}`;
          if (r.error) stepFail(`cli ${step.args.join(" ")}`, `spawn error: ${r.error.message}`);
          else if (r.status !== 0) stepFail(`cli ${step.args.join(" ")}`, `exited ${r.status}: ${combined.slice(-300)}`);
          let json = null;
          try { json = JSON.parse(combined); } catch {}
          results.push(...evaluateChecks(step.checks, combined, json));
          artifact.steps.push({ type: "cli", args: step.args, status: r.status, outputChars: combined.length });
          continue;
        }
        if (step.type === "config_file") {
          const file = path.join(workspaceDir, step.file);
          let text = "";
          try {
            text = fs.readFileSync(file, "utf8");
          } catch (e) {
            stepFail(`config_file ${step.file}`, `cannot read ${file}: ${e.message}`);
            continue;
          }
          let json = null;
          try { json = JSON.parse(text); } catch {}
          if (json === null && (step.checks ?? []).some((k) => k.type === "json_path")) {
            stepFail(`config_file ${step.file}`, "file is not valid JSON");
          }
          results.push(...evaluateChecks(step.checks, text, json));
          artifact.steps.push({ type: "config_file", file: step.file });
          continue;
        }
      }
    } catch (e) {
      if (e instanceof SuiteAbort) {
        aborted = e.message;
      } else {
        stepFail("harness", `unexpected error: ${e?.stack ?? e?.message ?? e}`);
      }
    } finally {
      if (serve) await serve.stop();
    }

    fs.writeFileSync(path.join(outLogDir, `${c.id}.artifact.json`), JSON.stringify(artifact, null, 2) + "\n");
    const pass = results.length > 0 && results.every((r) => r.pass);
    if (pass) {
      console.log("PASS");
    } else {
      console.log(results.length === 0 ? "FAIL (no checks evaluated)" : "FAIL");
      failed++;
      for (const r of results.filter((x) => !x.pass)) {
        console.log(`    - ${r.desc}: ${r.error ? "ERROR: " : ""}${r.detail}`);
      }
    }
    if (aborted) {
      console.error(`\nSUITE ABORTED (not vacuous): ${aborted}`);
      process.exit(2);
    }
  }

  console.log(`\nResults: ${selected.length - failed} passed, ${failed} failed.`);
  console.log("Daemon hygiene: every serve instance was killed by PID; check `pgrep -af 'opencode serve'` for strays.");
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Harness error:", err);
  process.exit(2);
});

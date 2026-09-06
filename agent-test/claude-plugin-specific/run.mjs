#!/usr/bin/env node
/*
 * agent-test/claude-plugin-specific/run.mjs — manual, local-only empirical
 * test runner for the bioresearcher Claude Code plugin (marketplace plugin
 * rooted at the repo root: bundled biomcp MCP server via
 * .claude-plugin/mcp.json, plugin skills, and the bioresearcher-dr-worker
 * plugin agent via .claude-plugin/agents/).
 *
 * Zero-dependency plain ESM (node:stdlib only), mirroring the philosophy of
 * the parent opencode suite (../run.mjs): per-case test.json specs, prompt +
 * objective mechanical checks, disposable per-rep run dirs, resume, and
 * PASS / PASS* / FAIL / ERROR outcome ladder. Event shapes are Claude Code's
 * `claude -p --output-format stream-json --verbose` protocol (evaluated on
 * Claude Code 2.1.261).
 *
 * Drivers:
 *   session (default) — spawn `claude --plugin-dir <repo> -p <prompt>
 *     --output-format stream-json --verbose --no-session-persistence
 *     --max-budget-usd <budget> [--permission-mode m] [extraArgs...]` in a
 *     disposable project dir; grade the parsed event stream.
 *   install — true user path: `claude plugin validate <repo>` ->
 *     `claude plugin marketplace add <repo>` -> `claude plugin install
 *     bioresearcher@bioresearcher-skills` -> `claude plugin list` -> one
 *     session WITHOUT --plugin-dir; grade the session stream.
 *   cli — one plain `claude <cliArgs...>` invocation; grade its combined
 *     output (cli_output checks). Free (no LLM) for e.g. plugin validate.
 *
 * Isolation: every rep gets its own CLAUDE_CONFIG_DIR under the run dir,
 * seeded by copying the host's ~/.claude/settings.json (auth provisioning —
 * see README), and its own empty project dir as cwd. The repo working tree
 * is never touched; all artifacts live under .runs/ (gitignored). Child env
 * overrides API_TIMEOUT_MS=600000 so a copied host setting cannot dwarf the
 * kill ladder; sessions are spawned detached and killed by process group so
 * npx/biomcp stdio children never orphan.
 *
 * NOT run in CI. CI only uses --list / --dry-run, which are hermetic (no
 * claude binary, no ~/.claude reads).
 *
 * Exit codes: 0 = all selected PASS / PASS* / SKIP; 1 = >=1 FAIL;
 * 2 = harness ERROR / INTERRUPTED (takes precedence over 1).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const SUITE_ROOT = path.dirname(path.resolve(process.argv[1]));
const RUNS_DIR = path.join(SUITE_ROOT, ".runs");
const CASES_DIR = path.join(SUITE_ROOT, "cases");
const DEFAULT_REPO = path.resolve(SUITE_ROOT, "..", "..");
const DEFAULT_BUDGET_USD = 0.5;
const DEFAULT_TIMEOUT_MS = 300000;
const TERM_GRACE_MS = 3000;
const DRIVERS = new Set(["session", "install", "cli"]);

class UsageError extends Error {}
class HarnessError extends Error {}

/* ================================================================ CLI */

function parseArgs(argv) {
  const a = {
    only: null, filter: null, reps: 1, force: false, model: null,
    timeout: null, claudeBin: "claude", repo: null, keepConfig: false,
    dryRun: false, list: false, help: false,
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
      case "--model": a.model = need(t, argv[++i]); break;
      case "--timeout": a.timeout = Number(need(t, argv[++i])); break;
      case "--claude": a.claudeBin = need(t, argv[++i]); break;
      case "--repo": a.repo = need(t, argv[++i]); break;
      case "--keep-config": a.keepConfig = true; break;
      case "--dry-run": a.dryRun = true; break;
      case "--list": a.list = true; break;
      case "--help": case "-h": a.help = true; break;
      default: throw new UsageError(`unknown argument: ${t}`);
    }
  }
  if (!Number.isInteger(a.reps) || a.reps < 1) throw new UsageError("--reps must be an integer >= 1");
  if (a.timeout !== null && (!Number.isFinite(a.timeout) || a.timeout <= 0)) throw new UsageError("--timeout must be positive ms");
  if (a.only && a.filter) throw new UsageError("--only and --filter are mutually exclusive");
  return a;
}

function usage() {
  return [
    "usage: node agent-test/claude-plugin-specific/run.mjs [options]",
    "  --only <id>         run a single case (dir name or test.json id)",
    "  --filter <glob>     run cases whose id matches glob (* and ?)",
    "  --reps <N>          repetitions per case (default 1)",
    "  --force             re-run even if a complete prior rep exists",
    "  --model <ID>        pass --model to session runs (optional)",
    "  --timeout <ms>      per-rep timeout override (default: case timeoutMs else 300000)",
    "  --claude <BIN>      claude binary (default: claude)",
    "  --repo <DIR>        plugin/marketplace repo root (default: ../..)",
    "  --keep-config       keep per-rep isolated CLAUDE_CONFIG_DIRs (contains copied auth)",
    "  --dry-run           discovery + schema validation + plan print; hermetic, never spawns claude",
    "  --list              print the case index table and exit (hermetic)",
    "exit codes: 0 all PASS/PASS*/SKIP-only; 1 any FAIL; 2 harness ERROR/INTERRUPTED",
  ].join("\n");
}

function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\0/g, ".*");
  return new RegExp(`^${esc}$`);
}

/* ============================================================ discovery + schema */

const CHECK_TYPES = new Set([
  "init_mcp", "init_tool", "init_tool_count", "init_skill", "init_agent",
  "tool_use", "tool_result_ok", "text", "permission_denials",
  "subagent_by_type", "file_exists", "cli_output", "group", "rubric",
]);

function validateCheck(c, where, errs) {
  if (!c || typeof c !== "object" || Array.isArray(c)) { errs.push(`${where}: check is not an object`); return; }
  if (!CHECK_TYPES.has(c.type)) { errs.push(`${where}: unknown check type ${JSON.stringify(c.type)}`); return; }
  const needStr = (k) => { if (typeof c[k] !== "string" || !c[k]) errs.push(`${where}: ${c.type} requires string ${k}`); };
  const isBool = (k) => { if (c[k] !== undefined && typeof c[k] !== "boolean") errs.push(`${where}: ${c.type} ${k} must be boolean`); };
  switch (c.type) {
    case "init_mcp": needStr("name"); break;
    case "init_tool": case "init_skill": case "init_agent":
      needStr("name"); isBool("regex");
      if (c.op !== undefined && c.op !== "present" && c.op !== "absent") errs.push(`${where}: ${c.type} op must be present|absent`);
      break;
    case "init_tool_count":
      for (const k of ["min", "max"]) if (c[k] !== undefined && !Number.isInteger(c[k])) errs.push(`${where}: init_tool_count ${k} must be an integer`);
      if (c.min === undefined && c.max === undefined) errs.push(`${where}: init_tool_count requires min and/or max`);
      if (c.pattern !== undefined) { try { new RegExp(c.pattern); } catch (e) { errs.push(`${where}: init_tool_count pattern: ${e.message}`); } }
      break;
    case "tool_use": case "tool_result_ok": {
      needStr("name"); isBool("regex");
      if (c.occurrence !== undefined && (!Number.isInteger(c.occurrence) || c.occurrence < 1)) errs.push(`${where}: ${c.type} occurrence must be an integer >= 1`);
      if (c.path !== undefined && (typeof c.path !== "string" || !c.path)) errs.push(`${where}: ${c.type} path must be a non-empty string`);
      const ops = new Set(["exists", "equals", "regex", "contains"]);
      if (c.op !== undefined && !ops.has(c.op)) errs.push(`${where}: ${c.type} op must be one of exists|equals|regex|contains`);
      if (c.op !== undefined && c.op !== "exists" && c.expect === undefined) errs.push(`${where}: ${c.type} op ${c.op} requires expect`);
      if (c.op === "regex" && typeof c.expect === "string") { try { new RegExp(c.expect); } catch (e) { errs.push(`${where}: ${c.type} invalid regex: ${e.message}`); } }
      break;
    }
    case "text": {
      needStr("expect");
      if (!["contains", "not_contains", "regex"].includes(c.op ?? "contains")) errs.push(`${where}: text op must be contains|not_contains|regex`);
      if (c.source !== undefined && c.source !== "final" && c.source !== "assistant") errs.push(`${where}: text source must be final|assistant`);
      if ((c.op ?? "contains") === "regex") { try { new RegExp(c.expect); } catch (e) { errs.push(`${where}: text invalid regex: ${e.message}`); } }
      break;
    }
    case "permission_denials":
      if (c.op !== "empty" && c.op !== "not_containing") errs.push(`${where}: permission_denials op must be empty|not_containing`);
      if (c.op === "not_containing" && typeof c.pattern !== "string") errs.push(`${where}: permission_denials not_containing requires string pattern`);
      break;
    case "subagent_by_type":
      needStr("agent");
      if (c.min !== undefined && !Number.isInteger(c.min)) errs.push(`${where}: subagent_by_type min must be an integer`);
      break;
    case "file_exists": {
      needStr("pattern");
      try { globToRegExp(c.pattern); } catch (e) { errs.push(`${where}: file_exists pattern: ${e.message}`); }
      break;
    }
    case "cli_output": {
      needStr("expect");
      if (!["contains", "regex"].includes(c.op ?? "contains")) errs.push(`${where}: cli_output op must be contains|regex`);
      if ((c.op ?? "contains") === "regex") { try { new RegExp(c.expect); } catch (e) { errs.push(`${where}: cli_output invalid regex: ${e.message}`); } }
      break;
    }
    case "group": {
      const hasAny = Array.isArray(c.anyOf), hasAll = Array.isArray(c.allOf);
      if (hasAny === hasAll || (hasAny ? c.anyOf.length : c.allOf.length) === 0) errs.push(`${where}: group requires exactly one non-empty anyOf|allOf array`);
      else (hasAny ? c.anyOf : c.allOf).forEach((arm, i) => validateCheck(arm, `${where}.arm[${i}]`, errs));
      break;
    }
    case "rubric":
      if (c.manual !== true) errs.push(`${where}: rubric requires manual: true`);
      needStr("flag");
      break;
  }
}

function loadCase(name) {
  const dir = path.join(CASES_DIR, name);
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return null;
  const tj = path.join(dir, "test.json");
  if (!fs.existsSync(tj)) return null;
  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(tj, "utf8"));
  } catch (e) {
    return { id: name, dirName: name, dir, error: `unparseable test.json: ${e.message}` };
  }
  const errs = [];
  const id = typeof spec.id === "string" && spec.id ? spec.id : name;
  const driver = spec.driver ?? "session";
  if (!DRIVERS.has(driver)) errs.push(`driver must be one of ${[...DRIVERS].join("|")}`);
  if (driver === "cli" && (!Array.isArray(spec.cliArgs) || spec.cliArgs.length === 0 || !spec.cliArgs.every((x) => typeof x === "string"))) errs.push("cli driver requires non-empty string array cliArgs");
  if (driver !== "cli" && typeof spec.prompt !== "string" && driver !== "install") errs.push("missing string field: prompt");
  if (!Array.isArray(spec.checks) || spec.checks.length === 0) errs.push("checks must be a non-empty array");
  if (spec.budgetUsd !== undefined && (!Number.isFinite(spec.budgetUsd) || spec.budgetUsd <= 0)) errs.push("budgetUsd must be a positive number");
  if (spec.timeoutMs !== undefined && (!Number.isFinite(spec.timeoutMs) || spec.timeoutMs <= 0)) errs.push("timeoutMs must be positive ms");
  if (spec.permissionMode !== undefined && typeof spec.permissionMode !== "string") errs.push("permissionMode must be a string");
  if (spec.extraArgs !== undefined && (!Array.isArray(spec.extraArgs) || !spec.extraArgs.every((x) => typeof x === "string"))) errs.push("extraArgs must be a string array");
  if (Array.isArray(spec.checks)) spec.checks.forEach((c, i) => validateCheck(c, `checks[${i}]`, errs));
  return {
    id, dirName: name, dir, spec, driver,
    level: spec.level ?? null, purpose: spec.purpose ?? "",
    error: errs.length ? errs.join("; ") : null,
    timeoutMs: typeof spec.timeoutMs === "number" ? spec.timeoutMs : null,
    budgetUsd: typeof spec.budgetUsd === "number" ? spec.budgetUsd : DEFAULT_BUDGET_USD,
  };
}

function discoverCases() {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(CASES_DIR, { withFileTypes: true });
  } catch {
    throw new HarnessError(`cannot read cases dir ${CASES_DIR}`);
  }
  for (const de of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const c = loadCase(de.name);
    if (c) out.push(c);
  }
  return out;
}

function selectCases(cases, args) {
  let sel = cases;
  if (args.only) {
    sel = cases.filter((c) => c.id === args.only || c.dirName === args.only);
    if (sel.length === 0) throw new HarnessError(`no case matches --only ${args.only}`);
  } else if (args.filter) {
    const re = globToRegExp(args.filter);
    sel = cases.filter((c) => re.test(c.id) || re.test(c.dirName));
    if (sel.length === 0) throw new HarnessError(`no case matches --filter ${args.filter}`);
  }
  return sel;
}

function printListTable(cases) {
  const cols = [["ID", 32], ["LEVEL", 5], ["DRIVER", 8], ["PURPOSE", 52], ["BUDGET", 6], ["TIMEOUT", 7]];
  const head = cols.map(([h, w]) => h.padEnd(w)).join("  ");
  console.log(head);
  console.log("-".repeat(head.length));
  for (const c of cases) {
    const purpose = c.error ? `ERROR: ${c.error}` : String(c.purpose ?? "");
    const row = [
      (c.id ?? "").slice(0, 32).padEnd(32),
      String(c.level ?? "-").slice(0, 5).padEnd(5),
      String(c.driver ?? "-").slice(0, 8).padEnd(8),
      purpose.slice(0, 52).padEnd(52),
      (c.error ? "-" : c.driver === "cli" && c.spec.budgetUsd === undefined ? "-" : `$${c.budgetUsd}`).padEnd(6),
      String(c.timeoutMs ?? DEFAULT_TIMEOUT_MS).padEnd(7),
    ].join("  ");
    console.log(row);
  }
}

/* ============================================================ config provisioning */

/* Auth provisioning: copy the host's ~/.claude/settings.json into the
 * isolated config dir (proven recipe on gateway-auth hosts). Alternatives
 * are documented in the README (ANTHROPIC_API_KEY env, or a one-time
 * interactive `claude` login inside the kept config dir). The copy carries
 * the host's auth token into .runs/ (gitignored) — chmod 0700, always
 * cleaned up unless --keep-config. */
function provisionConfigDir(cfgDir) {
  fs.mkdirSync(cfgDir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(cfgDir, 0o700); } catch {}
  const hostSettings = path.join(process.env.HOME || "", ".claude", "settings.json");
  if (fs.existsSync(hostSettings)) fs.copyFileSync(hostSettings, path.join(cfgDir, "settings.json"));
  return fs.existsSync(path.join(cfgDir, "settings.json"));
}

/* Child env: CLAUDE_CONFIG_DIR isolated; API_TIMEOUT_MS capped so a copied
 * host setting (e.g. 3,000,000 ms) cannot dwarf the runner's kill ladder. */
function childEnv(cfgDir) {
  return {
    ...process.env,
    CLAUDE_CONFIG_DIR: cfgDir,
    API_TIMEOUT_MS: "600000",
  };
}

/* ============================================================ spawning */

function timestampDirName() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* Session run: detached (own process group); timeout ladder SIGTERM ->
 * TERM_GRACE_MS -> SIGKILL applied to the whole group so npx/biomcp stdio
 * children never orphan. Grade from the parsed event stream, never the
 * process exit code (empirically unreliable). */
function runSession({ claudeBin, argv, cwd, env, logPath, timeoutMs, killRegistry }) {
  return new Promise((resolve) => {
    const fd = fs.openSync(logPath, "a");
    const child = spawn(claudeBin, argv, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let timedOut = false, settled = false, killTimer = null;
    killRegistry.add(child.pid);
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      killTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, TERM_GRACE_MS);
    }, timeoutMs);
    const finish = (spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      killRegistry.delete(child.pid);
      fs.closeSync(fd);
      resolve({ timedOut, spawnError: spawnError ?? null });
    };
    child.stdout.on("data", (c) => { try { fs.writeSync(fd, c); } catch {} });
    child.stderr.on("data", (c) => { try { fs.writeSync(fd, c); } catch {} });
    child.on("error", (e) => finish(e));
    child.on("close", () => finish(null));
  });
}

/* Plain CLI step (install driver / cli driver): same group-kill discipline. */
function runCliStep({ claudeBin, argv, cwd, env, logPath, timeoutMs, killRegistry }) {
  return new Promise((resolve) => {
    const fd = fs.openSync(logPath, "a");
    fs.writeSync(fd, `\n[${new Date().toISOString()}] claude ${argv.join(" ")}\n`);
    const child = spawn(claudeBin, argv, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", timedOut = false, settled = false, killTimer = null;
    killRegistry.add(child.pid);
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
      killTimer = setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch {} }, TERM_GRACE_MS);
    }, timeoutMs);
    const finish = (code, spawnError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      killRegistry.delete(child.pid);
      fs.writeSync(fd, `\n[${new Date().toISOString()}] exit=${code}${timedOut ? " (timed out)" : ""}\n`);
      fs.closeSync(fd);
      resolve({ code, output: out, timedOut, spawnError: spawnError ?? null });
    };
    child.stdout.on("data", (c) => { out += c; try { fs.writeSync(fd, c); } catch {} });
    child.stderr.on("data", (c) => { out += c; try { fs.writeSync(fd, c); } catch {} });
    child.on("error", (e) => finish(-1, e));
    child.on("close", (code) => finish(code, null));
  });
}

/* ============================================================ stream parsing */

function parseStream(text) {
  const events = [];
  let parsedCount = 0;
  for (const line of String(text).split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    let ev;
    try { ev = JSON.parse(s); } catch { continue; }
    parsedCount++;
    events.push(ev);
  }
  let init = null;
  const toolCalls = [];
  const byId = new Map();
  const texts = [];
  let result = null;
  for (const ev of events) {
    if (ev.type === "system" && ev.subtype === "init") {
      init = {
        mcpServers: Array.isArray(ev.mcp_servers) ? ev.mcp_servers : [],
        tools: Array.isArray(ev.tools) ? ev.tools : [],
        skills: Array.isArray(ev.skills) ? ev.skills : [],
        agents: Array.isArray(ev.agents) ? ev.agents : [],
      };
    } else if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
      for (const c of ev.message.content) {
        if (c.type === "tool_use" && typeof c.name === "string") {
          const call = { id: c.id ?? null, name: c.name, input: c.input ?? null, status: null, error: null, resultText: null };
          toolCalls.push(call);
          if (call.id) byId.set(call.id, call);
        } else if (c.type === "text" && typeof c.text === "string" && c.text) {
          texts.push(c.text);
        }
      }
    } else if (ev.type === "user" && Array.isArray(ev.message?.content)) {
      /* Normative: tool_result blocks are joined to their tool_use by
       * tool_use_id, never by name (parallel worker calls interleave). */
      for (const c of ev.message.content) {
        if (c.type === "tool_result") {
          const call = c.tool_use_id ? byId.get(c.tool_use_id) : null;
          const text = typeof c.content === "string" ? c.content : JSON.stringify(c.content ?? "");
          if (call) {
            call.status = c.is_error ? "error" : "completed";
            call.resultText = text;
            if (c.is_error) call.error = text;
          } else {
            toolCalls.push({ id: c.tool_use_id ?? null, name: null, input: null, status: c.is_error ? "error" : "completed", error: c.is_error ? text : null, resultText: text });
          }
        }
      }
    } else if (ev.type === "result") {
      result = {
        text: typeof ev.result === "string" ? ev.result : (ev.result == null ? null : JSON.stringify(ev.result)),
        isError: ev.is_error === true,
        subtype: ev.subtype ?? null,
        permissionDenials: Array.isArray(ev.permission_denials) ? ev.permission_denials : [],
        subagentStats: ev.subagent_stats && typeof ev.subagent_stats === "object" ? ev.subagent_stats : null,
        totalCostUsd: typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : null,
      };
    }
  }
  return { events, parsedCount, init, toolCalls, texts, result, endsWithResult: result !== null };
}

function readStreamFile(file) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch { return null; }
  return parseStream(text);
}

/* Synthetic parsed object for the cli driver: grading targets cliOutput, not
 * a session stream, so the stream-based terminal condition is trivially met. */
function cliParsed() {
  return {
    events: [], parsedCount: 1, init: null, toolCalls: [], texts: [],
    result: { text: null, isError: false, subtype: "cli", permissionDenials: [], subagentStats: null, totalCostUsd: null },
    endsWithResult: true,
  };
}

/* ============================================================ grader helpers */

function toText(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
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

function existsValue(v) {
  if (v === null || v === undefined) return false;
  if (v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === "object" && Object.keys(v).length === 0) return false;
  return true;
}

function matchEntry(entry, name, regex) {
  return regex ? new RegExp(name).test(toText(entry)) : toText(entry) === name;
}

function resolveCalls(toolCalls, name, regex) {
  return toolCalls.filter((c) => typeof c.name === "string" && matchEntry(c.name, name, regex));
}

function walkDirFiles(dir, base = dir, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const de of entries) {
    const p = path.join(dir, de.name);
    if (de.isDirectory()) walkDirFiles(p, base, acc);
    else acc.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return acc;
}

const result1 = (check, status, detail) => ({
  type: check?.type ?? "?",
  desc: typeof check?.desc === "string" && check.desc ? check.desc : null,
  status, detail,
});

/* ============================================================ grader */

function evalCheck(check, ctx) {
  if (!check || typeof check !== "object" || Array.isArray(check)) return result1(check, "error", "check is not an object");
  try {
    const fn = GRADERS[check.type];
    if (!fn) return result1(check, "error", `unknown check type ${JSON.stringify(check.type)}`);
    return fn(check, ctx);
  } catch (e) {
    return result1(check, "error", `grader exception: ${e.message}`);
  }
}

const GRADERS = {
  init_mcp(check, ctx) {
    const want = check.status ?? "connected";
    const servers = ctx.parsed?.init?.mcpServers ?? [];
    const hit = servers.find((s) => s.name === check.name && s.status === want);
    const seen = servers.map((s) => `${s.name}:${s.status}`).join(", ");
    return result1(check, hit ? "pass" : "fail",
      `mcp server "${check.name}" ${hit ? `is ${want}` : `not ${want}; init servers: ${seen}`}`);
  },
  init_tool(check, ctx) {
    const tools = ctx.parsed?.init?.tools ?? [];
    const found = tools.some((t) => matchEntry(t, check.name, check.regex));
    const want = check.op ?? "present";
    const ok = want === "present" ? found : !found;
    return result1(check, ok ? "pass" : "fail", `tool ${JSON.stringify(check.name)} ${found ? "present in" : "absent from"} init (${tools.length} tools; want ${want})`);
  },
  init_tool_count(check, ctx) {
    const tools = ctx.parsed?.init?.tools ?? [];
    const counted = check.pattern ? tools.filter((t) => new RegExp(check.pattern).test(toText(t))) : tools;
    const ok = (check.min === undefined || counted.length >= check.min) && (check.max === undefined || counted.length <= check.max);
    return result1(check, ok ? "pass" : "fail", `count=${counted.length}${check.pattern ? ` of pattern ${JSON.stringify(check.pattern)}` : ""}; bounds [${check.min ?? "-inf"}, ${check.max ?? "inf"}]`);
  },
  init_skill(check, ctx) {
    const found = (ctx.parsed?.init?.skills ?? []).some((s) => matchEntry(s, check.name, check.regex));
    const ok = (check.op ?? "present") === "present" ? found : !found;
    return result1(check, ok ? "pass" : "fail", `skill ${JSON.stringify(check.name)} ${found ? "present in" : "absent from"} init (${(ctx.parsed?.init?.skills ?? []).length} skills)`);
  },
  init_agent(check, ctx) {
    const found = (ctx.parsed?.init?.agents ?? []).some((a) => matchEntry(a, check.name, check.regex));
    const ok = (check.op ?? "present") === "present" ? found : !found;
    return result1(check, ok ? "pass" : "fail", `agent ${JSON.stringify(check.name)} ${found ? "present in" : "absent from"} init (${(ctx.parsed?.init?.agents ?? []).length} agents)`);
  },
  tool_use(check, ctx) {
    const calls = resolveCalls(ctx.parsed?.toolCalls ?? [], check.name, check.regex);
    if (calls.length === 0) return result1(check, "fail", `no tool_use matching ${JSON.stringify(check.name)}`);
    const occ = check.occurrence ?? 1;
    const call = calls[occ - 1];
    if (!call) return result1(check, "fail", `occurrence ${occ} of ${JSON.stringify(check.name)} not found (${calls.length} call(s))`);
    if (check.path === undefined) {
      const op = check.op;
      if (op === undefined || op === "exists") return result1(check, "pass", `${call.name}#${occ} called`);
      // Whole-input assertion: models may vary the exact parameter name
      // (e.g. article_search accepts query- and terms-style params), so
      // contains/regex without a path matches the serialized whole input.
      const hay = toText(call.input);
      if (op === "contains") {
        const ok2 = hay.includes(String(check.expect));
        return result1(check, ok2 ? "pass" : "fail", `input of ${call.name}#${occ} ${ok2 ? "contains" : "does not contain"} ${JSON.stringify(String(check.expect))}: ${hay.slice(0, 120)}`);
      }
      const ok2 = new RegExp(String(check.expect)).test(hay);
      return result1(check, ok2 ? "pass" : "fail", `input regex ${JSON.stringify(String(check.expect))} on ${call.name}#${occ}: ${ok2 ? "matched" : `no match in ${hay.slice(0, 120)}`}`);
    }
    if (typeof call.input !== "object" || call.input === null || Array.isArray(call.input)) {
      return result1(check, "fail", `${call.name}#${occ} input is not an object`);
    }
    const w = walkPath(call.input, check.path);
    if (w.error) return result1(check, "error", w.error);
    if (w.missing) return result1(check, "fail", `path "${check.path}" missing in ${call.name}#${occ} input`);
    const v = w.value;
    const op = check.op ?? "exists";
    if (op === "exists") {
      const ok = existsValue(v);
      return result1(check, ok ? "pass" : "fail", `path "${check.path}" in ${call.name}#${occ}: ${ok ? "exists" : `empty/null (${toText(v)})`}`);
    }
    if (check.expect === undefined) return result1(check, "error", `${op} requires expect`);
    const hay = toText(v);
    if (op === "equals") {
      const ok = hay === toText(check.expect) || (typeof check.expect === "object" && JSON.stringify(v) === JSON.stringify(check.expect));
      return result1(check, ok ? "pass" : "fail", `path "${check.path}" in ${call.name}#${occ}: ${hay} ${ok ? "==" : "!="} ${toText(check.expect)}`);
    }
    if (op === "contains") {
      const ok = hay.includes(String(check.expect));
      return result1(check, ok ? "pass" : "fail", `path "${check.path}" in ${call.name}#${occ}: ${ok ? "contains" : "does not contain"} ${JSON.stringify(String(check.expect))}`);
    }
    const ok = new RegExp(String(check.expect)).test(hay);
    return result1(check, ok ? "pass" : "fail", `path "${check.path}" in ${call.name}#${occ}: regex ${JSON.stringify(String(check.expect))} ${ok ? "matched" : "no match"}`);
  },
  tool_result_ok(check, ctx) {
    const calls = resolveCalls(ctx.parsed?.toolCalls ?? [], check.name, check.regex);
    if (calls.length === 0) return result1(check, "fail", `no tool_use matching ${JSON.stringify(check.name)}`);
    const occ = check.occurrence ?? 1;
    const call = calls[occ - 1];
    if (!call) return result1(check, "fail", `occurrence ${occ} not found (${calls.length} call(s))`);
    if (call.status === null) return result1(check, "fail", `${call.name}#${occ} has no tool_result (session ended first?)`);
    const ok = call.status === "completed";
    return result1(check, ok ? "pass" : "fail", `${call.name ?? "?"}#${occ} result ${call.status}${ok ? "" : `: ${toText(call.error).slice(0, 160)}`}`);
  },
  text(check, ctx) {
    const op = check.op ?? "contains";
    const src = check.source ?? "final";
    let hay;
    if (src === "final") hay = ctx.parsed?.result?.text ?? (ctx.parsed?.texts.length ? ctx.parsed.texts[ctx.parsed.texts.length - 1] : null);
    else hay = ctx.parsed?.texts.join("\n") ?? null;
    if (hay === null || hay === undefined) return result1(check, "fail", `missing source "${src}"`);
    let ok;
    if (op === "contains") ok = hay.includes(check.expect);
    else if (op === "not_contains") ok = !hay.includes(check.expect);
    else ok = new RegExp(check.expect).test(hay);
    return result1(check, ok ? "pass" : "fail", `${op} ${JSON.stringify(check.expect)} on ${src} (${hay.length} chars)`);
  },
  permission_denials(check, ctx) {
    const denials = ctx.parsed?.result?.permissionDenials ?? [];
    if (check.op === "empty") {
      return result1(check, denials.length === 0 ? "pass" : "fail", `${denials.length} denial(s): ${denialsSummary(denials)}`);
    }
    const bad = denials.filter((d) => toText(d).includes(check.pattern));
    return result1(check, bad.length === 0 ? "pass" : "fail", `${bad.length} denial(s) containing ${JSON.stringify(check.pattern)}: ${denialsSummary(bad)}`);
  },
  subagent_by_type(check, ctx) {
    const byType = ctx.parsed?.result?.subagentStats?.by_type;
    if (!byType || typeof byType !== "object") return result1(check, "fail", "result.subagent_stats.by_type missing (no subagents spawned?)");
    const min = check.min ?? 1;
    const hits = Object.entries(byType).filter(([k]) => k.includes(check.agent));
    if (hits.length === 0) return result1(check, "fail", `by_type has no key containing ${JSON.stringify(check.agent)}: ${JSON.stringify(Object.keys(byType))}`);
    let total = 0, allNumeric = true;
    for (const [, v] of hits) {
      let n = NaN;
      if (typeof v === "number") n = v;
      else if (v && typeof v === "object") n = typeof v.spawned === "number" ? v.spawned : (typeof v.completed === "number" ? v.completed : NaN);
      if (Number.isFinite(n)) total += n; else allNumeric = false;
    }
    const count = allNumeric ? total : hits.length; // shape fallback: count matching keys
    const ok = count >= min;
    return result1(check, ok ? "pass" : "fail", `by_type keys containing ${JSON.stringify(check.agent)}: ${JSON.stringify(hits.map(([k, v]) => `${k}:${toText(v)}`))}; count ${count} vs min ${min}`);
  },
  file_exists(check, ctx) {
    const re = globToRegExp(check.pattern);
    const hit = walkDirFiles(ctx.projDir).filter((f) => re.test(f));
    return result1(check, hit.length > 0 ? "pass" : "fail", `${hit.length} file(s) matching ${JSON.stringify(check.pattern)}${hit.length ? `: ${hit.slice(0, 5).join(", ")}` : ""}`);
  },
  cli_output(check, ctx) {
    const hay = ctx.cliOutput ?? "";
    if (!hay) return result1(check, "fail", "no cli output captured");
    const ok = (check.op ?? "contains") === "regex" ? new RegExp(check.expect).test(hay) : hay.includes(check.expect);
    return result1(check, ok ? "pass" : "fail", `${check.op ?? "contains"} ${JSON.stringify(check.expect)} on cli output (${hay.length} chars)`);
  },
  group(check, ctx) {
    const hasAny = Array.isArray(check.anyOf);
    const arms = (hasAny ? check.anyOf : check.allOf).map((a) => evalCheck(a, ctx));
    const summary = arms.map((r, i) => `arm${i + 1}(${r.type})[${r.status}]`).join("; ");
    if (hasAny) {
      const idx = arms.findIndex((r) => r.status === "pass");
      if (idx !== -1) return { ...result1(check, "pass", `anyOf arm ${idx + 1} fired: ${summary}`), firedArm: idx + 1, arms };
      if (arms.every((r) => r.status === "error")) return { ...result1(check, "error", `anyOf all arms ERROR: ${summary}`), arms };
      return { ...result1(check, "fail", `anyOf: no arm matched: ${summary}`), arms };
    }
    if (arms.some((r) => r.status === "fail")) return { ...result1(check, "fail", `allOf failing arm(s): ${summary}`), arms };
    if (arms.some((r) => r.status === "error")) return { ...result1(check, "error", `allOf error arm(s): ${summary}`), arms };
    return { ...result1(check, "pass", `allOf matched: ${summary}`), arms };
  },
  rubric(check) {
    if (check.manual !== true) return result1(check, "error", "rubric requires manual: true");
    if (typeof check.flag !== "string" || !check.flag) return result1(check, "error", "rubric requires string flag");
    return { ...result1(check, "manual", `unadjudicated rubric flag: ${check.flag}`), flag: check.flag };
  },
};

function denialsSummary(denials) {
  return denials.slice(0, 5).map((d) => toText(d).slice(0, 80)).join(" | ") || "(none)";
}

function gradeRep(parsed, ctx, testCase) {
  const results = testCase.spec.checks.map((c) => evalCheck(c, ctx));
  const rubrics = results.filter((r) => r.status === "manual");
  let outcome, reason = null;
  if (parsed.parsedCount === 0) { outcome = "ERROR"; reason = "stream has no parseable NDJSON events"; }
  else if (!parsed.endsWithResult) { outcome = "ERROR"; reason = "no terminal result event in stream"; }
  else if (results.some((r) => r.status === "error")) { outcome = "ERROR"; reason = `${results.filter((r) => r.status === "error").length} check(s) ERROR`; }
  else if (results.some((r) => r.status === "fail")) { outcome = "FAIL"; }
  else { outcome = rubrics.length ? "PASS*" : "PASS"; }
  return { outcome, reason, results, rubrics };
}

/* ============================================================ drivers */

function substitute(s, repo, projDir) {
  return String(s).split("{REPO}").join(repo).split("{PROJECT_DIR}").join(projDir);
}

function sessionArgv({ repo, prompt, budgetUsd, permissionMode, model, extraArgs, withPluginDir }) {
  const argv = [];
  if (withPluginDir) argv.push("--plugin-dir", repo);
  argv.push("-p", prompt, "--output-format", "stream-json", "--verbose", "--no-session-persistence", "--max-budget-usd", String(budgetUsd));
  if (permissionMode) argv.push("--permission-mode", permissionMode);
  if (model) argv.push("--model", model);
  for (const a of extraArgs ?? []) argv.push(a);
  return argv;
}

/* ============================================================ resume + main */

function findResumeDir(caseEntry, rep) {
  const caseRuns = path.join(RUNS_DIR, caseEntry.dirName);
  let dirs = [];
  try { dirs = fs.readdirSync(caseRuns).sort().reverse(); } catch { return null; }
  for (const name of dirs) {
    const m = name.match(/^(\d{8}-\d{6})(?:-\d+)?-r(\d+)$/);
    if (!m || Number(m[2]) !== rep) continue;
    const dir = path.join(caseRuns, name);
    const stream = path.join(dir, "stream.jsonl");
    const resultFile = path.join(dir, "result.json");
    if (!fs.existsSync(stream) || !fs.existsSync(resultFile)) continue;
    const parsed = readStreamFile(stream);
    if (parsed?.endsWithResult) return dir;
  }
  return null;
}

function dropIncompleteRepDirs(caseEntry, rep) {
  const caseRuns = path.join(RUNS_DIR, caseEntry.dirName);
  let dirs = [];
  try { dirs = fs.readdirSync(caseRuns); } catch { return; }
  for (const name of dirs) {
    const m = name.match(/^(\d{8}-\d{6})(?:-\d+)?-r(\d+)$/);
    if (!m || Number(m[2]) !== rep) continue;
    const dir = path.join(caseRuns, name);
    const stream = path.join(dir, "stream.jsonl");
    const resultFile = path.join(dir, "result.json");
    const ok = (() => { const p = readStreamFile(stream); return !!(p?.endsWithResult); })() && fs.existsSync(resultFile);
    if (!ok) fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function runCaseRep(caseEntry, rep, args, killRegistry, keepConfig) {
  const caseRuns = path.join(RUNS_DIR, caseEntry.dirName);
  fs.mkdirSync(caseRuns, { recursive: true });
  dropIncompleteRepDirs(caseEntry, rep);
  const ts = timestampDirName();
  let runDir = path.join(caseRuns, `${ts}-r${rep}`);
  for (let k = 2; fs.existsSync(runDir); k++) runDir = path.join(caseRuns, `${ts}-${k}-r${rep}`);
  const projDir = path.join(runDir, "project");
  const cfgDir = path.join(runDir, "claude-config");
  fs.mkdirSync(projDir, { recursive: true });
  const repo = path.resolve(args.repo ?? DEFAULT_REPO);
  provisionConfigDir(cfgDir);
  const env = childEnv(cfgDir);
  const timeoutMs = args.timeout ?? caseEntry.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const logPath = path.join(runDir, "stream.jsonl");
  const cliLogPath = path.join(runDir, "install.log");
  let harnessError = null, timedOut = false;
  let parsed = null, ctx = null;

  try {
    if (caseEntry.driver === "cli") {
      const argv = caseEntry.spec.cliArgs.map((a) => substitute(a, repo, projDir));
      const r = await runCliStep({ claudeBin: args.claudeBin, argv, cwd: projDir, env, logPath: cliLogPath, timeoutMs, killRegistry });
      if (r.spawnError) harnessError = `spawn failed: ${r.spawnError.message}`;
      else if (r.timedOut) { timedOut = true; harnessError = "cli step timed out"; }
      parsed = cliParsed();
      ctx = { parsed, projDir, cliOutput: r.output };
    } else if (caseEntry.driver === "install") {
      const steps = [
        { argv: ["plugin", "validate", repo], expect: /Validation passed/i },
        { argv: ["plugin", "marketplace", "add", repo], expect: null },
        { argv: ["plugin", "install", "bioresearcher@bioresearcher-skills"], expect: null },
        { argv: ["plugin", "list"], expect: /bioresearcher/i },
      ];
      for (const step of steps) {
        const r = await runCliStep({ claudeBin: args.claudeBin, argv: step.argv, cwd: projDir, env, logPath: cliLogPath, timeoutMs, killRegistry });
        if (r.spawnError) throw new Error(`spawn failed (${step.argv.join(" ")}): ${r.spawnError.message}`);
        if (r.timedOut) { timedOut = true; throw new Error(`install step timed out (${step.argv.join(" ")})`); }
        if (r.code !== 0 || (step.expect && !step.expect.test(r.output))) {
          throw new Error(`install step failed (${step.argv.join(" ")}, exit=${r.code}); see ${path.relative(SUITE_ROOT, cliLogPath)}`);
        }
      }
      const prompt = substitute(caseEntry.spec.prompt ?? "Do not use any tools. Reply with exactly: OK", repo, projDir);
      const argv = sessionArgv({ repo, prompt, budgetUsd: caseEntry.budgetUsd, permissionMode: caseEntry.spec.permissionMode, model: args.model, extraArgs: caseEntry.spec.extraArgs, withPluginDir: false });
      const r = await runSession({ claudeBin: args.claudeBin, argv, cwd: projDir, env, logPath, timeoutMs, killRegistry });
      if (r.spawnError) harnessError = `spawn failed: ${r.spawnError.message}`;
      else if (r.timedOut) { timedOut = true; harnessError = "session timed out"; }
      parsed = readStreamFile(logPath) ?? parseStream("");
      ctx = { parsed, projDir };
    } else {
      const prompt = substitute(caseEntry.spec.prompt, repo, projDir);
      const argv = sessionArgv({ repo, prompt, budgetUsd: caseEntry.budgetUsd, permissionMode: caseEntry.spec.permissionMode, model: args.model, extraArgs: caseEntry.spec.extraArgs, withPluginDir: true });
      const r = await runSession({ claudeBin: args.claudeBin, argv, cwd: projDir, env, logPath, timeoutMs, killRegistry });
      if (r.spawnError) harnessError = `spawn failed: ${r.spawnError.message}`;
      else if (r.timedOut) { timedOut = true; harnessError = "session timed out"; }
      parsed = readStreamFile(logPath) ?? parseStream("");
      ctx = { parsed, projDir };
    }
  } catch (e) {
    harnessError = e.message;
    parsed = parsed ?? parseStream("");
    ctx = ctx ?? { parsed, projDir };
  }

  const graded = gradeRep(parsed, ctx, caseEntry);
  if (harnessError) {
    graded.outcome = "ERROR";
    graded.reason = harnessError;
  }
  if (timedOut) graded.reason = `${graded.reason ?? ""}${graded.reason ? "; " : ""}timed out at ${timeoutMs} ms`.replace(/^; /, "");
  const firedArms = [];
  for (const r of graded.results) if (r.firedArm) firedArms.push({ desc: r.desc, arm: r.firedArm });
  const resultPayload = {
    case: caseEntry.id, rep, runDir: path.relative(SUITE_ROOT, runDir),
    outcome: graded.outcome, reason: graded.reason,
    costUsd: parsed?.result?.totalCostUsd ?? null,
    durationIso: new Date().toISOString(),
    firedArms: firedArms.length ? firedArms : undefined,
    checks: graded.results, rubricFlags: graded.rubrics.map((r) => r.flag),
  };
  fs.writeFileSync(path.join(runDir, "result.json"), JSON.stringify(resultPayload, null, 2) + "\n");
  if (!keepConfig) fs.rmSync(cfgDir, { recursive: true, force: true });
  return resultPayload;
}

function captureProvenance(args) {
  const prov = {
    timestamp: new Date().toISOString(),
    gitCommit: null, claudeVersion: null, node: process.version,
    repo: path.resolve(args.repo ?? DEFAULT_REPO),
    hostSettingsSha256: null,
  };
  try {
    const g = spawnSync("git", ["rev-parse", "HEAD"], { cwd: prov.repo, encoding: "utf8", timeout: 15000 });
    if (g.status === 0) prov.gitCommit = g.stdout.trim();
  } catch {}
  try {
    const v = spawnSync(args.claudeBin, ["--version"], { encoding: "utf8", timeout: 30000 });
    if (v.status === 0) prov.claudeVersion = (v.stdout ?? "").trim().split(/\r?\n/)[0];
  } catch {}
  const hostSettings = path.join(process.env.HOME || "", ".claude", "settings.json");
  try {
    if (fs.existsSync(hostSettings)) {
      prov.hostSettingsSha256 = crypto.createHash("sha256").update(fs.readFileSync(hostSettings)).digest("hex");
    }
  } catch {}
  return prov;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return 0; }
  const cases = discoverCases();
  if (cases.length === 0) throw new HarnessError("no cases found under cases/");
  if (args.list) { printListTable(cases); return 0; }

  const badSchema = cases.filter((c) => c.error);
  if (badSchema.length && !args.only && !args.filter) {
    for (const c of badSchema) console.error(`FAIL schema [${c.id}]: ${c.error}`);
    return 2;
  }
  const sel = selectCases(cases, args);
  for (const c of sel.filter((c) => c.error)) console.error(`WARN schema [${c.id}]: ${c.error}`);

  if (args.dryRun) {
    console.log(`dry-run: ${sel.length} case(s) selected; drivers:`);
    for (const c of sel) {
      console.log(`- ${c.id} [${c.driver}] budget=$${c.budgetUsd} timeout=${c.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms checks=${c.error ? "INVALID" : c.spec.checks.length}${c.error ? ` (${c.error})` : ""}`);
    }
    console.log("dry-run never spawns claude and never reads ~/.claude.");
    return badSchema.some((c) => sel.includes(c)) ? 2 : 0;
  }

  const killRegistry = new Set();
  let interrupted = false;
  const onInt = () => {
    interrupted = true;
    for (const pid of killRegistry) { try { process.kill(-pid, "SIGKILL"); } catch {} }
    process.exitCode = 2;
  };
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onInt);

  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const provenance = captureProvenance(args);
  fs.writeFileSync(path.join(RUNS_DIR, "provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
  console.log(`claude ${provenance.claudeVersion ?? "?"} | repo ${provenance.gitCommit ?? "?"} | host settings ${provenance.hostSettingsSha256 ? "copied (sha256 recorded)" : "NOT FOUND"}`);

  const summary = [];
  for (const c of sel) {
    if (interrupted) { summary.push({ case: c.id, outcome: "INTERRUPTED" }); continue; }
    if (c.error) { summary.push({ case: c.id, outcome: "ERROR", reason: `schema: ${c.error}` }); continue; }
    for (let rep = 1; rep <= args.reps; rep++) {
      const resume = !args.force ? findResumeDir(c, rep) : null;
      let payload;
      if (resume) {
        payload = JSON.parse(fs.readFileSync(path.join(resume, "result.json"), "utf8"));
        payload.reused = true;
        console.log(`== ${c.id} r${rep}: reused ${path.relative(SUITE_ROOT, resume)}`);
      } else {
        payload = await runCaseRep(c, rep, args, killRegistry, args.keepConfig);
      }
      summary.push({ case: c.id, rep, outcome: payload.outcome, reason: payload.reason ?? null, costUsd: payload.costUsd });
      const cost = payload.costUsd == null ? "" : ` $${payload.costUsd.toFixed(3)}`;
      console.log(`== ${c.id} r${rep}: ${payload.outcome}${cost}${payload.reason ? ` — ${payload.reason}` : ""}`);
      if (interrupted) break;
    }
  }
  fs.writeFileSync(path.join(RUNS_DIR, "summary.json"), JSON.stringify({ provenance, results: summary }, null, 2) + "\n");
  const failing = summary.filter((s) => s.outcome === "FAIL").length;
  const errored = summary.filter((s) => s.outcome === "ERROR" || s.outcome === "INTERRUPTED").length;
  console.log(`summary: ${summary.length} rep(s); ${failing} FAIL, ${errored} ERROR/INTERRUPTED (see .runs/summary.json)`);
  return errored ? 2 : failing ? 1 : 0;
}

main().then(
  (code) => process.exit(code ?? 0),
  (e) => {
    if (e instanceof UsageError) { console.error(e.message); console.error(usage()); process.exit(2); }
    console.error(e instanceof HarnessError ? `ERROR: ${e.message}` : (e?.stack ?? e));
    process.exit(2);
  },
);

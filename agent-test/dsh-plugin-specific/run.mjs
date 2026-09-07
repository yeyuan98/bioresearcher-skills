#!/usr/bin/env node
/*
 * agent-test/dsh-plugin-specific/run.mjs — empirical test runner for
 * the bioresearcher DeepSeek Harness (dsh) connector/plugin.
 *
 * Zero-dependency plain ESM (node:stdlib only).
 *
 * CI Mode (Hermetic):
 *   node agent-test/dsh-plugin-specific/run.mjs --list
 *   node agent-test/dsh-plugin-specific/run.mjs --dry-run
 *
 * Live Mode (requires dsh and pnpm on PATH):
 *   node agent-test/dsh-plugin-specific/run.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const SUITE_ROOT = path.dirname(path.resolve(process.argv[1]));
const CASES_DIR = path.join(SUITE_ROOT, "cases");
const RUNS_DIR = path.join(SUITE_ROOT, ".runs");
const ROOT = path.resolve(SUITE_ROOT, "..", "..");

function parseArgs(argv) {
  const a = {
    only: null,
    filter: null,
    dshBin: "dsh",
    dryRun: false,
    list: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    switch (t) {
      case "--only": a.only = argv[++i]; break;
      case "--filter": a.filter = argv[++i]; break;
      case "--dsh": a.dshBin = argv[++i]; break;
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
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function evaluateChecks(checks, rawOutput, json) {
  const output = stripAnsi(rawOutput);
  const results = [];
  for (const c of checks) {
    if (c.type === "cli_output") {
      if (c.op === "contains") {
        const pass = output.includes(c.expect);
        results.push({ desc: c.desc, pass, detail: pass ? "matched" : `expected to contain "${c.expect}"` });
      } else if (c.op === "regex") {
        const re = new RegExp(c.expect, "i");
        const pass = re.test(output);
        results.push({ desc: c.desc, pass, detail: pass ? "matched" : `expected to match regex /${c.expect}/` });
      }
    } else if (c.type === "json_path") {
      if (!json) {
        results.push({ desc: c.desc, pass: false, detail: "output is not valid JSON" });
        continue;
      }
      const parts = c.path.split(".");
      let cur = json;
      for (const p of parts) {
        cur = cur?.[p];
      }
      const pass = cur === c.expect;
      results.push({ desc: c.desc, pass, detail: pass ? `got ${JSON.stringify(cur)}` : `expected ${JSON.stringify(c.expect)}, got ${JSON.stringify(cur)}` });
    }
  }
  return results;
}

async function runContractCase(c, stageDir) {
  if (c.id === "plugin-skills-discovery") {
    const bundlePath = path.join(stageDir, "bioresearcher", "skill-bundle.json");
    const skillsDir = path.join(stageDir, "bioresearcher", "skills");
    if (!fs.existsSync(bundlePath) || !fs.existsSync(skillsDir)) {
      return "FAIL missing bundle files";
    }
    const bundle = JSON.parse(fs.readFileSync(bundlePath, "utf8")).skills || [];
    return bundle.join(" ");
  }
  if (c.id === "plugin-subagent-worker") {
    const promptPath = path.join(stageDir, "bioresearcher", "agents", "bioresearcher-dr-worker.md");
    if (!fs.existsSync(promptPath)) return "FAIL missing agent prompt";
    const raw = fs.readFileSync(promptPath, "utf8");
    const replaced = raw.replaceAll("${CLAUDE_PLUGIN_ROOT}", path.join(stageDir, "bioresearcher"));
    return replaced;
  }
  return "";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = loadCases();

  if (args.help) {
    console.log("Usage: node run.mjs [--list] [--dry-run] [--only <id>] [--filter <glob>] [--dsh <bin>]");
    process.exit(0);
  }

  if (args.list) {
    console.log(`Discovered ${cases.length} case(s):`);
    for (const c of cases) {
      console.log(`  [${c.level || "L0"}] ${c.id.padEnd(26)} ${c.purpose || c.name}`);
    }
    process.exit(0);
  }

  if (args.dryRun) {
    console.log(`ok dry-run: validated ${cases.length} case definition(s)`);
    for (const c of cases) {
      if (!c.id || !c.checks || !Array.isArray(c.checks)) {
        console.error(`FAIL case ${c.id} missing id or checks array`);
        process.exit(1);
      }
    }
    process.exit(0);
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

  // Verify dsh binary exists for live execution
  const checkDsh = spawnSync(args.dshBin, ["--version"], { encoding: "utf8" });
  if (checkDsh.error || checkDsh.status !== 0) {
    console.error(`ERROR: dsh binary "${args.dshBin}" not available or failed: ${checkDsh.error?.message || checkDsh.stderr}`);
    process.exit(2);
  }

  const checkPnpm = spawnSync("pnpm", ["--version"], { encoding: "utf8" });
  if (checkPnpm.error || checkPnpm.status !== 0) {
    console.error(`ERROR: pnpm binary not available or failed: ${checkPnpm.error?.message || checkPnpm.stderr}`);
    process.exit(2);
  }

  console.log(`Running ${selected.length} DeepSeek Harness empirical test case(s)...`);

  // Build connector into isolated staging directory
  const testStage = path.join(RUNS_DIR, ".stage");
  fs.rmSync(testStage, { recursive: true, force: true });
  fs.mkdirSync(testStage, { recursive: true });

  const buildResult = spawnSync("node", [path.join(ROOT, "scripts", "ci", "build-connector-dsh.mjs"), "--out", testStage], {
    encoding: "utf8",
    cwd: ROOT,
  });
  if (buildResult.status !== 0) {
    console.error(`ERROR building connector for tests:\n${buildResult.stderr}`);
    process.exit(2);
  }

  // Setup isolated DSH home
  const dshHome = path.join(RUNS_DIR, "dsh-home");
  const pnpmHome = path.join(RUNS_DIR, "pnpm-home");
  const pnpmStore = path.join(RUNS_DIR, "pnpm-store");
  fs.rmSync(dshHome, { recursive: true, force: true });
  fs.mkdirSync(path.join(dshHome, "profiles", "headless"), { recursive: true });
  fs.mkdirSync(pnpmHome, { recursive: true });
  fs.mkdirSync(pnpmStore, { recursive: true });

  const env = {
    ...process.env,
    DSH_HOME: dshHome,
    PNPM_HOME: pnpmHome,
    npm_config_store_dir: pnpmStore,
  };

  // Install the staged bundle into the isolated headless profile
  const tarball = path.join(testStage, `bioresearcher-connector_dsh-v${JSON.parse(fs.readFileSync(path.join(ROOT, "connector", "dsh", "package.json"), "utf8")).version}.tar.gz`);
  const installRes = spawnSync(args.dshBin, ["plugin", "--profile", "headless", "add", tarball], {
    cwd: testStage,
    env,
    encoding: "utf8",
  });
  if (installRes.status !== 0) {
    console.warn(`dsh plugin add failed: ${installRes.stderr}`);
  }

  let failed = 0;
  for (const c of selected) {
    process.stdout.write(`  ${c.id.padEnd(28)} ... `);
    let output = "";

    if (c.driver === "contract") {
      output = await runContractCase(c, testStage);
    } else {
      const cliArgs = c.cliArgs || ["--profile", "headless", "--dump-config"];
      const res = spawnSync(args.dshBin, cliArgs, {
        cwd: testStage,
        timeout: c.timeoutMs || 30000,
        env,
        encoding: "utf8",
      });
      output = (res.stdout || "") + "\n" + (res.stderr || "");
    }

    let json = null;
    try {
      json = JSON.parse(output);
    } catch {}

    const results = evaluateChecks(c.checks, output, json);
    const pass = results.every((r) => r.pass);

    if (pass) {
      console.log("PASS");
    } else {
      console.log("FAIL");
      failed++;
      for (const r of results.filter((r) => !r.pass)) {
        console.log(`    - ${r.desc}: ${r.detail}`);
      }
    }
  }

  // Clean up stage if not debugging
  fs.rmSync(testStage, { recursive: true, force: true });
  fs.rmSync(dshHome, { recursive: true, force: true });
  fs.rmSync(pnpmHome, { recursive: true, force: true });
  fs.rmSync(pnpmStore, { recursive: true, force: true });

  console.log(`\nResults: ${selected.length - failed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Harness error:", err);
  process.exit(2);
});

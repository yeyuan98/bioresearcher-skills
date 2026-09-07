#!/usr/bin/env node
/*
 * agent-test/opencode-plugin-specific/run.mjs — empirical test runner for
 * the bioresearcher OpenCode connector/plugin.
 *
 * Zero-dependency plain ESM (node:stdlib only).
 *
 * CI Mode (Hermetic):
 *   node agent-test/opencode-plugin-specific/run.mjs --list
 *   node agent-test/opencode-plugin-specific/run.mjs --dry-run
 *
 * Live Mode (requires opencode binary on PATH):
 *   node agent-test/opencode-plugin-specific/run.mjs
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
      console.log(`  [${c.level || "L0"}] ${c.id.padEnd(24)} ${c.purpose || c.name}`);
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

  // Verify opencode binary exists
  const checkBin = spawnSync(args.opencodeBin, ["--version"], { encoding: "utf8" });
  if (checkBin.error || checkBin.status !== 0) {
    console.error(`ERROR: opencode binary "${args.opencodeBin}" not available or failed: ${checkBin.error?.message || checkBin.stderr}`);
    process.exit(2);
  }

  console.log(`Running ${selected.length} OpenCode empirical test case(s)...`);

  // Build connector to a temporary directory
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

  // Setup isolated test workspace
  const workspaceDir = path.join(RUNS_DIR, "workspace");
  fs.rmSync(workspaceDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(workspaceDir, ".opencode", "plugins"), { recursive: true });
  spawnSync("git", ["init"], { cwd: workspaceDir });

  // Copy built bioresearcher plugin package into workspace
  fs.cpSync(path.join(testStage, "bioresearcher"), path.join(workspaceDir, ".opencode", "plugins", "bioresearcher"), { recursive: true });
  fs.cpSync(path.join(testStage, "bioresearcher", "loader.js"), path.join(workspaceDir, ".opencode", "plugins", "bioresearcher.js"));

  let failed = 0;
  const outLogDir = path.join(RUNS_DIR, "logs");
  fs.mkdirSync(outLogDir, { recursive: true });

  for (const c of selected) {
    process.stdout.write(`  ${c.id.padEnd(28)} ... `);
    const cliArgs = c.cliArgs || ["debug", "config"];
    
    // Bun unflushed stdout workaround: execute with shell redirect to file outside workspace
    const tmpOut = path.join(outLogDir, `${c.id}.txt`);
    const escapedArgs = cliArgs.map((a) => (/[ \t\n"$`\\]/.test(a) ? JSON.stringify(a) : a)).join(" ");
    const cmd = `${args.opencodeBin} ${escapedArgs} > "${tmpOut}" 2>&1`;
    spawnSync("sh", ["-c", cmd], {
      cwd: workspaceDir,
      timeout: c.timeoutMs || 30000,
      env: { ...process.env, OPENCODE_DISABLE_PROJECT_CONFIG: "0" },
    });

    const combinedOutput = fs.existsSync(tmpOut) ? fs.readFileSync(tmpOut, "utf8") : "";
    let json = null;
    try {
      json = JSON.parse(combinedOutput);
    } catch {}

    const results = evaluateChecks(c.checks, combinedOutput, json);
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

  console.log(`\nResults: ${selected.length - failed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Harness error:", err);
  process.exit(2);
});

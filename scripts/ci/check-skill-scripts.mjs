#!/usr/bin/env node
// Skill python-script health gate. Zero deps.
// Runs the hermetic selftest of evidence-ledger.py plus a vet-references.py
// --help smoke test. Graceful skip (ok, not fail) when python3 is absent so
// local checks on minimal dev boxes still pass; CI provisions python 3.13 so
// the skip branch never triggers there. Any non-zero exit from the scripts
// FAILS this gate (only ENOENT on the python3 binary itself skips).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const SCRIPTS = join(ROOT, "skills", "bioresearcher-deep-research", "scripts");

const checks = [
  { name: "evidence-ledger selftest", args: [join(SCRIPTS, "evidence-ledger.py"), "selftest"] },
  { name: "vet-references --help smoke", args: [join(SCRIPTS, "vet-references.py"), "--help"] },
];

let failures = 0;
for (const check of checks) {
  if (!existsSync(check.args[0])) {
    console.error(`fail ${check.name}: ${check.args[0]} missing`);
    failures++;
    continue;
  }
  const res = spawnSync("python3", check.args, { encoding: "utf8", timeout: 120000 });
  if (res.error && res.error.code === "ENOENT") {
    console.log(`skip ${check.name}: python3 not on PATH (CI provisions it; local skip)`);
    continue;
  }
  if (res.status !== 0) {
    console.error(`fail ${check.name}: exit ${res.status}`);
    if (res.stdout) console.error(String(res.stdout).trim());
    if (res.stderr) console.error(String(res.stderr).trim());
    failures++;
    continue;
  }
  const out = String(res.stdout || "");
  if (check.name.includes("selftest")) {
    // FAIL lines print BEFORE the summary banner; the exit code is the primary
    // guard, these checks catch an exit-0-with-failures regression directly.
    if (/^FAIL /m.test(out)) {
      console.error(`fail ${check.name}: FAIL line present in selftest output`);
      console.error(out.trim());
      failures++;
      continue;
    }
    if (!/\[evidence-ledger\] selftest: \d+\/\d+ group\(s\) passed/.test(out)) {
      console.error(`fail ${check.name}: completion banner not found`);
      console.error(out.trim());
      failures++;
      continue;
    }
  }
  console.log(`ok   ${check.name}`);
}

if (failures) {
  console.error(`check-skill-scripts: ${failures} failure(s)`);
  process.exit(1);
}
console.log("check-skill-scripts: all green");

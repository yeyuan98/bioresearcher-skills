#!/usr/bin/env node
// General npm package publisher for bioresearcher-skills connectors/plugins. Zero deps.
// Supports both OIDC Trusted Publishing (preferred) and ambient token fallback.
//
// Usage: node scripts/ci/publish-npm.mjs <target-dir> [--dry-run]
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const target = args.find((a) => !a.startsWith("-"));

if (!target) {
  console.error("Usage: node scripts/ci/publish-npm.mjs <target-dir> [--dry-run]");
  process.exit(2);
}

const dir = resolve(process.cwd(), target);
const pkgPath = join(dir, "package.json");

if (!existsSync(pkgPath)) {
  console.error(`FAIL: No package.json found at ${pkgPath}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const { name, version } = pkg;
if (!name || !version) {
  console.error("FAIL: package.json missing name or version");
  process.exit(1);
}

console.log(`Checking publication status for ${name}@${version}...`);

let alreadyPublished = false;
try {
  const stdout = execFileSync("npm", ["view", `${name}@${version}`, "version"], {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  if (stdout === version) {
    alreadyPublished = true;
  }
} catch (err) {
  // Exit code non-zero: package or version doesn't exist (E404), which is expected for new releases
  const stderr = err.stderr ? err.stderr.toString() : "";
  if (!stderr.includes("E404") && !stderr.includes("404") && !stderr.includes("Not Found")) {
    console.warn(`npm view returned non-404 diagnostic (proceeding with publish): ${stderr.trim()}`);
  }
}

if (alreadyPublished) {
  console.log(`ok   ${name}@${version} is already published on npm. Skipping.`);
  process.exit(0);
}

console.log(`Publishing ${name}@${version} from ${dir} (dry-run: ${dryRun})...`);
const publishArgs = ["publish", dir, "--access", "public"];
if (dryRun) {
  publishArgs.push("--dry-run");
}
if (process.env.GITHUB_ACTIONS === "true" && !dryRun) {
  publishArgs.push("--provenance");
}

try {
  execFileSync("npm", publishArgs, {
    stdio: "inherit",
    env: process.env,
  });
  console.log(`ok   Successfully published ${name}@${version}`);
} catch (err) {
  console.error(`FAIL: Failed to publish ${name}@${version}`);
  process.exit(1);
}

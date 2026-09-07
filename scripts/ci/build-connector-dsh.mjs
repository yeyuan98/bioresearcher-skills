#!/usr/bin/env node
// DeepSeek Harness (dsh) connector/plugin bundle builder. Zero deps.
// Stages connector/dsh/ + bundled skills + dr-worker agent into <out>/bioresearcher/,
// validates the whole bundle, and writes a reproducible
// bioresearcher-connector_dsh-v<VERSION>.tar.gz next to the staging dir.
// Repo sources are never modified.
//
// Usage: node scripts/ci/build-connector-dsh.mjs [--out DIR]   (DIR defaults to dist/)
// Needs GNU tar + gzip on PATH (macOS bsdtar lacks the reproducibility flags).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const FLAVOR = join(ROOT, "connector", "dsh");
let failures = 0;
const fail = (msg) => { console.error(`FAIL ${msg}`); failures++; };
const ok = (msg) => console.log(`ok   ${msg}`);
const warn = (msg) => console.warn(`warn ${msg}`);

let outDir = "dist";
{
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out") {
      const v = args[i + 1];
      if (!v || v.startsWith("-")) { console.error("--out requires a value"); process.exit(2); }
      outDir = v;
      i++;
    } else { console.error(`unknown arg: ${args[i]}`); process.exit(2); }
  }
}
if (resolve(outDir) === "/") { console.error("refusing --out /"); process.exit(2); }

// --- repo inputs -----------------------------------------------------------
const version = readFileSync(join(ROOT, "VERSION"), "utf8").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) { fail(`VERSION "${version}" not semver`); process.exit(1); }

const meta = JSON.parse(readFileSync(join(FLAVOR, "connector-meta.json"), "utf8"));
if (meta.version !== version) fail(`connector-meta.json version ${meta.version} != VERSION ${version}`);
else ok(`connector-meta.json version == VERSION (${version})`);

if (meta.harness !== "dsh") fail(`connector-meta.json harness "${meta.harness}" != "dsh"`);
else ok('connector-meta.json harness == "dsh"');

const pkg = JSON.parse(readFileSync(join(FLAVOR, "package.json"), "utf8"));
if (pkg.version !== version) fail(`package.json version ${pkg.version} != VERSION ${version}`);
else ok(`package.json version == VERSION (${version})`);

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
if (!KEBAB.test(meta.source ?? "")) fail(`meta.source "${meta.source}" not kebab-case`);

if (failures) { console.error("validation failed before staging"); process.exit(1); }

// --- bundle manifest --------------------------------------------------------
const bundleFile = JSON.parse(readFileSync(join(FLAVOR, "skill-bundle.json"), "utf8"));
const bundle = bundleFile.skills ?? [];
if (!Array.isArray(bundle) || bundle.length === 0) fail("skill-bundle.json .skills empty");

const skillsDir = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const name of bundle) {
  if (!skillsDir.includes(name)) fail(`skill-bundle.json key "${name}" has no skills/ directory`);
}
for (const name of skillsDir.filter((n) => !bundle.includes(n))) {
  if (bundleFile.excluded?.[name]) {
    ok(`skills/${name} excluded intentionally (${bundleFile.excluded[name]})`);
  } else {
    warn(`skills/${name} not bundled into the dsh connector (intentional? document in skill-bundle.json)`);
  }
}
ok(`bundle manifest: ${bundle.length} skill(s): ${bundle.join(", ")}`);

// --- agent check -----------------------------------------------------------
const agentSrc = join(ROOT, ".claude-plugin", "agents", "bioresearcher-dr-worker.md");
if (!existsSync(agentSrc)) fail(`expected agent prompt file missing at ${agentSrc}`);
else ok("dr-worker subagent source present");

if (failures) { console.error("validation failed before staging"); process.exit(1); }

// --- stage -------------------------------------------------------------------
const stageRoot = resolve(ROOT, outDir);
const stage = join(stageRoot, "bioresearcher");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const f of ["package.json", "connector-meta.json", "index.js", "cordis.patch.yml", "skill-bundle.json"]) {
  cpSync(join(FLAVOR, f), join(stage, f));
}

if (existsSync(join(ROOT, "LICENSE"))) {
  cpSync(join(ROOT, "LICENSE"), join(stage, "LICENSE"));
}
if (existsSync(join(FLAVOR, "README.md"))) {
  cpSync(join(FLAVOR, "README.md"), join(stage, "README.md"));
} else if (existsSync(join(ROOT, "docs", "connector-dsh.md"))) {
  cpSync(join(ROOT, "docs", "connector-dsh.md"), join(stage, "README.md"));
}

mkdirSync(join(stage, "agents"), { recursive: true });
cpSync(agentSrc, join(stage, "agents", "bioresearcher-dr-worker.md"));

// Local-build hygiene: never package editor/interpreter droppings
const JUNK = /(^|\/)(__pycache__|\.DS_Store|\.ipynb_checkpoints|Thumbs\.db)(\/|$)|\.pyc$/;
for (const name of bundle) {
  cpSync(join(ROOT, "skills", name), join(stage, "skills", name), { recursive: true, filter: (p) => !JUNK.test(p) });
  const p = join(stage, "skills", name, "SKILL.md");
  const text = readFileSync(p, "utf8");
  if (text.includes("\r\n")) fail(`${name}: staged SKILL.md uses CRLF line endings`);
}

// --- packaged-tree sanity ------------------------------------------------------
JSON.parse(readFileSync(join(stage, "connector-meta.json"), "utf8"));
JSON.parse(readFileSync(join(stage, "package.json"), "utf8"));
if (!existsSync(join(stage, "index.js"))) fail("staged bundle missing index.js");
if (!existsSync(join(stage, "cordis.patch.yml"))) fail("staged bundle missing cordis.patch.yml");
if (!existsSync(join(stage, "skill-bundle.json"))) fail("staged bundle missing skill-bundle.json");
if (!existsSync(join(stage, "agents", "bioresearcher-dr-worker.md"))) fail("staged bundle missing dr-worker agent");

for (const name of bundle) {
  if (!existsSync(join(stage, "skills", name, "SKILL.md"))) fail(`staged bundle missing skills/${name}/SKILL.md`);
}
if (failures) { console.error("staging failed; no tarball written"); process.exit(1); }

// --- reproducible tar ----------------------------------------------------------
const tarball = join(stageRoot, `bioresearcher-connector_dsh-v${version}.tar.gz`);
const tarPath = `${tarball.slice(0, -3)}.tar`;
execFileSync("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-cf", tarPath, "-C", stageRoot, "bioresearcher"]);
writeFileSync(tarball, execFileSync("gzip", ["-n", "-9", "-c", tarPath], { maxBuffer: 1 << 26 }));
rmSync(tarPath);
execFileSync("gzip", ["-t", tarball]);
const tarBytes = readFileSync(tarball);
const sha256 = createHash("sha256").update(tarBytes).digest("hex");
ok(`tarball ${join(outDir, `bioresearcher-connector_dsh-v${version}.tar.gz`)}`);
console.log(`     ${tarBytes.length} bytes  sha256=${sha256}`);
ok(`staged at ${join(outDir, "bioresearcher")}/ (root dir inside the tarball)`);

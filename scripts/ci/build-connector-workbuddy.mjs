#!/usr/bin/env node
// WorkBuddy connector bundle builder. Zero deps.
// Stages connector/workbuddy/ + the bundled skills into <out>/bioresearcher/,
// augments ONLY the staged SKILL.md frontmatter with the WorkBuddy-required
// keys (description_zh, description_en, version, author), validates the whole
// bundle, and writes a reproducible
// bioresearcher-connector_workbuddy-v<VERSION>.tar.gz next to the staging dir.
// Repo sources are never modified (strict-6 frontmatter lint stays green).
//
// Usage: node scripts/ci/build-connector-workbuddy.mjs [--out DIR]   (DIR defaults to dist/)
// Needs GNU tar + gzip on PATH (macOS bsdtar lacks the reproducibility flags).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const FLAVOR = join(ROOT, "connector", "workbuddy");
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

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
if (!KEBAB.test(meta.source ?? "")) fail(`meta.source "${meta.source}" not kebab-case`);
const len = (s) => (s ?? "").length;
// WorkBuddy's advisory is 20-100 字 for descriptions; zh is held to it, while
// en prose realistically needs more headroom (deliberate deviation).
for (const [field, lo, hi] of [["description", 20, 200], ["description_zh", 20, 100], ["description_en", 20, 200]]) {
  if (len(meta[field]) < lo || len(meta[field]) > hi) fail(`meta.${field} length ${len(meta[field])} outside ${lo}-${hi}`);
}
for (const field of ["examples_zh", "examples_en"]) {
  const ex = meta[field];
  if (!Array.isArray(ex) || ex.length < 2 || ex.length > 5 || ex.some((e) => !String(e).trim())) {
    fail(`meta.${field} must be 2-5 non-empty strings`);
  }
}

const mcp = JSON.parse(readFileSync(join(FLAVOR, "mcp.json"), "utf8"));
const servers = Object.keys(mcp.mcpServers ?? {});
if (servers.length !== 1) fail(`mcp.json must configure exactly one server, found ${servers.length}`);
else ok(`mcp.json single server "${servers[0]}"`);
if (failures) { console.error("validation failed before staging"); process.exit(1); }

// --- icon ------------------------------------------------------------------
if (existsSync(join(FLAVOR, "icon.jpg"))) {
  fail("legacy icon.jpg detected in connector/workbuddy/; WorkBuddy audit rule F4 strictly requires icon.png or icon.svg");
}
const ICONS = ["icon.png", "icon.svg"];
const present = ICONS.filter((f) => existsSync(join(FLAVOR, f)));
if (present.length !== 1) fail(`exactly one icon file expected in connector/workbuddy/ (icon.png or icon.svg), found: ${present.join(", ") || "none"}`);
const icon = present[0];
if (icon === "icon.png") {
  const buf = readFileSync(join(FLAVOR, icon));
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(pngMagic)) fail(`${icon}: missing PNG magic signature`);
  if (buf.length < 24 || buf.subarray(12, 16).toString("ascii") !== "IHDR") fail(`${icon}: missing IHDR chunk header`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width !== 512 || height !== 512) fail(`${icon}: dimensions ${width}x${height} != 512x512`);
  if (buf.length < 1024 || buf.length > 500 * 1024) fail(`${icon}: ${buf.length} bytes outside 1KB-500KB`);
  ok(`${icon} 512x512, PNG magic+IHDR+size valid (${buf.length} bytes)`);
} else if (icon === "icon.svg") {
  const str = readFileSync(join(FLAVOR, icon), "utf8");
  if (!str.includes("<svg") || !str.includes("</svg>")) fail(`${icon}: invalid SVG content`);
  if (str.length < 100 || str.length > 200 * 1024) fail(`${icon}: SVG size ${str.length} bytes outside 100B-200KB`);
  ok(`${icon} SVG content valid (${str.length} bytes)`);
}
if (failures) { console.error("validation failed before staging"); process.exit(1); }

// --- bundle manifest (locales) ----------------------------------------------
const localesFile = JSON.parse(readFileSync(join(FLAVOR, "skill-locales.json"), "utf8"));
const locales = localesFile.skills ?? {};
const bundle = Object.keys(locales);
if (bundle.length === 0) fail("skill-locales.json .skills empty");
const skillsDir = readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const name of bundle) {
  const zh = locales[name]?.description_zh;
  if (typeof zh !== "string" || !zh.trim()) fail(`skill-locales.json ${name}: description_zh missing/empty`);
  else if (zh.length > 500) fail(`skill-locales.json ${name}: description_zh ${zh.length} > 500 chars`);
  if (!skillsDir.includes(name)) fail(`skill-locales.json key "${name}" has no skills/ directory`);
}
for (const name of skillsDir.filter((n) => !bundle.includes(n))) warn(`skills/${name} not bundled into the WorkBuddy connector (intentional? document in docs/connector-workbuddy.md)`);
ok(`bundle manifest: ${bundle.length} skill(s): ${bundle.join(", ")}`);

const plugin = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
const author = plugin.author?.name;
if (!author) fail("plugin.json author.name required (staged skill frontmatter)");
const registry = JSON.parse(readFileSync(join(ROOT, "skills.json"), "utf8"));
const regVersion = Object.fromEntries(registry.skills.map((s) => [s.name, s.version]));
for (const name of bundle) if (!regVersion[name]) fail(`skills.json has no version for bundled skill "${name}"`);
if (failures) { console.error("validation failed before staging"); process.exit(1); }

// --- stage -------------------------------------------------------------------
const stageRoot = resolve(ROOT, outDir);
const stage = join(stageRoot, "bioresearcher");
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const f of ["connector-meta.json", "mcp.json", icon]) cpSync(join(FLAVOR, f), join(stage, f));

// YAML double-quoted scalar, escaped so the value can never fold lines or
// leak control characters into the frontmatter.
const YAML_ESCAPES = { "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" };
const yamlQuote = (s) => `"${String(s).replace(/[\\"\n\r\t\u0000-\u001f]/g, (c) => YAML_ESCAPES[c] ?? `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)}"`;
// Local-build hygiene: never package editor/interpreter droppings that
// .gitignore excludes (clean CI checkouts never have them anyway).
const JUNK = /(^|\/)(\.git|\.env|__pycache__|\.DS_Store|\.ipynb_checkpoints|node_modules|Thumbs\.db)(\/|$)|\.(pyc|swp|tmp)$/;
for (const name of bundle) {
  cpSync(join(ROOT, "skills", name), join(stage, "skills", name), { recursive: true, filter: (p) => !JUNK.test(p) });
  const p = join(stage, "skills", name, "SKILL.md");
  const text = readFileSync(p, "utf8");
  if (text.includes("\r\n")) { fail(`${name}: staged SKILL.md uses CRLF line endings`); continue; }
  const fm = text.match(/^---\n(.*?\n)---\n/s);
  if (!fm) { fail(`${name}: staged SKILL.md frontmatter not found`); continue; }
  const dm = fm[1].match(/^description:[ \t]*(.+)$/m);
  if (!dm) { fail(`${name}: frontmatter description line not found`); continue; }
  let desc;
  try { desc = JSON.parse(dm[1].trim()); } catch { fail(`${name}: description is not a single-line double-quoted value`); continue; }
  const add = [
    `description_zh: ${yamlQuote(locales[name].description_zh)}`,
    `description_en: ${yamlQuote(desc)}`,
    `version: ${yamlQuote(regVersion[name])}`,
    `author: ${yamlQuote(author)}`,
  ].join("\n");
  const stagedText = `---\n${fm[1]}${add}\n---\n${text.slice(fm[0].length)}`;
  writeFileSync(p, stagedText);
  const stagedFm = stagedText.match(/^---\n(.*?\n)---\n/s)?.[1] ?? "";
  for (const key of ["description_zh", "description_en", "version", "author"]) {
    if (!new RegExp(`^${key}: `, "m").test(stagedFm)) fail(`${name}: staged frontmatter missing ${key}`);
  }
}

// --- packaged-tree sanity ------------------------------------------------------
JSON.parse(readFileSync(join(stage, "connector-meta.json"), "utf8"));
JSON.parse(readFileSync(join(stage, "mcp.json"), "utf8"));
if (!existsSync(join(stage, "icon.png")) && !existsSync(join(stage, "icon.svg"))) {
  fail("staged root missing icon.png or icon.svg (WorkBuddy rubric F4)");
}
if (existsSync(join(stage, "icon.jpg"))) {
  fail("staged root contains forbidden icon.jpg");
}
for (const name of bundle) {
  if (!existsSync(join(stage, "skills", name, "SKILL.md"))) fail(`staged bundle missing skills/${name}/SKILL.md`);
}
if (failures) { console.error("staging failed; no tarball written"); process.exit(1); }

// --- reproducible tar ----------------------------------------------------------
// tar and gzip run as separate processes so each failure is fatal on its own
// (a `tar | gzip` shell pipeline would mask tar's exit status).
const tarball = join(stageRoot, `bioresearcher-connector_workbuddy-v${version}.tar.gz`);
const tarPath = `${tarball.slice(0, -3)}.tar`;
execFileSync("tar", ["--sort=name", "--mtime=@0", "--owner=0", "--group=0", "--numeric-owner", "-cf", tarPath, "-C", stageRoot, "bioresearcher"]);
writeFileSync(tarball, execFileSync("gzip", ["-n", "-9", "-c", tarPath], { maxBuffer: 1 << 26 }));
rmSync(tarPath);
execFileSync("gzip", ["-t", tarball]);
const entries = execFileSync("tar", ["-tf", tarball], { encoding: "utf8" }).trim().split("\n");
if (!entries.includes("bioresearcher/icon.png") && !entries.includes("bioresearcher/icon.svg")) {
  fail("tarball missing root icon: bioresearcher/icon.png or bioresearcher/icon.svg");
}
if (entries.includes("bioresearcher/icon.jpg")) {
  fail("tarball contains forbidden bioresearcher/icon.jpg");
}
const tarBytes = readFileSync(tarball);
const sha256 = createHash("sha256").update(tarBytes).digest("hex");
ok(`tarball ${join(outDir, `bioresearcher-connector_workbuddy-v${version}.tar.gz`)}`);
console.log(`     ${tarBytes.length} bytes  sha256=${sha256}`);
ok(`staged at ${join(outDir, "bioresearcher")}/ (root dir inside the tarball)`);

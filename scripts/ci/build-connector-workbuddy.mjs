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
const ICONS = ["icon.svg", "icon.png", "icon.jpg"];
const present = ICONS.filter((f) => existsSync(join(FLAVOR, f)));
if (present.length !== 1) fail(`exactly one icon file expected in connector/workbuddy/, found: ${present.join(", ") || "none"}`);
const icon = present[0];
if (icon === "icon.jpg") {
  const buf = readFileSync(join(FLAVOR, icon));
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) fail(`${icon}: missing JPEG magic bytes`);
  if (buf.length < 1024 || buf.length > 200 * 1024) fail(`${icon}: ${buf.length} bytes outside 1KB-200KB`);
  let dims = null;
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const seglen = buf.readUInt16BE(i + 2);
    const sof = (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (sof) { dims = { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }; break; }
    i += 2 + seglen;
  }
  if (!dims) fail(`${icon}: no SOF marker (not a baseline JPEG?)`);
  else if (dims.width !== 512 || dims.height !== 512) fail(`${icon}: ${dims.width}x${dims.height} != 512x512`);
  else ok(`${icon} 512x512, magic+size valid (${buf.length} bytes)`);
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
const JUNK = /(^|\/)(__pycache__|\.DS_Store|\.ipynb_checkpoints|Thumbs\.db)(\/|$)|\.pyc$/;
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
const tarBytes = readFileSync(tarball);
const sha256 = createHash("sha256").update(tarBytes).digest("hex");
ok(`tarball ${join(outDir, `bioresearcher-connector_workbuddy-v${version}.tar.gz`)}`);
console.log(`     ${tarBytes.length} bytes  sha256=${sha256}`);
ok(`staged at ${join(outDir, "bioresearcher")}/ (root dir inside the tarball)`);

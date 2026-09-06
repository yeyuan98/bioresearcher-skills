#!/usr/bin/env node
// Version drift check. Zero deps.
// Enforces: VERSION semver; skills.json names == skills/ dirs; per-skill
// skills.json version == SKILL.md metadata.version; CHANGELOG has a
// line-anchored heading for VERSION and exactly one "### <skill> <version>"
// subsection line per skills.json version (top-level ## [x.y.z] headings
// are repo releases only; inter-release skill bumps live under
// ## [Unreleased]); VERSION-coupled locations per the SINGLE REGISTRY
// scripts/ci/version-coupling.json (live-slot equality incl. marketplace
// plugin entries, connector-meta, CITATION.cff, partner-doc literals), a
// stale-literal tripwire over tracked files (past versions derived from
// CHANGELOG headings; per-skill-axis tokens, '@'-pinned tokens, zones and
// exempt files excluded), and CITATION date-released == CHANGELOG
// ## [VERSION] date.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
let failures = 0;
const fail = (msg) => { console.error(`FAIL ${msg}`); failures++; };
const ok = (msg) => console.log(`ok   ${msg}`);

const semver = (s) => /^\d+\.\d+\.\d+$/.test(s?.trim() ?? "");

const version = readFileSync(join(ROOT, "VERSION"), "utf8").trim();
if (!semver(version)) fail(`VERSION "${version}" is not semver`);

const registry = JSON.parse(readFileSync(join(ROOT, "skills.json"), "utf8"));
const dirNames = readdirSync(join(ROOT, "skills"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const regNames = registry.skills.map((s) => s.name).sort();
if (JSON.stringify(dirNames) !== JSON.stringify(regNames)) fail(`skills.json names ${JSON.stringify(regNames)} != skills/ dirs ${JSON.stringify(dirNames)}`);
else ok(`skills.json <-> skills/ (${dirNames.length} skills)`);

const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Line-anchored, mirroring the release-workflow awk extractor.
if (!new RegExp(`^## \\[${escapeRe(version)}\\]`, "m").test(changelog)) {
  fail(`CHANGELOG.md missing "## [${version}]" heading`);
}
for (const s of registry.skills) {
  if (!semver(s.version)) { fail(`skills.json ${s.name} version not semver`); continue; }
  const skillMd = readFileSync(join(ROOT, "skills", s.name, "SKILL.md"), "utf8");
  // Anchor to the metadata block (indented lines only) so a `version:` in the
  // body can never satisfy the check.
  const metaBlock = skillMd.match(/^metadata:\n((?:[ \t]+[^\n]*\n)+)/m);
  const m = metaBlock?.[1].match(/[ \t]+version:[ \t]*"?(\d+\.\d+\.\d+)"?/);
  if (!m) fail(`${s.name}: metadata.version missing`);
  else if (m[1] !== s.version) fail(`${s.name}: metadata.version ${m[1]} != skills.json ${s.version}`);
  const subLine = `### ${s.name} ${s.version}`;
  const occurrences = changelog.split("\n").filter((l) => l.replace(/[ \t]+$/, "") === subLine).length;
  if (occurrences === 0) fail(`CHANGELOG.md missing "${subLine}" subsection line`);
  else if (occurrences > 1) fail(`CHANGELOG.md has ${occurrences} "${subLine}" subsection lines (expected exactly 1 - fold ## [Unreleased] into the release section)`);
}
ok(`CHANGELOG covers repo ${version} + all skill versions`);

/* ============================ version-coupling registry ============================ */

const MANIFEST_PATH = join(ROOT, "scripts", "ci", "version-coupling.json");
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
const manifestRel = "scripts/ci/version-coupling.json";

// ---- manifest self-validation: a broken manifest is a hard failure.
if (!Array.isArray(manifest.live_slots) || manifest.live_slots.length === 0) fail(`${manifestRel}: live_slots must be a non-empty array`);
if (!Array.isArray(manifest.historical_zones)) fail(`${manifestRel}: historical_zones must be an array`);
if (!Array.isArray(manifest.scan_extensions) || manifest.scan_extensions.length === 0) fail(`${manifestRel}: scan_extensions must be a non-empty array`);
else if (manifest.scan_extensions.some((e) => !String(e).startsWith("."))) fail(`${manifestRel}: scan_extensions entries must start with "."`);
const exemptFiles = Array.isArray(manifest.exempt_files) ? manifest.exempt_files : [];
const seenIds = new Set();
for (const slot of manifest.live_slots ?? []) {
  if (!slot || typeof slot.id !== "string" || !slot.id) { fail(`${manifestRel}: slot missing string id`); continue; }
  if (seenIds.has(slot.id)) fail(`${manifestRel}: duplicate slot id "${slot.id}"`);
  seenIds.add(slot.id);
  if (typeof slot.file !== "string" || !slot.file) { fail(`${manifestRel}: slot "${slot.id}" missing file`); continue; }
  if (!existsSync(join(ROOT, slot.file))) fail(`${manifestRel}: slot "${slot.id}" file does not exist: ${slot.file}`);
  const hasJp = typeof slot.json_path === "string" && !!slot.json_path;
  const hasRx = typeof slot.regex === "string" && !!slot.regex;
  if (hasJp === hasRx) { fail(`${manifestRel}: slot "${slot.id}" needs exactly one of json_path|regex`); continue; }
  if (hasJp && (slot.json_path.startsWith(".") || slot.json_path.endsWith(".") || slot.json_path.includes(".."))) {
    fail(`${manifestRel}: slot "${slot.id}" malformed json_path "${slot.json_path}"`);
  }
  if (hasRx) {
    const flags = slot.flags ?? "";
    if (!/^[misu]*$/.test(flags)) fail(`${manifestRel}: slot "${slot.id}" invalid flags "${flags}" (allowed: m i s u)`);
    try { new RegExp(slot.regex, flags); } catch (e) { fail(`${manifestRel}: slot "${slot.id}" regex does not compile: ${e.message}`); }
  }
}
for (const zone of manifest.historical_zones ?? []) {
  if (!existsSync(join(ROOT, zone))) fail(`${manifestRel}: historical zone does not exist in tree: ${zone}`);
}
for (const ex of exemptFiles) {
  if (!ex || typeof ex.file !== "string" || !existsSync(join(ROOT, ex.file))) fail(`${manifestRel}: exempt_files entry missing or nonexistent: ${ex?.file}`);
}
if (failures === 0) ok(`${manifestRel} self-validates (${manifest.live_slots.length} slot(s), ${manifest.historical_zones.length} zone(s), ${exemptFiles.length} exempt file(s))`);

// ---- live-slot enforcement: every slot must carry the CURRENT version.
function resolveJsonPath(obj, jp) {
  // Dot-path with at most one "*" segment (array iteration). Returns
  // { values: [...] } on success or { error } explaining the miss.
  const segs = jp.split(".");
  let current = [obj];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const next = [];
    for (const c of current) {
      if (seg === "*") {
        if (!Array.isArray(c)) return { error: `segment * on non-array at position ${i}` };
        if (c.length === 0) return { error: `array at position ${i} is empty (nothing matches "*")` };
        next.push(...c);
      } else if (c === null || typeof c !== "object" || !Object.prototype.hasOwnProperty.call(c, seg)) {
        return { error: `missing key "${seg}" at position ${i}` };
      } else {
        next.push(c[seg]);
      }
    }
    current = next;
  }
  return { values: current };
}

for (const slot of manifest.live_slots ?? []) {
  if (typeof slot.file !== "string" || !slot.file || !existsSync(join(ROOT, slot.file))) continue; // already failed validation
  const text = readFileSync(join(ROOT, slot.file), "utf8");
  if (slot.json_path) {
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (e) {
      fail(`[${slot.id}] ${slot.file}: unparseable JSON: ${e.message}`);
      continue;
    }
    const r = resolveJsonPath(obj, slot.json_path);
    if (r.error) {
      fail(`[${slot.id}] ${slot.file}: json_path "${slot.json_path}" ${r.error} — bump it, or fix the slot in ${manifestRel}`);
      continue;
    }
    const bad = r.values.filter((v) => v !== version);
    if (bad.length > 0) {
      fail(`[${slot.id}] ${slot.file}: json_path "${slot.json_path}" carries ${JSON.stringify(bad)} != VERSION ${version} — bump it in this release PR${slot.notes ? ` (${slot.notes})` : ""}`);
    } else {
      ok(`[${slot.id}] ${slot.file} ${slot.json_path} == VERSION ${version} (${r.values.length} value(s))`);
    }
  } else {
    const flags = slot.flags ?? "";
    const re = new RegExp(slot.regex, flags.includes("g") ? flags : flags + "g");
    const matches = [...text.matchAll(re)];
    if (matches.length === 0) {
      fail(`[${slot.id}] ${slot.file}: regex matches nothing — slot rotted; fix it in ${manifestRel}`);
      continue;
    }
    if (matches.some((m) => m[1] === undefined)) {
      fail(`[${slot.id}] ${slot.file}: regex match without capture group 1 — fix the slot pattern in ${manifestRel}`);
      continue;
    }
    const bad = matches.filter((m) => m[1] !== version);
    if (bad.length > 0) {
      fail(`[${slot.id}] ${slot.file}: captured ${JSON.stringify(bad.map((m) => m[1]))} != VERSION ${version} — bump it in this release PR`);
    } else {
      ok(`[${slot.id}] ${slot.file} captures VERSION ${version} (${matches.length} match(es))`);
    }
  }
}

/* ============================ stale-literal tripwire ============================ */

// Past versions derive hermetically from CHANGELOG release headings (tags
// may disagree, e.g. a changelog-only release).
const pastVersions = new Set(
  [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]).filter((v) => v !== version)
);
// Per-skill axis: tokens equal to a skills.json version are governed by the
// per-skill gate, never by the repo-version tripwire.
const skillVersions = new Set(registry.skills.map((s) => s.version));

function gitTrackedFiles() {
  const r = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8", timeout: 30000 });
  if (r.status !== 0) throw new Error(`git ls-files failed: ${r.stderr}`);
  return r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

function inZone(rel, zones) {
  return zones.some((z) => rel === z || rel.startsWith(z.endsWith("/") ? z : z + "/"));
}

let tracked = [];
try {
  tracked = gitTrackedFiles();
} catch (e) {
  fail(`tripwire: ${e.message}`);
}

const zones = manifest.historical_zones ?? [];
const exemptSet = new Set(exemptFiles.map((e) => e.file));
const skipFiles = new Set([manifestRel, "VERSION", ...exemptSet]);
const tokenRe = /\bv?\d+\.\d+\.\d+\b/g;
const extOk = (f) => manifest.scan_extensions.some((e) => f.endsWith(e));

let scanned = 0;
for (const rel of tracked.sort()) {
  if (skipFiles.has(rel) || inZone(rel, zones) || !extOk(rel)) continue;
  const abs = join(ROOT, rel);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  scanned++;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // cff-version is a schema constant (CITATION.cff line 1), not a repo version.
    if (/^\s*cff-version:/.test(line)) continue;
    tokenRe.lastIndex = 0;
    let m;
    while ((m = tokenRe.exec(line)) !== null) {
      const lit = m[0].replace(/^v/, "");
      if (!pastVersions.has(lit)) continue;
      if (skillVersions.has(lit)) continue; // per-skill axis
      if (m.index > 0 && line[m.index - 1] === "@") continue; // foreign @-pin
      fail(`tripwire: stale version literal "v${lit}" in ${rel}:${i + 1} — bump it, register a slot, or add a zone in ${manifestRel}`);
    }
  }
}
if (failures === 0) ok(`tripwire: no stale past-version literals (${pastVersions.size} past version(s), ${scanned} file(s) scanned)`);

/* ============================ date consistency ============================ */

const cffText = readFileSync(join(ROOT, "CITATION.cff"), "utf8");
const dateReleased = cffText.match(/^date-released:\s*"?(\d{4}-\d{2}-\d{2})"?/m)?.[1] ?? null;
const headingDate = changelog.match(new RegExp(`^## \\[${escapeRe(version)}\\] - (\\d{4}-\\d{2}-\\d{2})`, "m"))?.[1] ?? null;
if (headingDate === null) {
  // The missing-heading case is already reported above; date check rides along.
  if (dateReleased !== null) fail(`CITATION.cff date-released ${dateReleased} but CHANGELOG has no "## [${version}] - <date>" heading`);
} else if (dateReleased !== headingDate) {
  fail(`CITATION.cff date-released ${dateReleased ?? "(missing)"} != CHANGELOG "## [${version}] - ${headingDate}" — both flip in the release PR`);
} else {
  ok(`CITATION.cff date-released == CHANGELOG date (${headingDate})`);
}

process.exit(failures ? 1 : 0);

#!/usr/bin/env node
// Version drift check. Zero deps, pure filesystem (no git subprocess, no
// repository-wide scanning).
//
// Two version series, two mechanisms, zero shared code paths:
// - Series 1 (repo VERSION = agent/connector/plugin product): opt-in live
//   slots declared in scripts/ci/version-coupling.json — every slot must
//   capture exactly the current VERSION (regex slots: >= 1 match, capture
//   group 1 defined, ALL captures equal; json_path slots: dot-path with at
//   most one '*' array segment, every resolved value equal, missing keys
//   fail). Nothing is scanned "just in case".
// - Series 2 (per-skill semver): structural checks — skills.json names ==
//   skills/ dirs; per-skill skills.json version == SKILL.md
//   metadata.version; CHANGELOG has a line-anchored heading for VERSION and
//   exactly one "### <skill> <version>" subsection line per skills.json
//   version (top-level ## [x.y.z] headings are repo releases only;
//   inter-release skill bumps live under ## [Unreleased]).
// Plus: CITATION.cff date-released == CHANGELOG "## [VERSION] - <date>".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";

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

// Manifest paths must be repo-relative and point at regular files.
const safeRel = (rel) => typeof rel === "string" && rel.length > 0 && !rel.includes("..") && !rel.startsWith("/") && !/^[A-Za-z]:/.test(rel);
const slotFileOk = (rel) => safeRel(rel) && statSync(join(ROOT, rel), { throwIfNoEntry: false })?.isFile() === true;

// ---- manifest self-validation: a broken manifest is a hard failure.
if (!Array.isArray(manifest.live_slots) || manifest.live_slots.length === 0) fail(`${manifestRel}: live_slots must be a non-empty array`);
const seenIds = new Set();
for (const slot of manifest.live_slots ?? []) {
  if (!slot || typeof slot.id !== "string" || !slot.id) { fail(`${manifestRel}: slot missing string id`); continue; }
  if (seenIds.has(slot.id)) fail(`${manifestRel}: duplicate slot id "${slot.id}"`);
  seenIds.add(slot.id);
  if (typeof slot.file !== "string" || !slot.file) { fail(`${manifestRel}: slot "${slot.id}" missing file`); continue; }
  if (!safeRel(slot.file)) { fail(`${manifestRel}: slot "${slot.id}" file must be a repo-relative path without "..": ${slot.file}`); continue; }
  if (!slotFileOk(slot.file)) fail(`${manifestRel}: slot "${slot.id}" file is missing or not a regular file: ${slot.file}`);
  const hasJp = typeof slot.json_path === "string" && !!slot.json_path;
  const hasRx = typeof slot.regex === "string" && !!slot.regex;
  if (hasJp === hasRx) { fail(`${manifestRel}: slot "${slot.id}" needs exactly one of json_path|regex`); continue; }
  if (hasJp && (slot.json_path.startsWith(".") || slot.json_path.endsWith(".") || slot.json_path.includes(".."))) {
    fail(`${manifestRel}: slot "${slot.id}" malformed json_path "${slot.json_path}"`);
  }
  if (hasJp && (slot.json_path.match(/\*/g) ?? []).length > 1) {
    fail(`${manifestRel}: slot "${slot.id}" json_path supports at most one "*" segment: ${slot.json_path}`);
  }
  if (hasRx) {
    const flags = slot.flags ?? "";
    if (!/^[misu]*$/.test(flags)) fail(`${manifestRel}: slot "${slot.id}" invalid flags "${flags}" (allowed: m i s u)`);
    try { new RegExp(slot.regex, flags); } catch (e) { fail(`${manifestRel}: slot "${slot.id}" regex does not compile: ${e.message}`); }
  }
}
if (failures === 0) ok(`${manifestRel} self-validates (${manifest.live_slots.length} slot(s))`);

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
  if (typeof slot.file !== "string" || !slot.file || !slotFileOk(slot.file)) continue; // already failed validation
  let text;
  try {
    text = readFileSync(join(ROOT, slot.file), "utf8");
  } catch (e) {
    fail(`[${slot.id}] ${slot.file}: unreadable: ${e.message}`);
    continue;
  }
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
    let matches;
    try {
      matches = [...text.matchAll(re)];
    } catch (e) {
      fail(`[${slot.id}] ${slot.file}: regex execution failed: ${e.message}`);
      continue;
    }
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

/* ============================ date consistency ============================ */

const cffText = readFileSync(join(ROOT, "CITATION.cff"), "utf8");
const dateReleased = cffText.match(/^date-released:\s*"?(\d{4}-\d{2}-\d{2})"?/m)?.[1] ?? null;
const headingDate = changelog.match(new RegExp(`^## \\[${escapeRe(version)}\\] - (\\d{4}-\\d{2}-\\d{2})`, "m"))?.[1] ?? null;
if (headingDate === null) {
  // The missing-heading case is already reported above; date check rides along.
  if (dateReleased !== null) fail(`CITATION.cff date-released ${dateReleased} but CHANGELOG has no "## [${version}] - <date>" heading (missing or missing its date)`);
} else if (dateReleased !== headingDate) {
  fail(`CITATION.cff date-released ${dateReleased ?? "(missing)"} != CHANGELOG "## [${version}] - ${headingDate}" — both flip in the release PR`);
} else {
  ok(`CITATION.cff date-released == CHANGELOG date (${headingDate})`);
}

process.exit(failures ? 1 : 0);

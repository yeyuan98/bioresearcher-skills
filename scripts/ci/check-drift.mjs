#!/usr/bin/env node
// Version drift check. Zero deps.
// Enforces: VERSION semver; skills.json names == skills/ dirs; per-skill
// skills.json version == SKILL.md metadata.version; CHANGELOG has a heading
// for every skills.json version AND for VERSION; plugin.json version and
// marketplace entry version == VERSION; workbuddy connector-meta.json
// version == VERSION.
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const needed = new Set([version]);
for (const s of registry.skills) {
  needed.add(s.version);
  if (!semver(s.version)) { fail(`skills.json ${s.name} version not semver`); continue; }
  const skillMd = readFileSync(join(ROOT, "skills", s.name, "SKILL.md"), "utf8");
  // Anchor to the metadata block (indented lines only) so a `version:` in the
  // body can never satisfy the check.
  const metaBlock = skillMd.match(/^metadata:\n((?:[ \t]+[^\n]*\n)+)/m);
  const m = metaBlock?.[1].match(/[ \t]+version:[ \t]*"?(\d+\.\d+\.\d+)"?/);
  if (!m) fail(`${s.name}: metadata.version missing`);
  else if (m[1] !== s.version) fail(`${s.name}: metadata.version ${m[1]} != skills.json ${s.version}`);
}
for (const v of needed) {
  if (!changelog.includes(`## [${v}]`)) fail(`CHANGELOG.md missing "## [${v}]" heading`);
}
ok(`CHANGELOG covers repo ${version} + all skill versions`);

const plugin = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
if (plugin.version !== version) fail(`plugin.json version ${plugin.version} != VERSION ${version}`);
else ok(`plugin.json version == VERSION`);

const wbMetaPath = join(ROOT, "connector", "workbuddy", "connector-meta.json");
if (!existsSync(wbMetaPath)) fail("connector/workbuddy/connector-meta.json missing");
else {
  const wbMeta = JSON.parse(readFileSync(wbMetaPath, "utf8"));
  if (wbMeta.version !== version) fail(`connector/workbuddy/connector-meta.json version ${wbMeta.version} != VERSION ${version}`);
  else ok("workbuddy connector-meta.json version == VERSION");
}

const market = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "marketplace.json"), "utf8"));
for (const p of market.plugins ?? []) {
  if (p.version !== undefined && p.version !== version) fail(`marketplace plugin ${p.name} version ${p.version} != VERSION ${version}`);
}
ok("marketplace versions consistent");

process.exit(failures ? 1 : 0);

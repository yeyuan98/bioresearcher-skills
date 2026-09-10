#!/usr/bin/env node
/*
 * demos/check-demos.mjs — CI-safe gate for the demos/ partner-publication
 * pack. Zero deps, node:stdlib only, no network, no opencode.
 *
 * Gates:
 *  1. links       — relative markdown links under demos/ resolve; no
 *                   duplicate headings within a file (case-insensitive).
 *  2. parity      — docs/agent.{zh,en}.md and docs/mcp.{zh,en}.md share the
 *                   exact same heading-slug sequence (structural parity of
 *                   the bilingual pairs).
 *  3. tool names  — every `biomcp_<token>` occurrence in demos/ markdown and
 *                   JSON files must strip to a tool in the pinned registry;
 *                   the 16 retired biomcp-python names are forbidden
 *                   anywhere in demos/. (No existing repo gate scans demos/
 *                   — this closes that gap; mirrors
 *                   scripts/ci/check-tool-names.mjs and
 *                   check-legacy-names.sh semantics.)
 *  4. registry    — demos/lib/biomcp-tools@1.4.0.json is byte-equal (after
 *                   JSON normalization) to scripts/ci/biomcp-tools.json, so
 *                   the vendored copy can never drift.
 *  5. scenarios   — scenario.json schema: id == dirname, kind, prompt/checks
 *                   (agent) or probe[] (mcp-probe), bilingual titles,
 *                   opencode.json present for agent kind.
 *  6. hermetic    — demos runtime code (*.mjs) never references agent-test/
 *                   paths (self-containment lint).
 *  7. caps        — committed demos/ tree <= 3 MiB and <= 150 files
 *                   (repo-lean policy; .runs/ and data/ excluded).
 *  8. artifacts   — every non-empty demos/artifacts/<dir>/ carries README.md,
 *                   transcript.md, result.json, provenance.json.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname, relative, resolve } from "node:path";
import path from "node:path";

const DEMOS = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(DEMOS);
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_FILES = 150;

let failures = 0;
const fail = (scope, msg) => { console.error(`FAIL [${scope}] ${msg}`); failures++; };
const ok = (scope, msg) => console.log(`ok   [${scope}] ${msg}`);

function walk(dir, acc = [], filter = () => true, skip = () => false) {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name === ".runs" || e.name === "data" || e.name === "node_modules" || e.name === ".git" || e.name === "_site") continue;
    const p = join(dir, e.name);
    if (skip(p)) continue;
    if (e.isDirectory()) walk(p, acc, filter, skip);
    else if (filter(p)) acc.push(p);
  }
  return acc;
}

/* -------------------------------------------------- gate 1: links + headings */

const mdFiles = walk(DEMOS, [], (p) => p.endsWith(".md"));
if (mdFiles.length === 0) fail("links", "no markdown files under demos/");

function headingsOf(text) {
  // Skip fenced code blocks (a fence of N backticks closes only on >= N).
  const out = [];
  let fence = 0;
  for (const line of text.split("\n")) {
    const fm = line.match(/^\s*(`{3,}|~{3,})/);
    if (fm) {
      const n = fm[1].length;
      if (fence === 0 || n >= fence) fence = fence === 0 ? n : 0;
      continue;
    }
    if (fence) continue;
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) out.push(m[2].trim());
  }
  return out;
}

let linkCount = 0;
for (const file of mdFiles) {
  const rel = relative(REPO, file);
  // Curated transcripts embed LLM-authored markdown verbatim: they are
  // generated evidence, not authored docs, so heading/link linting skips them.
  const isGeneratedTranscript = file.endsWith("transcript.md") && rel.includes(`${path.sep}artifacts${path.sep}`);
  const text = readFileSync(file, "utf8");
  const seen = new Set();
  if (!isGeneratedTranscript) {
    for (const h of headingsOf(text)) {
      const key = h.toLowerCase();
      if (seen.has(key)) fail("links", `${rel}: duplicate heading "${h}"`);
      seen.add(key);
    }
  }
  // Relative links resolve (skip fenced code blocks).
  let fence = 0;
  for (const line of text.split("\n")) {
    const fm = line.match(/^\s*(`{3,}|~{3,})/);
    if (fm) {
      const n = fm[1].length;
      if (fence === 0 || n >= fence) fence = fence === 0 ? n : 0;
      continue;
    }
    if (fence) continue;
    // Allow one level of balanced parens inside the href (CommonMark style).
    for (const m of line.matchAll(/\[[^\]]*\]\((((?:\([^)\s]*\)|[^)\s]))+)[^)]*\)/g)) {
      const href = m[1];
      if (/^[a-z]+:\/\//i.test(href) || href.startsWith("#") || href.startsWith("mailto:")) {
        // Same-repo absolute links: at least the path portion must exist in
        // the current tree (catches stale-tree permalinks 404ing by path).
        const gm = href.match(/^https:\/\/github\.com\/yeyuan98\/bioresearcher-skills\/(?:tree|blob)\/[^/]+\/(.+?)(?:\/?#|$)/);
        if (gm) {
          linkCount++;
          const target = join(REPO, decodeURIComponent(gm[1].split("#")[0]));
          if (!existsSync(target)) fail("links", `${rel}: same-repo permalink path does not exist in this tree: ${href}`);
        }
        continue;
      }
      linkCount++;
      let clean;
      try {
        clean = decodeURIComponent(href.split("#")[0]);
      } catch {
        fail("links", `${rel}: malformed percent escape in link ${href}`);
        continue;
      }
      const target = resolve(dirname(file), clean);
      if (!existsSync(target)) fail("links", `${rel}: broken relative link ${href}`);
    }
  }
}
if (mdFiles.length) ok("links", `${mdFiles.length} md file(s), ${linkCount} relative link(s) resolve, no duplicate headings`);

/* ---------------------------------------------------- gate 2: zh/en parity */

function headingNumbers(file) {
  // Both language versions number every h2/h3 identically ("## 1. ...",
  // "### 4.2 ..."); parity = identical numbering sequence.
  return headingsOf(readFileSync(file, "utf8"))
    .map((h) => {
      const m = h.match(/^(\d+(?:\.\d+)*)[.、]?\s/);
      return m ? m[1] : null;
    })
    .filter((x) => x !== null);
}
for (const base of ["agent", "mcp"]) {
  const zh = join(DEMOS, "docs", `${base}.zh.md`);
  const en = join(DEMOS, "docs", `${base}.en.md`);
  if (!existsSync(zh) || !existsSync(en)) continue; // docs not written yet
  const zhN = headingNumbers(zh);
  const enN = headingNumbers(en);
  if (zhN.length === 0) fail("parity", `${base}.zh.md has no numbered headings (expected "## 1. ..." scheme)`);
  else if (JSON.stringify(zhN) !== JSON.stringify(enN)) {
    fail("parity", `${base}.zh.md numbering [${zhN.join(", ")}] != ${base}.en.md [${enN.join(", ")}]`);
  } else {
    ok("parity", `${base}.zh.md <-> ${base}.en.md section-numbering parity (${zhN.length} numbered headings)`);
  }
}

/* --------------------------------------------------- gate 3: tool names */

const registry = JSON.parse(readFileSync(join(REPO, "scripts", "ci", "biomcp-tools.json"), "utf8"));
const known = new Set([...registry.core, ...registry.optional]);
const ENV_ALLOWLIST = new Set(["biomcp_project_config"]);
const LEGACY = [
  "biomcp_article_searcher", "biomcp_article_getter", "biomcp_trial_searcher", "biomcp_trial_getter",
  "biomcp_trial_protocol_getter", "biomcp_trial_outcomes_getter", "biomcp_gene_getter", "biomcp_variant_searcher",
  "biomcp_variant_getter", "biomcp_drug_getter", "biomcp_openfda_adverse_searcher", "biomcp_openfda_label_searcher",
  "biomcp_openfda_approval_searcher", "biomcp_search", "biomcp_fetch", "biomcp_tool",
];
const scanFiles = walk(DEMOS, [], (p) => /\.(md|json)$/.test(p) && !p.endsWith("biomcp-tools@1.4.0.json"));
let refs = 0;
for (const file of scanFiles) {
  const rel = relative(REPO, file);
  const raw = readFileSync(file, "utf8");
  const text = raw.replace(/mcp__[A-Za-z0-9_*-]+/g, "");
  for (const m of text.matchAll(/biomcp_([a-z0-9_]+)/gi)) {
    const token = m[0];
    if (token === token.toUpperCase() && token !== token.toLowerCase()) {
      if (!ENV_ALLOWLIST.has(token.toLowerCase())) {
        fail("tools", `${rel}: unknown BIOMCP_* env var "${token}"`);
      }
      continue;
    }
    refs++;
    if (!known.has(m[1].toLowerCase()) && !known.has(token.toLowerCase())) {
      fail("tools", `${rel}: unknown biomcp tool reference "${token}"`);
    }
  }
  for (const name of LEGACY) {
    const re = new RegExp(`(^|[^a-z0-9_])${name}([^a-z0-9_]|$)`, "i");
    if (re.test(text)) fail("tools", `${rel}: retired biomcp-python tool name "${name}"`);
  }
}
if (refs === 0) fail("tools", "no biomcp tool references found under demos/ — gate is vacuous");
else if (!failures) ok("tools", `${refs} biomcp tool references match pinned registry v${registry.biomcp_ts_version}; no retired names`);

/* --------------------------------------------------- gate 4: vendored registry */

const vendoredPath = join(DEMOS, "lib", "biomcp-tools@1.4.0.json");
if (!existsSync(vendoredPath)) {
  fail("registry", "demos/lib/biomcp-tools@1.4.0.json missing");
} else {
  const a = JSON.parse(readFileSync(vendoredPath, "utf8"));
  const b = registry;
  const norm = (x) => JSON.stringify(x);
  if (norm(a) !== norm(b)) fail("registry", "vendored biomcp-tools@1.4.0.json differs from scripts/ci/biomcp-tools.json — re-vendor it");
  else ok("registry", `vendored registry byte-matches scripts/ci/biomcp-tools.json (biomcp ${b.biomcp_ts_version})`);
}

/* --------------------------------------------------- gate 5: scenario schema */

const scenariosRoot = join(DEMOS, "scenarios");
const scenarioDirs = existsSync(scenariosRoot)
  ? readdirSync(scenariosRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
let scenariosOk = 0;
for (const name of scenarioDirs) {
  const dir = join(scenariosRoot, name);
  const sj = join(dir, "scenario.json");
  if (!existsSync(sj)) { fail("scenarios", `${name}/scenario.json missing`); continue; }
  let spec;
  try {
    spec = JSON.parse(readFileSync(sj, "utf8"));
  } catch (e) {
    fail("scenarios", `${name}/scenario.json unparseable: ${e.message}`);
    continue;
  }
  const problems = [];
  if ((spec.id ?? name) !== name) problems.push(`id "${spec.id}" != dir name`);
  const kind = spec.kind ?? "agent";
  if (kind === "agent") {
    if (typeof spec.prompt !== "string" || !spec.prompt) problems.push("missing prompt");
    if (!Array.isArray(spec.checks) || spec.checks.length === 0) problems.push("missing checks[]");
    if (!existsSync(join(dir, "opencode.json"))) problems.push("missing opencode.json");
    if (Array.isArray(spec.publish?.outputs)) {
      for (const g of spec.publish.outputs) {
        if (typeof g !== "string" || g.startsWith("/")) problems.push(`bad outputs glob "${g}"`);
      }
    }
  } else if (kind === "mcp-probe") {
    if (!Array.isArray(spec.probe) || spec.probe.length === 0) problems.push("missing probe[]");
    else {
      for (const [i, c] of spec.probe.entries()) {
        if (!c || typeof c.tool !== "string" || !known.has(c.tool)) problems.push(`probe[${i}] tool "${c?.tool}" not in registry`);
        if (c.args === undefined) problems.push(`probe[${i}] missing args`);
        for (const rx of ["expect_regex", "expect_not_regex"]) {
          if (c[rx] !== undefined) {
            try { new RegExp(c[rx]); } catch (e) { problems.push(`probe[${i}].${rx} does not compile`); }
          }
        }
      }
    }
    if (spec.server !== undefined && spec.server.command !== undefined) {
      const cmd = spec.server.command;
      if (!Array.isArray(cmd) || cmd.length === 0 || cmd.some((c) => typeof c !== "string")) problems.push("server.command must be a non-empty string array");
    }
  } else {
    problems.push(`unsupported kind "${kind}"`);
  }
  if (kind === "agent" && Array.isArray(spec.publish?.outputs)) {
    for (const g of spec.publish.outputs) {
      if (typeof g !== "string" || g.length === 0 || g.startsWith("/")) problems.push(`bad outputs glob "${g}"`);
    }
  }
  if (typeof spec.title_en !== "string" || !spec.title_en) problems.push("missing title_en");
  if (typeof spec.title_zh !== "string" || !spec.title_zh) problems.push("missing title_zh");
  if (problems.length) fail("scenarios", `${name}: ${problems.join("; ")}`);
  else scenariosOk++;
}
if (scenarioDirs.length) ok("scenarios", `${scenariosOk}/${scenarioDirs.length} scenario manifest(s) valid`);

/* --------------------------------------------------- gate 6: hermetic runtime */

const mjsFiles = walk(DEMOS, [], (p) => p.endsWith(".mjs"));
for (const file of mjsFiles) {
  const rel = relative(DEMOS, file);
  const text = readFileSync(file, "utf8");
  // Flag agent-test path USAGE (string/template literals resolving to the
  // sibling suite), not prose provenance mentions in comments.
  if (/["'`](?:\.\.\/)+agent-test\//.test(text) || /["'`]agent-test\//.test(text)) {
    fail("hermetic", `${rel}: runtime code references agent-test/ paths`);
  }
}
if (mjsFiles.length) ok("hermetic", `${mjsFiles.length} .mjs file(s) reference no agent-test/ paths`);

/* --------------------------------------------------- gate 7: size caps */

const allFiles = walk(DEMOS);
let totalBytes = 0;
for (const f of allFiles) totalBytes += statSync(f).size;
if (allFiles.length > MAX_FILES) fail("caps", `${allFiles.length} files > ${MAX_FILES}`);
if (totalBytes > MAX_BYTES) fail("caps", `${(totalBytes / 1048576).toFixed(2)} MiB > ${(MAX_BYTES / 1048576).toFixed(0)} MiB`);
if (!failures) ok("caps", `${allFiles.length} file(s), ${(totalBytes / 1024).toFixed(0)} KiB committed tree`);

/* --------------------------------------------------- gate 8: artifact completeness */

const artifactsRoot = join(DEMOS, "artifacts");
const artifactDirs = existsSync(artifactsRoot)
  ? readdirSync(artifactsRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
let artifactsOk = 0;
let artifactsChecked = 0;
for (const name of artifactDirs) {
  const dir = join(artifactsRoot, name);
  const files = walk(dir);
  if (files.length === 0) continue;
  artifactsChecked++;
  const need = ["README.md", "transcript.md", "result.json", "provenance.json"];
  const missing = need.filter((f) => !existsSync(join(dir, f)));
  if (missing.length) fail("artifacts", `${name}/ missing ${missing.join(", ")}`);
  else artifactsOk++;
}
if (artifactsChecked) ok("artifacts", `${artifactsOk}/${artifactsChecked} artifact dir(s) complete`);

// Stale artifact dirs for scenarios that no longer exist fail loudly.
const orphanArtifacts = artifactDirs.filter((d) => !scenarioDirs.includes(d));
for (const d of orphanArtifacts) fail("artifacts", `demos/artifacts/${d}/ has no matching scenario under demos/scenarios/`);

if (failures) {
  console.error(`\ncheck-demos: ${failures} failure(s)`);
  process.exit(1);
}
console.log("check-demos: all gates green");

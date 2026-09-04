#!/usr/bin/env node
// Strict-6 Agent Skills frontmatter lint. Zero deps.
// Validates: exact key set, name==dir + regex + <=64, description <=500,
// metadata string->string, allowed-tools from generic set, license, BOM,
// SKILL.md line budget, one-level-deep layout.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const SKILLS_DIR = join(ROOT, "skills");
const ALLOWED_KEYS = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"];
const REQUIRED_KEYS = ["name", "description"];
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_NAME = 64;
const MAX_DESC = 500; // repo policy (spec allows 1024)
const MAX_SKILL_LINES = 500;
const GENERIC_TOOLS = new Set(["Bash", "Read", "Write", "Edit", "Glob", "Grep", "Task", "WebFetch", "WebSearch", "TodoWrite"]);
const LICENSE = "Apache-2.0";

let failures = 0;
const fail = (skill, msg) => { console.error(`FAIL [${skill}] ${msg}`); failures++; };
const ok = (skill, msg) => console.log(`ok   [${skill}] ${msg}`);

// Minimal YAML frontmatter parser for our constrained schema:
// flat scalar keys + one optional nested `metadata:` map of scalar strings.
function parseFrontmatter(text) {
  // Normalize CRLF so fence detection is newline-ending agnostic.
  const norm = text.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return { error: "file must start with '---' frontmatter fence" };
  const end = norm.indexOf("\n---", 4);
  if (end === -1) return { error: "missing closing '---' fence" };
  const lines = norm.slice(4, end).split("\n");
  const fm = {};
  const seen = new Set();
  let inMeta = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\s+\S/.test(line)) {
      if (!inMeta) return { error: `indented line outside metadata: ${line.trim()}` };
      const m = line.match(/^\s+([A-Za-z0-9_-]+):\s*(.*)$/);
      if (!m) return { error: `unparseable metadata line: ${line.trim()}` };
      const mk = `metadata.${m[1]}`;
      if (seen.has(mk)) return { error: `duplicate key: ${mk}` };
      seen.add(mk);
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (fm.metadata == null || typeof fm.metadata === "string") return { error: "metadata key defined twice" };
      fm.metadata[m[1]] = v;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) return { error: `unparseable line: ${line.trim()}` };
    if (seen.has(m[1])) return { error: `duplicate key: ${m[1]}` };
    seen.add(m[1]);
    inMeta = m[1] === "metadata";
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    fm[m[1]] = m[1] === "metadata" && v === "" ? {} : v;
  }
  return { fm };
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "__pycache__") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const skills = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
if (skills.length === 0) fail("repo", "no skills found under skills/");

for (const d of skills) {
  const name = d.name;
  const skillPath = join(SKILLS_DIR, name);
  const mdPath = join(skillPath, "SKILL.md");
  let text;
  try {
    const buf = readFileSync(mdPath);
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) { fail(name, "SKILL.md has UTF-8 BOM"); }
    text = buf.toString("utf8");
  } catch { fail(name, "missing SKILL.md"); continue; }

  const { fm, error } = parseFrontmatter(text);
  if (error) { fail(name, `frontmatter: ${error}`); continue; }

  const keys = Object.keys(fm);
  for (const k of keys) if (!ALLOWED_KEYS.includes(k)) fail(name, `disallowed frontmatter key: ${k}`);
  for (const k of REQUIRED_KEYS) if (!keys.includes(k)) fail(name, `missing required key: ${k}`);
  if (fm.name !== undefined && fm.name !== name) fail(name, `frontmatter name "${fm.name}" != directory "${name}"`);
  if (typeof fm.name === "string" && (!NAME_RE.test(fm.name) || fm.name.length > MAX_NAME)) fail(name, `name violates regex/length: ${fm.name}`);
  if (typeof fm.description === "string") {
    if (fm.description.trim().length === 0) fail(name, "empty description");
    if (fm.description.length > MAX_DESC) fail(name, `description ${fm.description.length} chars > policy ${MAX_DESC}`);
  }
  if (fm.license !== undefined && fm.license !== LICENSE) fail(name, `license "${fm.license}" != expected ${LICENSE}`);
  if (fm.compatibility !== undefined && (typeof fm.compatibility !== "string" || fm.compatibility.length > 500)) fail(name, "compatibility must be a string <= 500 chars");
  if (fm.metadata !== undefined) {
    if (typeof fm.metadata !== "object" || Array.isArray(fm.metadata) || fm.metadata === null) {
      fail(name, "metadata must be a map");
    } else {
      for (const [k, v] of Object.entries(fm.metadata)) {
        if (typeof v !== "string") fail(name, `metadata.${k} must be a string (quote numbers)`);
      }
      if (!/^\d+\.\d+\.\d+$/.test(fm.metadata.version ?? "")) fail(name, "metadata.version missing or not semver");
    }
  }
  if (fm["allowed-tools"] !== undefined) {
    const tools = String(fm["allowed-tools"]).split(/\s+/).filter(Boolean);
    for (const t of tools) if (!GENERIC_TOOLS.has(t)) fail(name, `allowed-tools entry not in generic set: ${t}`);
  }

  const bodyLines = text.split("\n").length;
  if (bodyLines > MAX_SKILL_LINES) fail(name, `SKILL.md ${bodyLines} lines > ${MAX_SKILL_LINES}`);

  // Layout: files at most one directory level deep under the skill root.
  for (const f of walk(skillPath)) {
    const rel = relative(skillPath, f).split(/[\\/]/);
    if (rel.length > 2) fail(name, `nested deeper than one level: ${relative(skillPath, f)}`);
    const buf = readFileSync(f);
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) fail(name, `BOM in ${relative(skillPath, f)}`);
  }
  ok(name, `frontmatter+layout (${bodyLines} lines)`);
}

process.exit(failures ? 1 : 0);

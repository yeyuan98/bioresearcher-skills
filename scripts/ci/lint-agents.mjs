#!/usr/bin/env node
// Plugin agents lint. Zero deps.
// Validates .claude-plugin/agents/*.md (Claude Code plugin subagents):
// parses frontmatter, enforces lowercase-kebab name without ':', required
// description <=500 chars, only plugin-supported frontmatter keys (never
// hooks/mcpServers/permissionMode, which Claude Code ignores for plugin
// agents), comma-separated tools entries that are bare tool names or
// mcp__ server rules, UTF-8 without BOM, and exact agreement between the
// files on disk and the plugin.json agents declarations.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative, resolve, sep } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const AGENTS_DIR = join(ROOT, ".claude-plugin", "agents");
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TOOL_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const MCP_RULE_RE = /^mcp__[a-z0-9_-]+(__\*)?$/;
const ALLOWED_KEYS = new Set([
  "name", "description", "model", "effort", "maxTurns", "tools",
  "disallowedTools", "skills", "memory", "background", "isolation",
]);
const FORBIDDEN_KEYS = ["hooks", "mcpServers", "permissionMode"];
const MAX_DESC = 500;

let failures = 0;
const fail = (msg) => { console.error(`FAIL ${msg}`); failures++; };
const ok = (msg) => console.log(`ok   ${msg}`);

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

// Minimal YAML frontmatter parser for flat scalar keys (agent frontmatter
// carries no nested maps in this repo).
function parseFrontmatter(text) {
  const norm = text.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return { error: "file must start with '---' frontmatter fence" };
  const end = norm.indexOf("\n---", 4);
  if (end === -1) return { error: "missing closing '---' fence" };
  const fm = {};
  const seen = new Set();
  for (const raw of norm.slice(4, end).split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\s+\S/.test(line)) return { error: `unexpected indented line (nested maps are not supported): ${line.trim()}` };
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) return { error: `unparseable line: ${line.trim()}` };
    if (seen.has(m[1])) return { error: `duplicate key: ${m[1]}` };
    seen.add(m[1]);
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    fm[m[1]] = v;
  }
  return { fm };
}

if (!existsSync(AGENTS_DIR) || !statSync(AGENTS_DIR).isDirectory()) {
  ok("no .claude-plugin/agents/ directory (no plugin agents shipped)");
} else {
  const files = walk(AGENTS_DIR);
  if (files.length === 0) fail(".claude-plugin/agents/ exists but contains no .md files");

  for (const file of files) {
    const rel = relative(ROOT, file).split(sep).join("/");
    const buf = readFileSync(file);
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) fail(`[${rel}] UTF-8 BOM`);
    const text = buf.toString("utf8");

    const { fm, error } = parseFrontmatter(text);
    if (error) { fail(`[${rel}] frontmatter: ${error}`); continue; }

    const keys = Object.keys(fm);
    for (const k of keys) {
      if (FORBIDDEN_KEYS.includes(k)) fail(`[${rel}] forbidden for plugin agents (ignored by Claude Code): ${k}`);
      else if (!ALLOWED_KEYS.has(k)) fail(`[${rel}] unsupported frontmatter key: ${k}`);
    }
    if (!fm.name) { fail(`[${rel}] name required`); continue; }
    if (fm.name.includes(":") || !NAME_RE.test(fm.name)) fail(`[${rel}] name must be lowercase kebab-case without ':': ${fm.name}`);
    if (!fm.description || !fm.description.trim()) fail(`[${rel}] description required`);
    else if (fm.description.length > MAX_DESC) fail(`[${rel}] description ${fm.description.length} chars > ${MAX_DESC}`);

    if (fm.tools !== undefined) {
      if (/^\[|]\s*$/.test(fm.tools) || fm.tools.includes("\n")) fail(`[${rel}] tools must be a comma-separated string, not a YAML list`);
      for (const t of fm.tools.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!TOOL_RE.test(t) && !MCP_RULE_RE.test(t)) fail(`[${rel}] tools entry must be a bare tool name or mcp__ server rule: ${t}`);
      }
    }
    ok(`[${rel}] plugin agent frontmatter valid`);
  }

  // Exact agreement with plugin.json agents declarations.
  const plugin = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const declared = new Set((plugin.agents ?? []).map((a) => relative(ROOT, resolve(ROOT, a)).split(sep).join("/")));
  const onDisk = new Set(files.map((f) => relative(ROOT, f).split(sep).join("/")));
  for (const d of declared) if (!onDisk.has(d)) fail(`plugin.json declares agent absent from .claude-plugin/agents/: ${d}`);
  for (const f of onDisk) if (!declared.has(f)) fail(`agent file not declared in plugin.json agents: ${f}`);
  if (declared.size === onDisk.size && failures === 0) ok(`plugin.json agents <-> .claude-plugin/agents/ (${onDisk.size} file(s))`);
}

process.exit(failures ? 1 : 0);

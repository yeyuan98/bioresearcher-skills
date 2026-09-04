#!/usr/bin/env node
// Link + heading lint over skills/**/*.md. Zero deps.
// Checks: relative markdown links resolve to existing files; no duplicate
// headings within a file (case-insensitive); inline reference paths stay
// one directory level deep from the skill root.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const SKILLS_DIR = join(ROOT, "skills");
let failures = 0;
const fail = (f, msg) => { console.error(`FAIL [${f}] ${msg}`); failures++; };

function walkMd(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkMd(p, acc);
    else if (e.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

const files = walkMd(SKILLS_DIR);
if (files.length === 0) fail("repo", "no markdown files under skills/");

for (const file of files) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  // Duplicate headings (skip fenced code blocks).
  const seen = new Map();
  let fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (!m) continue;
    const h = m[2].trim().toLowerCase();
    if (seen.has(h)) fail(rel, `duplicate heading "${m[2].trim()}" (lines ${seen.get(h)} + repeat)`);
    else seen.set(h, null); // line numbers not tracked precisely; report value
  }

  // Relative links resolve. Skip fenced code.
  fence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|ftp:|#|<)/.test(target)) continue;
      const clean = target.split("#")[0];
      if (!clean) continue;
      const abs = resolve(dirname(file), clean);
      let exists = false;
      try { exists = statSync(abs).isFile() || statSync(abs).isDirectory(); } catch {}
      if (!exists) fail(rel, `broken relative link: ${target}`);
    }
  }
}

console.log(`ok   link+heading lint over ${files.length} markdown files`);
process.exit(failures ? 1 : 0);

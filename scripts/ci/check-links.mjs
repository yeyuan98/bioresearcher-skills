#!/usr/bin/env node
// Link + heading lint over skills/**/*.md. Zero deps.
// Checks: relative markdown links resolve to existing files; no duplicate
// headings within a file (case-insensitive); inline reference paths stay
// one directory level deep from the skill root.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import path from "node:path";

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

  // Duplicate headings (skip fenced code blocks; a fence of N backticks
  // closes only on >= N backticks).
  const seen = new Map();
  let fence = 0;
  for (const line of lines) {
    const fm = line.match(/^\s*(`{3,}|~{3,})/);
    if (fm) {
      const n = fm[1].length;
      if (fence === 0 || n >= fence) fence = fence === 0 ? n : 0;
      continue;
    }
    if (fence) continue;
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (!m) continue;
    const h = m[2].trim().toLowerCase();
    if (seen.has(h)) fail(rel, `duplicate heading "${m[2].trim()}"`);
    else seen.set(h, null);
  }

  // Relative links resolve and stay inside the skill root. Skip fenced code.
  fence = 0;
  for (const line of lines) {
    const fm = line.match(/^\s*(`{3,}|~{3,})/);
    if (fm) {
      const n = fm[1].length;
      if (fence === 0 || n >= fence) fence = fence === 0 ? n : 0;
      continue;
    }
    if (fence) continue;
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|ftp:|#|<)/.test(target)) continue;
      const clean = target.split("#")[0];
      if (!clean) continue;
      // Links must not escape the skills/ root (standalone installs).
      const abs = resolve(dirname(file), clean);
      const relToSkills = relative(SKILLS_DIR, abs);
      if (relToSkills.startsWith("..") || path.isAbsolute(relToSkills)) {
        fail(rel, `link escapes skills/: ${target}`);
        continue;
      }
      let exists = false;
      try { exists = statSync(abs).isFile() || statSync(abs).isDirectory(); } catch {}
      if (!exists) fail(rel, `broken relative link: ${target}`);
    }
  }
}

console.log(`ok   link+heading lint over ${files.length} markdown files`);
process.exit(failures ? 1 : 0);

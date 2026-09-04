#!/usr/bin/env node
// Tool-name drift gate. Zero deps.
// Every `biomcp_<token>` occurrence in skills/ must strip to a tool in the
// pinned biomcp-ts registry (scripts/ci/biomcp-tools.json). This catches
// references to tools that do not exist (or were renamed) in the pinned
// server version. Refresh the JSON when bumping the biomcp-ts pin.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
const registry = JSON.parse(readFileSync(join(ROOT, "scripts", "ci", "biomcp-tools.json"), "utf8"));
const known = new Set([...registry.core, ...registry.optional]);

function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(md|py)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

let failures = 0;
let refs = 0;
for (const file of walk(join(ROOT, "skills"))) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/biomcp_([a-z0-9_]+)/g)) {
    refs++;
    // Accept both plain tool names and self-prefixed ones (biomcp_configure).
    if (!known.has(m[1]) && !known.has(m[0])) {
      console.error(`FAIL unknown biomcp tool reference "${m[0]}" in ${file}`);
      failures++;
    }
  }
}
if (refs === 0) { console.error("FAIL no biomcp tool references found in skills/ — gate is vacuous"); failures++; }
else console.log(`ok   ${refs} biomcp tool references all match pinned registry v${registry.biomcp_ts_version}`);
process.exit(failures ? 1 : 0);

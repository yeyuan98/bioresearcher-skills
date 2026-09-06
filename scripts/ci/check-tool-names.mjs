#!/usr/bin/env node
// Tool-name drift gate. Zero deps.
// Every `biomcp_<token>` occurrence in skills/ and .claude-plugin/agents/
// must strip to a tool in the pinned biomcp-ts registry
// (scripts/ci/biomcp-tools.json). This catches references to tools that do
// not exist (or were renamed) in the pinned server version. Refresh the JSON
// when bumping the biomcp-ts pin. Claude Code server rules (mcp__<server> /
// mcp__<server>__*) are stripped first: they reference servers, not tools.
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

const DIRS = [join(ROOT, "skills")];
const agentsDir = join(ROOT, ".claude-plugin", "agents");
if (existsSync(agentsDir)) DIRS.push(agentsDir);

// SCREAMING_SNAKE tokens with the biomcp_ prefix are env vars, not tools
// (e.g. BIOMCP_PROJECT_CONFIG, the .biomcp.json kill switch).
const ENV_ALLOWLIST = new Set(["biomcp_project_config"]);

let failures = 0;
let refs = 0;
for (const dir of DIRS) {
  for (const file of walk(dir)) {
    // Case-insensitive pass catches BIOMCP_SEARCH-style drift too. Strip
    // mcp__ server-rule tokens first (mcp__biomcp, mcp__<server>__<tool>):
    // they name servers/permission scopes, not canonical tool names.
    const text = readFileSync(file, "utf8").replace(/mcp__[A-Za-z0-9_*-]+/g, "");
    for (const m of text.matchAll(/biomcp_([a-z0-9_]+)/gi)) {
      const token = m[0];
      if (token === token.toUpperCase() && token !== token.toLowerCase()) {
        // Uppercase form: env var lane.
        if (!ENV_ALLOWLIST.has(token.toLowerCase())) {
          console.error(`FAIL unknown BIOMCP_* env var "${token}" in ${file}`);
          failures++;
        }
        continue;
      }
      refs++;
      // Accept both plain tool names and self-prefixed ones (biomcp_configure).
      if (!known.has(m[1].toLowerCase()) && !known.has(token.toLowerCase())) {
        console.error(`FAIL unknown biomcp tool reference "${token}" in ${file}`);
        failures++;
      }
    }
  }
}
if (refs === 0) { console.error("FAIL no biomcp tool references found in skills/ — gate is vacuous"); failures++; }
else console.log(`ok   ${refs} biomcp tool references all match pinned registry v${registry.biomcp_ts_version}`);
process.exit(failures ? 1 : 0);

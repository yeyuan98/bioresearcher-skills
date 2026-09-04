#!/usr/bin/env node
// Claude Code marketplace validation. Zero deps.
// Checks required fields, kebab-case + non-reserved marketplace name,
// plugin entries with relative "./" sources, plugin.json presence at the
// resolved source, and that declared skill paths exist.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");
let failures = 0;
const fail = (msg) => { console.error(`FAIL ${msg}`); failures++; };
const ok = (msg) => console.log(`ok   ${msg}`);

const RESERVED = new Set([
  "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official", "claude-plugins-community",
  "claude-community", "anthropic-marketplace", "anthropic-plugins", "agent-skills", "anthropic-agent-skills",
  "knowledge-work-plugins", "life-sciences", "claude-for-legal", "claude-for-financial-services",
  "financial-services-plugins", "first-party-plugins", "healthcare",
]);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const marketPath = join(ROOT, ".claude-plugin", "marketplace.json");
const market = JSON.parse(readFileSync(marketPath, "utf8"));
if (!KEBAB.test(market.name ?? "")) fail(`marketplace name "${market.name}" not kebab-case`);
if (RESERVED.has(market.name)) fail(`marketplace name "${market.name}" is reserved`);
if (!market.owner?.name) fail("marketplace.owner.name required");
if (!Array.isArray(market.plugins) || market.plugins.length === 0) fail("marketplace.plugins must be a non-empty array");

for (const p of market.plugins ?? []) {
  if (!KEBAB.test(p.name ?? "")) fail(`plugin name "${p.name}" not kebab-case`);
  if (typeof p.source !== "string" || !p.source.startsWith("./")) fail(`plugin ${p.name}: source must be a relative "./" path`);
  const pluginDir = resolve(ROOT, p.source);
  if (!statSync(pluginDir).isDirectory()) fail(`plugin ${p.name}: source dir missing: ${p.source}`);
  const pluginJson = join(pluginDir, ".claude-plugin", "plugin.json");
  if (!existsSync(pluginJson)) { fail(`plugin ${p.name}: missing .claude-plugin/plugin.json under ${p.source}`); continue; }
  const plugin = JSON.parse(readFileSync(pluginJson, "utf8"));
  if (!plugin.name) fail(`plugin.json missing name`);
  if (!plugin.version) fail(`plugin.json ${plugin.name}: version required (users only update when it changes)`);
  if (!plugin.author?.name) fail(`plugin.json ${plugin.name}: author.name required`);
  for (const s of plugin.skills ?? []) {
    const skillDir = resolve(pluginDir, s);
    if (!existsSync(join(skillDir, "SKILL.md"))) fail(`plugin ${plugin.name}: declared skill path missing SKILL.md: ${s}`);
  }
}
ok(`marketplace "${market.name}" + ${market.plugins?.length ?? 0} plugin(s) valid`);
process.exit(failures ? 1 : 0);

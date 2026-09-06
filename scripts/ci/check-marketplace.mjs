#!/usr/bin/env node
// Claude Code marketplace validation. Zero deps.
// Checks required fields, kebab-case + non-reserved marketplace name,
// plugin entries with relative "./" sources, plugin.json presence at the
// resolved source, that declared skill paths exist, that the bundled MCP
// config (plugin.json mcpServers path) matches the biomcp-tools.json pin,
// and that declared agent paths exist.
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

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
  let isDir = false;
  try { isDir = statSync(pluginDir).isDirectory(); } catch {}
  if (!isDir) fail(`plugin ${p.name}: source dir missing: ${p.source}`);
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
  // Bundled MCP server config: must be a manifest-declared path inside the
  // plugin dir defining exactly one pinned core-only biomcp stdio server.
  const mcpField = plugin.mcpServers;
  if (typeof mcpField !== "string" || !mcpField.startsWith("./")) {
    fail(`plugin ${plugin.name}: mcpServers must be a relative "./" path to the bundled MCP config`);
  } else {
    const mcpPath = resolve(pluginDir, mcpField);
    if (relative(pluginDir, mcpPath).startsWith("..")) fail(`plugin ${plugin.name}: mcpServers path escapes plugin dir: ${mcpField}`);
    else if (!existsSync(mcpPath) || !statSync(mcpPath).isFile()) fail(`plugin ${plugin.name}: mcpServers file missing: ${mcpField}`);
    else {
      let mcp = null;
      try { mcp = JSON.parse(readFileSync(mcpPath, "utf8")); }
      catch (e) { fail(`plugin ${plugin.name}: mcpServers file does not parse: ${e.message}`); }
      if (mcp) {
        const servers = Object.keys(mcp.mcpServers ?? {});
        if (servers.length !== 1 || servers[0] !== "biomcp") {
          fail(`plugin ${plugin.name}: bundled MCP config must define exactly one server "biomcp", found ${JSON.stringify(servers)}`);
        } else {
          const registry = JSON.parse(readFileSync(join(ROOT, "scripts", "ci", "biomcp-tools.json"), "utf8"));
          const wantArgs = ["-y", "-p", `biomcp@${registry.biomcp_ts_version}`, "biomcp"];
          const srv = mcp.mcpServers.biomcp;
          if (srv.type !== "stdio" || srv.command !== "npx" || JSON.stringify(srv.args ?? []) !== JSON.stringify(wantArgs)) {
            fail(`plugin ${plugin.name}: bundled biomcp server must be "npx ${wantArgs.join(" ")}" (pin must match scripts/ci/biomcp-tools.json biomcp_ts_version ${registry.biomcp_ts_version})`);
          }
        }
      }
    }
  }
  // Declared plugin agents: manifest-referenced files must exist in-tree.
  for (const a of plugin.agents ?? []) {
    const ap = resolve(pluginDir, a);
    if (relative(pluginDir, ap).startsWith("..")) fail(`plugin ${plugin.name}: agents path escapes plugin dir: ${a}`);
    else if (!existsSync(ap) || !statSync(ap).isFile()) fail(`plugin ${plugin.name}: declared agent path missing: ${a}`);
  }
}
ok(`marketplace "${market.name}" + ${market.plugins?.length ?? 0} plugin(s) valid`);
process.exit(failures ? 1 : 0);

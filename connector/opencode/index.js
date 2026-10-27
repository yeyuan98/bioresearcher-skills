// opencode v2 plugin (framework: @opencode/plugin Plugin.define).
// Delivers the bundled bioresearcher skills via ctx.skill.transform and
// installs the bioresearcher-dr-worker subagent prompt as a global agent
// markdown file under <config>/opencode/agents/. The biomcp MCP server is
// NOT registered programmatically: opencode v2's mcp.transform hook is
// broken upstream, so the server is config-driven (mcp.servers.biomcp in
// opencode.json; the bundled bioresearcher-onboard skill writes it).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Plugin } from "@opencode/plugin";

const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(PLUGIN_ROOT, "skills");
const AGENT_SRC = path.join(PLUGIN_ROOT, "agents", "bioresearcher-dr-worker.md");
const AGENT_NAME = "bioresearcher-dr-worker.md";
const STAMP_RE = /<!--\s*bioresearcher-stamp v([^\s>]+)\s*-->/;

function stripQuotes(value) {
  const t = value.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

// Minimal strict-6 frontmatter reader: YAML between the first two `---`
// lines, single-line `key: value` pairs only (what our SKILL.md files use).
function parseFrontmatter(text, fallbackName) {
  const lines = text.split(/\r?\n/);
  let name = fallbackName;
  let description = "";
  if (lines[0]?.trim() === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 1) {
      for (const line of lines.slice(1, end)) {
        const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (!m) continue;
        if (m[1] === "name") {
          const v = stripQuotes(m[2]);
          if (v) name = v;
        } else if (m[1] === "description") {
          let v = stripQuotes(m[2]);
          if (v.startsWith("[") && v.endsWith("]")) {
            const inner = v.slice(1, -1);
            const s = /"([^"]*)"/.exec(inner) || /'([^']*)'/.exec(inner);
            v = (s ? s[1] : inner).trim();
          }
          description = v;
        }
      }
    }
  }
  return { name, description };
}

// First sentence of the description, hard-trimmed to ~200 chars.
function firstSentence(value) {
  let s = value.split(" - ")[0].trim();
  const m = /^(.{20,}?[.!?])(?:\s|$)/.exec(s);
  if (m) s = m[1];
  if (s.length > 200) s = `${s.slice(0, 197).replace(/\s+\S*$/, "")}...`;
  return s;
}

// Read the bundled skills once; closed over by the transform hook.
function loadSkillRecords() {
  const records = [];
  let entries = [];
  try {
    entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch {
    return records; // no bundled skills dir -> deliver nothing, never throw
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const skillPath = path.join(SKILLS_DIR, e.name, "SKILL.md");
    try {
      const content = fs.readFileSync(skillPath, "utf8");
      const { name, description } = parseFrontmatter(content, e.name);
      records.push({
        id: e.name,
        name,
        description: firstSentence(description),
        path: skillPath,
        content,
      });
    } catch {
      // unreadable/missing SKILL.md -> skip the skill, never throw
    }
  }
  return records;
}

// <XDG_CONFIG_HOME or ~/.config>/opencode/agents — opencode v2 auto-loads
// agent markdown files from this directory.
function resolveAgentsDir() {
  const configRoot = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(configRoot, "opencode", "agents");
}

// Idempotent, stamp-guarded install of the dr-worker agent prompt.
// - target missing                  -> write
// - target stamp == source stamp    -> skip (idempotent)
// - target stamp != source stamp    -> overwrite (plugin upgrade)
// - target has NO stamp             -> user-owned file, never touch
function installAgentPrompt() {
  let source;
  try {
    source = fs.readFileSync(AGENT_SRC, "utf8");
  } catch {
    return; // no bundled agent prompt -> nothing to install
  }
  const sourceStamp = STAMP_RE.exec(source)?.[1];
  if (!sourceStamp) return; // unsourced build artifact; refuse to guess
  const body = source.replaceAll("${PLUGIN_ROOT}", PLUGIN_ROOT);
  const targetDir = resolveAgentsDir();
  const target = path.join(targetDir, AGENT_NAME);
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    try {
      const existing = fs.readFileSync(target, "utf8");
      if (STAMP_RE.exec(existing)?.[1] === sourceStamp) return; // up to date
      if (!STAMP_RE.test(existing)) return; // user-owned, never overwrite
    } catch {
      // target unreadable/missing -> fall through and write
    }
    fs.writeFileSync(target, body);
  } catch {
    // read-only config dir etc. -> skills still work; never break plugin load
  }
}

export default Plugin.define({
  id: "bioresearcher",
  async setup(ctx) {
    // 1. Register bundled skills (idempotent; content is required by v2).
    const records = loadSkillRecords();
    ctx.skill.transform((ed) => {
      for (const s of records) {
        try {
          ed.add({ id: s.id, name: s.name, description: s.description, path: s.path, content: s.content });
        } catch {
          // one bad record must not block the rest or break the transform
        }
      }
    });

    // 2. Install the dr-worker subagent prompt as a global agent file.
    installAgentPrompt();

    // 3. No MCP registration: v2's mcp.transform is broken upstream; biomcp
    //    is registered via mcp.servers.biomcp in opencode.json (the bundled
    //    bioresearcher-onboard skill writes that entry).

    // 4. No cleanup: removing the agent file here would flap on every
    //    location reload (setup/cleanup run per config load, not once per
    //    process). Uninstall is documented as a one-line rm.
    return () => {};
  },
});

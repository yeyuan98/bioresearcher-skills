import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(PLUGIN_ROOT, "skills");
const AGENT_PROMPT_PATH = path.join(PLUGIN_ROOT, "agents", "bioresearcher-dr-worker.md");

/**
 * Loads and prepares the bioresearcher-dr-worker subagent prompt.
 * Replaces Claude-specific ${CLAUDE_PLUGIN_ROOT} with the actual plugin root path.
 */
function loadWorkerPrompt() {
  let prompt = "";
  if (fs.existsSync(AGENT_PROMPT_PATH)) {
    const raw = fs.readFileSync(AGENT_PROMPT_PATH, "utf8").replace(/^\uFEFF/, "");
    prompt = raw.replace(/^---[\r\n]+[\s\S]*?[\r\n]+---\r?\n*/, "");
  } else {
    prompt = "You are a bioresearcher deep-research aspect worker.";
  }
  return prompt.replaceAll("${CLAUDE_PLUGIN_ROOT}", PLUGIN_ROOT);
}

/**
 * Extracts YAML frontmatter name, description, and markdown body from SKILL.md.
 * Zero-dependency parser matching the Agent Skills strict-6 frontmatter structure.
 */
function parseSkillFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const match = raw.match(/^---[\r\n]+([\s\S]*?)[\r\n]+---[\r\n]*([\s\S]*)$/);
    if (!match) return null;
    const frontmatterRaw = match[1];
    const content = match[2];

    let name = "";
    let description = "";
    for (const line of frontmatterRaw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("name:")) {
        name = trimmed.slice(5).trim().replace(/^["']|["']$/g, "").trim();
      } else if (trimmed.startsWith("description:")) {
        description = trimmed.slice(12).trim().replace(/^["']|["']$/g, "").trim();
      }
    }
    if (!name || !description) return null;
    return { name, description, content };
  } catch {
    return null;
  }
}

export const name = "bioresearcher";
export const inject = ["tools", "skills"];

export async function apply(ctx, config = {}) {
  const isWin = process.platform === "win32";
  const npxCmd = isWin ? "npx.cmd" : "npx";

  const npmRegistry =
    process.env.npm_config_registry ||
    process.env.NPM_CONFIG_REGISTRY ||
    (Intl.DateTimeFormat().resolvedOptions().timeZone?.includes("Shanghai")
      ? "https://registry.npmmirror.com"
      : undefined);

  // 1. Mount biomcp MCP client if not already mounted
  try {
    const McpClient = await import("@deepseek-ai/dsh-mcp-client");
    ctx.plugin(McpClient.default ?? McpClient, {
      transport: "stdio",
      serverName: "biomcp",
      command: npxCmd,
      args: ["-y", "-p", "biomcp@1.1.1", "biomcp"],
      env: {
        ...(npmRegistry ? { npm_config_registry: npmRegistry } : {}),
      },
      cwd: "",
      toolCallTimeoutMs: 120000,
    });
  } catch (err) {
    // If dsh-mcp-client is already active or unavailable, log non-fatal warning
    ctx.logger?.warn?.(`[bioresearcher] biomcp MCP client mount note: ${err?.message || err}`);
  }

  // 2. Register bundled skills with dsh skills registry with lifecycle effect disposal
  if (ctx.skills?.register && fs.existsSync(SKILLS_DIR)) {
    const bundleFile = path.join(PLUGIN_ROOT, "skill-bundle.json");
    let bundle = [];
    if (fs.existsSync(bundleFile)) {
      try {
        bundle = JSON.parse(fs.readFileSync(bundleFile, "utf8")).skills || [];
      } catch {}
    }
    if (bundle.length === 0) {
      bundle = fs.readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    }

    for (const skillName of bundle) {
      const skillDir = path.join(SKILLS_DIR, skillName);
      const skillMd = path.join(skillDir, "SKILL.md");
      const parsed = parseSkillFile(skillMd);
      if (parsed) {
        try {
          const reg = {
            name: parsed.name,
            description: parsed.description,
            content: parsed.content,
            source: "bioresearcher",
            resourceBase: {
              kind: "directory",
              path: skillDir,
            },
          };
          if (typeof ctx.effect === "function") {
            ctx.effect(() => ctx.skills.register(reg));
          } else {
            ctx.skills.register(reg);
          }
        } catch (err) {
          ctx.logger?.warn?.(`[bioresearcher] Failed to register skill ${parsed.name}: ${err?.message || err}`);
        }
      }
    }
  }

  // 3. Register deep-research aspect worker subagent if an agent roster service is active
  const workerPrompt = loadWorkerPrompt();
  const agentsService = ctx.get?.("agents");
  if (agentsService?.register) {
    try {
      const agentDef = {
        name: "bioresearcher-dr-worker",
        description:
          "Deep-research aspect worker for the bioresearcher-deep-research skill. Researches exactly ONE assigned biomedical aspect via the biomcp MCP server and writes one self-contained cited markdown file.",
        prompt: workerPrompt,
        tools: ["mcp__biomcp__*", "read", "write", "glob", "grep"],
      };
      if (typeof ctx.effect === "function") {
        ctx.effect(() => {
          const res = agentsService.register(agentDef);
          return typeof res === "function" ? res : undefined;
        });
      } else {
        agentsService.register(agentDef);
      }
    } catch (err) {
      ctx.logger?.debug?.(`[bioresearcher] Agent registration note: ${err?.message || err}`);
    }
  }
}

export default { name, inject, apply };

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
    const raw = fs.readFileSync(AGENT_PROMPT_PATH, "utf8");
    prompt = raw.replace(/^---[\s\S]*?---\n*/, "");
  } else {
    prompt = "You are a bioresearcher deep-research aspect worker.";
  }
  return prompt.replaceAll("${CLAUDE_PLUGIN_ROOT}", PLUGIN_ROOT);
}

export const BioresearcherPlugin = async () => {
  const workerPrompt = loadWorkerPrompt();
  const isWin = process.platform === "win32";
  const npxCmd = isWin ? "npx.cmd" : "npx";

  const npmRegistry =
    process.env.npm_config_registry ||
    process.env.NPM_CONFIG_REGISTRY ||
    (Intl.DateTimeFormat().resolvedOptions().timeZone?.includes("Shanghai")
      ? "https://registry.npmmirror.com"
      : undefined);

  return {
    config: async (cfg) => {
      // 1. Automatically register biomcp stdio MCP server (pinned to 1.4.0)
      cfg.mcp = cfg.mcp || {};
      if (!cfg.mcp["biomcp"]) {
        cfg.mcp["biomcp"] = {
          type: "local",
          command: [npxCmd, "-y", "-p", "biomcp@1.4.0", "biomcp"],
          enabled: true,
          timeout: 120000,
          environment: {
            ...(npmRegistry ? { npm_config_registry: npmRegistry } : {}),
          },
        };
      }

      // 2. Automatically register bundled skills path
      cfg.skills = cfg.skills || {};
      cfg.skills.paths = cfg.skills.paths || [];
      if (fs.existsSync(SKILLS_DIR) && !cfg.skills.paths.includes(SKILLS_DIR)) {
        cfg.skills.paths.push(SKILLS_DIR);
      }

      // 3. Automatically register bioresearcher-dr-worker subagent
      cfg.agent = cfg.agent || {};
      if (!cfg.agent["bioresearcher-dr-worker"]) {
        cfg.agent["bioresearcher-dr-worker"] = {
          mode: "subagent",
          description:
            "Deep-research aspect worker for the bioresearcher-deep-research skill. Researches exactly ONE assigned biomedical aspect via the biomcp MCP server and writes one self-contained cited markdown file.",
          permission: {
            bash: "deny",
            task: "deny",
          },
          prompt: workerPrompt,
        };
      }
    },
  };
};

export default BioresearcherPlugin;

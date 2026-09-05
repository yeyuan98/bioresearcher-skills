#!/usr/bin/env node
/**
 * Stage 1 Onboarding Engine for bioresearcher-onboard.
 * Installs biomcp@1.1.1 into .bioresearcher-runtime/node_modules, configures
 * optional features via .biomcp.json, non-destructively merges harness
 * configuration files, and runs pre-flight doctor verification.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const CWD = process.cwd();
const RUNTIME_ROOT = process.env.BIORESEARCHER_RUNTIME_DIR || path.resolve(CWD, ".bioresearcher-runtime");
const CACHE_DIR = path.join(RUNTIME_ROOT, "npm-cache");
const IS_WIN = process.platform === "win32";

// 1. Resolve Node and npm executables
let nodeBin = process.execPath;
const vendoredNode = IS_WIN
  ? path.join(RUNTIME_ROOT, "node", "node.exe")
  : path.join(RUNTIME_ROOT, "node", "bin", "node");

if (fs.existsSync(vendoredNode)) {
  nodeBin = vendoredNode;
}

let npmBin = IS_WIN
  ? path.join(RUNTIME_ROOT, "node", "npm.cmd")
  : path.join(RUNTIME_ROOT, "node", "bin", "npm");

if (!fs.existsSync(npmBin)) {
  npmBin = "npm";
}

// 2. Parse CLI options
const args = process.argv.slice(2);
const getArgVal = (prefix) => {
  const match = args.find((a) => a.startsWith(prefix));
  return match ? match.slice(match.indexOf("=") + 1) : null;
};

const options = {
  withR: args.includes("--with-r") || process.env.ONBOARD_R === "1",
  withMysql: args.includes("--with-mysql") || process.env.ONBOARD_MYSQL === "1",
  withBiowasm: args.includes("--with-biowasm") || process.env.ONBOARD_BIOWASM === "1",
  sqlitePath: getArgVal("--sqlite-path=") || process.env.ONBOARD_SQLITE_PATH || null,
  client: getArgVal("--client=") || null,
  registry: getArgVal("--registry=") || process.env.NPM_CONFIG_REGISTRY || "https://registry.npmjs.org",
  nonInteractive: args.includes("--non-interactive") || !process.stdin.isTTY,
};

console.log("[bioresearcher-onboard] Initializing project-local BioMCP runtime...");

// 3. Prepare isolated .bioresearcher-runtime directory
fs.mkdirSync(RUNTIME_ROOT, { recursive: true });
fs.mkdirSync(CACHE_DIR, { recursive: true });

const runtimePkgJson = path.join(RUNTIME_ROOT, "package.json");
if (!fs.existsSync(runtimePkgJson)) {
  fs.writeFileSync(runtimePkgJson, JSON.stringify({ name: "bioresearcher-runtime", private: true }, null, 2));
}

// 4. Determine packages to install
const packagesToInstall = ["biomcp@1.1.1"];
if (options.withR) packagesToInstall.push("webr@0.6");
if (options.withMysql) packagesToInstall.push("mysql2@3");

console.log(`[bioresearcher-onboard] Installing dependencies (${packagesToInstall.join(", ")}) via ${options.registry}...`);

const npmEnv = {
  ...process.env,
  npm_config_cache: CACHE_DIR,
  npm_config_userconfig: IS_WIN ? "NUL" : "/dev/null",
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
  npm_config_registry: options.registry,
};

const installArgs = ["install", "--prefix", RUNTIME_ROOT, "--ignore-scripts", ...packagesToInstall];
const installRes = spawnSync(npmBin, installArgs, {
  env: npmEnv,
  stdio: "inherit",
  cwd: RUNTIME_ROOT,
});

if (installRes.status !== 0) {
  console.error("[bioresearcher-onboard] Error: Failed to install packages into .bioresearcher-runtime");
  process.exit(installRes.status || 1);
}

// 5. Verify bundle path
const bundlePath = path.join(RUNTIME_ROOT, "node_modules", "biomcp", "dist", "bundle.js");
if (!fs.existsSync(bundlePath)) {
  console.error(`[bioresearcher-onboard] Error: BioMCP bundle not found at ${bundlePath}`);
  process.exit(1);
}

// 6. Generate .biomcp.json if optional features are requested
const featuresConfig = {};
if (options.withR) {
  featuresConfig.analysis_r = { enabled: true };
}
if (options.withBiowasm) {
  featuresConfig.analysis_biowasm = { enabled: true };
}
if (options.sqlitePath) {
  featuresConfig.database = {
    enabled: true,
    type: "sqlite",
    sqlite_path: options.sqlitePath,
  };
} else if (options.withMysql) {
  featuresConfig.database = {
    enabled: true,
    type: "mysql",
  };
}

const biomcpJsonPath = path.resolve(CWD, ".biomcp.json");
if (Object.keys(featuresConfig).length > 0) {
  let existing = {};
  if (fs.existsSync(biomcpJsonPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(biomcpJsonPath, "utf8"));
    } catch {}
  }
  existing.features = { ...existing.features, ...featuresConfig };

  // Write atomically with 0o600 permissions
  const tmpPath = `${biomcpJsonPath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, biomcpJsonPath);
  console.log(`[bioresearcher-onboard] Configured optional features in .biomcp.json`);
}

// 7. Non-destructive deep-merge of client harness configuration files
// Normalize Windows paths to POSIX forward slashes for valid JSON strings
const normalizedNodePath = IS_WIN ? nodeBin.replace(/\\/g, "/") : nodeBin;
const normalizedBundlePath = IS_WIN ? bundlePath.replace(/\\/g, "/") : bundlePath;

function stripJsonc(content) {
  let result = "";
  let inString = false;
  let inSingleComment = false;
  let inMultiComment = false;
  let isEscaped = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inSingleComment) {
      if (ch === "\n") {
        inSingleComment = false;
        result += ch;
      }
      continue;
    }

    if (inMultiComment) {
      if (ch === "*" && next === "/") {
        inMultiComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      result += ch;
      if (isEscaped) {
        isEscaped = false;
      } else if (ch === "\\") {
        isEscaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      isEscaped = false;
      result += ch;
      continue;
    }

    if (ch === "/" && next === "/") {
      inSingleComment = true;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      inMultiComment = true;
      i++;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      let isTrailing = false;
      let tempInSingle = false;
      let tempInMulti = false;
      while (j < content.length) {
        const cj = content[j];
        const nj = content[j + 1];
        if (tempInSingle) {
          if (cj === "\n") tempInSingle = false;
          j++;
          continue;
        }
        if (tempInMulti) {
          if (cj === "*" && nj === "/") {
            tempInMulti = false;
            j += 2;
            continue;
          }
          j++;
          continue;
        }
        if (cj === "/" && nj === "/") {
          tempInSingle = true;
          j += 2;
          continue;
        }
        if (cj === "/" && nj === "*") {
          tempInMulti = true;
          j += 2;
          continue;
        }
        if (/\s/.test(cj)) {
          j++;
          continue;
        }
        if (cj === "}" || cj === "]") {
          isTrailing = true;
        }
        break;
      }
      if (isTrailing) {
        continue;
      }
    }

    result += ch;
  }

  return result.trim();
}

function safeMergeJson(filePath, updater) {
  let data = {};
  let backedUp = false;
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf8");
    if (raw.trim().length > 0) {
      try {
        data = JSON.parse(stripJsonc(raw));
      } catch (e) {
        console.error(`[bioresearcher-onboard] Error: Failed to parse existing JSONC at ${filePath}: ${e.message}`);
        console.error(`[bioresearcher-onboard] Aborting modification to prevent data loss. Existing file was not modified.`);
        process.exit(1);
      }
    }
    fs.copyFileSync(filePath, `${filePath}.bak`);
    backedUp = true;
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    data = {};
  }

  const updated = updater(data);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(updated, null, 2));
  fs.renameSync(tmp, filePath);
  if (backedUp) {
    console.log(`[bioresearcher-onboard] Updated ${path.basename(filePath)} (backup saved to ${path.basename(filePath)}.bak)`);
  } else {
    console.log(`[bioresearcher-onboard] Created ${path.basename(filePath)}`);
  }
}

// Probe harness configs upfront to avoid generating unintended files
const opencodePath = path.resolve(CWD, "opencode.json");
const claudePath = path.resolve(CWD, ".mcp.json");
const cursorDir = path.resolve(CWD, ".cursor");
const cursorPath = path.join(cursorDir, "mcp.json");

const zcodeDir = path.resolve(CWD, ".zcode");
const zcodePath = path.join(zcodeDir, "config.json");

const piDir = path.resolve(CWD, ".pi");
const piPath = path.join(piDir, "mcp.json");

const codebuddyDir = path.resolve(CWD, ".codebuddy");
const codebuddySettingsPath = path.join(codebuddyDir, "settings.json");
const codebuddyMdPath = path.resolve(CWD, "CODEBUDDY.md");

const workbuddyDir = path.resolve(CWD, ".workbuddy");
const workbuddyPath = path.join(workbuddyDir, "mcp.json");
const workbuddyMdPath = path.resolve(CWD, "WORKBUDDY.md");

const opencodeExists = fs.existsSync(opencodePath);
const claudeExists = fs.existsSync(claudePath);
const cursorExists = fs.existsSync(cursorDir) || fs.existsSync(cursorPath);
const zcodeExists = fs.existsSync(zcodeDir) || fs.existsSync(zcodePath) || Boolean(process.env.ZCODE_WORKSPACE);
const piExists = fs.existsSync(piDir) || fs.existsSync(piPath) || Boolean(process.env.PI_CODING_AGENT_DIR);
const codebuddyExists = fs.existsSync(codebuddyDir) || fs.existsSync(codebuddyMdPath) || Boolean(process.env.CODEBUDDY_CLI);
const workbuddyExists = fs.existsSync(workbuddyDir) || fs.existsSync(workbuddyPath) || fs.existsSync(workbuddyMdPath);

// Normalize client argument with aliases
const clientArg = (options.client || "").toLowerCase().trim();
const clientAliases = {
  "claude": "claude-code",
  "code-buddy": "codebuddy",
  "work-buddy": "workbuddy",
  "pi-agent": "pi",
};
const resolvedClient = clientAliases[clientArg] || clientArg;

const validClients = ["opencode", "claude-code", "cursor", "zcode", "pi", "codebuddy", "workbuddy"];
if (resolvedClient && !validClients.includes(resolvedClient)) {
  console.error(`[bioresearcher-onboard] Error: Unknown client "${options.client}". Valid options: ${validClients.join(", ")}`);
  process.exit(1);
}

let targetOpencode  = resolvedClient === "opencode"    || (!resolvedClient && opencodeExists);
let targetClaude    = resolvedClient === "claude-code" || (!resolvedClient && claudeExists && !codebuddyExists);
let targetCursor    = resolvedClient === "cursor"     || (!resolvedClient && cursorExists);
let targetZcode     = resolvedClient === "zcode"      || (!resolvedClient && zcodeExists);
let targetPi        = resolvedClient === "pi"         || (!resolvedClient && piExists);
let targetCodebuddy = resolvedClient === "codebuddy"  || (!resolvedClient && codebuddyExists);
let targetWorkbuddy = resolvedClient === "workbuddy"  || (!resolvedClient && workbuddyExists);

// Default to opencode.json if no client specified and no config file exists yet
const anyDetected = opencodeExists || claudeExists || cursorExists || zcodeExists || piExists || codebuddyExists || workbuddyExists;
if (!resolvedClient && !anyDetected) {
  targetOpencode = true;
}

// OpenCode: opencode.json
if (targetOpencode) {
  safeMergeJson(opencodePath, (data) => {
    data.$schema = data.$schema || "https://opencode.ai/config.json";
    data.mcp = data.mcp || {};
    data.mcp.biomcp = {
      type: "local",
      command: [normalizedNodePath, normalizedBundlePath],
      environment: data.mcp.biomcp?.environment || {},
      enabled: true,
      timeout: options.withR ? 120000 : 30000,
    };
    return data;
  });
}

// Claude Code: .mcp.json
if (targetClaude) {
  safeMergeJson(claudePath, (data) => {
    data.mcpServers = data.mcpServers || {};
    data.mcpServers.biomcp = {
      type: "stdio",
      command: normalizedNodePath,
      args: [normalizedBundlePath],
      env: data.mcpServers.biomcp?.env || {},
    };
    return data;
  });
}

// Cursor: .cursor/mcp.json
if (targetCursor) {
  safeMergeJson(cursorPath, (data) => {
    data.mcpServers = data.mcpServers || {};
    data.mcpServers.biomcp = {
      command: normalizedNodePath,
      args: [normalizedBundlePath],
      env: data.mcpServers.biomcp?.env || {},
    };
    return data;
  });
}

// ZCode: .zcode/config.json
if (targetZcode) {
  safeMergeJson(zcodePath, (data) => {
    data.mcp = data.mcp || {};
    data.mcp.servers = data.mcp.servers || {};
    data.mcp.servers.biomcp = {
      command: normalizedNodePath,
      args: [normalizedBundlePath],
      env: data.mcp.servers.biomcp?.env || {},
      enable: true,
    };
    return data;
  });
}

// Pi Coding Agent: .pi/mcp.json
if (targetPi) {
  safeMergeJson(piPath, (data) => {
    data.mcpServers = data.mcpServers || {};
    data.mcpServers.biomcp = {
      command: normalizedNodePath,
      args: [normalizedBundlePath],
      env: data.mcpServers.biomcp?.env || {},
    };
    return data;
  });
}

// CodeBuddy: .mcp.json + pre-approval in .codebuddy/settings.json
if (targetCodebuddy) {
  safeMergeJson(claudePath, (data) => {
    data.mcpServers = data.mcpServers || {};
    data.mcpServers.biomcp = {
      type: "stdio",
      command: normalizedNodePath,
      args: [normalizedBundlePath],
      env: data.mcpServers.biomcp?.env || {},
    };
    return data;
  });

  safeMergeJson(codebuddySettingsPath, (data) => {
    const approved = new Set(data.enabledMcpjsonServers || []);
    approved.add("biomcp");
    data.enabledMcpjsonServers = Array.from(approved);
    return data;
  });
}

// WorkBuddy: .workbuddy/mcp.json
if (targetWorkbuddy) {
  safeMergeJson(workbuddyPath, (data) => {
    data.mcpServers = data.mcpServers || {};
    data.mcpServers.biomcp = {
      type: "stdio",
      command: normalizedNodePath,
      args: [normalizedBundlePath],
      env: data.mcpServers.biomcp?.env || {},
    };
    return data;
  });
}

// 8. Run pre-flight verification via biomcp doctor --json
console.log("[bioresearcher-onboard] Running pre-flight verification via biomcp doctor...");
const cliPath = path.join(RUNTIME_ROOT, "node_modules", "biomcp", "dist", "cli.js");
const doctorRes = spawnSync(nodeBin, [cliPath, "doctor", "--json"], {
  cwd: CWD,
  encoding: "utf8",
});

if (doctorRes.status === 0) {
  try {
    const report = JSON.parse(doctorRes.stdout);
    console.log(`[bioresearcher-onboard] ✓ Pre-flight check PASSED (schema v${report.schema_version})`);
    console.log(`  Node: ${report.node.version} (required ${report.node.required})`);
    console.log(`  Install mode: ${report.server_context.install_mode}`);
    for (const f of report.features) {
      console.log(`  Feature ${f.id}: ${f.running_after_restart ? "ON after restart" : "off"}`);
    }
  } catch {
    console.log("[bioresearcher-onboard] ✓ Doctor exit code 0");
  }
} else {
  console.warn("[bioresearcher-onboard] Warning: Doctor reported potential blockers:");
  console.log(doctorRes.stdout || doctorRes.stderr);
}

// 9. Git Hygiene: Ensure .bioresearcher-runtime is gitignored
const gitignorePath = path.resolve(CWD, ".gitignore");
let gitignoreContent = "";
if (fs.existsSync(gitignorePath)) {
  gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
}
if (!gitignoreContent.includes(".bioresearcher-runtime")) {
  const newline = gitignoreContent.length > 0 && !gitignoreContent.endsWith("\n") ? "\n" : "";
  fs.appendFileSync(gitignorePath, `${newline}# BioMCP project-local runtime\n.bioresearcher-runtime/\n`);
  console.log("[bioresearcher-onboard] Added .bioresearcher-runtime/ to .gitignore");
}

console.log("\n========================================================");
console.log("✓ BioMCP runtime bootstrapped successfully!");
console.log(`  Runtime directory: .bioresearcher-runtime/`);
console.log(`  Node.js: ${nodeBin}`);
console.log(`  BioMCP bundle: ${bundlePath}`);
console.log("\n→ NEXT STEP: Restart your agent/client session to activate biomcp tools.");
console.log("========================================================\n");

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

function stripJsonComments(jsonString) {
  return jsonString
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function safeMergeJson(filePath, updater) {
  let data = {};
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      data = JSON.parse(stripJsonComments(raw));
      // Backup original
      fs.copyFileSync(filePath, `${filePath}.bak`);
    } catch (e) {
      console.warn(`[bioresearcher-onboard] Warning: Could not parse ${path.basename(filePath)}, writing fresh entry. Backup created.`);
      fs.copyFileSync(filePath, `${filePath}.bak`);
    }
  }

  const updated = updater(data);
  const tmp = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(updated, null, 2));
  fs.renameSync(tmp, filePath);
  console.log(`[bioresearcher-onboard] Updated ${path.basename(filePath)} (backup saved to ${path.basename(filePath)}.bak)`);
}

// Probe harness configs upfront to avoid generating unintended files
const opencodePath = path.resolve(CWD, "opencode.json");
const claudePath = path.resolve(CWD, ".mcp.json");
const cursorDir = path.resolve(CWD, ".cursor");
const cursorPath = path.join(cursorDir, "mcp.json");

const opencodeExists = fs.existsSync(opencodePath);
const claudeExists = fs.existsSync(claudePath);
const cursorExists = fs.existsSync(cursorDir) || fs.existsSync(cursorPath);

let targetOpencode = options.client === "opencode" || (!options.client && opencodeExists);
let targetClaude = options.client === "claude-code" || (!options.client && claudeExists);
let targetCursor = options.client === "cursor" || (!options.client && cursorExists);

// Default to opencode.json if no client specified and no config file exists yet
if (!options.client && !opencodeExists && !claudeExists && !cursorExists) {
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
  fs.mkdirSync(cursorDir, { recursive: true });
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

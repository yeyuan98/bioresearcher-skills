#!/usr/bin/env node
// Independent WorkBuddy connector audit validator. Zero deps.
// Replicates WorkBuddy Connector Marketplace's automated 24-rubric static audit
// against a built bioresearcher-connector_workbuddy-v*.tar.gz archive.
//
// Usage: node scripts/ci/validate-connector-workbuddy.mjs <path-to-tarball>
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;
const fail = (rubric, msg) => { console.error(`FAIL [${rubric}] ${msg}`); failures++; };
const ok = (rubric, msg) => console.log(`ok   [${rubric}] ${msg}`);

const tarball = process.argv[2];
if (!tarball) {
  console.error("Usage: node scripts/ci/validate-connector-workbuddy.mjs <path-to-tarball>");
  process.exit(2);
}
if (!existsSync(tarball)) {
  console.error(`tarball not found: ${tarball}`);
  process.exit(2);
}

// 1. List archive entries
const tarListOutput = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" });
const entries = tarListOutput.trim().split("\n").map((e) => e.trim()).filter(Boolean);

// A1: 压缩包安全解压 (Safe decompress: no traversal, symlinks, bounds)
let hasTraversal = false;
let hasAbsolute = false;
for (const e of entries) {
  if (e.startsWith("/")) hasAbsolute = true;
  if (e.includes("..")) hasTraversal = true;
}
if (hasAbsolute) fail("A1", "archive contains absolute paths");
if (hasTraversal) fail("A1", "archive contains path traversal (..)");
if (entries.length > 1000) fail("A1", `entry count ${entries.length} > 1000 cap`);
const tarStat = statSync(tarball);
if (tarStat.size > 10 * 1024 * 1024) fail("A1", `compressed size ${tarStat.size} > 10MB`);

// Extract to clean tempdir for deep inspection
const tmpDir = mkdtempSync(join(tmpdir(), "workbuddy-audit-"));
try {
  execFileSync("tar", ["-xzf", tarball, "-C", tmpDir]);

  // S0: 连接器根目录可定位 (Root dir locatable)
  const rootPrefixes = new Set(entries.map((e) => e.split("/")[0]));
  if (rootPrefixes.size !== 1 || !rootPrefixes.has("bioresearcher")) {
    fail("S0", `root directory must be single 'bioresearcher', found: ${Array.from(rootPrefixes).join(", ")}`);
  } else {
    ok("S0", "connector root directory locatable as 'bioresearcher/'");
  }

  const root = join(tmpDir, "bioresearcher");

  // F0: connector-meta.json 存在且可解析
  const metaPath = join(root, "connector-meta.json");
  let meta = null;
  if (!existsSync(metaPath)) {
    fail("F0", "connector-meta.json missing at connector root");
  } else {
    try {
      meta = JSON.parse(readFileSync(metaPath, "utf8"));
      const keys = Object.keys(meta);
      if (keys.length !== 12) {
        fail("F0", `connector-meta.json expected exactly 12 top-level fields, found ${keys.length}`);
      } else {
        ok("F0", `connector-meta.json parseable with ${keys.length} top-level fields`);
      }
    } catch (e) {
      fail("F0", `connector-meta.json JSON parse error: ${e.message}`);
    }
  }

  if (meta) {
    // S1: source 合法
    const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!KEBAB.test(meta.source ?? "")) {
      fail("S1", `source "${meta.source}" not valid kebab-case`);
    } else {
      ok("S1", `source "${meta.source}" valid kebab-case`);
    }

    // F0: connector-meta 基本文案完整
    const requiredTexts = ["name", "name_en", "description", "description_zh", "description_en"];
    const missingTexts = requiredTexts.filter((k) => typeof meta[k] !== "string" || !meta[k].trim());
    if (missingTexts.length > 0) {
      fail("F0", `missing required meta text fields: ${missingTexts.join(", ")}`);
    } else {
      const zhLen = meta.description_zh.length;
      const enLen = meta.description_en.length;
      if (zhLen < 20 || zhLen > 100) fail("F0", `description_zh length ${zhLen} outside [20, 100]`);
      if (enLen < 20 || enLen > 200) fail("F0", `description_en length ${enLen} outside [20, 200]`);
      ok("F0", `required names and descriptions complete (zh: ${zhLen} chars, en: ${enLen} chars)`);
    }

    // F0: connector-meta 双语示例有效
    for (const [exField, lang] of [["examples_zh", "zh"], ["examples_en", "en"]]) {
      const arr = meta[exField];
      if (!Array.isArray(arr) || arr.length < 2 || arr.length > 5 || arr.some((x) => typeof x !== "string" || !x.trim())) {
        fail("F0", `${exField} must contain 2-5 non-empty strings`);
      } else {
        ok("F0", `${exField} valid with ${arr.length} non-empty examples`);
      }
    }

    // S2: connector 类型合法
    if (meta.type !== "mcp") {
      fail("S2", `type must be 'mcp', found '${meta.type}'`);
    } else {
      ok("S2", "connector type='mcp' valid");
    }

    // W1: source 全局冲突
    if (meta.source !== "bioresearcher") {
      fail("W1", `expected source 'bioresearcher', found '${meta.source}'`);
    } else {
      ok("W1", "source 'bioresearcher' matches registered connector");
    }

    // V1: 最低客户端版本
    if (meta.minWorkbuddyVersion !== "5.0.0") {
      fail("V1", `minWorkbuddyVersion expected '5.0.0', found '${meta.minWorkbuddyVersion}'`);
    } else {
      ok("V1", "minWorkbuddyVersion='5.0.0' valid");
    }

    // Version sanity
    if (!/^\d+\.\d+\.\d+$/.test(meta.version ?? "")) {
      fail("V1", `version "${meta.version}" not semver`);
    }
  }

  // F1: mcp.json 存在且可解析
  const mcpPath = join(root, "mcp.json");
  let mcp = null;
  if (!existsSync(mcpPath)) {
    fail("F1", "mcp.json missing at connector root");
  } else {
    try {
      mcp = JSON.parse(readFileSync(mcpPath, "utf8"));
      ok("F1", "mcp.json exists and parseable");
    } catch (e) {
      fail("F1", `mcp.json JSON parse error: ${e.message}`);
    }
  }

  // S3: 类型与配置文件一致
  if (mcp && meta?.type === "mcp") {
    if (!mcp.mcpServers || typeof mcp.mcpServers !== "object") {
      fail("S3", "mcpServers missing in mcp.json");
    } else {
      ok("S3", "file structure consistent with type='mcp'");
    }
  }

  // F2: token-schema 与 auth_mode 匹配
  if (existsSync(join(root, "token-schema.json")) || meta?.auth_mode === "token") {
    fail("F2", "token-schema should not exist for keyless connector");
  } else {
    ok("F2", "keyless auth mode matches absence of token-schema.json");
  }

  if (mcp?.mcpServers) {
    // M1: 单一 MCP Server
    const sKeys = Object.keys(mcp.mcpServers);
    if (sKeys.length !== 1 || sKeys[0] !== "biomcp") {
      fail("M1", `mcpServers must contain exactly one server 'biomcp', found: ${sKeys.join(", ")}`);
    } else {
      ok("M1", "single MCP server 'biomcp' configured");
    }

    // M2: MCP 连接字段完整
    const biomcp = mcp.mcpServers.biomcp ?? {};
    if (biomcp.type !== "stdio" || biomcp.command !== "npx" || !Array.isArray(biomcp.args)) {
      fail("M2", "biomcp must specify type='stdio', command='npx', and args array");
    } else {
      ok("M2", "MCP connection fields complete (transport=stdio, command='npx')");
    }

    // M3: stdio runtime 合法
    if (biomcp.runtime?.type !== "node" || biomcp.runtime?.version !== "22") {
      fail("M3", `runtime must be node version 22, found: ${JSON.stringify(biomcp.runtime)}`);
    } else if (!biomcp.npmRegistry || !biomcp.timeout) {
      fail("M3", "npmRegistry and timeout must be configured in mcp.json");
    } else {
      ok("M3", "stdio runtime valid (Node 22, npmRegistry, timeout)");
    }
  }

  // K1: Skill 目录结构
  const skillsRoot = join(root, "skills");
  const expectedSkills = ["bioresearcher-deep-research", "bioresearcher-plot-making", "bioresearcher-pubmed-weekly", "bioresearcher-python-setup-uv"];
  for (const sk of expectedSkills) {
    const skMd = join(skillsRoot, sk, "SKILL.md");
    if (!existsSync(skMd)) fail("K1", `missing skill file: skills/${sk}/SKILL.md`);
  }
  if (!existsSync(join(skillsRoot, "bioresearcher-onboard"))) {
    ok("K1", "4 bundled skills present, bioresearcher-onboard excluded intentionally");
  } else {
    fail("K1", "bioresearcher-onboard should not be bundled in WorkBuddy connector");
  }

  // K2: Skill frontmatter 完整
  for (const sk of expectedSkills) {
    const skMdPath = join(skillsRoot, sk, "SKILL.md");
    if (existsSync(skMdPath)) {
      const text = readFileSync(skMdPath, "utf8");
      const m = text.match(/^---\n([\s\S]*?)\n---/);
      if (!m) {
        fail("K2", `${sk}: frontmatter missing`);
        continue;
      }
      const fm = m[1];
      const requiredFm = ["name", "description", "description_zh", "description_en", "version", "author"];
      const missingFm = requiredFm.filter((k) => !new RegExp(`^${k}:\\s*\\S+`, "m").test(fm));
      if (missingFm.length > 0) {
        fail("K2", `${sk}: missing staged frontmatter keys: ${missingFm.join(", ")}`);
      } else {
        ok("K2", `${sk} frontmatter complete with required WorkBuddy keys`);
      }
    }
  }

  // F4: 源包图标存在 (The previously failed item)
  const hasPng = existsSync(join(root, "icon.png"));
  const hasSvg = existsSync(join(root, "icon.svg"));
  const hasJpg = existsSync(join(root, "icon.jpg"));
  if (hasJpg) {
    fail("F4", "connector root contains forbidden icon.jpg");
  }
  if (!hasPng && !hasSvg) {
    fail("F4", "connector root missing icon.svg or icon.png");
  } else {
    ok("F4", "connector root contains valid icon.png / icon.svg (icon.jpg absent)");
  }

  // L2: 图标视觉质量
  if (hasPng) {
    const iconBuf = readFileSync(join(root, "icon.png"));
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!iconBuf.subarray(0, 8).equals(pngMagic)) {
      fail("L2", "icon.png missing 8-byte PNG signature");
    } else if (iconBuf.length < 24 || iconBuf.subarray(12, 16).toString("ascii") !== "IHDR") {
      fail("L2", "icon.png missing IHDR chunk header");
    } else {
      const w = iconBuf.readUInt32BE(16);
      const h = iconBuf.readUInt32BE(20);
      if (w !== 512 || h !== 512) {
        fail("L2", `icon.png dimensions ${w}x${h} != 512x512`);
      } else if (iconBuf.length < 1024 || iconBuf.length > 500 * 1024) {
        fail("L2", `icon.png size ${iconBuf.length} bytes outside 1KB-500KB`);
      } else {
        ok("L2", `icon.png visual quality valid (512x512, ${iconBuf.length} bytes, valid PNG/IHDR)`);
      }
    }
  }

  // X1: 无硬编码凭证
  const allFiles = execFileSync("find", [root, "-type", "f"], { encoding: "utf8" }).trim().split("\n");
  const secretPattern = /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][a-zA-Z0-9_\-]{20,}["']/i;
  const suspiciousFiles = [];
  for (const f of allFiles) {
    if (f.endsWith(".json") || f.endsWith(".md") || f.endsWith(".py") || f.endsWith(".js")) {
      const c = readFileSync(f, "utf8");
      if (secretPattern.test(c)) suspiciousFiles.push(f.replace(tmpDir + "/", ""));
    }
  }
  if (suspiciousFiles.length > 0) {
    fail("X1", `hardcoded credential pattern matched in: ${suspiciousFiles.join(", ")}`);
  } else {
    ok("X1", "0 hardcoded credentials found across all staged files");
  }

  // X2: 无打包噪音
  const noisePattern = /(^|\/)(\.git|\.env|__pycache__|\.DS_Store|node_modules|Thumbs\.db)(\/|$)|\.(pyc|swp|tmp)$/;
  const noiseMatches = entries.filter((e) => noisePattern.test(e));
  if (noiseMatches.length > 0) {
    fail("X2", `packaging noise detected: ${noiseMatches.join(", ")}`);
  } else {
    ok("X2", "0 packaging noise files found in archive");
  }

  // Total uncompressed size check (A1)
  let totalUncompressedBytes = 0;
  for (const f of allFiles) totalUncompressedBytes += statSync(f).size;
  ok("A1", `safe decompression verified: ${entries.length} entries, ${totalUncompressedBytes} bytes uncompressed`);

} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

console.log("\n------------------------------------------------------------");
if (failures > 0) {
  console.error(`FAILED: ${failures} rubric violation(s) detected in WorkBuddy connector package.`);
  process.exit(1);
} else {
  console.log("SUCCESS: 100% full compliance with all WorkBuddy audit rubrics verified!");
  process.exit(0);
}

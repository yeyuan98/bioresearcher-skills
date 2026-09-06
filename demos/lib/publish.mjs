#!/usr/bin/env node
/*
 * demos/lib/publish.mjs — artifact curator for demos/run-demo.mjs --publish.
 * Turns one graded rep (agent or mcp-probe kind) into the committed,
 * human-browsable demos/artifacts/<scenario>/ tree:
 *
 *   README.md       bilingual (en + zh) landing page: prompt/outcome/how-run
 *   transcript.md   curated event transcript (per-call trimmed outputs,
 *                   full final answer) — log.jsonl itself is NEVER committed
 *   result.json     the graded checks (verbatim from the rep)
 *   provenance.json exact bytes identity: git commit, versions, per-SKILL.md
 *                   sha256, durations, cost
 *   outputs/        headline products copied from the run dir via the
 *                   scenario's publish.outputs globs (per-file cap 1.5 MiB;
 *                   larger files are skipped with a note)
 *   screenshots/    NOT created here (added manually via lib/screenshot.sh
 *                   for flagship scenarios); README links it only if present
 *
 * Plain ESM JavaScript, node:stdlib only, zero npm dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO_URL = "https://github.com/yeyuan98/bioresearcher-skills";
const MAX_OUTPUT_BYTES = 1.5 * 1024 * 1024;
const CALL_OUTPUT_CHARS = 2000;
const CALL_OUTPUT_LINES = 15;

function statFile(file) {
  return fs.statSync(file, { throwIfNoEntry: false }) ?? null;
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/* Simple path glob: a double-star segment crosses directory boundaries,
 * single star and question mark do not. Examples: "combined.xlsx",
 * a double-star between "reports" and "final_report.md" (any depth),
 * "figures" + double-star + "*.png", or a trailing double-star under
 * "reports" (every file at any depth). */
function globToRegExp(pattern) {
  const segs = pattern.split("/").filter((s) => s.length > 0);
  let re = "^";
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const last = i === segs.length - 1;
    if (seg === "**") {
      if (last) re += "(?:[^/]+/)*[^/]+"; // any file at any depth below
      else re += "(?:[^/]+/)*";
      continue;
    }
    const esc = seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
    re += esc;
    if (!last) re += "/";
  }
  return new RegExp(re + "$");
}

function listFilesRecursive(root) {
  const out = [];
  const walk = (dir) => {
    for (const de of fs.readdirSync(dir, { withFileTypes: true })) {
      if (de.name === ".opencode" || de.name === "node_modules" || de.name === ".venv" || de.name === ".git") continue;
      const p = path.join(dir, de.name);
      if (de.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(root);
  return out;
}

function collectOutputs(runDir, globs) {
  const picked = [];
  const skipped = [];
  // Raw session logs/prompts are never published, whatever a glob matches.
  const NEVER = new Set(["log.jsonl", "prompt.txt", "result.json", "probe-result.json", "summary.json"]);
  if (!Array.isArray(globs) || globs.length === 0) return { picked, skipped };
  const res = globs.map((g) => ({ g, re: globToRegExp(g) }));
  for (const file of listFilesRecursive(runDir)) {
    if (NEVER.has(path.basename(file))) continue;
    const rel = path.relative(runDir, file).split(path.sep).join("/");
    for (const { g, re } of res) {
      if (!re.test(rel)) continue;
      const st = statFile(file);
      if (st && st.size > MAX_OUTPUT_BYTES) {
        skipped.push({ rel, reason: `file is ${(st.size / 1048576).toFixed(2)} MiB > ${(MAX_OUTPUT_BYTES / 1048576).toFixed(1)} MiB cap` });
      } else {
        picked.push({ rel, file });
      }
      break;
    }
  }
  picked.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return { picked, skipped };
}

function trimCallOutput(v) {
  const text = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (!text) return "*(no output)*";
  let out = text;
  // Neutralize fenced-block openers inside excerpts so an embedded ``` line
  // cannot break out of (or flip) the transcript's own fences (and with them
  // the committed-markdown gates).
  out = out.replace(/^(`{3,}|~{3,})/gm, (m) => m[0] + "\\" + m.slice(1));
  const lines = out.split(/\r?\n/);
  if (lines.length > CALL_OUTPUT_LINES) out = lines.slice(0, CALL_OUTPUT_LINES).join("\n") + `\n… [trimmed ${lines.length - CALL_OUTPUT_LINES} more line(s)]`;
  if (out.length > CALL_OUTPUT_CHARS) out = out.slice(0, CALL_OUTPUT_CHARS) + `… [trimmed ${out.length - CALL_OUTPUT_CHARS} more char(s)]`;
  return out;
}

function fmtCost(costTotal) {
  if (costTotal === null || costTotal === undefined || !Number.isFinite(Number(costTotal))) return null;
  return `$${Number(costTotal).toFixed(4)}`;
}

function extractBiomcpPin(scenario, runDir) {
  const tryText = (t) => {
    const m = String(t).match(/biomcp@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
    return m ? m[1] : null;
  };
  const cfg = path.join(runDir, "opencode.json");
  if (statFile(cfg)) {
    const v = tryText(fs.readFileSync(cfg, "utf8"));
    if (v) return v;
  }
  if (scenario.kind === "mcp-probe") {
    // Probe runs record their actual server command in probe-result.json
    // (covers manifests that rely on the pinned default command).
    const pr = path.join(runDir, "probe-result.json");
    if (statFile(pr)) {
      try {
        const v = tryText((JSON.parse(fs.readFileSync(pr, "utf8")).serverCommand ?? []).join(" "));
        if (v) return v;
      } catch {}
    }
    const v = tryText((scenario.spec.server?.command ?? []).join(" "));
    if (v) return v;
  }
  return null;
}

/* ------------------------------------------------------------ transcript: agent */

function agentTranscript(scenario, parsed, resultDoc, meta) {
  const L = [];
  L.push(`# Transcript — ${scenario.spec.title_en ?? scenario.id} / ${scenario.spec.title_zh ?? scenario.id}`);
  L.push("");
  L.push(`- Scenario: \`${scenario.id}\` (kind: agent, lang: ${scenario.lang ?? "en"})`);
  L.push(`- Outcome: **${resultDoc.outcome}**${resultDoc.reason ? ` — ${resultDoc.reason}` : ""}`);
  if (meta?.startedAt) L.push(`- Session: ${meta.startedAt} → ${meta.endedAt}`);
  L.push(`- Replay: \`node demos/run-demo.mjs --only ${scenario.id} --publish\` (spends LLM tokens; manual-run only)`);
  L.push("");
  L.push("## Prompt / 提示词");
  L.push("");
  L.push("```text");
  L.push(resultDoc.promptText ?? "(see run dir prompt.txt)");
  L.push("```");
  L.push("");
  const calls = parsed?.toolCalls ?? [];
  L.push(`## Tool calls (${calls.length}) / 工具调用`);
  L.push("");
  if (calls.length === 0) L.push("*(no tool calls recorded)*");
  for (const [i, c] of calls.entries()) {
    L.push(`### ${i + 1}. \`${c.tool}\` — ${c.status ?? "?"}`);
    L.push("");
    if (c.input !== null && c.input !== undefined) {
      L.push("Input:");
      L.push("```json");
      L.push(trimCallOutput(c.input));
      L.push("```");
    }
    const outv = c.status === "completed" ? c.output : c.error;
    L.push(`${c.status === "completed" ? "Output" : "Error"} (trimmed):`);
    L.push("```text");
    L.push(trimCallOutput(outv));
    L.push("```");
    L.push("");
  }
  const finalText = parsed?.texts?.length ? parsed.texts[parsed.texts.length - 1] : null;
  L.push("## Final answer (verbatim) / 最终回答（原文）");
  L.push("");
  L.push(finalText ?? "*(no assistant text recorded)*");
  L.push("");
  return L.join("\n");
}

/* ---------------------------------------------------------- transcript: probe */

function probeTranscript(scenario, runDir, resultDoc) {
  // Probe serverInfo/serverCommand live in probe-result.json (the runner's
  // canonical result.json carries only the graded checks).
  let probeMeta = null;
  const prPath = path.join(runDir, "probe-result.json");
  if (statFile(prPath)) {
    try { probeMeta = JSON.parse(fs.readFileSync(prPath, "utf8")); } catch {}
  }
  const captures = [];
  const capPath = path.join(runDir, "capture.jsonl");
  if (statFile(capPath)) {
    for (const line of fs.readFileSync(capPath, "utf8").split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      try { captures.push(JSON.parse(s)); } catch {}
    }
  }
  let toolCount = null;
  const tlPath = path.join(runDir, "tools-list.json");
  if (statFile(tlPath)) {
    try { toolCount = JSON.parse(fs.readFileSync(tlPath, "utf8")).count ?? null; } catch {}
  }
  const serverInfo = probeMeta?.serverInfo ?? resultDoc.serverInfo ?? null;
  const serverCommand = probeMeta?.serverCommand ?? null;
  const L = [];
  L.push(`# Probe transcript — ${scenario.spec.title_en ?? scenario.id} / ${scenario.spec.title_zh ?? scenario.id}`);
  L.push("");
  L.push(`- Scenario: \`${scenario.id}\` (kind: mcp-probe, lang: ${scenario.lang ?? "en"}) — deterministic stdio JSON-RPC calls, no LLM involved`);
  L.push(`- Outcome: **${resultDoc.outcome}**${resultDoc.reason ? ` — ${resultDoc.reason}` : ""}`);
  if (serverInfo) L.push(`- Server: ${serverInfo.name ?? "?"} ${serverInfo.version ?? ""}`.trim());
  if (serverCommand) L.push(`- Server command: \`${serverCommand.join(" ")}\``);
  if (toolCount !== null) L.push(`- tools/list exposed ${toolCount} tool(s)`);
  L.push(`- Replay: \`node demos/run-demo.mjs --only ${scenario.id} --publish\` (network via npx; token-free)`);
  L.push("");
  L.push(`## Probe calls (${captures.length}) / 探针调用`);
  L.push("");
  if (captures.length === 0) L.push("*(no captures — see probe-result.json)*");
  for (const [i, c] of captures.entries()) {
    L.push(`### ${i + 1}. \`${c.tool}\` — ${c.assert?.status ?? "?"}${c.durationMs !== null && c.durationMs !== undefined ? ` (${c.durationMs} ms)` : ""}`);
    L.push("");
    if (c.note_en) L.push(`${c.note_en}`);
    if (c.note_zh) L.push(`${c.note_zh}`);
    if (c.note_en || c.note_zh) L.push("");
    L.push("Request:");
    L.push("```json");
    L.push(JSON.stringify(c.request, null, 2));
    L.push("```");
    L.push(`Response (excerpt${c.isError ? ", isError=true" : ""}):`);
    L.push("```text");
    L.push(trimCallOutput(c.textExcerpt));
    L.push("```");
    if (c.assert?.status !== "pass") {
      L.push(`Assert: **${c.assert?.status}** — ${c.assert?.detail}`);
    }
    L.push("");
  }
  return L.join("\n");
}

/* ------------------------------------------------------------------- README */

function readmeBody(scenario, resultDoc, prov, outputs, skippedOutputs, costStr, durationSec, parsed) {
  const id = scenario.id;
  const isProbe = scenario.kind === "mcp-probe";
  const nCalls = isProbe ? "?" : String(parsed?.toolCalls?.length ?? 0);
  const outLines = outputs.map((o) => `- [\`outputs/${o.rel}\`](./outputs/${o.rel})`);
  const skipLines = skippedOutputs.map((o) => `- \`${o.rel}\` — skipped (${o.reason})`);
  const commitLine = prov.gitCommit ? `${REPO_URL}/tree/${prov.gitCommit}` : null;
  const runDirLine = prov.runDirName ? `\`${prov.runDirName}\` (gitignored raw log; not committed)` : null;
  const checksPassed = (resultDoc.checks ?? []).filter((c) => c.status === "pass").length;
  const checksTotal = (resultDoc.checks ?? []).length;
  // Fan-out mode is detected from the actual tool stream: a `task` tool call
  // means the skill fanned out to parallel subagent workers; otherwise it
  // ran the sequential fallback.
  const taskCalls = (parsed?.toolCalls ?? []).filter((c) => String(c.tool).toLowerCase() === "task").length;
  const fanOutEn = scenario.kind !== "agent"
    ? "n/a (no agent)"
    : taskCalls > 0
      ? `parallel fan-out via the harness Task tool (${taskCalls} subagent worker call(s) in the transcript)`
      : "sequential fallback (no subagent/Task tool calls in this session)";
  const fanOutZh = scenario.kind !== "agent"
    ? "不适用（无智能体参与）"
    : taskCalls > 0
      ? `经宿主 Task 工具并行扇出（会话中有 ${taskCalls} 次子代理工作节点调用）`
      : "顺序回退模式（本会话未使用子代理 Task 工具）";
  const promptBlock = !isProbe && resultDoc.promptText
    ? ["**Prompt**", "", "```text", resultDoc.promptText, "```", ""]
    : [];
  const en = [
    `# ${scenario.spec.title_en ?? id}`,
    "",
    ...(scenario.spec.summary_en ? [scenario.spec.summary_en, ""] : []),
    `**Outcome:** ${resultDoc.outcome} (${checksPassed}/${checksTotal} checks passed)${resultDoc.reason ? ` — ${resultDoc.reason}` : ""}`,
    "",
    ...promptBlock,
    `**How it was run:** ${isProbe
      ? `deterministic MCP stdio probe (\`demos/lib/mcp-probe.mjs\`) against \`${(scenario.spec.server?.command ?? ["npx", "-y", "-p", "biomcp@1.1.1", "biomcp"]).join(" ")}\` — no LLM tokens`
      : `real \`opencode run --auto\` session driven by \`demos/run-demo.mjs\` with the repo skills injected${durationSec !== null ? `, ${durationSec} s wall-clock` : ""}${costStr ? `, ${costStr} model cost` : ""}`}.`,
    "",
    `**Provenance:** commit ${prov.gitCommit ?? "?"} (${commitLine ? `[permalink](${commitLine})` : "local"}), ${prov.opencodeVersion ? `opencode ${prov.opencodeVersion}, ` : ""}node ${prov.nodeVersion}${prov.biomcpPin ? `, biomcp@${prov.biomcpPin}` : ""}; raw rep: ${runDirLine ?? "n/a"}. See [provenance.json](./provenance.json) for per-skill sha256.`,
    "",
    `**Contents:** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json)${outputs.length ? " · outputs:" : ""}`,
    ...outLines,
    ...(skipLines.length ? ["", "Skipped by size cap:", ...skipLines] : []),
    "",
    `**Replay:** \`node demos/run-demo.mjs --only ${id} --publish\` (${isProbe ? "network only, token-free" : "manual-run only — spends LLM tokens"}).`,
    "",
    `**Fan-out mode:** ${fanOutEn}.`,
  ];
  const zh = [
    `# ${scenario.spec.title_zh ?? id}`,
    "",
    ...(scenario.spec.summary_zh ? [scenario.spec.summary_zh, ""] : []),
    `**结果：** ${resultDoc.outcome}（${checksPassed}/${checksTotal} 项检查通过）${resultDoc.reason ? ` — ${resultDoc.reason}` : ""}`,
    "",
    ...(!isProbe && resultDoc.promptText ? ["**提示词**", "", "```text", resultDoc.promptText, "```", ""] : []),
    `**运行方式：** ${isProbe
      ? `确定性 MCP stdio 探针（\`demos/lib/mcp-probe.mjs\`），直连 \`${(scenario.spec.server?.command ?? ["npx", "-y", "-p", "biomcp@1.1.1", "biomcp"]).join(" ")}\` — 不消耗任何 LLM token`
      : `由 \`demos/run-demo.mjs\` 驱动的真实 \`opencode run --auto\` 会话（注入本仓库技能）${durationSec !== null ? `，耗时 ${durationSec} 秒` : ""}${costStr ? `，模型成本 ${costStr}` : ""}`}。`,
    "",
    `**溯源：** 提交 ${prov.gitCommit ?? "?"}${commitLine ? `（[固定链接](${commitLine})）` : ""}，${prov.opencodeVersion ? `opencode ${prov.opencodeVersion}、` : ""}node ${prov.nodeVersion}${prov.biomcpPin ? `、biomcp@${prov.biomcpPin}` : ""}；各技能 SKILL.md 的 sha256 见 [provenance.json](./provenance.json)。`,
    "",
    `**内容：** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json)${outputs.length ? " · 产出文件：" : ""}`,
    ...outLines,
    ...(skipLines.length ? ["", "因体积上限跳过：", ...skipLines] : []),
    "",
    `**复现：** \`node demos/run-demo.mjs --only ${id} --publish\`（${isProbe ? "仅需网络，不消耗 token" : "仅限手动运行——会消耗 LLM token"}）。`,
    "",
    `**并行模式：** ${fanOutZh}。`,
  ];
  return ["<!-- Bilingual artifact README: English first, 中文 below -->", ...en, "", "---", "", ...zh, ""].join("\n");
}

/* ------------------------------------------------------------------ publish */

export async function publishScenario({ scenario, runDir, args, provenance, skillsDir, sessionMeta, parsed }) {
  const artifactsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "artifacts");
  const target = path.join(artifactsDir, scenario.id);
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(path.join(target, "outputs"), { recursive: true });

  const resultPath = path.join(runDir, "result.json");
  const resultDoc = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  if (sessionMeta?.prompt) resultDoc.promptText = sessionMeta.prompt;
  else if (scenario.kind === "agent") {
    const pPath = path.join(runDir, "prompt.txt");
    if (statFile(pPath)) resultDoc.promptText = fs.readFileSync(pPath, "utf8").trim();
  }

  // Transcript.
  const parsedLog = parsed ?? (scenario.kind === "agent" ? readParsedLog(runDir) : null);
  const transcript = scenario.kind === "mcp-probe"
    ? probeTranscript(scenario, runDir, resultDoc)
    : agentTranscript(scenario, parsedLog, resultDoc, sessionMeta);
  fs.writeFileSync(path.join(target, "transcript.md"), transcript);

  // Outputs.
  let outputs = [];
  let skipped = [];
  if (scenario.kind === "mcp-probe") {
    for (const f of ["capture.jsonl", "tools-list.json"]) {
      const src = path.join(runDir, f);
      if (statFile(src)) {
        fs.cpSync(src, path.join(target, "outputs", f));
        outputs.push({ rel: f, file: src });
      }
    }
  } else {
    const r = collectOutputs(runDir, scenario.spec.publish?.outputs ?? []);
    for (const o of r.picked) {
      const dest = path.join(target, "outputs", o.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(o.file, dest);
      outputs.push(o);
    }
    skipped = r.skipped;
  }

  // result.json (verbatim graded doc).
  fs.cpSync(resultPath, path.join(target, "result.json"));

  // provenance.json for this artifact.
  const scenarioJsonPath = path.join(scenario.dir, "scenario.json");
  const durationSec = sessionMeta?.startedAt && sessionMeta?.endedAt
    ? Math.max(1, Math.round((new Date(sessionMeta.endedAt) - new Date(sessionMeta.startedAt)) / 1000))
    : null;
  const costStr = fmtCost(parsedLog?.costTotal ?? null);
  const prov = {
    scenario: scenario.id,
    kind: scenario.kind,
    runDirName: path.basename(runDir),
    gitCommit: provenance.gitCommit,
    repoUrl: REPO_URL,
    opencodeVersion: scenario.kind === "agent" ? provenance.opencodeVersion : null,
    model: args.model ?? null,
    nodeVersion: process.version,
    biomcpPin: extractBiomcpPin(scenario, runDir),
    skillsDir: provenance.skillsDir,
    skills: provenance.skills ?? {},
    scenarioSha256: sha256File(scenarioJsonPath),
    startedAt: sessionMeta?.startedAt ?? null,
    endedAt: sessionMeta?.endedAt ?? null,
    durationSec,
    modelCostUsd: parsedLog?.costTotal ?? null,
    outcome: resultDoc.outcome,
    publishedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(target, "provenance.json"), JSON.stringify(prov, null, 2) + "\n");

  // Bilingual README.
  fs.writeFileSync(path.join(target, "README.md"), readmeBody(scenario, resultDoc, prov, outputs, skipped, costStr, durationSec, parsedLog));

  console.log(`published demos/artifacts/${scenario.id}/ (${outputs.length} output file(s)${skipped.length ? `, ${skipped.length} skipped` : ""})`);
}

function readParsedLog(runDir) {
  const logPath = path.join(runDir, "log.jsonl");
  let text = "";
  try {
    text = fs.readFileSync(logPath, "utf8");
  } catch {
    return null;
  }
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try { events.push(JSON.parse(s)); } catch {}
  }
  const toolCalls = [];
  const texts = [];
  let costTotal = null;
  for (const ev of events) {
    if (ev.type === "tool_use") {
      const part = ev.part ?? {};
      const state = part.state ?? {};
      if (state.status === "pending") continue;
      toolCalls.push({ tool: part.tool, status: state.status ?? null, input: state.input ?? null, output: state.output ?? null, error: state.error ?? null });
    } else if ((ev.type === "text" || ev.type === "message") && typeof ev.part?.text === "string") {
      if (ev.part.text) texts.push(ev.part.text);
    } else if (ev.type === "step_finish") {
      const c = ev.part?.cost?.total;
      if (typeof c === "number" && Number.isFinite(c)) costTotal = (costTotal ?? 0) + c;
    }
  }
  return { toolCalls, texts, costTotal };
}

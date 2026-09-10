#!/usr/bin/env node
/*
 * demos/lib/mcp-probe.mjs — deterministic stdio JSON-RPC MCP client for the
 * biomcp server. Used by demos/run-demo.mjs (kind "mcp-probe" scenarios) to
 * capture TRUE request/response pairs for the partner MCP documentation.
 *
 * No LLM tokens, no opencode: it spawns the pinned server command
 * (default ["npx","-y","-p","biomcp@1.4.0","biomcp"]), performs the MCP
 * initialize handshake, and issues scripted tools/call requests from a
 * scenario manifest. Results are written to --out-dir:
 *
 *   probe-result.json  { outcome, reason, checks[], serverInfo, durationMs }
 *   tools-list.json    { count, names[] } (full paginated tools/list)
 *   capture.jsonl      one JSON line per probe call:
 *                      { tool, request, ok, isError, textExcerpt, errorText,
 *                        durationMs, assert: {status, detail}, note_en, note_zh }
 *   log.jsonl          (only when invoked standalone) stdout/stderr transcript
 *
 * Protocol (MCP stdio transport): newline-delimited UTF-8 JSON — exactly one
 * message per line (NOT LSP Content-Length framing; MCP-Protocol-Version is
 * an HTTP-transport header and is deliberately not sent). Sequence:
 *   initialize (protocolVersion + capabilities + clientInfo)
 *   -> notifications/initialized (notification, no id, no response)
 *   -> tools/list (paginated on nextCursor)
 *   -> tools/call per manifest entry.
 * The read loop correlates responses by id and ignores server->client
 * notifications/requests (no strict ordering assumptions).
 *
 * Robustness: init timeout >= 120 s (npx cold start mirrors the plugin's
 * 120000 ms connection timeout), stderr drained, the server spawned
 * detached and killed as a PROCESS GROUP (child.kill() alone can orphan the
 * biomcp grandchild under npx).
 *
 * Plain ESM JavaScript, node:stdlib only, zero npm dependencies.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_COMMAND = ["npx", "-y", "-p", "biomcp@1.4.0", "biomcp"];
const DEFAULT_INIT_TIMEOUT_MS = 180000;
const DEFAULT_CALL_TIMEOUT_MS = 150000; // patent_get alone bakes in 120 s
const PROTOCOL_VERSION = "2025-06-18";
const CLIENT_INFO = { name: "bioresearcher-demos-mcp-probe", version: "1.0.0" };
const EXCERPT_LIMIT = 8000; // per-call text excerpt cap in capture.jsonl

function usage() {
  return [
    "usage: node demos/lib/mcp-probe.mjs --manifest <scenario.json> --out-dir <DIR>",
    "       node demos/lib/mcp-probe.mjs --check [--command 'npx,-y,-p,biomcp@1.4.0,biomcp']",
    "  --manifest PATH   mcp-probe scenario manifest (server, probe[], asserts)",
    "  --out-dir DIR     where probe-result.json / capture.jsonl / tools-list.json go",
    "  --check           handshake + tools/list + core-registry assert only, exit code 0/1",
  ].join("\n");
}

function parseArgs(argv) {
  const a = { manifest: null, outDir: null, check: false, help: false, command: null };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--manifest": if (argv[i + 1] === undefined) throw new Error("--manifest requires a value"); a.manifest = argv[++i]; break;
      case "--out-dir": if (argv[i + 1] === undefined) throw new Error("--out-dir requires a value"); a.outDir = argv[++i]; break;
      case "--check": a.check = true; break;
      case "--command": if (argv[i + 1] === undefined) throw new Error("--command requires a value"); a.command = argv[++i].split(","); break;
      case "--help": case "-h": a.help = true; break;
      default: throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  return a;
}

class ProbeError extends Error {}

/* --------------------------------------------------------------- stdio transport */

class McpStdioClient {
  constructor(command, { initTimeoutMs } = {}) {
    this.command = command;
    this.initTimeoutMs = initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
    this.nextId = 1;
    this.pending = new Map(); // id -> {resolve, reject, timer}
    this.buf = "";
    this.dead = false;
    this.stderrTail = "";
    this.serverInfo = null;
  }

  start() {
    // detached: true -> new process group, so kill(-pid) reaps npx AND the
    // biomcp grandchild (child.kill() alone can orphan it).
    this.child = spawnDetached(this.command);
    this.child.stdout.on("data", (c) => this._onStdout(c));
    this.child.stderr.on("data", (c) => {
      this.stderrTail = (this.stderrTail + c.toString("utf8")).slice(-4000);
    });
    this.child.on("error", (e) => this._failAll(e));
    this.child.on("close", (code, signal) => {
      this.dead = true;
      this._failAll(new ProbeError(`server exited early (code=${code} signal=${signal ?? "-"}) stderr tail: ${this.stderrTail.slice(-800)}`));
    });
  }

  _failAll(err) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  _onStdout(chunk) {
    this.buf += chunk.toString("utf8");
    let idx;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // non-JSON noise on stdout is ignored
      }
      if (msg && (msg.id === undefined || msg.id === null)) continue; // notification/request from server
      // Only responses carry result/error; a server-initiated *request* with
      // a colliding id must not resolve a pending call.
      if (!("result" in msg) && !("error" in msg)) continue;
      const p = this.pending.get(msg.id);
      if (!p) continue;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      p.resolve(msg);
    }
  }

  send(obj) {
    if (this.dead) throw new ProbeError("server process is gone");
    this.child.stdin.write(JSON.stringify(obj) + "\n");
  }

  notify(method, params) {
    this.send({ jsonrpc: "2.0", method, params: params ?? {} });
  }

  request(method, params, timeoutMs) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ProbeError(`timeout after ${timeoutMs} ms waiting for response to ${method} (id=${id})`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ jsonrpc: "2.0", id, method, params: params ?? {} });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  async initialize() {
    const res = await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO,
    }, this.initTimeoutMs);
    if (res.error) throw new ProbeError(`initialize failed: ${JSON.stringify(res.error)}`);
    this.serverInfo = res.result?.serverInfo ?? null;
    // Required before any further request per the MCP lifecycle.
    this.notify("notifications/initialized");
    return res.result;
  }

  async listTools(callTimeoutMs) {
    const names = [];
    let cursor;
    let guard = 0;
    do {
      const params = {};
      if (cursor) params.cursor = cursor;
      const res = await this.request("tools/list", params, callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS);
      if (res.error) throw new ProbeError(`tools/list failed: ${JSON.stringify(res.error)}`);
      for (const t of res.result?.tools ?? []) names.push(t.name);
      cursor = res.result?.nextCursor ?? undefined;
    } while (cursor && ++guard < 100);
    return names;
  }

  async callTool(tool, args, timeoutMs) {
    const res = await this.request("tools/call", { name: tool, arguments: args ?? {} }, timeoutMs ?? DEFAULT_CALL_TIMEOUT_MS);
    if (res.error) return { jsonrpcError: res.error, isError: true, text: JSON.stringify(res.error) };
    const r = res.result ?? {};
    const text = (r.content ?? [])
      .filter((c) => c && c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n");
    return { jsonrpcError: null, isError: r.isError === true, text };
  }

  stop() {
    if (!this.child || this.child.killed) return;
    try { process.kill(-this.child.pid, "SIGTERM"); } catch {
      try { this.child.kill("SIGTERM"); } catch {}
    }
    // Reap the group; escalate to SIGKILL after a grace period.
    const pid = this.child.pid;
    setTimeout(() => { try { process.kill(-pid, "SIGKILL"); } catch {} }, 3000).unref();
  }
}

function spawnDetached(command) {
  return spawn(command[0], command.slice(1), {
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });
}

/* ---------------------------------------------------------------- assert helpers */

function excerpt(text, limit = EXCERPT_LIMIT) {
  const s = String(text ?? "");
  if (s.length <= limit) return s;
  return s.slice(0, limit) + `… [trimmed ${s.length - limit} chars]`;
}

function assertCall(entry, call) {
  const problems = [];
  if (call.jsonrpcError) problems.push(`JSON-RPC error: ${JSON.stringify(call.jsonrpcError).slice(0, 300)}`);
  if (call.isError) problems.push(`server isError=true`);
  if (entry.expect_regex) {
    let re;
    try { re = new RegExp(entry.expect_regex); } catch (e) { problems.push(`invalid expect_regex: ${e.message}`); }
    if (re && !re.test(call.text)) problems.push(`expect_regex not matched: ${entry.expect_regex}`);
  }
  if (entry.expect_not_regex) {
    let re;
    try { re = new RegExp(entry.expect_not_regex); } catch (e) { problems.push(`invalid expect_not_regex: ${e.message}`); }
    if (re && re.test(call.text)) problems.push(`expect_not_regex matched: ${entry.expect_not_regex}`);
  }
  return {
    status: problems.length === 0 ? "pass" : "fail",
    detail: problems.length === 0 ? "ok (no isError, all expectations matched)" : problems.join("; "),
  };
}

/* --------------------------------------------------------------------- run modes */

async function loadRegistry() {
  // Vendored copy of scripts/ci/biomcp-tools.json at the pinned version; CI
  // (demos/check-demos.mjs) diffs the two so drift is impossible.
  const regPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "biomcp-tools@1.4.0.json");
  return JSON.parse(fs.readFileSync(regPath, "utf8"));
}

async function runCheckMode(args) {
  const registry = await loadRegistry();
  const client = new McpStdioClient(args.command ?? DEFAULT_COMMAND);
  const startedAt = Date.now();
  try {
    client.start();
    await client.initialize();
    const names = await client.listTools();
    const known = new Set(registry.core);
    const missing = registry.core.filter((n) => !names.includes(n));
    const optionalPresent = registry.optional.filter((n) => names.includes(n)).length;
    if (missing.length > 0) {
      console.error(`FAIL tools/list is missing ${missing.length} pinned core tool(s): ${missing.join(", ")}`);
      console.error(`      server exposed ${names.length} tool(s)${optionalPresent ? ` (incl. ${optionalPresent} optional-group tool(s))` : ""}`);
      return 1;
    }
    console.log(`ok   tools/list exposes all ${known.size} pinned core tools (server total: ${names.length}, biomcp ${registry.biomcp_ts_version}) in ${Date.now() - startedAt} ms`);
    return 0;
  } finally {
    client.stop();
  }
}

async function runManifestMode(args) {
  const manifest = JSON.parse(fs.readFileSync(args.manifest, "utf8"));
  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const command = manifest.server?.command ?? DEFAULT_COMMAND;
  const registry = await loadRegistry();
  const requireCore = manifest.require_core_list !== false;
  const client = new McpStdioClient(command, { initTimeoutMs: manifest.server?.initTimeoutMs });
  const checks = [];
  const captures = [];
  const startedAt = Date.now();
  let outcome = "PASS";
  let reason = null;
  try {
    client.start();
    const init = await client.initialize();
    const names = await client.listTools(manifest.server?.callTimeoutMs);
    fs.writeFileSync(path.join(outDir, "tools-list.json"), JSON.stringify({
      count: names.length,
      names: [...names].sort(),
    }, null, 2) + "\n");
    if (requireCore) {
      const missing = registry.core.filter((n) => !names.includes(n));
      checks.push({
        type: "core_registry",
        desc: `tools/list contains all ${registry.core.length} pinned core tools`,
        status: missing.length === 0 ? "pass" : "fail",
        detail: missing.length === 0 ? `server total ${names.length}` : `missing: ${missing.join(", ")}`,
      });
    }
    for (const entry of manifest.probe) {
      if (!names.includes(entry.tool)) {
        const assert = { status: "fail", detail: `tool ${entry.tool} not present in tools/list` };
        checks.push({ type: "probe_call", desc: entry.desc ?? entry.tool, ...assert });
        captures.push({ tool: entry.tool, request: entry.args ?? {}, ok: false, isError: true, textExcerpt: null, errorText: "tool not present in tools/list", durationMs: null, assert, note_en: entry.note_en ?? null, note_zh: entry.note_zh ?? null });
        continue;
      }
      const t0 = Date.now();
      const call = await client.callTool(entry.tool, entry.args ?? {}, manifest.server?.callTimeoutMs);
      const durationMs = Date.now() - t0;
      const assert = assertCall(entry, call);
      checks.push({ type: "probe_call", desc: entry.desc ?? entry.tool, ...assert });
      captures.push({
        tool: entry.tool,
        request: entry.args ?? {},
        ok: assert.status === "pass",
        isError: call.isError,
        textExcerpt: call.jsonrpcError ? JSON.stringify(call.jsonrpcError) : excerpt(call.text),
        errorText: call.isError || call.jsonrpcError ? excerpt(call.text ?? "", 2000) : null,
        durationMs,
        assert,
        note_en: entry.note_en ?? null,
        note_zh: entry.note_zh ?? null,
      });
    }
  } catch (e) {
    outcome = "ERROR";
    reason = e.message;
  } finally {
    client.stop();
  }
  const failing = checks.filter((c) => c.status === "fail" || c.status === "error");
  if (outcome !== "ERROR") {
    outcome = failing.length === 0 ? "PASS" : "FAIL";
    reason = failing.length === 0 ? null : `${failing.length} probe check(s) failed`;
  }
  const probeResult = {
    kind: "mcp-probe",
    manifest: manifest.id ?? path.basename(path.dirname(path.resolve(args.manifest))),
    serverCommand: command,
    serverInfo: client.serverInfo,
    protocolVersion: PROTOCOL_VERSION,
    registry: { file: "demos/lib/biomcp-tools@1.4.0.json", biomcp_ts_version: registry.biomcp_ts_version, core: registry.core.length, optional: registry.optional.length },
    nodeVersion: process.version,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: Date.now() - startedAt,
    outcome,
    reason,
    checks,
  };
  fs.writeFileSync(path.join(outDir, "probe-result.json"), JSON.stringify(probeResult, null, 2) + "\n");
  const capFd = fs.openSync(path.join(outDir, "capture.jsonl"), "w");
  for (const c of captures) fs.writeSync(capFd, JSON.stringify(c) + "\n");
  fs.closeSync(capFd);
  console.log(`probe ${outcome}${reason ? `: ${reason}` : ""} (${checks.length} check(s), ${captures.length} call(s), ${probeResult.durationMs} ms)`);
  console.log(`result: ${path.join(outDir, "probe-result.json")}`);
  return outcome === "PASS" ? 0 : 1;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || (!args.check && (!args.manifest || !args.outDir))) {
  console.log(usage());
  process.exitCode = args.help ? 0 : 2;
} else if (args.check) {
  process.exitCode = await runCheckMode(args).catch((e) => { console.error(`harness error: ${e?.stack ?? e}`); return 2; });
} else {
  process.exitCode = await runManifestMode(args).catch((e) => { console.error(`harness error: ${e?.stack ?? e}`); return 2; });
}

<!-- Bilingual artifact README: English first, 中文 below -->
# MCP tool tour — true request/response pairs from 8 core tools

Deterministic stdio JSON-RPC probe against the keyless biomcp@1.4.0 server: initialize handshake, paginated tools/list (all 41 pinned core tools present), then 8 scripted tools/call requests whose real responses back the MCP documentation's API tables.

**Outcome:** PASS (9/9 checks passed)

**How it was run:** deterministic MCP stdio probe (`demos/lib/mcp-probe.mjs`) against `npx -y -p biomcp@1.4.0 biomcp` — no LLM tokens.

**Provenance:** commit d818c8571ae2874d9b76e7ce49fbc5e69016e573 ([permalink](https://github.com/yeyuan98/bioresearcher-skills/tree/d818c8571ae2874d9b76e7ce49fbc5e69016e573)), node v22.23.1, biomcp@1.4.0; raw rep: `20260911-213014-r1` (gitignored raw log; not committed). See [provenance.json](./provenance.json) for per-skill sha256.

**Contents:** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · outputs:
- [`outputs/capture.jsonl`](./outputs/capture.jsonl)
- [`outputs/tools-list.json`](./outputs/tools-list.json)

**Replay:** `node demos/run-demo.mjs --only mcp-tool-tour-en --publish` (network only, token-free).

**Fan-out mode:** n/a (no agent).

---

# MCP 工具巡览——8 个核心工具的真实请求/响应样本

对免密钥 biomcp@1.4.0 服务的确定性 stdio JSON-RPC 探针：initialize 握手、分页 tools/list（41 个受-pin 核心工具全部在列），随后 8 次脚本化 tools/call，其真实响应即 MCP 文档 API 表格的数据来源。

**结果：** PASS（9/9 项检查通过）

**运行方式：** 确定性 MCP stdio 探针（`demos/lib/mcp-probe.mjs`），直连 `npx -y -p biomcp@1.4.0 biomcp` — 不消耗任何 LLM token。

**溯源：** 提交 d818c8571ae2874d9b76e7ce49fbc5e69016e573（[固定链接](https://github.com/yeyuan98/bioresearcher-skills/tree/d818c8571ae2874d9b76e7ce49fbc5e69016e573)），node v22.23.1、biomcp@1.4.0；各技能 SKILL.md 的 sha256 见 [provenance.json](./provenance.json)。

**内容：** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · 产出文件：
- [`outputs/capture.jsonl`](./outputs/capture.jsonl)
- [`outputs/tools-list.json`](./outputs/tools-list.json)

**复现：** `node demos/run-demo.mjs --only mcp-tool-tour-en --publish`（仅需网络，不消耗 token）。

**并行模式：** 不适用（无智能体参与）。

<!-- Bilingual artifact README: English first, 中文 below -->
# MCP tool tour — the BRAF V600E variant-to-trials chain (zh notes)

Same deterministic probe mechanics, themed on the WorkBuddy connector's third zh example (查找 BRAF V600E 变异的相关药物与临床试验): variant -> gene -> drugs -> trials in four keyless calls with bilingual notes.

**Outcome:** PASS (5/5 checks passed)

**How it was run:** deterministic MCP stdio probe (`demos/lib/mcp-probe.mjs`) against `npx -y -p biomcp@1.1.1 biomcp` — no LLM tokens.

**Provenance:** commit 3380cc6083c10a4f21d10f1f7988f985adbcb65a ([permalink](https://github.com/yeyuan98/bioresearcher-skills/tree/3380cc6083c10a4f21d10f1f7988f985adbcb65a)), node v22.23.1, biomcp@1.1.1; raw rep: `20260906-133313-r1` (gitignored raw log; not committed). See [provenance.json](./provenance.json) for per-skill sha256.

**Contents:** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · outputs:
- [`outputs/capture.jsonl`](./outputs/capture.jsonl)
- [`outputs/tools-list.json`](./outputs/tools-list.json)

**Replay:** `node demos/run-demo.mjs --only mcp-tool-tour-zh --publish` (network only, token-free).

**Fan-out mode:** n/a (no agent).

---

# MCP 工具巡览——BRAF V600E 从变异到临床试验的调用链（中文注释）

同款确定性探针，主题取自 WorkBuddy 连接器第三条中文示例语料（查找 BRAF V600E 变异的相关药物与临床试验）：变异 → 基因 → 药物 → 临床试验共 4 次免密钥调用，附中英双语注释。

**结果：** PASS（5/5 项检查通过）

**运行方式：** 确定性 MCP stdio 探针（`demos/lib/mcp-probe.mjs`），直连 `npx -y -p biomcp@1.1.1 biomcp` — 不消耗任何 LLM token。

**溯源：** 提交 3380cc6083c10a4f21d10f1f7988f985adbcb65a（[固定链接](https://github.com/yeyuan98/bioresearcher-skills/tree/3380cc6083c10a4f21d10f1f7988f985adbcb65a)），node v22.23.1、biomcp@1.1.1；各技能 SKILL.md 的 sha256 见 [provenance.json](./provenance.json)。

**内容：** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · 产出文件：
- [`outputs/capture.jsonl`](./outputs/capture.jsonl)
- [`outputs/tools-list.json`](./outputs/tools-list.json)

**复现：** `node demos/run-demo.mjs --only mcp-tool-tour-zh --publish`（仅需网络，不消耗 token）。

**并行模式：** 不适用（无智能体参与）。

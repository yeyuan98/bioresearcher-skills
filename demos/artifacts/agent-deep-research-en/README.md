<!-- Bilingual artifact README: English first, 中文 below -->
# Deep research — BRCA1 DNA repair literature survey (English)

The bioresearcher-deep-research skill interviews-free light path decomposes a topic, queries PubMed via the biomcp MCP server, and writes a cited Markdown + HTML report (reports/<topic>/final_report.md/.html).

**Outcome:** PASS (4/4 checks passed)

**Prompt**

```text
no-interview light-research: Using the bioresearcher-deep-research skill, survey the recent article landscape on BRCA1 DNA repair. Cite sources with PMIDs.
```

**How it was run:** real `opencode run --auto` session driven by `demos/run-demo.mjs` with the repo skills injected.

**Provenance:** commit 3380cc6083c10a4f21d10f1f7988f985adbcb65a ([permalink](https://github.com/yeyuan98/bioresearcher-skills/tree/3380cc6083c10a4f21d10f1f7988f985adbcb65a)), opencode 1.18.29, node v22.23.1, biomcp@1.1.1; raw rep: `20260906-134601-r1` (gitignored raw log; not committed). See [provenance.json](./provenance.json) for per-skill sha256. (`reused: true` — the session log was re-graded from disk after the scenario's checks were widened to accept worker-mediated evidence; the session itself is the single 515 s run.)

**Contents:** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · outputs:
- [`outputs/reports/brca1_dna_repair/final_report.html`](./outputs/reports/brca1_dna_repair/final_report.html)
- [`outputs/reports/brca1_dna_repair/final_report.md`](./outputs/reports/brca1_dna_repair/final_report.md)

**Screenshot:** [screenshots/final_report-top.jpg](./screenshots/final_report-top.jpg) — Top of the rendered final_report.html (chromium headless capture) (GitHub does not render committed HTML).

**Replay:** `node demos/run-demo.mjs --only agent-deep-research-en --publish` (manual-run only — spends LLM tokens).

**Fan-out mode:** parallel fan-out via the harness Task tool (2 subagent worker call(s) in the transcript).

---

# 深度研究——BRCA1 DNA 修复文献调研（英文）

bioresearcher-deep-research 技能的免访谈轻量路径：分解主题、经 biomcp MCP 服务检索 PubMed、产出带编号引用的 Markdown + HTML 报告（reports/<topic>/final_report.md/.html）。

**结果：** PASS（4/4 项检查通过）

**提示词**

```text
no-interview light-research: Using the bioresearcher-deep-research skill, survey the recent article landscape on BRCA1 DNA repair. Cite sources with PMIDs.
```

**运行方式：** 由 `demos/run-demo.mjs` 驱动的真实 `opencode run --auto` 会话（注入本仓库技能）。

**溯源：** 提交 3380cc6083c10a4f21d10f1f7988f985adbcb65a（[固定链接](https://github.com/yeyuan98/bioresearcher-skills/tree/3380cc6083c10a4f21d10f1f7988f985adbcb65a)），opencode 1.18.29、node v22.23.1、biomcp@1.1.1；各技能 SKILL.md 的 sha256 见 [provenance.json](./provenance.json)。

**内容：** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · 产出文件：
- [`outputs/reports/brca1_dna_repair/final_report.html`](./outputs/reports/brca1_dna_repair/final_report.html)
- [`outputs/reports/brca1_dna_repair/final_report.md`](./outputs/reports/brca1_dna_repair/final_report.md)

**截图：** [screenshots/final_report-top.jpg](./screenshots/final_report-top.jpg) —— 渲染后 final_report.html 的顶部（chromium 无头截图；GitHub 不渲染已提交的 HTML）。

**复现：** `node demos/run-demo.mjs --only agent-deep-research-en --publish`（仅限手动运行——会消耗 LLM token）。

**并行模式：** 经宿主 Task 工具并行扇出（会话中有 2 次子代理工作节点调用）。

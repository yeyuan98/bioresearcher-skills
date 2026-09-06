<!-- Bilingual artifact README: English first, 中文 below -->
# Deep research — tumor immunotherapy survey driven by a Chinese prompt

Same deep-research skill, Chinese-language request (the connector's canonical zh example): the agent answers and reports in Chinese while querying English biomedical sources, citing PMIDs.

**Outcome:** PASS (5/5 checks passed)

**Prompt**

```text
no-interview light-research: 使用 bioresearcher-deep-research 技能，帮我做一个关于肿瘤免疫治疗（tumor immunotherapy）的多方面文献综述并附引用。请用中文撰写报告，引用使用 PMID。
```

**How it was run:** real `opencode run --auto` session driven by `demos/run-demo.mjs` with the repo skills injected, 814 s wall-clock.

**Provenance:** commit 3380cc6083c10a4f21d10f1f7988f985adbcb65a ([permalink](https://github.com/yeyuan98/bioresearcher-skills/tree/3380cc6083c10a4f21d10f1f7988f985adbcb65a)), opencode 1.18.29, node v22.23.1, biomcp@1.1.1; raw rep: `20260906-141051-r1` (gitignored raw log; not committed). See [provenance.json](./provenance.json) for per-skill sha256.

**Contents:** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · outputs:
- [`outputs/reports/tumor_immunotherapy/final_report.html`](./outputs/reports/tumor_immunotherapy/final_report.html)
- [`outputs/reports/tumor_immunotherapy/final_report.md`](./outputs/reports/tumor_immunotherapy/final_report.md)

**Screenshot:** [screenshots/final_report-top.jpg](./screenshots/final_report-top.jpg) — Top of the rendered final_report.html (chromium headless capture) (GitHub does not render committed HTML).

**Replay:** `node demos/run-demo.mjs --only agent-deep-research-zh --publish` (manual-run only — spends LLM tokens).

**Fan-out mode:** parallel fan-out via the harness Task tool (2 subagent worker call(s) in the transcript).

---

# 深度研究——中文提问的肿瘤免疫治疗文献综述

同一深度研究技能，中文提问（WorkBuddy 连接器的中文示例语料）：智能体检索英文生物医学数据源，以中文撰写综述并附 PMID 引用。

**结果：** PASS（5/5 项检查通过）

**提示词**

```text
no-interview light-research: 使用 bioresearcher-deep-research 技能，帮我做一个关于肿瘤免疫治疗（tumor immunotherapy）的多方面文献综述并附引用。请用中文撰写报告，引用使用 PMID。
```

**运行方式：** 由 `demos/run-demo.mjs` 驱动的真实 `opencode run --auto` 会话（注入本仓库技能），耗时 814 秒。

**溯源：** 提交 3380cc6083c10a4f21d10f1f7988f985adbcb65a（[固定链接](https://github.com/yeyuan98/bioresearcher-skills/tree/3380cc6083c10a4f21d10f1f7988f985adbcb65a)），opencode 1.18.29、node v22.23.1、biomcp@1.1.1；各技能 SKILL.md 的 sha256 见 [provenance.json](./provenance.json)。

**内容：** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · 产出文件：
- [`outputs/reports/tumor_immunotherapy/final_report.html`](./outputs/reports/tumor_immunotherapy/final_report.html)
- [`outputs/reports/tumor_immunotherapy/final_report.md`](./outputs/reports/tumor_immunotherapy/final_report.md)

**截图：** [screenshots/final_report-top.jpg](./screenshots/final_report-top.jpg) —— 渲染后 final_report.html 的顶部（chromium 无头截图；GitHub 不渲染已提交的 HTML）。

**复现：** `node demos/run-demo.mjs --only agent-deep-research-zh --publish`（仅限手动运行——会消耗 LLM token）。

**并行模式：** 经宿主 Task 工具并行扇出（会话中有 2 次子代理工作节点调用）。

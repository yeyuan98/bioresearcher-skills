<!-- Bilingual artifact README: English first, 中文 below -->
# Deep research — tumor immunotherapy survey driven by a Chinese prompt

Same deep-research skill, Chinese-language request (the connector's canonical zh example): parallel workers build per-aspect evidence ledgers, the render script numbers every cite-key marker and generates the References section, and vet-references.py audits the result - the agent answers and reports in Chinese while querying English biomedical sources, citing PMIDs.

**Outcome:** PASS* (8/9 checks passed)

**Prompt**

```text
no-interview light-research: 使用 bioresearcher-deep-research 技能，帮我做一个关于肿瘤免疫治疗（tumor immunotherapy）的文献综述并附引用。最多 2 个研究方面，每个方面的工作节点最多调用 10 次 biomcp 工具。请用中文撰写报告，引用使用 PMID。
```

**How it was run:** real `opencode run --auto` session driven by `demos/run-demo.mjs` with the repo skills injected.

**Provenance:** commit d818c8571ae2874d9b76e7ce49fbc5e69016e573 ([permalink](https://github.com/yeyuan98/bioresearcher-skills/tree/d818c8571ae2874d9b76e7ce49fbc5e69016e573)), opencode 1.18.30, node v22.23.1, biomcp@1.4.0; raw rep: `20260911-214453-r1` (gitignored raw log; not committed). See [provenance.json](./provenance.json) for per-skill sha256.

**Contents:** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · outputs:
- [`outputs/reports/tumor_immunotherapy/car_t_cell_therapy.md`](./outputs/reports/tumor_immunotherapy/car_t_cell_therapy.md)
- [`outputs/reports/tumor_immunotherapy/checkpoint_inhibitors.md`](./outputs/reports/tumor_immunotherapy/checkpoint_inhibitors.md)
- [`outputs/reports/tumor_immunotherapy/evidence/sources.jsonl`](./outputs/reports/tumor_immunotherapy/evidence/sources.jsonl)
- [`outputs/reports/tumor_immunotherapy/final_report.draft.md`](./outputs/reports/tumor_immunotherapy/final_report.draft.md)
- [`outputs/reports/tumor_immunotherapy/final_report.html`](./outputs/reports/tumor_immunotherapy/final_report.html)
- [`outputs/reports/tumor_immunotherapy/final_report.md`](./outputs/reports/tumor_immunotherapy/final_report.md)
- [`outputs/reports/tumor_immunotherapy/plan.md`](./outputs/reports/tumor_immunotherapy/plan.md)
- [`outputs/subagents.json`](./outputs/subagents.json)

**Replay:** `node demos/run-demo.mjs --only agent-deep-research-zh --publish` (manual-run only — spends LLM tokens).

**Fan-out mode:** parallel fan-out via the harness Task tool (2 subagent worker call(s) in the transcript).

---

# 深度研究——中文提问的肿瘤免疫治疗文献综述

同一深度研究技能，中文提问（WorkBuddy 连接器的中文示例语料）：并行工作节点构建逐方面证据账本，render 脚本统一为引用键编号并生成参考文献，vet-references.py 审计结果——智能体检索英文生物医学数据源，以中文撰写综述并附 PMID 引用。

**结果：** PASS*（8/9 项检查通过）

**提示词**

```text
no-interview light-research: 使用 bioresearcher-deep-research 技能，帮我做一个关于肿瘤免疫治疗（tumor immunotherapy）的文献综述并附引用。最多 2 个研究方面，每个方面的工作节点最多调用 10 次 biomcp 工具。请用中文撰写报告，引用使用 PMID。
```

**运行方式：** 由 `demos/run-demo.mjs` 驱动的真实 `opencode run --auto` 会话（注入本仓库技能，耗时 649 秒）。

**溯源：** 提交 d818c8571ae2874d9b76e7ce49fbc5e69016e573（[固定链接](https://github.com/yeyuan98/bioresearcher-skills/tree/d818c8571ae2874d9b76e7ce49fbc5e69016e573)），opencode 1.18.30、node v22.23.1、biomcp@1.4.0；各技能 SKILL.md 的 sha256 见 [provenance.json](./provenance.json)。

**内容：** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · 产出文件：
- [`outputs/reports/tumor_immunotherapy/car_t_cell_therapy.md`](./outputs/reports/tumor_immunotherapy/car_t_cell_therapy.md)
- [`outputs/reports/tumor_immunotherapy/checkpoint_inhibitors.md`](./outputs/reports/tumor_immunotherapy/checkpoint_inhibitors.md)
- [`outputs/reports/tumor_immunotherapy/evidence/sources.jsonl`](./outputs/reports/tumor_immunotherapy/evidence/sources.jsonl)
- [`outputs/reports/tumor_immunotherapy/final_report.draft.md`](./outputs/reports/tumor_immunotherapy/final_report.draft.md)
- [`outputs/reports/tumor_immunotherapy/final_report.html`](./outputs/reports/tumor_immunotherapy/final_report.html)
- [`outputs/reports/tumor_immunotherapy/final_report.md`](./outputs/reports/tumor_immunotherapy/final_report.md)
- [`outputs/reports/tumor_immunotherapy/plan.md`](./outputs/reports/tumor_immunotherapy/plan.md)
- [`outputs/subagents.json`](./outputs/subagents.json)

**复现：** `node demos/run-demo.mjs --only agent-deep-research-zh --publish`（仅限手动运行——会消耗 LLM token）。

**并行模式：** 经宿主 Task 工具并行扇出（会话中有 2 次子代理工作节点调用）。

<!-- Bilingual artifact README: English first, 中文 below -->
# Deep research — BRCA1 DNA repair literature survey (English)

The bioresearcher-deep-research skill's interview-free light path decomposes a topic, dispatches parallel workers that append every citable source to a per-aspect evidence ledger, synthesizes a cite-key draft, then the ledger script renders the numbered citations + References (single numbering authority) and vet-references.py audits them - producing reports/<topic>/final_report.md and, by default, final_report.html.

**Outcome:** PASS* (7/8 checks passed)

**Prompt**

```text
no-interview light-research: Using the bioresearcher-deep-research skill, survey the recent article landscape on BRCA1 DNA repair. Keep it to at most 2 research aspects and at most 10 biomcp tool calls per aspect worker. Cite sources with PMIDs.
```

**How it was run:** real `opencode run --auto` session driven by `demos/run-demo.mjs` with the repo skills injected.

**Provenance:** commit d818c8571ae2874d9b76e7ce49fbc5e69016e573 ([permalink](https://github.com/yeyuan98/bioresearcher-skills/tree/d818c8571ae2874d9b76e7ce49fbc5e69016e573)), opencode 1.18.30, node v22.23.1, biomcp@1.4.0; raw rep: `20260911-213213-r1` (gitignored raw log; not committed). See [provenance.json](./provenance.json) for per-skill sha256.

**Contents:** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · outputs:
- [`outputs/reports/brca1_dna_repair_landscape/evidence/sources.jsonl`](./outputs/reports/brca1_dna_repair_landscape/evidence/sources.jsonl)
- [`outputs/reports/brca1_dna_repair_landscape/final_report.draft.md`](./outputs/reports/brca1_dna_repair_landscape/final_report.draft.md)
- [`outputs/reports/brca1_dna_repair_landscape/final_report.html`](./outputs/reports/brca1_dna_repair_landscape/final_report.html)
- [`outputs/reports/brca1_dna_repair_landscape/final_report.md`](./outputs/reports/brca1_dna_repair_landscape/final_report.md)
- [`outputs/reports/brca1_dna_repair_landscape/hr_mechanisms.md`](./outputs/reports/brca1_dna_repair_landscape/hr_mechanisms.md)
- [`outputs/reports/brca1_dna_repair_landscape/parpi_resistance_clinical.md`](./outputs/reports/brca1_dna_repair_landscape/parpi_resistance_clinical.md)
- [`outputs/reports/brca1_dna_repair_landscape/plan.md`](./outputs/reports/brca1_dna_repair_landscape/plan.md)
- [`outputs/subagents.json`](./outputs/subagents.json)

**Replay:** `node demos/run-demo.mjs --only agent-deep-research-en --publish` (manual-run only — spends LLM tokens).

**Fan-out mode:** parallel fan-out via the harness Task tool (2 subagent worker call(s) in the transcript).

---

# 深度研究——BRCA1 DNA 修复文献调研（英文）

bioresearcher-deep-research 技能的免访谈轻量路径：分解主题、并行派发工作节点（把每条可引用来源追加到逐方面证据账本）、以引用键草稿汇总，再由账本脚本统一编号渲染引用与参考文献（唯一编号权威）并经 vet-references.py 审计——产出 reports/<topic>/final_report.md 及默认开启的 final_report.html。

**结果：** PASS*（7/8 项检查通过）

**提示词**

```text
no-interview light-research: Using the bioresearcher-deep-research skill, survey the recent article landscape on BRCA1 DNA repair. Keep it to at most 2 research aspects and at most 10 biomcp tool calls per aspect worker. Cite sources with PMIDs.
```

**运行方式：** 由 `demos/run-demo.mjs` 驱动的真实 `opencode run --auto` 会话（注入本仓库技能，耗时 545 秒）。

**溯源：** 提交 d818c8571ae2874d9b76e7ce49fbc5e69016e573（[固定链接](https://github.com/yeyuan98/bioresearcher-skills/tree/d818c8571ae2874d9b76e7ce49fbc5e69016e573)），opencode 1.18.30、node v22.23.1、biomcp@1.4.0；各技能 SKILL.md 的 sha256 见 [provenance.json](./provenance.json)。

**内容：** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · 产出文件：
- [`outputs/reports/brca1_dna_repair_landscape/evidence/sources.jsonl`](./outputs/reports/brca1_dna_repair_landscape/evidence/sources.jsonl)
- [`outputs/reports/brca1_dna_repair_landscape/final_report.draft.md`](./outputs/reports/brca1_dna_repair_landscape/final_report.draft.md)
- [`outputs/reports/brca1_dna_repair_landscape/final_report.html`](./outputs/reports/brca1_dna_repair_landscape/final_report.html)
- [`outputs/reports/brca1_dna_repair_landscape/final_report.md`](./outputs/reports/brca1_dna_repair_landscape/final_report.md)
- [`outputs/reports/brca1_dna_repair_landscape/hr_mechanisms.md`](./outputs/reports/brca1_dna_repair_landscape/hr_mechanisms.md)
- [`outputs/reports/brca1_dna_repair_landscape/parpi_resistance_clinical.md`](./outputs/reports/brca1_dna_repair_landscape/parpi_resistance_clinical.md)
- [`outputs/reports/brca1_dna_repair_landscape/plan.md`](./outputs/reports/brca1_dna_repair_landscape/plan.md)
- [`outputs/subagents.json`](./outputs/subagents.json)

**复现：** `node demos/run-demo.mjs --only agent-deep-research-en --publish`（仅限手动运行——会消耗 LLM token）。

**并行模式：** 经宿主 Task 工具并行扇出（会话中有 2 次子代理工作节点调用）。

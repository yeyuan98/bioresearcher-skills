<!-- Bilingual artifact README: English first, 中文 below -->
# PubMed weekly — updatefiles sample parsed into an Excel workbook

The bioresearcher-pubmed-weekly skill streams a (trimmed) weekly updatefiles archive — 6 <PubmedArticle> entries plus a <DeleteCitation> block — into one combined.xlsx workbook via its pure-Python parser.

**Outcome:** PASS (rubric adjudicated SATISFIED) (1/2 checks passed)

**Prompt**

```text
In /home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-pubmed-weekly-en/20260906-133410-r1/data/pubmed-sample.xml.gz you have a trimmed PubMed updatefiles sample. Load the bioresearcher-pubmed-weekly skill and parse this file into combined.xlsx in the working directory, then report the sheet names, row counts, and the deleted PMIDs.
```

**How it was run:** real `opencode run --auto` session driven by `demos/run-demo.mjs` with the repo skills injected, 56 s wall-clock.

**Provenance:** commit 3380cc6083c10a4f21d10f1f7988f985adbcb65a ([permalink](https://github.com/yeyuan98/bioresearcher-skills/tree/3380cc6083c10a4f21d10f1f7988f985adbcb65a)), opencode 1.18.29, node v22.23.1; raw rep: `20260906-133410-r1` (gitignored raw log; not committed). See [provenance.json](./provenance.json) for per-skill sha256.

**Contents:** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · outputs:
- [`outputs/combined.xlsx`](./outputs/combined.xlsx)

**Replay:** `node demos/run-demo.mjs --only agent-pubmed-weekly-en --publish` (manual-run only — spends LLM tokens).

**Fan-out mode:** sequential fallback (opencode CLI has no subagent tool in this mode; the parallel dr-worker fan-out is a Claude Code plugin feature).

---

# PubMed 周更——将 updatefiles 样例解析为 Excel 工作簿

bioresearcher-pubmed-weekly 技能用纯 Python 流式解析器，把裁剪版的周更 updatefiles 存档（6 条 <PubmedArticle> 记录 + 一个 <DeleteCitation> 块）解析为一个 combined.xlsx 工作簿。

**结果：** PASS（rubric 已裁定 SATISFIED）（1/2 项检查通过）

**提示词**

```text
In /home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-pubmed-weekly-en/20260906-133410-r1/data/pubmed-sample.xml.gz you have a trimmed PubMed updatefiles sample. Load the bioresearcher-pubmed-weekly skill and parse this file into combined.xlsx in the working directory, then report the sheet names, row counts, and the deleted PMIDs.
```

**运行方式：** 由 `demos/run-demo.mjs` 驱动的真实 `opencode run --auto` 会话（注入本仓库技能），耗时 56 秒。

**溯源：** 提交 3380cc6083c10a4f21d10f1f7988f985adbcb65a（[固定链接](https://github.com/yeyuan98/bioresearcher-skills/tree/3380cc6083c10a4f21d10f1f7988f985adbcb65a)），opencode 1.18.29、node v22.23.1；各技能 SKILL.md 的 sha256 见 [provenance.json](./provenance.json)。

**内容：** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · 产出文件：
- [`outputs/combined.xlsx`](./outputs/combined.xlsx)

**复现：** `node demos/run-demo.mjs --only agent-pubmed-weekly-en --publish`（仅限手动运行——会消耗 LLM token）。

**并行模式：** 顺序回退模式（opencode CLI 此模式下无子代理工具；并行 dr-worker 扇出是 Claude Code 插件特性）。

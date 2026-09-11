<!-- Bilingual artifact README: English first, 中文 below -->
# Interview-first — clarifying questions before research starts

Without the no-interview prefix, the deep-research skill asks its clarifying-question batch as ONE turn and does not start researching — even under non-interactive `opencode run --auto`.

**Outcome:** PASS (5/5 checks passed)

**Prompt**

```text
Using the bioresearcher-deep-research skill, run a deep research report on CAR-T therapy safety in solid tumors.
```

**How it was run:** real `opencode run --auto` session driven by `demos/run-demo.mjs` with the repo skills injected, 33 s wall-clock.

**Provenance:** commit d818c8571ae2874d9b76e7ce49fbc5e69016e573 ([permalink](https://github.com/yeyuan98/bioresearcher-skills/tree/d818c8571ae2874d9b76e7ce49fbc5e69016e573)), opencode 1.18.30, node v22.23.1; raw rep: `20260911-213114-r1` (gitignored raw log; not committed). See [provenance.json](./provenance.json) for per-skill sha256.

**Contents:** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json)

**Replay:** `node demos/run-demo.mjs --only agent-interview-en --publish` (manual-run only — spends LLM tokens).

**Fan-out mode:** sequential fallback (no subagent/Task tool calls in this session).

---

# 访谈优先——研究开始前先提出澄清问题

未加 no-interview 前缀时，深度研究技能会在一轮内集中提出澄清问题，且不先开始检索——即便是在非交互的 `opencode run --auto` 模式下。

**结果：** PASS（5/5 项检查通过）

**提示词**

```text
Using the bioresearcher-deep-research skill, run a deep research report on CAR-T therapy safety in solid tumors.
```

**运行方式：** 由 `demos/run-demo.mjs` 驱动的真实 `opencode run --auto` 会话（注入本仓库技能），耗时 33 秒。

**溯源：** 提交 d818c8571ae2874d9b76e7ce49fbc5e69016e573（[固定链接](https://github.com/yeyuan98/bioresearcher-skills/tree/d818c8571ae2874d9b76e7ce49fbc5e69016e573)），opencode 1.18.30、node v22.23.1；各技能 SKILL.md 的 sha256 见 [provenance.json](./provenance.json)。

**内容：** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json)

**复现：** `node demos/run-demo.mjs --only agent-interview-en --publish`（仅限手动运行——会消耗 LLM token）。

**并行模式：** 顺序回退模式（本会话未使用子代理 Task 工具）。

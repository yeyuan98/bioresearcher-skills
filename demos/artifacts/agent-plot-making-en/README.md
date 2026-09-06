<!-- Bilingual artifact README: English first, 中文 below -->
# Publication-grade structural figure — KRAS Switch I/II with 3-layer QA

Chains bioresearcher-python-setup-uv (uv env + pymol-open-source/matplotlib/pymupdf/numpy/pillow/biopython) and bioresearcher-plot-making to render fig1_kras_landscape (.pdf/.svg/.png) + LEGENDS.md from structural fixtures, passing the bundled alignment/collision/PDF-text QA gates.

**Outcome:** PASS (rubric adjudicated SATISFIED) (5/6 checks passed)

**Prompt**

```text
Using the input data in /home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-plot-making-en/20260906-142434-r1/data, first use bioresearcher-python-setup-uv to install the scientific visualization dependencies (pymol-open-source, matplotlib, pymupdf, numpy, pillow, biopython). Then use bioresearcher-plot-making to create a publication-grade composite figure in figures/kras_inhibitors/ following the structural-biology_binder-visualization specification. Generate fig1_kras_landscape (.pdf, .svg, .png), run the bundled QA gates (audit_panel_alignment.py, audit_figure_collisions.py, and audit_pdf_text.py), and provide LEGENDS.md. Ensure all QA gates pass.
```

**How it was run:** real `opencode run --auto` session driven by `demos/run-demo.mjs` with the repo skills injected, 1064 s wall-clock.

**Provenance:** commit 3380cc6083c10a4f21d10f1f7988f985adbcb65a ([permalink](https://github.com/yeyuan98/bioresearcher-skills/tree/3380cc6083c10a4f21d10f1f7988f985adbcb65a)), opencode 1.18.29, node v22.23.1; raw rep: `20260906-142434-r1` (gitignored raw log; not committed). See [provenance.json](./provenance.json) for per-skill sha256.

**Contents:** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · outputs:
- [`outputs/figures/kras_inhibitors/LEGENDS.md`](./outputs/figures/kras_inhibitors/LEGENDS.md)
- [`outputs/figures/kras_inhibitors/fig1_kras_landscape.alignment.json`](./outputs/figures/kras_inhibitors/fig1_kras_landscape.alignment.json)
- [`outputs/figures/kras_inhibitors/fig1_kras_landscape.pdf`](./outputs/figures/kras_inhibitors/fig1_kras_landscape.pdf)
- [`outputs/figures/kras_inhibitors/fig1_kras_landscape.png`](./outputs/figures/kras_inhibitors/fig1_kras_landscape.png)

**Replay:** `node demos/run-demo.mjs --only agent-plot-making-en --publish` (manual-run only — spends LLM tokens).

**Fan-out mode:** sequential fallback (no subagent/Task tool calls in this session).

---

# 发表级结构生物学图——KRAS Switch I/II 与三层 QA 门禁

串联 bioresearcher-python-setup-uv（uv 环境 + pymol-open-source/matplotlib/pymupdf/numpy/pillow/biopython）与 bioresearcher-plot-making，由结构数据fixtures 渲染 fig1_kras_landscape（.pdf/.svg/.png）与 LEGENDS.md，并通过自带的对齐/碰撞/PDF 文本三层 QA 门禁。

**结果：** PASS（rubric 已裁定 SATISFIED）（5/6 项检查通过）

**提示词**

```text
Using the input data in /home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-plot-making-en/20260906-142434-r1/data, first use bioresearcher-python-setup-uv to install the scientific visualization dependencies (pymol-open-source, matplotlib, pymupdf, numpy, pillow, biopython). Then use bioresearcher-plot-making to create a publication-grade composite figure in figures/kras_inhibitors/ following the structural-biology_binder-visualization specification. Generate fig1_kras_landscape (.pdf, .svg, .png), run the bundled QA gates (audit_panel_alignment.py, audit_figure_collisions.py, and audit_pdf_text.py), and provide LEGENDS.md. Ensure all QA gates pass.
```

**运行方式：** 由 `demos/run-demo.mjs` 驱动的真实 `opencode run --auto` 会话（注入本仓库技能），耗时 1064 秒。

**溯源：** 提交 3380cc6083c10a4f21d10f1f7988f985adbcb65a（[固定链接](https://github.com/yeyuan98/bioresearcher-skills/tree/3380cc6083c10a4f21d10f1f7988f985adbcb65a)），opencode 1.18.29、node v22.23.1；各技能 SKILL.md 的 sha256 见 [provenance.json](./provenance.json)。

**内容：** [transcript.md](./transcript.md) · [result.json](./result.json) · [provenance.json](./provenance.json) · 产出文件：
- [`outputs/figures/kras_inhibitors/LEGENDS.md`](./outputs/figures/kras_inhibitors/LEGENDS.md)
- [`outputs/figures/kras_inhibitors/fig1_kras_landscape.alignment.json`](./outputs/figures/kras_inhibitors/fig1_kras_landscape.alignment.json)
- [`outputs/figures/kras_inhibitors/fig1_kras_landscape.pdf`](./outputs/figures/kras_inhibitors/fig1_kras_landscape.pdf)
- [`outputs/figures/kras_inhibitors/fig1_kras_landscape.png`](./outputs/figures/kras_inhibitors/fig1_kras_landscape.png)

**复现：** `node demos/run-demo.mjs --only agent-plot-making-en --publish`（仅限手动运行——会消耗 LLM token）。

**并行模式：** 顺序回退模式（本会话未使用子代理 Task 工具）。

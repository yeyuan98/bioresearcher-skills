# BioResearcher Agent — Partner Publication Documentation (English)

> Language: **English** | [中文版](./agent.zh.md) · [Glossary](./glossary.md)
>
> Partner-facing document covering: functionality, technical architecture/API,
> core features, onboarding, application cases, demo links, and FAQ. Every
> demo below is a **true run result** (see `demos/artifacts/`, each with commit
> + sha256 provenance).

## 1. What it does

BioResearcher is an **Agent Skills package for biomedical research** built
around the [biomcp-ts](https://github.com/yeyuan98/biomcp-ts) MCP server. It
turns any SKILL.md-reading harness (opencode, Claude Code, Codex, Cursor,
Gemini CLI, WorkBuddy, …) into a research-capable agent: cited deep research,
clinical-trial / gene / variant / drug / disease / patent retrieval,
publication-grade plotting, PubMed weekly processing, Python environment
bootstrapping, and automated MCP runtime onboarding.

Current release: repo v1.11.1 with five independently versioned skills:

| Skill | Version | What it does |
|---|---|---|
| `bioresearcher-deep-research` | 1.7.0 | Deep-research orchestrator: clarify → align research area plan → decompose into 2–5 aspects → parallel (or sequential) investigation → PubMed E-utilities reference vetting → fully cited Markdown + HTML report with 1-click active return navigation |
| `bioresearcher-onboard` | 1.1.1 | Bootstraps `.bioresearcher-runtime/` in the project: portable Node.js 22, vendored biomcp (official or npmmirror mirror, auto-detected), optional R/Biowasm/SQLite features, and registers the server into OpenCode, Claude Code, Cursor, ZCode, Pi, CodeBuddy, or WorkBuddy |
| `bioresearcher-plot-making` | 1.0.0 | Biomedical plotting router + engine: publication-grade composite figures (protein–binder complexes, conformational dynamics, literature method summaries, case registers, evidence tables) with three-layer QA gates |
| `bioresearcher-pubmed-weekly` | 1.0.0 | Downloads and parses NCBI's past-week PubMed updatefiles (pure-Python streaming parser handling both `<PubmedArticle>` and `<DeleteCitation>`) into one Excel workbook |
| `bioresearcher-python-setup-uv` | 1.1.0 | Bootstraps a project-local uv-managed Python environment (official or China mirror) |

The "agent" = these skills + distribution forms (Claude Code plugin bundling
the MCP server and the `bioresearcher-dr-worker` subagent; WorkBuddy connector
shipping skills + MCP as one market listing). The MCP server itself is
documented separately in the [MCP doc](./mcp.en.md).

## 2. Core features

- **Verifiable citations, generated not hand-assembled**: every potentially
  citable source a worker touches lands in a per-aspect **evidence ledger**
  (`reports/<TOPIC>/evidence/*.jsonl`, fields copied verbatim from biomcp
  output); the report draft is authored with semantic cite-key markers
  (`[@pmid:21639808]`), and the ledger script `render` is the single
  numbering authority — it numbers every marker by first appearance and
  generates the Vancouver References section, so out-of-sync or hand-typed
  citations are structurally impossible. An independent auditor
  (`vet-references.py`) then re-checks the rendered report (contiguous
  [1]..[N], N == bibliography count, NCBI esummary cross-check) before
  delivery (true run: [case 6.2](#62-case-deep-research-english-parallel-fan-out)).
- **Interview-first**: by default the agent asks its clarifying questions as
  one batch (question, scope, time window, outcome, output format) and aligns
  the research-area plan with you before researching — even in non-interactive
  mode (see [case 6.4](#64-case-interview-first)).
- **Parallel fan-out with sequential fallback**: when the harness provides a
  subagent/Task tool, aspect workers run in parallel; otherwise the same
  skill runs them sequentially (true parallel evidence in
  [case 6.2](#62-case-deep-research-english-parallel-fan-out)).
- **Publication-grade plotting with deterministic QA**: panel alignment
  (≤1.5 pt), vector PDF collision audit, and a ≥5 pt font floor — all judged
  by scripts, not eyeballs.
- **Weekly pipeline processing**: incremental PubMed updatefiles parsing
  (including retracted/deleted PMIDs) into a single `combined.xlsx`.
- **Keyless by default**: every demo on this page — including the raw MCP
  probes — ran with **zero API keys**; keys only raise limits or unlock
  specific sources (MCP doc §5.3).
- **Bilingual**: skills are authored in English (ecosystem convention);
  the agent answers in the language of the prompt — a Chinese prompt yields a
  Chinese report (true run: [case 6.3](#63-case-deep-research-chinese-prompt)).
- **Built-in rate limiting**: the server paces every upstream source
  in-process; agents never sleep or throttle manually.
- **Offline resilience (after onboarding)**: Node runtime and biomcp are
  vendored into the project directory; no global environment needed.

## 3. Technical architecture

### 3.1 Components

```
┌────────────────────────────────────────────────────────────────┐
│ Harness (opencode / Claude Code / Codex / Cursor / Gemini CLI / │
│          ZCode / Pi / CodeBuddy / WorkBuddy)                    │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Skills layer skills/ (SKILL.md contract + references/    │  │
│  │ domain guides + scripts/)                                 │  │
│  │   deep-research (orchestrator) → dr-worker / Task fan-out │  │
│  │   plot-making · pubmed-weekly · python-setup-uv · onboard │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ MCP protocol (stdio JSON-RPC)       │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │ biomcp-ts MCP server (npm `biomcp`, pinned 1.4.0; 41 core │  │
│  │ + 15 optional tools: articles/trials/genes/variants/       │  │
│  │ drugs/diseases/patents/omics/…)                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
Distribution: skills CLI · Claude plugin marketplace (bundled MCP+subagent) ·
             WorkBuddy connector market (connector/workbuddy/) · git clone
```

### 3.2 Workflow (deep research)

① clarifying interview (skippable via `no-interview`) → ② decompose the
topic into 2–5 aspects and align the research-area plan with the user
(`light-research` keeps the top two) → ③ write the durable plan to
`reports/<TOPIC>/plan.md` → ④ one worker per aspect — parallel dispatch is
mandatory when the harness provides a subagent/Task tool — each worker
queries biomcp per `references/tool-selection.md` and appends every citable
source to `reports/<TOPIC>/evidence/<aspect>.jsonl` (verbatim tool fields,
never invented), writes cite-key-marked aspect notes, and passes a per-aspect
`check --markers` completion gate → ⑤ the orchestrator synthesizes
`final_report.draft.md` with the same `[@key]` markers → ⑤a merge the
per-aspect ledgers into `evidence/sources.jsonl` and verify article records
against NCBI esummary (fill-only backfill) → ⑤b `render` numbers every
marker and generates the References section (single numbering authority;
hard-fails on unresolved keys) → ⑤c `vet-references.py` audits the rendered
report (offline structural audit + independent NCBI verification) → ⑥
deliver `final_report.md` and, by default, `final_report.html` (`no-html`
skips). The worker contract lives in
`skills/bioresearcher-deep-research/references/worker-protocol.md`
(no re-delegation, no fabrication, no internal-knowledge fallback, every
claim cited).

### 3.3 Distribution channels

| Channel | Form | Notes |
|---|---|---|
| skills CLI | skills package | `npx skills add yeyuan98/bioresearcher-skills`; any SKILL.md harness |
| Claude Code marketplace | plugin | Bundles the core-only biomcp server (auto-starts; no manual `.mcp.json`) + `bioresearcher-dr-worker` subagent |
| WorkBuddy connector market | connector | MCP + 4 skills (onboard excluded — the connector itself does that job); npmmirror registry, managed Node 22 |
| git clone | source | Into `.opencode/skills/`, `.claude/skills/`, `.agents/skills/`, `.codex/skills/`, or `.gemini/skills/` |

## 4. API / interface documentation

The agent's "API" is the **skill contract**: a stable interface of files,
triggers, request prefixes, and output contracts — not REST endpoints.

### 4.1 The skill contract (SKILL.md, strict-6)

Each skill ships one `SKILL.md` whose frontmatter has exactly six keys
(agentskills.io strict mode, CI-enforced):

| Key | Meaning |
|---|---|
| `name` | Skill name == directory name, `^[a-z0-9]+(-[a-z0-9]+)*$` |
| `description` | Trigger description (front-loaded triggers; ≤500 chars, repo policy) |
| `license` | Apache-2.0 |
| `compatibility` | Harness/dependency notes |
| `metadata` | String metadata (incl. the independent `version`) |
| `allowed-tools` | Tool allowlist; may additionally contain Claude Code MCP server rules (`mcp__biomcp`, …) — inert strings elsewhere |

Body ≤500 lines; references and scripts exactly one directory level deep.

### 4.2 Request prefixes

Case-sensitive, leading tokens (trailing `:` tolerated):

| Prefix | Effect |
|---|---|
| `no-interview` | Skip the interview workflow (both Step-1 questions and Step-2 plan review) |
| `light-research` | Research only the top two aspects |
| `no-html` | Markdown only; skip HTML rendering |

### 4.3 Output contracts

| Skill | Output |
|---|---|
| deep-research | `reports/<TOPIC>/plan.md` + `evidence/<aspect>.jsonl` (per-aspect ledgers) + `evidence/sources.jsonl` (merged + verified) + cite-key `final_report.draft.md` + rendered `final_report.md` (numbered citations + generated References) + `final_report.html` (default on) + per-aspect notes (+ `assumptions.md` on interview degradation) |
| plot-making | `figures/<topic>/figN.*.pdf/.svg/.png` + `LEGENDS.md` + QA audit JSON (`*.alignment.json`, …) |
| pubmed-weekly | `combined.xlsx` (sheets `PubMed Articles` and `Deleted PMIDs`) |
| python-setup-uv | Project-local `.venv/` (uv-managed) |
| onboard | `.bioresearcher-runtime/` + harness config registration |

### 4.4 Subagent contract (dr-worker)

The Claude Code plugin ships `bioresearcher-dr-worker`
(`.claude-plugin/agents/`): it executes exactly ONE assigned aspect; its tool
pool is the biomcp servers plus file tools; per `worker-protocol.md` it makes
sequential calls (the server already paces — never sleep manually), makes
at most 3 attempts per query (original → simplified → alternate source), records
"evidence gaps" on failure, and never re-delegates or fabricates. Non-plugin
harnesses reach the same effect via their own Task tool or the sequential
fallback.

### 4.5 Harness compatibility matrix

| Harness | Skills | MCP | Notes |
|---|---|---|---|
| opencode | ✅ project `.opencode/skills/` | ✅ `opencode.json` | The empirically proven harness for these demos (v1.18.30; the retained 2026-09-06 pubmed-weekly capture ran on v1.18.29) |
| Claude Code | ✅ plugin or `.claude/skills/` | ✅ bundled / `.mcp.json` | Plugin adds the dr-worker parallel fan-out |
| Codex / Cursor / Gemini CLI | ✅ `.codex/skills/` / `.cursor/` / `.gemini/skills/` | ✅ per-harness MCP config | Gemini also `gemini skills install <repo>` (preview channel) |
| ZCode / Pi / CodeBuddy | ✅ | ✅ | Registered by the onboard skill |
| WorkBuddy | ✅ connector listing (4 skills) | ✅ bundled | Market install; core-only server; npmmirror |

## 5. Onboarding

### 5.1 Requirements

- Node.js **>= 22.13** with `npx` on PATH (check: `npx --version`)
- Optional: `uv` + `python3` (plotting/weekly skills bootstrap their own deps)
- The biomcp server is best assembled by the onboard skill; manual wiring is
  in [MCP doc §5.2](./mcp.en.md#52-harness-wiring)

### 5.2 Channel A: skills CLI (any harness)

```bash
npx skills add yeyuan98/bioresearcher-skills
# install just the onboarding skill and bootstrap immediately:
npx skills add yeyuan98/bioresearcher-skills --skill bioresearcher-onboard
```

### 5.3 Channel B: Claude Code plugin marketplace

```
/plugin marketplace add yeyuan98/bioresearcher-skills
/plugin install bioresearcher@bioresearcher-skills
```

The plugin bundles the core-only biomcp server (tools surface as
`mcp__plugin_bioresearcher_biomcp__*`) and the dr-worker subagent; the first
tool call pays the npx download. For prompt-free permissions see the
`permissions.allow` snippet in the repo's `docs/biomcp-ts-setup.md`.

### 5.4 Channel C: WorkBuddy connector

Install "BioResearcher" from the WorkBuddy connector market. The connector
ships the MCP server (npmmirror registry, managed Node 22, 120 s connection
timeout) plus four skills with zh/en descriptions — market install, no CLI.

### 5.5 Channel D: git clone

```bash
git clone https://github.com/yeyuan98/bioresearcher-skills .opencode/skills/bioresearcher-skills
# or .claude/skills/, .agents/skills/, .codex/skills/, .gemini/skills/
```

### 5.6 Mainland-China network

- The onboard skill **auto-detects network conditions** and switches to the
  npmmirror registry for Node + biomcp downloads when needed;
- `bioresearcher-python-setup-uv` supports China PyPI mirrors;
- The WorkBuddy connector defaults to npmmirror;
- Upstream biomedical APIs (NCBI E-utilities, ClinicalTrials.gov, MyGene, …)
  are global public endpoints; on restricted networks configure a proxy (the
  server honors HTTP(S)_PROXY via undici).

## 6. Application cases and demos

All cases are **true runs** driven by `demos/run-demo.mjs` (opencode v1.18.30)
— not hand-written examples. The 2026-09-11 refresh re-ran cases 6.2/6.3/6.4
and the MCP probes against deep-research **1.7.0** + biomcp **1.4.0**
(commit `d818c85`, per-`provenance.json`); case 6.5 retains its original
2026-09-06 run (commit `3380cc6`) and case 6.6 keeps its original 2026-09-06
session (re-published after a publish-glob fix only — prompt/checks unchanged;
its provenance carries both the original run fields and the re-publish note) —
their skills are unchanged and their provenances stay self-describing. Each
artifact dir carries: a bilingual README, the
session `transcript.md`, objective `result.json`, `provenance.json`, and the
produced outputs.

### 6.1 Case overview

| Case | Lang | Outcome | Duration | Demo link (GitHub permalink) |
|---|---|---|---|---|
| 6.2 deep research (BRCA1 DNA repair) | EN | PASS (rubric SATISFIED) | 545 s | [demos/artifacts/agent-deep-research-en](https://github.com/yeyuan98/bioresearcher-skills/tree/NEWPACKSHA/demos/artifacts/agent-deep-research-en) |
| 6.3 deep research (tumor immunotherapy) | ZH | PASS (rubric SATISFIED) | 649 s | [demos/artifacts/agent-deep-research-zh](https://github.com/yeyuan98/bioresearcher-skills/tree/NEWPACKSHA/demos/artifacts/agent-deep-research-zh) |
| 6.4 interview-first | EN | PASS | 33 s | [demos/artifacts/agent-interview-en](https://github.com/yeyuan98/bioresearcher-skills/tree/NEWPACKSHA/demos/artifacts/agent-interview-en) |
| 6.5 PubMed weekly parse | EN | PASS (rubric SATISFIED) | 56 s | [demos/artifacts/agent-pubmed-weekly-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-pubmed-weekly-en) |
| 6.6 publication-grade structural figure | EN | PASS (rubric SATISFIED) | 1064 s | [demos/artifacts/agent-plot-making-en](https://github.com/yeyuan98/bioresearcher-skills/tree/NEWPACKSHA/demos/artifacts/agent-plot-making-en) |
| 6.7 documented cases (WorkBuddy / onboard) | ZH/EN | — (non-run) | — | see §6.7 |

(When browsing the repo, use relative paths `../artifacts/<case>/`.)

### 6.2 Case: deep research (English, parallel fan-out)

**Prompt**: `no-interview light-research: Using the bioresearcher-deep-research skill, survey the recent article landscape on BRCA1 DNA repair. Keep it to at most 2 research aspects and at most 10 biomcp tool calls per aspect worker. Cite sources with PMIDs.`

The agent loads the skill → smoke-tests the MCP connection
(`biomcp_gene_search`) → fans out **two parallel Task workers** ("BRCA1 HR
mechanisms" and "BRCA1 PARPi resistance") — each appends its sources to a
per-aspect evidence ledger and passes the `check --markers` completion gate →
the orchestrator merges + NCBI-verifies the ledgers (`sources.jsonl`: 34
records, 33/33 markers resolved), drafts with `[@pmid:...]` cite-key markers, `render` numbers all 30
citations and generates the Vancouver References (citation locators — volume/issue/pages — wherever the source provides them), `vet-references.py` passes its structural audit, and the
interactive HTML report is rendered. Objective checks: skill loaded; ≥1 Task
dispatch; ledger keys (`pmid:...`) in tool output; the
`[evidence-ledger] render:` success banner; `[vet-references] Structural
audit: PASS`; PMIDs in the final answer; `final_report.html` surfaced.
Outputs:
[final_report.md](../artifacts/agent-deep-research-en/outputs/reports/brca1_dna_repair_landscape/final_report.md) ·
[cite-key draft](../artifacts/agent-deep-research-en/outputs/reports/brca1_dna_repair_landscape/final_report.draft.md) ·
[merged ledger](../artifacts/agent-deep-research-en/outputs/reports/brca1_dna_repair_landscape/evidence/sources.jsonl) ·
[rendered screenshot](../artifacts/agent-deep-research-en/screenshots/final_report-top.jpg) ·
[transcript](../artifacts/agent-deep-research-en/transcript.md)

### 6.3 Case: deep research (Chinese prompt, Chinese report)

**Prompt**: `no-interview light-research: 使用 bioresearcher-deep-research 技能，帮我做一个关于肿瘤免疫治疗（tumor immunotherapy）的文献综述并附引用。最多 2 个研究方面，每个方面的工作节点最多调用 10 次 biomcp 工具。请用中文撰写报告，引用使用 PMID。`
(extends the WorkBuddy connector's canonical zh example with explicit skill,
language, PMID, and call-budget instructions).

Two Chinese-titled parallel workers ("ICB 文献研究 worker", "CAR-T 文献研究
worker") build ledgers from English sources; `render` numbers 52 citations
from the merged ledger and `vet-references.py` passes. The report is written
in Chinese (executive summary; checkpoint-inhibitor and CAR-T aspects) with
PMID-cited English sources. Extra check: the final answer must contain Chinese
text (regex `[\u4e00-\u9fff]`). Outputs:
[final_report.md](../artifacts/agent-deep-research-zh/outputs/reports/tumor_immunotherapy/final_report.md) ·
[cite-key draft](../artifacts/agent-deep-research-zh/outputs/reports/tumor_immunotherapy/final_report.draft.md) ·
[merged ledger](../artifacts/agent-deep-research-zh/outputs/reports/tumor_immunotherapy/evidence/sources.jsonl) ·
[rendered screenshot](../artifacts/agent-deep-research-zh/screenshots/final_report-top.jpg)

### 6.4 Case: interview-first

**Prompt**: `Using the bioresearcher-deep-research skill, run a deep research report on CAR-T therapy safety in solid tumors.` (no prefix.)

Even under non-interactive `--auto`, the agent posts its clarifying-question
batch and starts **no research and no scripts** (checks: final answer
contains `?`; contains no `final_report`; none of `article_search` /
`trial_search` / `gene_get` was called; zero `bash` calls — ledger scripts
and rendering start only after the scope is agreed). Regression evidence for
the interview-first feature. Output:
[transcript](../artifacts/agent-interview-en/transcript.md)

### 6.5 Case: PubMed weekly parse

**Prompt**: parse `{DATA_DIR}/pubmed-sample.xml.gz` (trimmed weekly archive:
6 articles + 2 deleted PMIDs) into `combined.xlsx` and report.

Output matches `expected-summary.json` exactly: sheet `PubMed Articles` has 6
data rows; sheet `Deleted PMIDs` carries 99999991/99999992. Rubric adjudicated
SATISFIED. Output: [combined.xlsx](../artifacts/agent-pubmed-weekly-en/outputs/combined.xlsx)

### 6.6 Case: publication-grade structural figure

**Prompt**: install pymol-open-source/matplotlib/pymupdf/numpy/pillow/
biopython via the uv skill, then produce
`figures/kras_inhibitors/fig1_kras_landscape` (.pdf/.svg/.png) per the
structural-biology_binder-visualization spec, run all three QA gates, and
write LEGENDS.md.

The true session iterated through two collision-audit fix rounds and finished
all-green: collisions 0 fail/0 warn; smallest glyph 5.2 pt (≥5 pt floor);
panel alignment PASS (fail 0 / warn 0 / 4 comparisons). Outputs:
[fig1_kras_landscape.png](../artifacts/agent-plot-making-en/outputs/figures/kras_inhibitors/fig1_kras_landscape.png) ·
[fig1 PDF](../artifacts/agent-plot-making-en/outputs/figures/kras_inhibitors/fig1_kras_landscape.pdf) ·
[LEGENDS.md](../artifacts/agent-plot-making-en/outputs/figures/kras_inhibitors/LEGENDS.md)

### 6.7 Documented cases (WorkBuddy / onboard)

- **WorkBuddy**: after installing "BioResearcher" from the connector market,
  the connector's example prompts reproduce case-6.2/6.3-style workflows —
  zh examples: “帮我做一个关于肿瘤免疫治疗的多方面文献综述并附引用”, “总结上周
  PubMed 更新中与 CRISPR 相关的文献”, “查找 BRAF V600E 变异的相关药物与临床
  试验” (the third one's raw MCP calls: [MCP doc §6](./mcp.en.md#6-application-cases-and-demos)).
- **onboard**: in any empty project, ask to bootstrap the BioResearcher
  runtime; the skill lands portable Node 22 + vendored biomcp in
  `.bioresearcher-runtime/` (npmmirror auto-detect), enables optional
  R/Biowasm/SQLite, and registers your harness — its effect IS the onboarding
  flow, so it is documented rather than run.

## 7. FAQ

**Q1: Is Chinese supported?**
Skills are authored in English (Agent Skills ecosystem convention, for stable
cross-harness triggering); the agent replies in the prompt's language — a
Chinese prompt yields a Chinese report (true run: case 6.3). The WorkBuddy
connector additionally ships official zh descriptions and zh example prompts.

**Q2: Do I need API keys?**
No — every demo here ran keyless. Exceptions and limit-raising keys: 
[MCP doc §5.3](./mcp.en.md#53-authentication-optional-api-keys).

**Q3: Does it work in Cursor / Codex / WorkBuddy?**
Yes — see the matrix in §4.5 and the matching channel in §5.

**Q4: Can the agent fabricate references?**
No — and not merely by instruction. Since deep-research 1.5+ the citation
pipeline is key-based end-to-end: workers append every citable source to an
evidence ledger, the draft is authored with `[@pmid:...]` cite-key markers,
and the `render` script is the single numbering authority (it hard-fails on
any key without a ledger record); `vet-references.py` then audits the
rendered report (contiguous [1]..[N], N == bibliography count, NCBI esummary
cross-check). Hand-assembled bibliographies are structurally impossible;
missing evidence is stated as evidence gaps, and failed queries are recorded.

**Q5: Does it work from mainland China?**
Yes — onboard/uv skills and the WorkBuddy connector support npmmirror/China
mirrors; upstream biomedical APIs may need a proxy (see §5.6).

**Q6: Parallel vs sequential mode?**
Functionally equivalent: with a subagent tool (opencode Task, the Claude
plugin's dr-worker) aspect workers run in parallel; otherwise sequentially.
Case 6.2's transcript shows a real Task parallel fan-out.

**Q7: Why won't final_report.html open on GitHub?**
GitHub does not render committed HTML. See each case's `screenshots/`, or
clone and open locally; the HTML file itself is in `outputs/`.

**Q8: How many tokens / how long do demos take?**
Measured (opencode v1.18.30, deep-research 1.7.0 with parallel dispatch):
interview 33 s; PubMed parse 56 s (2026-09-06 run); deep research EN 545 s /
ZH 649 s; structural figure (incl. dependency install) 1064 s (both 2026-09-06 runs). Replay
commands are in `demos/README.md`; the MCP probes are token-free.

**Q9: Do the plugin-bundled and manually registered MCP servers conflict?**
Differently-configured servers do not deduplicate — keep one and disable the
other via `/mcp` (Claude Code).

**Q10: What about data privacy?**
All queries hit public biomedical APIs only; reports and figures stay local
to your project; the repo contains no telemetry; demo artifacts and logs
contain no credentials.

**Q11: License and commercial use?**
Apache-2.0 (repo LICENSE); citation metadata in `CITATION.cff`. Commercial
use and derivative work permitted with the license notice retained.

**Q12: Windows support?**
The onboard skill supports PowerShell/cmd; demos were proven on Linux. The
core requirement is Node >= 22.13 + npx — cross-platform by design.

**Q13: Does it work offline?**
After onboarding, the runtime is vendored in-project; retrieval features
inherently need the public data sources (a data-source property, not an
installation dependency).

**Q14: How do I reproduce these demos?**
Clone the repo and run `node demos/run-demo.mjs --list` for all 7 scenarios;
`--only <id> --publish` re-runs and re-publishes artifacts (agent cases spend
LLM tokens; manual-run only). Details: [demos/README.md](../README.md).

## 8. References and license

- Skill sources: repo `skills/<name>/SKILL.md` (21 domain reference guides
  under `references/` — 18 for deep-research, 3 for plot-making — incl. tool
  selection, citation formats, rate limiting)
- MCP server: [MCP doc (EN)](./mcp.en.md) / [MCP 文档（中文）](./mcp.zh.md)
- Wiring and auth details: repo `docs/biomcp-ts-setup.md`
- Migration from the older plugin (tool-name map, capability downgrades):
  repo `docs/migration-from-plugin.md`
- License: Apache-2.0; citation: `CITATION.cff`; terms: [Glossary](./glossary.md)

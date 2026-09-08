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

Current release: repo v1.8.0 with five independently versioned skills:

| Skill | Version | What it does |
|---|---|---|
| `bioresearcher-deep-research` | 1.3.0 | Deep-research orchestrator: clarify → align research area plan → decompose into 2–5 aspects → parallel (or sequential) investigation → PubMed E-utilities reference vetting → fully cited Markdown + HTML report with 1-click active return navigation |
| `bioresearcher-onboard` | 1.1.0 | Bootstraps `.bioresearcher-runtime/` in the project: portable Node.js 22, vendored biomcp (official or npmmirror mirror, auto-detected), optional R/Biowasm/SQLite features, and registers the server into OpenCode, Claude Code, Cursor, ZCode, Pi, CodeBuddy, or WorkBuddy |
| `bioresearcher-plot-making` | 1.0.0 | Biomedical plotting router + engine: publication-grade composite figures (protein–binder complexes, conformational dynamics, literature method summaries, case registers, evidence tables) with three-layer QA gates |
| `bioresearcher-pubmed-weekly` | 1.0.0 | Downloads and parses NCBI's past-week PubMed updatefiles (pure-Python streaming parser handling both `<PubmedArticle>` and `<DeleteCitation>`) into one Excel workbook |
| `bioresearcher-python-setup-uv` | 1.1.0 | Bootstraps a project-local uv-managed Python environment (official or China mirror) |

The "agent" = these skills + distribution forms (Claude Code plugin bundling
the MCP server and the `bioresearcher-dr-worker` subagent; WorkBuddy connector
shipping skills + MCP as one market listing). The MCP server itself is
documented separately in the [MCP doc](./mcp.en.md).

## 2. Core features

- **Verifiable citations**: every claim carries a numbered citation (PMID /
  DOI / NCT / patent IDs); no internal-knowledge fallback, and missing
  evidence is stated explicitly.
- **Interview-first**: by default the agent asks its clarifying questions as
  one batch (question, scope, time window, outcome, output format) before
  researching — even in non-interactive mode (see [case 6.4](#64-case-interview-first)).
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
│  │ biomcp-ts MCP server (npm `biomcp`, pinned 1.1.1; 41 core │  │
│  │ + 15 optional tools: articles/trials/genes/variants/       │  │
│  │ drugs/diseases/patents/omics/…)                            │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
Distribution: skills CLI · Claude plugin marketplace (bundled MCP+subagent) ·
             WorkBuddy connector market (connector/workbuddy/) · git clone
```

### 3.2 Workflow (deep research)

Six steps: ① clarifying interview (skippable via `no-interview`) →
② decompose topic and align research area plan (`light-research` keeps the
top two) → ③ one worker per aspect, parallel or sequential (tool choice per
`references/tool-selection.md`, collecting identifiers) → ④ synthesize
`reports/<TOPIC>/final_report.md` (numbered citations + bibliography) →
⑤ render `final_report.html` by default (`no-html` skips) → ⑥ deliver. The
worker contract lives in
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
| deep-research | `reports/<TOPIC>/final_report.md` + `final_report.html` (default on) + per-aspect files (+ `assumptions.md` on interview degradation) |
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
| opencode | ✅ project `.opencode/skills/` | ✅ `opencode.json` | The empirically proven harness for these demos (v1.18.29) |
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

All cases are **true runs** driven by `demos/run-demo.mjs` (opencode v1.18.29; the
skills tree under test is pinned at commit `3380cc6` — see each
`provenance.json`) — not hand-written examples. Each artifact dir carries:
a bilingual README, the session `transcript.md`, objective `result.json`,
`provenance.json`, and the produced outputs.

### 6.1 Case overview

| Case | Lang | Outcome | Duration | Demo link (GitHub permalink) |
|---|---|---|---|---|
| 6.2 deep research (BRCA1 DNA repair) | EN | PASS | 515 s | [demos/artifacts/agent-deep-research-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-deep-research-en) |
| 6.3 deep research (tumor immunotherapy) | ZH | PASS | 814 s | [demos/artifacts/agent-deep-research-zh](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-deep-research-zh) |
| 6.4 interview-first | EN | PASS | 23 s | [demos/artifacts/agent-interview-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-interview-en) |
| 6.5 PubMed weekly parse | EN | PASS (rubric SATISFIED) | 56 s | [demos/artifacts/agent-pubmed-weekly-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-pubmed-weekly-en) |
| 6.6 publication-grade structural figure | EN | PASS (rubric SATISFIED) | 1064 s | [demos/artifacts/agent-plot-making-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-plot-making-en) |
| 6.7 documented cases (WorkBuddy / onboard) | ZH/EN | — (non-run) | — | see §6.7 |

(When browsing the repo, use relative paths `../artifacts/<case>/`.)

### 6.2 Case: deep research (English, parallel fan-out)

**Prompt**: `no-interview light-research: Using the bioresearcher-deep-research skill, survey the recent article landscape on BRCA1 DNA repair. Cite sources with PMIDs.`

The agent loads the skill → smoke-tests the MCP connection
(`biomcp_gene_search`) → fans out **two parallel Task workers** ("HR mechanism
frontier" and "PARPi clinical translation") → synthesizes and renders
`final_report.html`. Objective checks: skill loaded; PMIDs in the final
answer; `final_report.html` surfaced in tool output; article searches ran
(directly or via workers). Outputs:
[final_report.md](../artifacts/agent-deep-research-en/outputs/reports/brca1_dna_repair/final_report.md) ·
[rendered screenshot](../artifacts/agent-deep-research-en/screenshots/final_report-top.jpg) ·
[transcript](../artifacts/agent-deep-research-en/transcript.md)

### 6.3 Case: deep research (Chinese prompt, Chinese report)

**Prompt**: `no-interview light-research: 使用 bioresearcher-deep-research 技能，帮我做一个关于肿瘤免疫治疗（tumor immunotherapy）的多方面文献综述并附引用。请用中文撰写报告，引用使用 PMID。`
(extends the WorkBuddy connector's canonical zh example with explicit skill,
language, and PMID instructions).

The agent queries English sources and writes the report in Chinese (executive
summary; checkpoint-inhibitor and cell-therapy aspects; unified bibliography
with numbered PMIDs). Extra check: the final answer must contain Chinese text
(regex `[\u4e00-\u9fff]`). Outputs:
[final_report.md](../artifacts/agent-deep-research-zh/outputs/reports/tumor_immunotherapy/final_report.md) ·
[rendered screenshot](../artifacts/agent-deep-research-zh/screenshots/final_report-top.jpg)

### 6.4 Case: interview-first

**Prompt**: `Using the bioresearcher-deep-research skill, run a deep research report on CAR-T therapy safety in solid tumors.` (no prefix.)

Even under non-interactive `--auto`, the agent posts its clarifying-question
batch and starts **no research** (checks: final answer contains `?`; contains
no `final_report`; none of `article_search` / `trial_search` / `gene_get` was
called). Regression evidence for the interview-first feature. Output:
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
The deep-research contract forbids internal-knowledge fallback: every claim
needs a numbered citation (PMID/DOI/NCT/patent ID), missing evidence must be
stated, and failed queries are recorded as evidence gaps.

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
Measured (opencode v1.18.29): interview 23 s; PubMed parse 56 s; deep
research EN 515 s / ZH 814 s; structural figure (incl. dependency install)
1064 s. Replay commands are in `demos/README.md`; the MCP probes are
token-free.

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

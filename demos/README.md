# Demos & Partner Documentation / 演示与合作发布文档

Bilingual partner-publication pack for the BioResearcher skills package:
**true-run demo artifacts** plus the two partner-facing documents (Agent 智能体
/ MCP), in Chinese and English. / 面向合作方的双语发布材料包：**真实运行**
的演示产物 + 两份发布文档（智能体 / MCP），中英双语。

> **Showroom / 展示站** — the same material powers the GitHub Pages site
> <https://yeyuan98.github.io/bioresearcher-skills/> (bilingual splash,
> per-case report pages embedding the byte-exact report artifacts). Source:
> `demos/website/` (static, zero-dep `build.mjs`; built site never committed);
> deployed by `.github/workflows/pages.yml` — requires the one-time repo
> setting Settings → Pages → Source: GitHub Actions.
> / 同一批材料驱动 GitHub Pages 展示站（双语入口页 + 逐案例报告页，直接嵌入
> 逐字节一致的报告产物）。源码在 `demos/website/`（静态、零依赖构建，构建
> 产物不入库），由 `pages.yml` 部署——需一次性设置 Settings → Pages →
> Source: GitHub Actions。

## Documents / 文档

| Document | 中文 | English |
|---|---|---|
| Agent (skills, plugin, connector) | [agent.zh.md](./docs/agent.zh.md) | [agent.en.md](./docs/agent.en.md) |
| MCP (biomcp-ts server, pinned 1.1.1) | [mcp.zh.md](./docs/mcp.zh.md) | [mcp.en.md](./docs/mcp.en.md) |
| Glossary / 术语表 | [glossary.md](./docs/glossary.md) | — |

### Partner-requirements matrix / 合作方需求覆盖矩阵

| Requirement / 要求 | Agent doc | MCP doc |
|---|---|---|
| 功能 (functionality) | §1 | §1 |
| 技术架构 / API 文档 (architecture / API docs) | §3 + §4 | §3 + §4 |
| 核心特性 (core features) | §2 | §2 |
| 开通流程 (onboarding) | §5 | §5 |
| 应用案例 (application cases) | §6 | §6 |
| Demo 链接 (demo links) | §6.1 table | §6 table |
| 常见 Q&A (FAQ) | §7 | §7 |

## Demo index / 演示索引

All artifacts are **true runs** with commit + sha256 provenance per directory
(`provenance.json`); each has a bilingual `README.md`, the curated session
`transcript.md`, graded `result.json`, and `outputs/`. / 所有产物均为**真实
运行**结果，每个目录带提交号与 sha256 溯源、双语 README、会话记录、客观
校验与产出文件。

> **Provenance note / 溯源说明** — the `gitCommit` recorded in each
> `provenance.json` is the repo HEAD **at run time** (`3380cc6`): it pins the
> exact `skills/` tree under test (per-skill sha256) and the scenario manifest
> (`scenarioSha256`). The `demos/` pack itself landed in the follow-up commit
> `2d4ab09`; the GitHub permalinks in the docs point at that pack commit.
> / 各 `provenance.json` 记录的 `gitCommit` 是**运行时刻**的仓库 HEAD
> （`3380cc6`），钉扎被测 `skills/` 树（逐技能 sha256）与场景清单
> （`scenarioSha256`）；`demos/` 目录本身由后续提交 `2d4ab09` 引入，文档中的
> GitHub 固定链接指向该打包提交。

| Scenario | Kind | Lang | Outcome | Wall time |
|---|---|---|---|---|
| [agent-deep-research-en](./artifacts/agent-deep-research-en/README.md) | agent (opencode + skills + MCP) | EN | PASS | 515 s |
| [agent-deep-research-zh](./artifacts/agent-deep-research-zh/README.md) | agent | ZH | PASS | 814 s |
| [agent-interview-en](./artifacts/agent-interview-en/README.md) | agent | EN | PASS | 23 s |
| [agent-pubmed-weekly-en](./artifacts/agent-pubmed-weekly-en/README.md) | agent | EN | PASS (rubric SATISFIED) | 56 s |
| [agent-plot-making-en](./artifacts/agent-plot-making-en/README.md) | agent | EN | PASS (rubric SATISFIED) | 1064 s |
| [mcp-tool-tour-en](./artifacts/mcp-tool-tour-en/README.md) | mcp-probe (no LLM) | EN | PASS | 43 s |
| [mcp-tool-tour-zh](./artifacts/mcp-tool-tour-zh/README.md) | mcp-probe | ZH | PASS | 9 s |

## Replay / 复现

```bash
node demos/run-demo.mjs --list                    # index (CI-safe)
node demos/run-demo.mjs --dry-run                 # schema + provisioning check (CI-safe)
node demos/run-demo.mjs --only mcp-tool-tour-en --publish   # token-free true replay
node demos/run-demo.mjs --only agent-interview-en --publish # agent replay (spends LLM tokens)
node demos/lib/mcp-probe.mjs --check              # tools/list vs pinned registry assert
node demos/check-demos.mjs                        # local gate: links/parity/tool-names/caps
```

Agent scenarios are **manual-run only** (real `opencode` CLI + LLM tokens +
network), exactly like the `agent-test/` suite they were ported from; CI
validates this pack hermetically via `--list`, `--dry-run`, and
`check-demos.mjs`. / 智能体场景**仅限手动运行**（真实 opencode CLI、LLM
token 与网络），与移植来源 `agent-test/` 套件一致；CI 仅以 `--list`、
`--dry-run` 与 `check-demos.mjs` 做封闭校验。

Replaying a rubric scenario (`agent-pubmed-weekly-en`,
`agent-plot-making-en`) overwrites its `result.json` and **drops the manual
adjudications** recorded there — re-verify the output against
`expected-summary.json` / the QA gates and re-record the adjudication entry
after replay. / 重放带 rubric 的两个场景会覆盖 `result.json` 并**丢失人工
裁定记录**——重放后请对照 `expected-summary.json` / QA 门禁重新核验并补录
裁定条目。

## Layout / 目录

```
demos/
├── run-demo.mjs     # runner + 12-check grader (vendored port of agent-test/run.mjs)
├── check-demos.mjs  # CI-safe gate for this pack
├── lib/             # mcp-probe.mjs (stdio JSON-RPC client), publish.mjs (curator),
│                    # biomcp-tools@1.1.1.json (vendored registry, CI-diffed), screenshot.sh
├── scenarios/       # 7 scenario manifests (+ fixtures; kind: agent | mcp-probe)
├── artifacts/       # committed true-run outputs (curated; log.jsonl never committed)
├── docs/            # the four partner documents + glossary
└── .runs/, data/    # (gitignored) replay workspace
```

Self-containment: `demos/` executes no file outside itself at runtime except
its declared subject — `../skills` (repo-relative; sha256-pinned in every
provenance) and `biomcp@1.1.1` from npm. No runtime read of `agent-test/`,
`scripts/ci/`, or `docs/` (CI-time registry diffing by `check-demos.mjs`
excepted). / 自包含：运行时除被演示对象（`../skills` 与 npm 的
`biomcp@1.1.1`）外不读取 `demos/` 之外的任何文件（CI 时点由
`check-demos.mjs` 做注册表一致性比对除外）。

## Notes / 说明

- The 447 KB structural fixture PNG in
  `scenarios/agent-plot-making-en/fixtures/` is copied **verbatim** from the
  source suite (re-encoding would falsify a true-run input) — documented
  exemption to the duplication guideline. / 结构生物学场景的 447 KB 输入
  PNG 为**原样复制**（重编码会失真真实运行的输入），属已记录的豁免。
- Repo-size budget for this pack: <= 3 MiB / <= 150 files (enforced by
  `check-demos.mjs`; the plugin install copies the whole repo, so this
  matters). / 本目录预算 ≤ 3 MiB / ≤ 150 个文件（`check-demos.mjs` 强制）。

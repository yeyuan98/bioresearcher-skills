# BioResearcher 智能体 · 合作伙伴发布文档（中文）

> 语言/Language: **中文** | [English version](./agent.en.md) · 术语表/[Glossary](./glossary.md)
>
> 本文档面向合作方发布场景，完整覆盖：功能、技术架构/API 文档、核心特性、
> 开通流程、应用案例、Demo 链接与常见 Q&A。所有 Demo 均为**真实运行结果**
> （见 `demos/artifacts/`，每次运行附提交号与 sha256 溯源）。

## 1. 功能总览

BioResearcher 是一套面向生物医学研究的**智能体技能包（Agent Skills）**，
围绕 [biomcp-ts](https://github.com/yeyuan98/biomcp-ts) MCP 服务器构建，
在 opencode、Claude Code、Codex、Cursor、Gemini CLI 及 WorkBuddy 等宿主中
提供「会做科研的智能体」能力：文献调研、临床试验/基因/变异/药物/疾病/专利
检索、发表级科研绘图、PubMed 周更批量处理、Python 环境引导与 MCP 运行时
自动开通。

当前版本：仓库 v1.7.0，包含 5 个技能（每个技能独立 semver）：

| 技能 | 版本 | 功能 |
|---|---|---|
| `bioresearcher-deep-research` | 1.3.0 | 深度研究编排器：澄清问题并对齐研究方案 → 把主题拆成 2–5 个研究侧面 → 并行（或顺序）调研 → PubMed E-utilities 自动核验补全引用 → 产出带编号引用的 Markdown + HTML 报告（支持一键回跳阅读锚点） |
| `bioresearcher-onboard` | 1.1.0 | 项目本地运行时引导：在 `.bioresearcher-runtime/` 下载便携 Node.js 22、供应商化 biomcp（自动探测官方源或 npmmirror 镜像）、按需启用 R/Biowasm/SQLite，并把服务注册进 OpenCode、Claude Code、Cursor、ZCode、Pi、CodeBuddy 或 WorkBuddy |
| `bioresearcher-plot-making` | 1.0.0 | 生物医学科研绘图路由与引擎：按数据类型选择规范，产出发表级复合图（蛋白-结合体结构、构象动态、文献方法综述、病例登记、证据表），内置三层 QA 门禁 |
| `bioresearcher-pubmed-weekly` | 1.0.0 | 下载并解析 NCBI 上周 PubMed updatefiles（纯 Python 流式解析器，同时处理 `<PubmedArticle>` 与 `<DeleteCitation>`），汇总为一个 Excel 工作簿 |
| `bioresearcher-python-setup-uv` | 1.1.0 | 用 uv 引导项目本地 Python 环境（官方源或国内镜像） |

「智能体」= 以上技能 + 分发形态（Claude Code 插件：捆绑 MCP 服务器与
`bioresearcher-dr-worker` 子代理；WorkBuddy 连接器：技能 + MCP 一体上架）。
MCP 服务器本身的文档另见 [MCP 文档](./mcp.zh.md)。

## 2. 核心特性

- **引用可核查的深度研究**：每条论断带编号引用，收集 PMID / DOI / NCT /
  专利号；不使用模型内部知识充数，证据缺失时明确说明。
- **访谈优先**：默认先在一轮内集中提出澄清问题（研究问题、范围、时间窗、
  结局指标、输出格式），确认后才开题——非交互模式下同样保持该行为
  （见 [案例 6.4](#64-案例访谈优先先问后做)）。
- **并行扇出 + 顺序回退**：宿主提供子代理/Task 工具时按研究侧面并行调度
  worker；没有时自动顺序执行——同一技能在两类宿主下均可运行
  （真实并行证据见 [案例 6.2](#62-案例深度研究英文并行扇出)）。
- **发表级绘图与确定性 QA**：面板对齐（≤1.5 pt）、PDF 矢量碰撞审计、
  字号下限（≥5 pt）三项门禁全部由脚本判定，不靠肉眼。
- **周更流水线处理**：PubMed updatefiles 增量解析（含撤稿删除记录），
  一步产出 `combined.xlsx`。
- **零密钥默认可用**：所有演示（含 MCP 直连探针）均在**无任何 API Key**
  的环境完成；需要更高限额或特定数据源时再按需配置（见 MCP 文档 5.3）。
- **双语能力**：技能指令以英文编写（生态惯例），智能体回答语言跟随提问
  语言——中文提问得到中文报告（真实运行证据见
  [案例 6.3](#63-案例深度研究中文提问中文报告)）。
- **服务内建限流**：智能体不需要（也不应该）手动 sleep；按数据源限速。
- **离线韧性（引导后）**：onboard 把 Node 运行时与 biomcp 供应商化进项目
  目录，安装完成后不再依赖全局环境。

## 3. 技术架构

### 3.1 组件构成

```
┌────────────────────────────────────────────────────────────────┐
│ 宿主 Harness（opencode / Claude Code / Codex / Cursor /          │
│              Gemini CLI / ZCode / Pi / CodeBuddy / WorkBuddy）    │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 技能层 skills/（SKILL.md 契约 + references/ 领域指南 +     │  │
│  │ scripts/ 脚本）                                            │  │
│  │   deep-research（编排） → dr-worker 子代理 / Task 扇出      │  │
│  │   plot-making · pubmed-weekly · python-setup-uv · onboard  │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│                           │ MCP 协议（stdio JSON-RPC）           │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │ biomcp-ts MCP 服务器（npm `biomcp`，钉扎 1.1.1；41 核心    │  │
│  │ + 15 可选工具：文献/试验/基因/变异/药物/疾病/专利/组学…）    │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
分发：skills CLI · Claude 插件市场（.claude-plugin/，捆绑 MCP+子代理）·
      WorkBuddy 连接器市场（connector/workbuddy/）· git clone
```

### 3.2 工作流（以深度研究为例）

六步：① 澄清访谈（`no-interview` 前缀可跳过）→ ② 主题分解与方案对齐（`light-research`
前缀只取前两个）→ ③ 每侧面一个 worker 并行/顺序
调研（按 `references/tool-selection.md` 选择工具，收集标识符）→ ④ 汇总为
`reports/<TOPIC>/final_report.md`（编号引用 + 文献表）→ ⑤ 默认渲染
`final_report.html`（`no-html` 前缀跳过）→ ⑥ 交付。Worker 契约见
`skills/bioresearcher-deep-research/references/worker-protocol.md`
（不重委派、不编造、不回退内部知识、每条论断带引用）。

### 3.3 分发渠道

| 渠道 | 形态 | 说明 |
|---|---|---|
| skills CLI | 技能包 | `npx skills add yeyuan98/bioresearcher-skills`，任意读取 SKILL.md 的宿主可用 |
| Claude Code 插件市场 | 插件 | 捆绑核心版 biomcp 服务器（自动启动，无需手动 `.mcp.json`）+ `bioresearcher-dr-worker` 子代理 |
| WorkBuddy 连接器市场 | 连接器 | MCP + 4 个技能（不含 onboard，连接器自身已完成其职责）；npmmirror 源、Node 22 托管运行时 |
| git clone | 源码 | 克隆到 `.opencode/skills/`、`.claude/skills/`、`.agents/skills/`、`.codex/skills/` 或 `.gemini/skills/` |

## 4. API / 接口文档

智能体的「API」是**技能契约**：宿主与用户通过稳定的文件接口、触发词、
请求前缀与输出契约交互，而不是 REST 端点。

### 4.1 技能契约（SKILL.md，strict-6）

每个技能根目录一个 `SKILL.md`，frontmatter 恰好六个键（agentskills.io
严格模式，仓库 CI 强制）：

| 键 | 含义 |
|---|---|
| `name` | 技能名 = 目录名，`^[a-z0-9]+(-[a-z0-9]+)*$` |
| `description` | 触发描述（前置触发词；≤500 字符，仓库策略） |
| `license` | Apache-2.0 |
| `compatibility` | 兼容宿主与依赖说明 |
| `metadata` | 字符串元数据（含独立 `version`） |
| `allowed-tools` | 工具白名单；可含 Claude Code MCP 服务器规则（`mcp__biomcp` 等），其他宿主视为惰性字符串 |

正文 ≤500 行；引用与脚本仅一层目录深（`references/`、`scripts/`）。

### 4.2 请求前缀

大小写敏感、置于提问开头（末尾可带 `:`）：

| 前缀 | 效果 |
|---|---|
| `no-interview` | 跳过访谈工作流（含第一步提问与第二步方案确认） |
| `light-research` | 只研究前两个侧面（轻量模式） |
| `no-html` | 只出 Markdown，不渲染 HTML |

### 4.3 输出契约

| 技能 | 输出 |
|---|---|
| deep-research | `reports/<TOPIC>/final_report.md` + `final_report.html`（默认开）+ 各侧面文件 + （免访谈降级时）`assumptions.md` |
| plot-making | `figures/<主题>/figN.*.pdf/.svg/.png` + `LEGENDS.md` + QA 审计 JSON（`*.alignment.json` 等） |
| pubmed-weekly | `combined.xlsx`（`PubMed Articles` 与 `Deleted PMIDs` 两个 sheet） |
| python-setup-uv | 项目本地 `.venv/`（uv 管理） |
| onboard | `.bioresearcher-runtime/` + 宿主配置注册 |

### 4.4 子代理契约（dr-worker）

Claude Code 插件内置 `bioresearcher-dr-worker`（`.claude-plugin/agents/`）：
只执行编排器分配的**单个**研究侧面；工具池为 biomcp 服务器 + 文件读写；
按 `worker-protocol.md` 执行——顺序调用（服务端已限速，绝不手动 sleep）、
每查询至多 3 次尝试（原查询 → 简化 → 换源）、失败记录「证据缺口」后继续、
禁止重委派与内部知识。非插件宿主用宿主自带 Task 工具或顺序回退达到同等
效果。

### 4.5 宿主兼容矩阵

| 宿主 | 技能 | MCP | 备注 |
|---|---|---|---|
| opencode | ✅ 项目级 `.opencode/skills/` | ✅ `opencode.json` | 本仓库 Demo 的实证宿主（v1.18.29） |
| Claude Code | ✅ 插件或 `.claude/skills/` | ✅ 插件捆绑 / `.mcp.json` | 插件额外提供 dr-worker 并行扇出 |
| Codex / Cursor / Gemini CLI | ✅ `.codex/skills/` / `.cursor/` / `.gemini/skills/` | ✅ 各自 MCP 配置 | Gemini 亦可 `gemini skills install <repo>`（预览通道命令） |
| ZCode / Pi / CodeBuddy | ✅ | ✅ | 由 onboard 技能注册 |
| WorkBuddy | ✅ 连接器上架（4 技能） | ✅ 连接器自带 | 市场安装，核心版服务器，npmmirror |

## 5. 开通流程

### 5.1 环境要求

- Node.js **≥ 22.13**（含 `npx`）；检查：`npx --version`
- 可选：`uv` + `python3`（绘图/周更技能的 Python 依赖由技能自行引导）
- MCP 服务器推荐由 onboard 技能自动装配，手动接线见
  [MCP 文档 5.2](./mcp.zh.md#52-各宿主接线)

### 5.2 渠道 A：skills CLI（任意宿主）

```bash
npx skills add yeyuan98/bioresearcher-skills
# 只装引导技能并立即开通运行时：
npx skills add yeyuan98/bioresearcher-skills --skill bioresearcher-onboard
```

### 5.3 渠道 B：Claude Code 插件市场

```
/plugin marketplace add yeyuan98/bioresearcher-skills
/plugin install bioresearcher@bioresearcher-skills
```

插件自动捆绑核心版 biomcp 服务器（工具名前缀
`mcp__plugin_bioresearcher_biomcp__*`）与 dr-worker 子代理；首次工具调用
会触发一次性 npx 下载。权限提示的免打扰配置见仓库
`docs/biomcp-ts-setup.md`（`permissions.allow` 片段）。

### 5.4 渠道 C：WorkBuddy 连接器

在 WorkBuddy 连接器市场搜索「BioResearcher 生物医学研究」安装。连接器
自带 MCP 服务（npmmirror、Node 22 托管、120 s 连接超时）与 4 个技能的
中文/英文描述；市场安装即用，无需命令行。

### 5.5 渠道 D：git clone

```bash
git clone https://github.com/yeyuan98/bioresearcher-skills .opencode/skills/bioresearcher-skills
# 或 .claude/skills/、.agents/skills/、.codex/skills/、.gemini/skills/
```

### 5.6 中国大陆网络环境

- onboard 技能**自动探测网络**并在需要时切换 npmmirror 镜像下载 Node 与
  biomcp；
- `bioresearcher-python-setup-uv` 支持国内 PyPI 镜像；
- WorkBuddy 连接器默认 npmmirror；
- 上游生物医学 API（NCBI E-utilities、ClinicalTrials.gov、MyGene 等）为
  海外公网接口，受限网络下建议配置代理（服务器经 undici 尊重
  HTTP(S)_PROXY 环境变量）。

## 6. 应用案例与 Demo

所有案例为 `demos/run-demo.mjs` 驱动的**真实运行**（opencode v1.18.29；
被测 skills 树钉扎于提交 `3380cc6`，见各 `provenance.json`），非手写示例。每个目录含：双语 README、会话记录
`transcript.md`、客观校验 `result.json`、溯源 `provenance.json` 与产出文件。

### 6.1 案例总览表

| 案例 | 语言 | 结果 | 耗时 | Demo 链接（GitHub 固定链接） |
|---|---|---|---|---|
| 6.2 深度研究（BRCA1 DNA 修复调研） | EN | PASS | 515 s | [demos/artifacts/agent-deep-research-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-deep-research-en) |
| 6.3 深度研究（肿瘤免疫治疗综述） | ZH | PASS | 814 s | [demos/artifacts/agent-deep-research-zh](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-deep-research-zh) |
| 6.4 访谈优先 | EN | PASS | 23 s | [demos/artifacts/agent-interview-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-interview-en) |
| 6.5 PubMed 周更解析 | EN | PASS（rubric 裁定 SATISFIED） | 56 s | [demos/artifacts/agent-pubmed-weekly-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-pubmed-weekly-en) |
| 6.6 发表级结构生物学绘图 | EN | PASS（rubric 裁定 SATISFIED） | 1064 s | [demos/artifacts/agent-plot-making-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/agent-plot-making-en) |
| 6.7 文档化案例（WorkBuddy / onboard） | ZH/EN | —（非运行） | — | 见 6.7 小节 |

（仓库内浏览请用相对路径 `../artifacts/<案例名>/`。）

### 6.2 案例：深度研究（英文，并行扇出）

**提示词**：`no-interview light-research: Using the bioresearcher-deep-research skill, survey the recent article landscape on BRCA1 DNA repair. Cite sources with PMIDs.`

智能体加载技能 → 冒烟测试 MCP 连接（`biomcp_gene_search`）→ **两个 Task
子代理并行**分别调研「HR 机制前沿」与「PARPi 临床转化」→ 汇总渲染
`final_report.html`。客观校验：技能加载 ≥1、PMID 出现在最终回答、
HTML 产出在工具输出中出现、（直接或经 worker 的）文献检索发生。
产出：[final_report.md](../artifacts/agent-deep-research-en/outputs/reports/brca1_dna_repair/final_report.md)
· [渲染截图](../artifacts/agent-deep-research-en/screenshots/final_report-top.jpg)
· [会话记录](../artifacts/agent-deep-research-en/transcript.md)

### 6.3 案例：深度研究（中文提问，中文报告）

**提示词**：`no-interview light-research: 使用 bioresearcher-deep-research 技能，帮我做一个关于肿瘤免疫治疗（tumor immunotherapy）的多方面文献综述并附引用。请用中文撰写报告，引用使用 PMID。`
（基于 WorkBuddy 连接器的中文示例语料扩展：显式指定技能、中文撰写与
PMID 引用。）

智能体检索英文数据源，以中文产出《肿瘤免疫治疗多方面文献综述》（执行摘要、
检查点抑制剂与细胞治疗两个侧面、统一文献表，PMID 编号引用）。
额外校验：最终回答必须包含中文（正则 `[\u4e00-\u9fff]`）。
产出：[final_report.md](../artifacts/agent-deep-research-zh/outputs/reports/tumor_immunotherapy/final_report.md)
· [渲染截图](../artifacts/agent-deep-research-zh/screenshots/final_report-top.jpg)

### 6.4 案例：访谈优先（先问后做）

**提示词**：`Using the bioresearcher-deep-research skill, run a deep research report on CAR-T therapy safety in solid tumors.`（无前缀。）

非交互 `--auto` 模式下，智能体仍先集中提出澄清问题、**未启动任何检索**
（校验：最终回答含 `?`；不含 `final_report`；`article_search` /
`trial_search` / `gene_get` 均未被调用）。这是「访谈优先」特性的回归证据。
产出：[transcript.md](../artifacts/agent-interview-en/transcript.md)

### 6.5 案例：PubMed 周更解析

**提示词**：解析 `{DATA_DIR}/pubmed-sample.xml.gz`（裁剪版周更档案：6 条
文章 + 2 个删除 PMID）为 `combined.xlsx` 并汇报。

产出与 `expected-summary.json` 逐项一致：sheet `PubMed Articles` 6 行数据
（表头外）、sheet `Deleted PMIDs` 含 99999991/99999992。rubric 人工裁定
SATISFIED。产出：[combined.xlsx](../artifacts/agent-pubmed-weekly-en/outputs/combined.xlsx)

### 6.6 案例：发表级结构生物学绘图

**提示词**：先用 uv 技能安装 pymol-open-source/matplotlib/pymupdf/numpy/
pillow/biopython，再按 structural-biology_binder-visualization 规范产出
`figures/kras_inhibitors/fig1_kras_landscape`（.pdf/.svg/.png），跑三项
QA 门禁并提供 LEGENDS.md。

真实会话经历了两轮碰撞审计修复后全部通过：碰撞 0 fail/0 warn、字号最小
5.2 pt（≥5 pt 门禁）、面板对齐 PASS（fail 0 / warn 0 / 4 组比较）。
产出：[fig1_kras_landscape.png](../artifacts/agent-plot-making-en/outputs/figures/kras_inhibitors/fig1_kras_landscape.png)
· [fig1 PDF](../artifacts/agent-plot-making-en/outputs/figures/kras_inhibitors/fig1_kras_landscape.pdf)
· [LEGENDS.md](../artifacts/agent-plot-making-en/outputs/figures/kras_inhibitors/LEGENDS.md)

### 6.7 文档化案例（WorkBuddy 连接器 / onboard）

- **WorkBuddy**：市场安装「BioResearcher 生物医学研究」后，直接输入连接器
  示例语料即可复现 6.2/6.3 类工作流——中文示例：「帮我做一个关于肿瘤免疫
  治疗的多方面文献综述并附引用」「总结上周 PubMed 更新中与 CRISPR 相关的
  文献」「查找 BRAF V600E 变异的相关药物与临床试验」（第三条的 MCP 直连
  真实调用见 [MCP 文档 6 章](./mcp.zh.md#6-应用案例与-demo)）。
- **onboard**：对任意空项目说「帮我开通 BioResearcher 运行时」，技能会在
  `.bioresearcher-runtime/` 落地便携 Node 22 与供应商化 biomcp（自动探测
  npmmirror）、按需启用 R/Biowasm/SQLite，并注册进你的宿主配置——其效果
  即「开通流程」本身，故不作为运行型 Demo。

## 7. 常见 Q&A

**Q1：支持中文吗？**
技能指令以英文编写（Agent Skills 生态惯例，保证跨宿主触发稳定），智能体
回答语言跟随提问语言——中文提问得到中文报告（真实证据见案例 6.3）。
WorkBuddy 连接器另附官方中文描述与中文示例语料。

**Q2：需要 API Key 吗？**
默认不需要。本页全部 Demo 在零密钥环境运行。个别功能例外与提额配置见
[MCP 文档 5.3](./mcp.zh.md#53-认证可选-api-key)。

**Q3：能用在 Cursor / Codex / WorkBuddy 吗？**
可以，见 4.5 宿主矩阵与第 5 章对应渠道。

**Q4：智能体会编造文献吗？**
深度研究契约禁止回退内部知识：每条论断需带编号引用（PMID/DOI/NCT/专利号），
证据缺失必须显式说明；worker 查询失败记「证据缺口」后继续。

**Q5：中国大陆网络环境能否使用？**
可以。onboard/uv 技能与 WorkBuddy 连接器均支持 npmmirror/国内镜像；上游
生物医学 API 建议配置代理（详见 5.6）。

**Q6：并行与顺序模式差别？**
功能等价：宿主有子代理工具（如 opencode 的 Task、Claude 插件的 dr-worker）
时按研究侧面并行，否则顺序回退。案例 6.2 的会话记录展示了真实的 Task 并行
扇出。

**Q7：为什么 GitHub 上打不开 final_report.html？**
GitHub 不渲染仓库内 HTML。请看每个案例的 `screenshots/` 截图，或克隆仓库
本地打开；HTML 原文件在 `outputs/` 中。

**Q8：Demo 会花多少 token / 时间？**
实测（opencode v1.18.29）：访谈案例 23 s；PubMed 解析 56 s；深度研究英文
515 s、中文 814 s；结构绘图（含装依赖）1064 s。复现命令见 `demos/README.md`；
MCP 直连探针不耗 token。

**Q9：插件与手动注册的 MCP 会冲突吗？**
命令不同时不会自动去重——保留其一，另一个用 `/mcp` 停用（Claude Code）。

**Q10：数据隐私如何？**
所有查询只访问公开生物医学 API；报告与图表全部落在你的项目本地；本仓库
不含任何遥测；Demo 产物与日志不包含凭证。

**Q11：许可证与商用？**
Apache-2.0（仓库 LICENSE）；引用信息见仓库 `CITATION.cff`。允许商用与二次
开发，需保留许可声明。

**Q12：Windows 支持吗？**
onboard 技能兼容 PowerShell/cmd；Demo 在 Linux 上实测通过。核心依赖是 Node ≥22.13
与 npx，跨平台设计。

**Q13：离线可用吗？**
onboard 完成后运行时供应商化在项目内；但检索类功能本身需要访问公开数据源
（这是数据来源，不是依赖安装问题）。

**Q14：如何复现这些 Demo？**
`git clone` 本仓库后运行 `node demos/run-demo.mjs --list` 查看全部 7 个
场景；`--only <id> --publish` 复现并重新生成 artifacts（智能体案例消耗
LLM token，仅限手动运行）。详见 [demos/README.md](../README.md)。

## 8. 参考与许可

- 技能原文：仓库 `skills/<技能名>/SKILL.md`（各技能附 `references/`
  领域指南——deep-research 18 篇 + plot-making 3 篇，共 21 篇，含工具选择、
  引用格式、限流认证等）
- MCP 服务器文档：[MCP 文档（中文）](./mcp.zh.md) / [MCP doc (EN)](./mcp.en.md)
- 接线与认证细节：仓库 `docs/biomcp-ts-setup.md`
- 旧插件迁移（工具名映射与能力降级）：仓库 `docs/migration-from-plugin.md`
- 许可：Apache-2.0；引用：`CITATION.cff`；术语：[术语表](./glossary.md)

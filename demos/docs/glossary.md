# 术语表 / Glossary

BioResearcher 双语文档共享术语锚点。中文译名以 WorkBuddy 连接器市场文案
（`connector/workbuddy/connector-meta.json`、`skill-locales.json`）为锚点；
个别用词文档采用更通行的说法，与市场文案的对应关系在行内标注。工具名一律保留英文原名。

| English | 中文 | Notes |
|---|---|---|
| Agent Skills | 智能体技能 | agentskills.io 开放标准；本仓库 `skills/` 下每个目录是一个技能 |
| skill (SKILL.md) | 技能（SKILL.md 契约文件） | strict-6 frontmatter：name/description/license/compatibility/metadata/allowed-tools |
| harness | 宿主 / 运行环境 | opencode、Claude Code、Codex、Cursor、Gemini CLI、WorkBuddy 等 |
| MCP (Model Context Protocol) | MCP（模型上下文协议） | 本项目使用 stdio JSON-RPC 传输 |
| biomcp-ts / biomcp | biomcp-ts MCP 服务 / biomcp 包 | npm 包名 `biomcp`，本仓库钉扎 `1.4.0` |
| deep research | 深度研究 | `bioresearcher-deep-research` 技能：访谈→方案对齐→分解→并行调研→引用报告 |
| aspect (research aspect) | 研究侧面（连接器文案作「研究方面」） | 深度研究把主题拆成 2–5 个独立侧面，每侧面一个 worker |
| fan-out / sequential fallback | 并行扇出 / 顺序回退 | 有子代理（Task）工具时并行；否则顺序执行 |
| interview (Step 1-2) | 访谈（第一至二步） | 深度研究强制先集中提问澄清并对齐方案，除非 `no-interview` 前缀 |
| request prefix | 请求前缀 | `no-interview` / `light-research` / `no-html`，置于提问开头 |
| cited report | 引用报告 | `reports/<topic>/final_report.md` + `.html`，编号引用 + 文献表 |
| publication-grade figure | 发表级科研绘图（连接器文案作「发表级科研图表」） | `bioresearcher-plot-making` 技能，三层 QA 门禁 |
| QA gates | QA 门禁 | 对齐 / 碰撞 / PDF 字号三项确定性审计 |
| PubMed weekly updatefiles | PubMed 周更档案 | NCBI updatefiles 流水档案；技能解析为 `combined.xlsx` |
| DeleteCitation | 删除引文块 | 周更档案中被撤稿/删除记录的 PMID 块 |
| onboarding | 开通 / 引导 | `bioresearcher-onboard` 技能自动装配项目本地运行时 |
| vendored / project-local runtime | 供应商化 / 项目本地运行时（vendored，本地内置） | `.bioresearcher-runtime/`：便携 Node 22 + 供应商化 biomcp |
| uv | uv（Python 环境管理器） | `bioresearcher-python-setup-uv` 技能 |
| keyless | 免密钥 | 默认无任何 API Key 即可用（个别工具除外，见 MCP 文档 5.3） |
| rate limiter | 限流器 | 服务内建按源限速，无需手动 sleep |
| npmmirror | npmmirror 镜像 | 中国大陆 npm 镜像；onboard 技能自动探测切换 |
| connector | 连接器 | WorkBuddy 市场形态：MCP 服务 + 技能包 |
| subagent (dr-worker) | 子代理（dr-worker） | Claude Code 插件内置的深度研究侧面工作代理 |
| provenance | 溯源信息 | 每次 Demo 运行记录的提交号、版本号与 sha256 指纹 |
| transcript | 会话记录 | 从真实运行日志整理的工具调用与最终回答（`transcript.md`） |

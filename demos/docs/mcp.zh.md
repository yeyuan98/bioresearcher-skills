# biomcp MCP 服务器 · 合作伙伴发布文档（中文）

> 语言/Language: **中文** | [English version](./mcp.en.md) · 智能体文档/[Agent doc](./agent.zh.md)
>
> 覆盖：功能、技术架构/API 文档、核心特性、开通流程、应用案例、Demo 链接与
> 常见 Q&A。所有请求/响应样本均为**探针真实捕获**（`demos/lib/mcp-probe.mjs`
> 直连 `biomcp@1.4.0`，零 LLM、零密钥），非手写示例。

## 1. 功能总览

biomcp-ts（npm 包 `biomcp`，本仓库钉扎 **1.4.0**）是一个生物医学数据
**MCP 服务器**：通过 stdio JSON-RPC 向智能体宿主暴露 41 个核心工具 +
15 个可选工具，覆盖文献、临床试验、基因、变异、药物、疾病、专利、
组学数据库、GTEx、Ensembl/PDB 等公开数据源。默认**免密钥**即可使用。

- 本仓库接线传输：**stdio**（本地子进程）；1.3.0 起服务端另提供 streamable-HTTP 模式（`biomcp serve`），本仓库不使用
- 上游：NCBI E-utilities（PubMed/GEO/SRA/GenBank）、ClinicalTrials.gov、
  MyGene/MyVariant、OpenTargets、GTEx、Ensembl、PDB/RCSB、Google Patents
  （及凭证可选启用的 EPO OPS / USPTO）、Semantic Scholar 等
- 实证：本页 Demo 的 `tools/list` 探针确认服务器暴露 **41 个核心工具**
  （与钉扎注册表 `scripts/ci/biomcp-tools.json` 一致）

## 2. 核心特性

- **免密钥默认可用**：41 个核心工具零配置零凭证（个别增强除外，见 5.3）
- **服务内建按源限流**：无需（也不应）在客户端 sleep/节流（数值见 3.3）
- **确定性版本钉扎**：`npx -p biomcp@1.4.0` 精确版本，避免 npx 缓存
  语义漂移与 peer 依赖问题（禁止裸 `npx biomcp`，见 Q&A Q1）
- **诊断工具**：`biomcp doctor` 环境体检（不启动服务器）；
  `biomcp_configure` 交互式管理可选凭证（写入项目 `.biomcp.json`）
- **可选工具组按环境变量注册**：R 分析（webR）/ SAM 工具链（Biowasm）/
  SQL 数据库（mysql2）三组，设 `BIOMCP_*` 变量后随服务器启动注册
- **中国大陆可用**：支持 npmmirror 镜像安装；HTTP(S)_PROXY 代理透传
- **超时内建**：每工具预算（文献 30 s、专利检索 60 s、专利详情 120 s），
  防止单一慢源拖垮会话

## 3. 技术架构

### 3.1 传输与协议

MCP stdio 传输：宿主以子进程拉起服务器，双方按**换行分隔的 UTF-8 JSON**
（每行一条 JSON-RPC 2.0 消息）通信。握手序列：

```
→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{
     "protocolVersion":"2025-06-18","capabilities":{},
     "clientInfo":{"name":"…","version":"…"}}}
← …initialize 响应（含 serverInfo）…
→ {"jsonrpc":"2.0","method":"notifications/initialized"}   ← 必发通知
→ {"method":"tools/list"}     ← 分页：响应含 nextCursor 时续拉
→ {"method":"tools/call","params":{"name":"gene_get","arguments":{…}}}
← {"result":{"content":[{"type":"text","text":"…JSON…"}],"isError":false}}
```

注意：`tools/call` 的载荷在 `content[0].text`（内层通常是 JSON 字符串）；
`isError: true` 表示工具级失败。完整可复现实现见
`demos/lib/mcp-probe.mjs`（单文件、零依赖）。

### 3.2 版本与安装钉扎

| 变体 | 命令数组 |
|---|---|
| 全功能（db + R 分析） | `["npx","-y","-p","biomcp@1.4.0","-p","webr@0.6","-p","mysql2@3","biomcp"]` |
| 核心 + R 分析（无 db） | `["npx","-y","-p","biomcp@1.4.0","-p","webr@0.6","biomcp"]` |
| 仅核心 | `["npx","-y","-p","biomcp@1.4.0","biomcp"]` |

要求 Node.js ≥ 22.13。`-p` 精确钉扎使 peer 依赖随包解析（裸
`npx biomcp` 会因缓存无法解析 peer 依赖而失败）。

### 3.3 限流与超时

| 数据源 | 限流 | 说明 |
|---|---|---|
| NCBI E-utilities（PubMed/GEO/SRA/GenBank 共享） | 334 ms/请求（免密钥）；100 ms（配 NCBI_API_KEY） | 约 3 → 10 请求/秒 |
| MyGene / MyVariant | 100 ms | — |
| OpenTargets | 500 ms | — |
| EPO OPS / USPTO PPUBS | ~1 s 令牌桶 | 需凭证 |
| Human Protein Atlas 分节 / GEO 补充文件下载 | **不限流** | 高频迭代请自行控制节奏 |

每工具超时预算：articles 30 s；patent_search 60 s；patent_get 120 s。
若启用 R 分析（webR），客户端 MCP 超时需 ≥ 120000 ms（webR 冷启动可达
分钟级）。

### 3.4 可选工具组（环境变量门控）

可选工具**随服务器启动**按环境变量注册，运行期不可变更（改后需重启）：

| 组 | 工具（15 个） | 启用条件 |
|---|---|---|
| SQL 数据库 | `db_query`、`db_list_tables`、`db_describe_table` | 命令含 `-p mysql2@3` 且配置数据库 |
| R 分析（webR） | `analysis_r_deseq2`、`analysis_r_edger`、`analysis_r_limma`、`analysis_r_session_info` | 命令含 `-p webr@0.6` |
| Biowasm（SAM/BCF/BED） | `analysis_bam_summary`、`analysis_bam_view_region`、`analysis_bcf_summary`、`analysis_bcf_view_region`、`analysis_bed_op`、`analysis_biowasm_convert`、`analysis_biowasm_session_info`、`analysis_biowasm_cli` | 环境变量启用 |

## 4. API 文档

### 4.1 工具总目录（41 核心 + 15 可选）

核心工具按领域（参数契约以服务器 `tools/list` 与
[biomcp-ts 源码](https://github.com/yeyuan98/biomcp-ts) 为准）：

| 领域 | 工具 | 说明 |
|---|---|---|
| 文献 | `article_search`、`article_get` | PubMed 联邦检索（Europe PMC/Semantic Scholar/PubTator/LitSense）、文献详情（可含引文网络） |
| 基因 | `gene_search`、`gene_get`、`gene_diseases`、`gene_drugs`、`gene_trials`、`gene_articles`、`gene_enrich` | MyGene/OpenTargets 等；`gene_get` 支持 16 个 section 可选值（含 `all`）与 `smart` 别名解析（HER2→ERBB2） |
| 变异 | `variant_search`、`variant_get`、`variant_oncokb`、`variant_trials` | MyVariant；**结构化查询**（`gene`+`hgvsp`，勿用复合自由文本）；OncoKB 需凭证 |
| 药物 | `drug_search`、`drug_get`、`drug_trials` | 药物与试验关联 |
| 疾病 | `disease_search`、`disease_get`、`disease_drugs`、`disease_trials` | DOID/MONDO 本体 |
| 临床试验 | `trial_search`、`trial_get` | ClinicalTrials.gov；`trial_get` 支持分节 |
| 专利 | `patent_search`、`patent_get` | 免密钥走 Google Patents；EPO OPS/USPTO 需凭证 |
| 组学数据库 | `geo_search`、`geo_get`、`sra_search`、`sra_get`、`genbank_search`、`genbank_get`、`genbank_genes` | GEO/SRA/GenBank 检索与记录获取（GenBank 支持区域切片） |
| GTEx | `gtex_expression`、`gtex_eqtl` | 组织表达（v10, TPM）与 eQTL |
| Ensembl/PDB | `ensembl_lookup`、`ensembl_homology`、`ensembl_consequence`、`ensembl_region`、`pdb` | ID 映射/同源/后果预测/区域变异；PDB 检索与元数据 |
| 实用 | `discover`、`batch_get`、`biomcp_configure` | 工具发现、批量获取、凭证配置 |

### 4.2 真实调用示例（探针捕获）

以下全部来自 [mcp-tool-tour-en](../artifacts/mcp-tool-tour-en/README.md)
与 [mcp-tool-tour-zh](../artifacts/mcp-tool-tour-zh/README.md) 的真实运行
（响应为节选；完整样本见各目录 `outputs/capture.jsonl`）：

**文献检索** `article_search` `{query:"BRCA1 DNA repair", limit:3}` →

```json
[{"doi": "10.1042/BJ20141077",
  "title": "Protein stability versus function: effects of destabilizing missense mutations on BRCA1 DNA repair activity.",
  "authors": ["David C. A. Gaboriau", "P. Rowling", "C. Morrison", "L. Itzhaki"],
  "journal": "Biochemical Journal", …}]
```

**基因详情** `gene_get` `{symbol:"BRCA1", sections:["core"]}` →

```json
{"symbol": "BRCA1", "name": "BRCA1 DNA repair associated",
 "summary": "This gene encodes a 190 kD nuclear phosphoprotein that plays a role in maintaining genomic stability…"}
```

**结构化变异检索** `variant_search` `{gene:"BRAF", hgvsp:"V600E", limit:3}` →

```json
[{"id": "rs113488022", "gene": "BRAF", "hgvs_p": "V600E",
  "hgvs_c": "c.1799T>A", "significance": "Pathogenic",
  "gnomad_af": 0.00000397994}]
```

**临床试验** `trial_search` `{query:"BRAF melanoma", limit:3}` →

```json
{"studies": [{"nct_id": "NCT01597908",
  "title": "Dabrafenib Plus Trametinib vs Vemurafenib Alone in Unresectable or Metastatic BRAF V600E/K Cutaneous Melanoma",
  "status": "COMPLETED", "interventions": ["DRUG: Dabrafenib", …]}, …]}
```

**疾病本体** `disease_search` `{query:"melanoma", limit:3}` →

```json
[{"name": "esophageal melanoma", "disease_id": "MONDO:0001192", "doid": "DOID:1108"}, …]
```

**专利检索** `patent_search` `{query:"\"mRNA display\"", limit:3}` →

```json
{"patents": [{"publication_number": "US20140179551A1",
  "title": "METHODS FOR THE SELECTION OF BINDING PROTEINS",
  "publication_date": "2014-06-26",
  "assignee": ["BRISTOL-MYERS SQUIBB COMPANY"], …}], …}
```

**GTEx 表达** `gtex_expression` `{gene:"TP53", limit:5}` →

```json
{"gene_symbol": "TP53", "gencode_id": "ENSG00000141510.18",
 "dataset": "gtex_v10", "unit": "TPM",
 "tissues": [{"tissue": "Cells_EBV-transformed_lymphocytes", "median_tpm": 77.4845, …}, …]}
```

**PDB 结构** `pdb` `{query:"KRAS", sections:["experiment"]}` →

```json
[{"pdb_id": "6N65", "score": 1,
  "summary": {"title": "KRAS G-quadruplex G16T mutant.",
              "experimental_method": "X-RAY DIFFRACTION", "resolution": 1.6, …}}, …]
```

**基因→药物** `gene_drugs` `{symbol:"BRAF"}` →

```json
[{"drug_name": "BELVARAFENIB", "source": "opentargets", "action_type": "Small molecule"},
 {"drug_name": "PLIXORAFENIB", "source": "opentargets", …}, …]
```

### 4.3 工具映射与能力降级（相对 biomcp-python）

从 biomcp-python 迁移：旧包采用 `*-searcher`/`*-getter` 后缀命名，本包为
`领域_动作` 短名（如 `article_search` / `gene_get`）；完整逐条映射表见仓库
`docs/migration-from-plugin.md`。能力差异（降级）：openFDA 的批准/标签/
不良事件三检索在 1.4.0 中未提供（不良事件能力部分并入药物工具链）；
旧 `protocol` 分节由 `core`+`eligibility` 分节承担。其余领域
（文献/基因/变异/药物/疾病/试验/专利/组学）为超集。

## 5. 开通流程

### 5.1 服务端命令

见 3.2 三种变体。若想零依赖完成安装：直接对智能体说「帮我开通
BioResearcher 运行时」（`bioresearcher-onboard` 技能自动落地
`.bioresearcher-runtime/` 并注册宿主，自动探测 npmmirror）。

### 5.2 各宿主接线

**opencode**（项目根 `opencode.json`）：

```json
{"$schema": "https://opencode.ai/config.json",
 "mcp": {"biomcp": {"type": "local",
   "command": ["npx", "-y", "-p", "biomcp@1.4.0", "biomcp"]}}}
```

服务器命名 `biomcp` 时工具显示为 `biomcp_article_search`、`biomcp_gene_get`
等（技能文档使用裸规范名）。

**Claude Code**：推荐插件（`/plugin install bioresearcher@bioresearcher-skills`，
捆绑核心版，工具名前缀 `mcp__plugin_bioresearcher_biomcp__*`）；或项目根
`.mcp.json`：

```json
{"mcpServers": {"biomcp": {"type": "stdio", "command": "npx",
  "args": ["-y", "-p", "biomcp@1.4.0", "biomcp"], "timeout": 120000}}}
```

手动注册与插件捆绑**不会按命令去重**，二选一并停用另一个（`/mcp`）。
权限免打扰：`permissions.allow` 加 `mcp__biomcp`（详见仓库
`docs/biomcp-ts-setup.md`）。

**其他宿主**（Codex/Cursor/ZCode/Pi/CodeBuddy/WorkBuddy）：等价 stdio 配置；
WorkBuddy 用户直接装连接器（市场托管，npmmirror + Node 22）。

### 5.3 认证（可选 API Key）

| 变量 | 作用 |
|---|---|
| `NCBI_API_KEY` | E-utilities 限速 ~3 → 10 请求/秒（PubMed+GEO+SRA+GenBank 共享） |
| `NCBI_EMAIL` | E-utilities 礼貌联系方式 |
| `S2_API_KEY` | Semantic Scholar（文献联邦） |
| `OPENFDA_API_KEY` | openFDA（药物不良事件） |
| `CROSSREF_EMAIL` | Crossref 礼貌池（引文） |
| `EPO_OPS_CONSUMER_KEY` / `EPO_OPS_CONSUMER_SECRET` | 启用 EPO OPS 专利后端（EP/WO 权利要求） |
| `USPTO_API_KEY` | 启用 USPTO ODP 专利后端 |
| `ONCOKB_TOKEN` | **必需**（`variant_oncokb`） |
| `DISGENET_API_KEY` | DisGeNET；缺失时 `gene_diseases` 回退 OpenTargets |

未设变量也可经项目 `.biomcp.json` 提供（`biomcp_configure` 交互管理，
需重启生效）。

### 5.4 健康检查（doctor）

```bash
npx -y biomcp@1.4.0 doctor --client opencode   # 也支持 claude-code/codex/…
```

仅诊断（Node 版本、npx、网络），不启动服务器；退出码 0 = 健康。

### 5.5 中国大陆网络环境

- 安装：npmmirror 镜像（onboard 技能/WorkBuddy 连接器自动使用；
  手动时给 npm 配 `--registry=https://registry.npmmirror.com`）
- 运行：上游 API 为海外公网，受限网络建议 HTTP(S)_PROXY（服务器经
  undici 的 EnvHttpProxyAgent 尊重代理变量）

## 6. 应用案例与 Demo

两个探针场景（token 零消耗，纯网络直连）：

| 场景 | 调用 | 结果 | Demo 链接（GitHub 固定链接） |
|---|---|---|---|
| MCP 工具巡览（英文，8 个核心工具 + tools/list 注册表校验） | article_search、gene_get、variant_search、trial_search、disease_search、patent_search、gtex_expression、pdb | PASS（43 s） | [demos/artifacts/mcp-tool-tour-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/mcp-tool-tour-en) |
| MCP 工具巡览（中文注释，BRAF V600E 变异→基因→药物→试验调用链） | variant_search、gene_get、gene_drugs、trial_search | PASS（9 s） | [demos/artifacts/mcp-tool-tour-zh](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/mcp-tool-tour-zh) |

英文巡览验证 `tools/list` 暴露全部 41 个钉扎核心工具；每个调用的完整
请求/响应（含断言）在 `outputs/capture.jsonl` 与 `transcript.md`。
中文巡览即 WorkBuddy 连接器示例语料「查找 BRAF V600E 变异的相关药物与
临床试验」的底层真实调用。

更高层的智能体应用案例（深度研究、绘图等）见
[智能体文档第 6 章](./agent.zh.md#6-应用案例与-demo)。

**复现**：`node demos/run-demo.mjs --only mcp-tool-tour-en --publish`（仅需
网络与 npx）。注册表一致性自检：`node demos/lib/mcp-probe.mjs --check`。

## 7. 常见 Q&A

**Q1：为什么不能用裸 `npx biomcp`？**
npx 缓存无法解析 peer 依赖（webr/mysql2 等），必须 `-p biomcp@1.4.0 -p
webr@0.6 …` 形式钉扎（见 3.2）。

**Q2：需要密钥吗？**
默认不需要；`variant_oncokb` 必需 OncoKB Token，DisGenNET 缺失时自动回退
OpenTargets（见 5.3）。

**Q3：首次调用为何慢？**
npx 冷启动要下载包（约 10–60 s，之后有缓存）；连接超时建议 ≥ 120 s。

**Q4：需要手动限速吗？**
不需要。服务端按源限流（3.3）；例外：HPA 分节与 GEO 补充文件不限流。

**Q5：支持远程/SSE 部署吗？**
本仓库钉扎接线仅 stdio 本地子进程。1.3.0 起服务端另提供 streamable-HTTP
远程模式（`biomcp serve`）；本仓库接线不使用。

**Q6：R 分析工具为何没出现？**
可选组随启动注册：命令需含 `-p webr@0.6`（R）/`-p mysql2@3`（db），并设置
相应环境变量；改配置后重启服务器（见 3.4）。

**Q7：并发调用安全吗？**
可以并发，但推荐顺序调用——限流器按源令牌桶工作，深度研究 worker 契约
即要求顺序调用。

**Q8：安全吗？会泄露数据吗？**
只读查询公开数据源；无遥测；凭证只存在于你本机环境变量或 `.biomcp.json`。

**Q9：Node 版本要求？**
≥ 22.13（含 npx）。

**Q10：版本如何钉扎/升级？**
所有接线示例精确钉 `biomcp@1.4.0`；升级由本仓库发版同步（钉扎注册表
`scripts/ci/biomcp-tools.json` 随 pin 更新，Demo 内置副本逐字节一致并受
CI 校验）。

**Q11：中国大陆网络环境？**
见 5.5：npmmirror 安装 + 代理访问上游 API。

**Q12：许可证？**
服务器为独立上游项目（Apache-2.0，见其仓库）；本仓库技能与文档亦为
Apache-2.0。

## 8. 参考与许可

- 上游源码与完整工具契约：<https://github.com/yeyuan98/biomcp-ts>
- 接线/认证/限流原文：仓库 `docs/biomcp-ts-setup.md`
- 钉扎注册表：`scripts/ci/biomcp-tools.json`（Demo 副本
  `demos/lib/biomcp-tools@1.4.0.json`，CI 保证一致）
- 迁移映射：仓库 `docs/migration-from-plugin.md`
- 智能体（技能层）文档：[agent.zh.md](./agent.zh.md)；术语表：
  [glossary.md](./glossary.md)

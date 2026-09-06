# 肿瘤免疫治疗多方面文献综述

Generated: 2026-09-06 | TOPIC: tumor_immunotherapy | Scope: 以两份研究侧面（light-research 模式）综述肿瘤免疫治疗的证据基础：免疫检查点抑制剂（ICI）与细胞免疫治疗/新兴免疫治疗模式，引用一律采用 PMID。

## 执行摘要 (Executive Summary)

肿瘤免疫治疗在过去十五年间从晚期黑色素瘤的首个总生存（OS）获益证据 [1]，发展为覆盖多瘤种的主流治疗支柱：PD-1/PD-L1 抑制剂在黑色素瘤、非小细胞肺癌（NSCLC）、微卫星不稳定（MSI-H/dMMR）结直肠癌等瘤种确立了生存优势 [2, 5, 8]，双免疫联合（nivolumab + ipilimumab）在黑色素瘤 10 年随访中位 OS 达 71.9 个月 [15]。与此同时，CAR-T 细胞治疗在血液系统恶性肿瘤实现了持久的完全缓解 [17, 21]，TCR-T [26]、双特异性抗体 [27, 28]、个体化新抗原 mRNA 疫苗 [30] 与溶瘤病毒 [33] 相继取得关键突破。

关键发现：

- CTLA-4 抑制剂 ipilimumab 是首个在随机三期试验中延长转移性黑色素瘤 OS 的免疫检查点抑制剂（中位 OS 10.1 vs 6.4 个月）[1]。
- PD-1 抑制剂疗效与安全性均优于 CTLA-4：KEYNOTE-006 中 pembrolizumab 对比 ipilimumab 显著改善 PFS 与 OS，3–5 级治疗相关不良事件 10.1%–13.3% vs 19.9% [2]。
- 生物标志物指导获益人群选择：PD-L1 TPS≥50% [5]、TMB≥10 mut/Mb [7] 与 MSI-H/dMMR [8, 9] 均有随机证据或验证研究支持，但任一单一标志物均不完备（CheckMate-026 阴性结果）[4]。
- 耐药三分类框架（原发/适应性/获得性）是当前理解 ICI 应答异质性的标准概念体系 [10]。
- CAR-T 治疗中 tisagenlecleucel 在儿童/年轻成人复发难治 B-ALL 的 3 个月总缓解率达 81%（均 MRD 阴性）[17]；真实世界 axi-cel 5 年 OS 40%，但 5 年非复发死亡率 16.2% 提示远期风险 [21]。
- TCR-T（afami-cel，SPEARHEAD-1）在滑膜肉瘤/脂肪肉瘤 ORR 37%，实现工程化 T 细胞治疗实体瘤的概念验证 [26]；双特异性抗体 blinatumomab 与 teclistamab 分别在 B-ALL（OS HR 0.71）[27] 与三重暴露骨髓瘤（ORR 66.4%）[28] 获益。
- 个体化新抗原 mRNA 疫苗联合 pembrolizumab（KEYNOTE-942）无复发生存 HR 0.561 [30]；溶瘤病毒 T-VEC 单药三期试验 DRR 19.0% vs 1.4% [33]，但与 PD-1 联合（MASTERKEY-265）未显示额外获益 [34]。

## 数据来源 (Data Sources)

| 来源 | 类型 | 查询/访问方式 | 访问日期 |
|---|---|---|---|
| biomcp_article_search（联邦检索：PubMed/Europe PMC/Semantic Scholar/LitSense） | 文献检索 | 见"分析方法"节各侧面查询；每查询 limit 5–8 | 2026-09-06 |
| biomcp_article_get(sections=["core"]) | 单篇核实 | 核实 8 篇关键文献数据（PMID 20525992、26028407、28636851、29562145、39282897、37305681、29385370、DOI 10.1038/s41408-021-00459-7） | 2026-09-06 |

- 检索范围：2010–2026 年发表的原始研究与权威综述/指南；共纳入 34 篇来源（侧面一 16 篇：13 篇随机三期试验 + 2 篇耐药综述 + 1 篇 SITC 指南；侧面二 18 篇：覆盖 CAR-T、TCR-T、双特异性抗体、肿瘤疫苗、溶瘤病毒六大主题）。
- 质量说明：优先纳入原始研究与长随访/最终分析；所有 PMID 均直接来自 biomcp 工具返回结果；个别里程碑试验的最初报告未在工具结果中返回，以同试验的后续分析或权威综述替代（详见"局限性"）。

## 分析方法 (Analysis Methodology)

- 模式：light-research（按用户请求前缀仅取两个研究侧面）+ no-interview（跳过澄清访谈）。
- 分解：TOPIC `tumor_immunotherapy`，两个侧面由两个并行的研究工作者（generic subagent，Tier B）分别完成：
  1. `checkpoint_inhibitors` — CTLA-4/PD-1/PD-L1 抑制剂里程碑试验、生物标志物、耐药、irAE、联合策略；输出 `reports/tumor_immunotherapy/checkpoint_inhibitors.md`。
  2. `cellular_novel_therapies` — CAR-T、TCR-T、双特异性抗体、肿瘤疫苗、溶瘤病毒；输出 `reports/tumor_immunotherapy/cellular_novel_therapies.md`。
- 工具与参数：每工作者串行调用 biomcp_article_search（具体英文术语 + limit 5–8 + dateRange 源头过滤），关键文献以 biomcp_article_get(sections=["core"]) 核实；查询失败按"原查询→简化查询→换源"重试（≤3 次），semantic_scholar 一次 HTTP 429 限流经改用 europepmc/pubmed 解决。
- 综合：阅读两份侧面报告，统一重编号为单一参考文献表（[1]–[34]，按正文出现顺序），冲突证据（如 T-VEC 单药阳性 vs 联合阴性）在正文明确呈现而非取舍。

## 研究发现 (Findings)

### 1. 免疫检查点抑制剂（ICI）

#### 1.1 里程碑随机三期试验

**CTLA-4 阻断的开端。** Hodi 等（2010，NEJM）在 676 例既往治疗失败的不可切除 III/IV 期黑色素瘤患者中证明：ipilimumab+gp100 组中位 OS 10.0 个月 vs gp100 单药 6.4 个月（死亡 HR 0.68，P<0.001），ipilimumab 单药中位 OS 10.1 个月（HR 0.66，P=0.003）[1]。这是首个在随机试验中证明免疫检查点阻断可改善转移性黑色素瘤 OS 的研究；同时揭示了 CTLA-4 阻断的毒性特征——ipilimumab 组 3/4 级免疫相关不良事件（irAE）10%–15%（对照 3%），14 例（2.1%）药物相关死亡中 7 例与 irAE 相关 [1]。

**PD-1 阻断的优效与低毒。** KEYNOTE-006（n=834）中 pembrolizumab 对比 ipilimumab 显著延长 PFS（6 个月 PFS 率 47.3%/46.4% vs 26.5%，HR 0.58，P<0.001）与 OS（12 个月生存率 74.1%/68.4% vs 58.2%），ORR 33.7%/32.9% vs 11.9%，3–5 级治疗相关不良事件 13.3%/10.1% vs 19.9% [2]。

**NSCLC 关键三期试验汇总：**

| 试验（NCT） | 药物/人群 | 关键疗效终点 | ≥3 级 TRAE | 引用 |
|---|---|---|---|---|
| CheckMate-017（NCT01642004） | nivolumab vs docetaxel，二线鳞状 NSCLC（n=272） | mOS 9.2 vs 6.0 个月（HR 0.59，P<0.001）；ORR 20% vs 9% | 7% vs 55% | [3] |
| CheckMate-026（NCT02041533） | 一线 nivolumab vs 化疗，PD-L1≥5%（n=423 亚组） | mPFS 4.2 vs 5.9 个月（HR 1.15，P=0.25）——阴性结果 | 18% vs 51% | [4] |
| KEYNOTE-024（NCT02142738） | 一线 pembrolizumab vs 铂类化疗，PD-L1 TPS≥50%（n=305） | 5 年随访：mOS 26.3 vs 13.4 个月（HR 0.62）；5 年 OS 率 31.9% vs 16.3% | 长期暴露未增加毒性 | [5] |
| IPSOS（NCT03191786） | 一线 atezolizumab vs 单药化疗，不适宜铂类 NSCLC（n=453） | mOS 10.3 vs 9.2 个月（HR 0.78，P=0.028）；2 年 OS 率 24% vs 12% | 16% vs 33% | [6] |

CheckMate-017 证实 PD-1 阻断在经治鳞状 NSCLC 的 OS 优势，且 PD-L1 表达在该人群中"既非预后亦非疗效预测因素" [3]；CheckMate-026 的阴性结果则提示单纯 PD-L1 表达阈值不足以筛选获益人群 [4]。KEYNOTE-024 是首个报告 5 年随访的一线免疫治疗三期试验：完成 35 程 pembrolizumab 的 39 例患者中 82.1% 在约 5 年时仍存活 [5]。IPSOS 填补了不适宜铂类化疗（ECOG PS 2–3 或 ≥70 岁合并症）人群的证据空白 [6]。

#### 1.2 疗效预测生物标志物

- **PD-L1 表达**：TPS≥50% 是 KEYNOTE-024 获益人群的入组标准（5 年 OS 率 31.9% vs 16.3%）[5]；但 CheckMate-017 中 PD-L1 无预测价值 [3]、CheckMate-026 在 PD-L1≥5% 人群主要终点失败 [4]，说明其预测价值受检测抗体、阈值与瘤种异质性限制。
- **肿瘤突变负荷（TMB）**：FDA 基于 KEYNOTE-158 于 2020 年批准 pembrolizumab 用于 TMB-high（≥10 mut/Mb）肿瘤不可知适应证；Mo 等验证研究确认 10 mut/Mb 为最优通用 cutoff——TMB-high 占比与各瘤种 anti-PD-(L)1 ORR 强相关（r=0.72），验证队列中 TMB≥10 mut/Mb 与 OS 改善相关（HR 0.58，P<0.001）[7]。
- **MSI-H/dMMR**：KEYNOTE-177（n=307，初治 MSI-H/dMMR 转移性结直肠癌）中 pembrolizumab 对比化疗 mPFS 16.5 vs 8.2 个月（HR 0.60，P=0.0002），24 个月持续缓解比例 83% vs 35%，≥3 级 TRAE 22% vs 66% [8]；最终分析（中位随访 44.5 个月）mOS 未达到 vs 36.7 个月（HR 0.74），因含 60% 交叉未获预设 α 水平的 OS 优效确认，但持久活性与低毒性支持其作为一线标准治疗 [9]。

#### 1.3 原发与继发耐药

Sharma 等在 Cell 的经典综述确立了免疫治疗耐药的三分类框架——原发耐药、适应性耐药与获得性耐药 [10]；Jenkins 等系统综述了覆盖肿瘤内在缺陷与肿瘤微环境（TME）免疫抑制程序的耐药机制谱系 [11]。近期综述进一步归纳为：抗原呈递缺陷、干扰素信号失调、致癌通路激活、替代性免疫检查点补偿性上调及微生物组相关免疫调节；对应策略包括生物标志物引导分层、合理联合治疗、TME 调控与多组学整合 [12]。临床层面，CheckMate-026 中 PD-L1 阳性人群整体未获益（HR 1.15）[4] 而 KEYNOTE-024 中 PD-L1≥50% 人群明确获益 [5]，说明现行标志物未能完全解释应答异质性，构成联合策略的直接动因。

#### 1.4 免疫相关不良事件（irAE）与管理

SITC 临床实践指南为单药与联合 ICI 方案 irAE 的识别与管理提供了循证与共识推荐，是临床决策的权威参考 [13]。关键试验的 ≥3 级治疗相关不良事件对比：ipilimumab 时代 10%–15%（3/4 级 irAE）[1]；pembrolizumab 10.1%–13.3% vs ipilimumab 19.9% [2]；nivolumab 18% vs 化疗 51% [4]；atezolizumab 16% vs 33%（治疗相关死亡 1% vs 3%，且生活质量维持或改善）[6]；pembrolizumab 22% vs 化疗 66%（KEYNOTE-177）[8]；双免疫联合（CheckMate 214）46% vs sunitinib 63%，致停药 22% vs 12% [14]——总体上 PD-1/PD-L1 单药毒性最低，双免疫联合毒性升高但仍可管理。

#### 1.5 联合策略

- **双免疫联合**：CheckMate 067（n=945）10 年最终随访显示 nivolumab+ipilimumab、nivolumab、ipilimumab 组中位 OS 分别为 71.9、36.9 与 19.9 个月（联合 vs ipilimumab HR 0.53；试验结束时联合组 37% 存活）[15]。CheckMate 214（n=1096，初治中/低危晚期肾透明细胞癌）中 nivolumab+ipilimumab 对比 sunitinib：18 个月 OS 率 75% vs 60%（HR 0.63，P<0.001），ORR 42% vs 27%，完全缓解率 9% vs 1%，在黑色素瘤之外确立双免疫一线标准 [14]。
- **化疗联合**：KEYNOTE-189（n=616，转移性非鳞 NSCLC）5 年随访：pembrolizumab+培美曲塞/铂类 OS HR 0.60、PFS HR 0.50，5 年 OS 率 19.4% vs 11.3%，获益与 PD-L1 表达水平无关；完成 35 程治疗的 57 例患者 ORR 86.0%，完成后 3 年 OS 率 71.9% [16]。化疗联合使 PD-L1 阴性人群亦能获益，弥补了单药生物标志物选择的局限。

### 2. 细胞免疫治疗与新兴模式

#### 2.1 CAR-T 在血液系统恶性肿瘤

**CD19 靶向。** 全球注册试验 ELIANA（n=75 可评估，≤25 岁复发/难治 B-ALL）中 tisagenlecleucel 单次输注后 3 个月内总缓解率 81% 且均达 MRD 阴性；12 个月 EFS 50%、OS 76%；CAR-T 细胞体内持久性最长 20 个月；CRS 77%（48% 使用托珠单抗）、神经事件 40% [17]。患者水平校正的历史对照比较显示 tisagenlecleucel 对比历史标准治疗 OS HR 0.54（P<0.001），2 年 OS 率 59.49% vs 36.16% [18]。JULIET 研究的细胞动力学分析（n=111，成人复发/难治 DLBCL）显示体内扩增程度与 CRS 严重程度及托珠单抗使用相关 [19]。

**长期与真实世界数据。** ZUMA-1 安全性扩展队列 3（38 例输注）24 个月分析：任意级别 CRS 92%（≥3 级仅 3%）、神经事件 87%（≥3 级 42%，1 例 5 级脑水肿）；48 个月随访中位 OS 34.8 个月；预防性托珠单抗未被推荐用于常规预防 [20]。美国 Lymphoma CAR T Consortium 真实世界数据（n=275，中位随访 58 个月）：5 年 PFS 29%、OS 40%、淋巴瘤特异性生存 53%；但 5 年非复发死亡率（NRM）16.2%，超过半数 NRM 发生于 2 年后（主要死因为感染与继发恶性肿瘤 9%，其中治疗相关髓系肿瘤 15 例）；≥60 岁患者复发风险更低但 NRM 风险显著更高（OR 4.5）[21]。

**BCMA 靶向（多发性骨髓瘤）。** ide-cel（KarMMa-1，ORR 73%）与 cilta-cel（CARTITUDE-1，ORR 98%）是截至 2025 年仅有的两款获批 BCMA CAR-T；新关注点包括迟发性神经毒性、第二原发恶性肿瘤及 IEC-小肠结肠炎 [22]。1272 例真实世界研究验证了两者在更广泛人群（含不符合试验入组标准者）中的有效性与可控安全性 [23]。

表：CAR-T 关键证据汇总

| 产品（靶点）/证据来源 | 适应证 | 设计与人群 | 主要疗效 | 引用 |
|---|---|---|---|---|
| Tisagenlecleucel（CD19）/ ELIANA | 复发/难治 B-ALL（≤25 岁） | 全球单臂 II 期，n=75 | 3 个月 ORR 81%（均 MRD 阴性）；12 个月 OS 76% | [17] |
| Tisagenlecleucel / 三试验 vs 登记库 | 复发/难治 B-ALL | 患者水平校正历史对照 | OS HR 0.54；2 年 OS 59.49% vs 36.16% | [18] |
| Axi-cel（CD19）/ ZUMA-1 队列 3 | 复发/难治大 B 细胞淋巴瘤 | 单臂安全性队列，n=38 | 中位 OS 34.8 个月（48 个月随访） | [20] |
| Axi-cel / 美国 CAR T Consortium | 复发/难治 LBCL（≥2 线） | 真实世界，n=275，中位随访 58 个月 | 5 年 PFS 29%、OS 40%；5 年 NRM 16.2% | [21] |
| Ide-cel（BCMA）/ KarMMa-1 | 复发/难治骨髓瘤 | 关键单臂试验 | ORR 73% | [22] |
| Cilta-cel（BCMA）/ CARTITUDE-1 | 复发/难治骨髓瘤 | 关键单臂试验 | ORR 98% | [22] |

#### 2.2 CAR-T 在实体瘤的挑战

权威综述（Blood Cancer Journal，被引 >2400 次）系统总结了 CAR-T 在实体瘤的主要屏障：威胁生命的严重毒性、抗肿瘤活性有限、抗原逃逸、转运受限与浸润不足，以及宿主与 TME 相互作用对 CAR-T 功能的抑制；开发与实施还依赖复杂的专业人力与生产体系 [24]。该综述同时讨论了通过 CAR-T 工程改造（增强活性、降低毒性）克服限制的创新策略 [24]。

#### 2.3 TCR-T 细胞治疗

Afamitresgene autoleucel（afami-cel）是首个获 FDA 批准的亲和力增强型 TCR 疗法，靶向癌睾丸抗原 MAGE-A4（HLA-A*02 限制）[25]。关键试验 SPEARHEAD-1（NCT04044768，主要队列 n=52：滑膜肉瘤 44 例、黏液样圆细胞脂肪肉瘤 8 例，中位 3 线既往治疗，中位随访 32.6 个月）：ORR 37%（滑膜肉瘤 39%、脂肪肉瘤 25%）；CRS 71% 但仅 1 例 3 级；最常见 ≥3 级不良事件为血细胞减少；无治疗相关死亡 [26]。后续评价指出 afami-cel 在滑膜肉瘤中产生超过 11 个月的持久缓解，确立工程化 TCR-T 治疗实体瘤的概念验证，但 HLA 限制、TME 耐药、生产周期与成本仍是主要挑战 [25]。

#### 2.4 双特异性抗体

- **Blinatumomab（CD19×CD3 BiTE）**：三期 TOWER 试验（n=405，2:1）中，对比标准化疗中位 OS 7.7 vs 4.0 个月（HR 0.71，P=0.01），12 周完全缓解伴完全血液学恢复率 34% vs 16%（P<0.001），≥3 级不良事件 87% vs 92% [27]。
- **Teclistamab（BCMA×CD3）**：首个获批 BCMA 双特异性抗体。三项注册队列合并分析（n=217，中位 5 线既往治疗，中位随访 29.5 个月）：ORR 66.4%、≥CR 率 50.2%，中位 PFS 15.6 个月、OS 29.1 个月；最常见不良事件为血细胞减少、CRS 与感染 [28]。真实世界系统综述（41 项研究）：>65% 患者不符合关键试验入组标准；8 项较大研究中 ORR 59%–66%、CRS 18%–64%，预防性托珠单抗可使 CRS 降至 13%–26% [29]。

#### 2.5 肿瘤疫苗（个体化新抗原 mRNA）

KEYNOTE-942（IIb 期随机，n=157，完全切除高危 IIIB–IV 期黑色素瘤辅助治疗）：个体化新抗原 mRNA 疗法 mRNA-4157（V940）联合 pembrolizumab 对比单药，无复发生存 HR 0.561（95% CI 0.309–1.017），复发或死亡事件率 22% vs 40%，18 个月 RFS 率 79% vs 62%；≥3 级 TRAE 25% vs 18%，无 mRNA-4157 相关 4–5 级事件 [30]。另一综述补充胰腺癌证据：autogene cevumeran 在 16 例可切除胰腺导管腺癌中诱导 8 例新抗原特异性 T 细胞应答，免疫应答者复发显著延迟（中位 RFS 未达到 vs 13.4 个月，HR 0.08）[31]。

#### 2.6 溶瘤病毒（T-VEC）

T-VEC（改造的 1 型单纯疱疹病毒）是首个获 FDA 批准、用于初始手术后复发不可切除黑色素瘤的溶瘤病毒 [32]。三期 OPTiM 试验（n=436，2:1）最终分析（中位随访 49 个月）：中位 OS 23.3 vs 18.9 个月（描述性 HR 0.79，P=0.0494）；持久缓解率（DRR）19.0% vs 1.4%（P<0.0001）；ORR 31.5% vs 6.4%，完全缓解 16.9% vs 0.7%，达 CR 者 5 年里程碑生存率估计 88.5% [33]。主要分析报告的 DRR 16.3% vs 2.1%，且未注射病灶（包括内脏病灶）亦见缓解，提示全身性抗肿瘤免疫效应 [32]。然而 MASTERKEY-265 显示 T-VEC 联合 pembrolizumab 未较单药带来额外临床获益，凸显联合策略的复杂性 [34]。

### 3. 跨主题综合

- **安全性谱系互补**：ICI 的特征毒性为 irAE（管理以糖皮质激素与 SITC 指南为框架 [13]）；T 细胞重定向疗法（CAR-T/TCR-T/双特异性抗体）的特征毒性为 CRS 与 ICANS/神经事件 [17, 20, 26, 29]，托珠单抗是 CRS 管理关键药物 [17, 29]，但预防性使用并不降低神经毒性、不推荐常规预防 [20]。
- **疗效边界清晰**：ICI 的生存获益已在多瘤种确立但多数瘤种客观缓解率有限、耐药常见 [10, 12]；CAR-T 在血液肿瘤疗效突出但实体瘤受限 [24]；TCR-T 提供了实体瘤的概念验证 [26]；mRNA 疫苗与溶瘤病毒提示新辅助/辅助与瘤内治疗方向的潜力与不确定性 [30, 33, 34]。
- **真实世界证据日益重要**：axi-cel 与 BCMA CAR-T、teclistamab 的真实世界研究显示关键试验疗效总体可外推，同时揭示远期 NRM、迟发神经毒性等试验期外风险 [21, 23, 29]。

## 局限性 (Limitations)

1. **覆盖范围（light-research 模式）**：按用户前缀仅研究两个侧面；肿瘤免疫治疗的其他重要方向——新型检查点（LAG-3、TIGIT）、肿瘤微环境与微生物组调节、溶瘤病毒以外的新载体、细胞因子治疗、儿科免疫治疗专场证据——未系统覆盖。
2. **未访谈（no-interview 前缀）**：研究范围由 orchestrator 自行界定（瘤种聚焦黑色素瘤/NSCLC/血液肿瘤，2010–2026 年），未与用户确认时间窗、瘤种优先级与输出粒度。
3. **原始主文献替代**：部分里程碑试验的最初报告未在 biomcp 结果中直接返回，以同试验长随访/最终分析替代——KEYNOTE-024 2016 首报（以 5 年随访 [5] 替代）、KEYNOTE-189 2018 首报（以 5 年随访 [16] 替代）、KEYNOTE-158 TMB 分析原文（以 Mo 2023 验证研究 [7] 替代）、ZUMA-1 队列 1/2 与 JULIET 主要疗效分析、KarMMa-1/CARTITUDE-1/MajesTEC-1 原始报告（以综述/汇总分析 [19, 22, 28] 替代）、IMpower130/110（以 IPSOS [6] 替代）。关键生存数据（HR、OS 率）完整，但首次报告的即时数据点未逐一核对。
4. **检索工具限制**：semantic_scholar 源一次 HTTP 429 限流、一次 pubmed 定向查询返回空，均经换源重试解决；CheckMate-057（非鳞 NSCLC 二线）未专门检索，非鳞二线证据以鳞癌试验 [3] 间接代表。
5. **来源质量异质**：纳入文献含 2 篇 2026 年综述/真实世界研究（PMID 42630122、41899614 等），发表时间新、同行评审积累有限，结论宜谨慎解读；KarMMa-1 与 CARTITUDE-1 的 ORR 数据转引自综述 [22] 而非原始试验报告。
6. **中文报告引用英文原始文献**：所有文献条目保留英文题录信息以保证 PMID 可核查性。

## 参考文献 (References)

[1] Hodi FS, O'Day SJ, McDermott DF, et al. Improved survival with ipilimumab in patients with metastatic melanoma. N Engl J Med. 2010 Aug 19. DOI: 10.1056/nejmoa1003466. PMID: 20525992.
[2] Robert C, Schachter J, Long GV, et al. Pembrolizumab versus Ipilimumab in Advanced Melanoma. N Engl J Med. 2015 Jun 25. DOI: 10.1056/NEJMoa1503093. PMID: 25891173.
[3] Brahmer J, Reckamp KL, Baas P, et al. Nivolumab versus Docetaxel in Advanced Squamous-Cell Non-Small-Cell Lung Cancer. N Engl J Med. 2015 Jul 09. DOI: 10.1056/nejmoa1504627. PMID: 26028407.
[4] Carbone DP, Reck M, Paz-Ares L, et al. First-Line Nivolumab in Stage IV or Recurrent Non-Small-Cell Lung Cancer. N Engl J Med. 2017 Jun 22. DOI: 10.1056/nejmoa1613493. PMID: 28636851.
[5] Reck M, Rodríguez-Abreu D, Robinson AG, et al. Five-Year Outcomes With Pembrolizumab Versus Chemotherapy for Metastatic Non-Small-Cell Lung Cancer With PD-L1 Tumor Proportion Score ≥ 50. J Clin Oncol. 2021 Jul 20. DOI: 10.1200/JCO.21.00174. PMID: 33872070.
[6] Lee SM, Schulz C, Prabhash K, et al. First-line atezolizumab monotherapy versus single-agent chemotherapy in patients with non-small-cell lung cancer ineligible for treatment with a platinum-containing regimen (IPSOS): a phase 3, global, multicentre, open-label, randomised controlled study. Lancet. 2023 Aug 05. DOI: 10.1016/S0140-6736(23)00774-2. PMID: 37423228.
[7] Mo SF, Cai ZZ, Kuai WH, et al. Universal cutoff for tumor mutational burden in predicting the efficacy of anti-PD-(L)1 therapy for advanced cancers. Front Cell Dev Biol. 2023. DOI: 10.3389/fcell.2023.1209243. PMID: 37305681.
[8] André T, Shiu KK, Kim TW, et al. Pembrolizumab in Microsatellite-Instability-High Advanced Colorectal Cancer. N Engl J Med. 2020 Dec 03. DOI: 10.1056/NEJMoa2017699. PMID: 33264544.
[9] Diaz LA, Shiu KK, Kim TW, et al. Pembrolizumab versus chemotherapy for microsatellite instability-high or mismatch repair-deficient metastatic colorectal cancer (KEYNOTE-177): final analysis of a randomised, open-label, phase 3 study. Lancet Oncol. 2022 May. DOI: 10.1016/S1470-2045(22)00197-8. PMID: 35427471.
[10] Sharma P, Hu-Lieskovan S, Wargo JA, et al. Primary, Adaptive, and Acquired Resistance to Cancer Immunotherapy. Cell. 2017 Feb 01. DOI: 10.1016/j.cell.2017.01.017. PMID: 28187290.
[11] Jenkins RW, Barbie DA, Flaherty KT. Mechanisms of resistance to immune checkpoint inhibitors. Br J Cancer. 2018 Jan 02. DOI: 10.1038/bjc.2017.434. PMID: 29319049.
[12] Xu Y, Shen H. Overcoming Resistance to Immune Checkpoint Blockade: Mechanistic Insights and Emerging Therapeutic Directions. Iran J Immunol. 2026 Aug 22. DOI: 10.22034/iji.2026.111387.3205. PMID: 42630122.
[13] Brahmer JR, Abu-Sbeih H, Ascierto PA, et al. Society for Immunotherapy of Cancer (SITC) clinical practice guideline on immune checkpoint inhibitor-related adverse events. J Immunother Cancer. 2021 Jun. DOI: 10.1136/jitc-2021-002435. PMID: 34172516.
[14] Motzer RJ, Tannir NM, McDermott DF, et al. Nivolumab plus Ipilimumab versus Sunitinib in Advanced Renal-Cell Carcinoma. N Engl J Med. 2018 Apr 05. DOI: 10.1056/nejmoa1712126. PMID: 29562145.
[15] Wolchok JD, Chiarion-Sileni V, Rutkowski P, et al. Final, 10-Year Outcomes with Nivolumab plus Ipilimumab in Advanced Melanoma. N Engl J Med. 2025 Jan 02. DOI: 10.1056/nejmoa2407417. PMID: 39282897.
[16] Garassino MC, Gadgeel S, Speranza G, et al. Pembrolizumab Plus Pemetrexed and Platinum in Nonsquamous Non-Small-Cell Lung Cancer: 5-Year Outcomes From the Phase 3 KEYNOTE-189 Study. J Clin Oncol. 2023 Apr 10. DOI: 10.1200/JCO.22.01989. PMID: 36809080.
[17] Maude SL, Laetsch TW, et al. Tisagenlecleucel in Children and Young Adults with B-Cell Lymphoblastic Leukemia. N Engl J Med. 2018. PMID: 29385370.
[18] V Stackelberg Arend, Jäschke K, et al. Tisagenlecleucel vs. historical standard of care in children and young adult patients with relapsed/refractory B-cell precursor acute lymphoblastic leukemia. Leukemia. 2023. PMID: 37880478.
[19] Awasthi R, Pacaud L, et al. Tisagenlecleucel cellular kinetics, dose, and immunogenicity in relation to clinical factors in relapsed/refractory DLBCL. Blood Adv. 2020. PMID: 32045475.
[20] Locke FL, Neelapu SS, et al. Tocilizumab Prophylaxis Following Axicabtagene Ciloleucel in Relapsed or Refractory Large B-Cell Lymphoma. Transplant Cell Ther. 2024. PMID: 39187161.
[21] Jain MD, Spiegel JY, et al. Five-Year Follow-Up of Standard-of-Care Axicabtagene Ciloleucel for Large B-Cell Lymphoma: Results From the US Lymphoma CAR T Consortium. J Clin Oncol. 2024. PMID: 39094076.
[22] Pleitez HG, Saowapa S, et al. From Trials to Practice: A 2025 Review of Idecabtagene Vicleucel and Ciltacabtagene Autoleucel Efficacy Across Clinical Studies and Real-World Evidence. Eur J Haematol. 2025. PMID: 40928436.
[23] Filippatos C, Ntanasis-Stathopoulos I, et al. Real-World Experience with Approved CAR T-Cell Therapies Ciltacabtagene Autoleucel and Idecabtagene Vicleucel in 1272 Relapsed/Refractory Multiple Myeloma Patients. Cancers (Basel). 2026. PMID: 41899614.
[24] Sterner RC, Sterner RM. CAR-T cell therapy: current limitations and potential strategies. Blood Cancer J. 2021. PMID: 33824268.
[25] Dupont M, Dufresne A, et al. An evaluation of afamitresgene autoleucel for the treatment of advanced synovial sarcoma and myxoid round cell liposarcoma. Expert Rev Anticancer Ther. 2026. PMID: 41472526.
[26] D'Angelo SP, Araujo DM, et al. Afamitresgene autoleucel for advanced synovial sarcoma and myxoid round cell liposarcoma (SPEARHEAD-1): an international, open-label, phase 2 trial. Lancet. 2024. PMID: 38554725.
[27] Kantarjian H, Stein A, et al. Blinatumomab versus Chemotherapy for Advanced Acute Lymphoblastic Leukemia. N Engl J Med. 2017. PMID: 28249141.
[28] Martin TG, Mateos M-V, et al. Efficacy and safety of teclistamab in triple-class exposed relapsed/refractory multiple myeloma: Pooled findings from three clinical cohorts and a retrospective cohort. Cancer. 2026. PMID: 41485109.
[29] Derman B, Tan C, et al. Real-World Evidence Evaluating Teclistamab in Patients with Relapsed/Refractory Multiple Myeloma: A Systematic Literature Review. Cancers (Basel). 2025. PMID: 40227780.
[30] Weber JS, Carlino MS, et al. Individualised neoantigen therapy mRNA-4157 (V940) plus pembrolizumab versus pembrolizumab monotherapy in resected melanoma (KEYNOTE-942): a randomised, phase 2b study. Lancet. 2024. PMID: 38246194.
[31] Parganiha M, Rathored J, et al. mRNA vaccines in oncology: personalized cancer immunization and neoantigen targeting. Mol Cell Oncol. 2026. PMID: 41971684.
[32] Hamid O, Ismail R, Puzanov I. Intratumoral Immunotherapy-Update 2019. Oncologist. 2020. PMID: 32162802.
[33] Andtbacka RHI, Collichio F, et al. Final analyses of OPTiM: a randomized phase III trial of talimogene laherparepvec versus granulocyte-macrophage colony-stimulating factor in unresectable stage III-IV melanoma. J Immunother Cancer. 2019. PMID: 31171039.
[34] Nassief G, Anaeme A, et al. Where Are We Now with Oncolytic Viruses in Melanoma and Nonmelanoma Skin Malignancies? Pharmaceuticals (Basel). 2024. PMID: 39065766.

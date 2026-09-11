# 肿瘤免疫治疗文献综述：免疫检查点抑制剂与 CAR-T 细胞治疗

Generated: 2026-09-11 | TOPIC: tumor_immunotherapy | Scope: 以 PubMed 为证据源，围绕肿瘤免疫治疗两大支柱——免疫检查点抑制剂（CTLA-4、PD-1/PD-L1）与 CAR-T 细胞治疗——综述关键临床证据、机制、毒性、耐药/屏障与下一代策略。模式：no-interview light-research（2 个方面，每方面 biomcp 调用 ≤10 次）。

## 摘要（Executive Summary）

肿瘤免疫治疗的两条主线已分别确立临床地位：免疫检查点抑制剂（ICB）自 ipilimumab 首次在 III 期试验中延长转移性黑色素瘤总生存（OS）以来 [1]，经 PD-1/PD-L1 阻断在黑色素瘤中进一步实现生存获益与更低毒性 [2, 3]；CAR-T 细胞治疗则以 anti-CD19 产品在复发/难治 B 细胞恶性肿瘤中取得高缓解率与长期生存证据 [4, 5]。

关键发现：
- CTLA-4 阻断的里程碑：ipilimumab 单药中位 OS 10.1 个月 vs 对照 6.4 个月（HR 0.66），为首个改善转移性黑色素瘤 OS 的 III 期证据，但代价是 10–15% 的 3/4 级免疫相关不良事件 [1]。
- PD-1/PD-L1 时代：nivolumab 一线 1 年 OS 率 72.9% vs 42.1% [2]；pembrolizumab 对比 ipilimumab 中位 OS 未达到 vs 16.0 个月 [3]。
- 耐药仍是主要瓶颈：NSCLC 中约 70–85% 患者存在原发或获得性耐药 [6]；双免联合（nivolumab+ipilimumab）带来长尾生存（真实世界 10 年生存率 36%）但 3/4 级 irAE 达 48.5% [7]。
- CAR-T 在血液肿瘤疗效显著：ZUMA-1 中 axicabtagene ciloleucel 的 ORR 82%、CR 58% [4]，4 年 OS 率 44% [5]；但 CRS/ICANS 毒性 [8] 与 40–60% 患者未能持久缓解 [9] 构成主要限制。
- 实体瘤拓展受抗原异质性、T 细胞耗竭与免疫抑制性微环境五重屏障制约 [10]，多靶点、逻辑门与纳米抗体等新型 CAR 设计是当前突破方向 [11, 12]。

## 数据来源（Data Sources）

| 来源 | 类型 | 查询/访问方式 | 访问日期 |
|------|------|--------------|----------|
| PubMed / EuropePMC（经 biomcp article_search） | 文献数据库 | 方面 1：10 次检索（ipilimumab/nivolumab/pembrolizumab 关键试验、irAE、耐药机制等，limit 6–10）；方面 2：8 次检索（tisagenlecleucel、ZUMA-1、CRS/ICANS、实体瘤屏障、新型 CAR，limit 5–8） | 2026-09-11 |
| PubMed（经 biomcp article_get） | 文献详情 | 方面 1：PMID 20525992、22658128；方面 2：2 次尝试均失败（DOI 解析失败、PMID 解析至无关文献） | 2026-09-11 |

- 记录范围：方面 1 入账 28 篇文献（原始试验 6 篇、综述/机制 12 篇、二次研究/真实世界 10 篇）；方面 2 入账 29 篇（ZUMA-1 系列试验/随访 5 篇、综述与机制研究 24 篇）。检索窗口以各检索词自带 dateRange 控制（多为 2010–2026；未设限的检索默认全时段）。
- 质量说明：两方面的证据账本均通过 evidence-ledger check（0 隔离行、全部引键解析）。案例报告、非肿瘤适应症与生产/费用类文献按排除标准剔除。方面 2 的两次元数据补全失败导致 ELIANA 与 ZUMA-1 首报（均为 NEJM 原文）未直接获取（见局限性）。

## 分析方法（Analysis Methodology）

- 研究组织：no-interview light-research 模式，TOPIC=tumor_immunotherapy，两个研究方面由两个并行 subagent worker 各自执行（方面 1：checkpoint_inhibitors；方面 2：car_t_cell_therapy），每个 worker 绑定上限 10 次 biomcp 工具调用，达到即停。
- 工具与参数：全部证据经 biomcp（article_search 为主、article_get 补全）获取；关键参数包括检索词（如 "pembrolizumab versus ipilimumab advanced melanoma progression-free survival randomized trial"，dateRange 2014-01-01/2018-12-31，limit 10）、"axicabtagene ciloleucel refractory large B-cell lymphoma ZUMA-1"（limit 8）等，完整查询日志见各方面报告。
- 验证步骤：worker 每次检索后即以 evidence-ledger.py add 逐字入账（含真实 UTC 时间戳）；完成时运行 check --markers（两方面均 exit 0）；orchestrator 合并账本后经 verify（NCBI esummary 交叉核验与回填）、render（编号引用与参考文献的唯一权威）与 vet-references.py（结构审计 + 独立 NCBI 复核）三级校验。
- 证据纪律：每条数量级论断在捕获时绑定其来源引键；命中检索词但违反纳入/排除标准的条目记为排除而非充数；二手转述的数字明确标注间接来源。

## 发现（Findings）

### 一、免疫检查点抑制剂（ICB）：从 CTLA-4 到 PD-1/PD-L1

#### 1.1 CTLA-4 阻断的里程碑

Hodi 等 2010 年 NEJM III 期试验（n=676，3:1:1 随机）首次证明任何治疗可改善转移性黑色素瘤 OS：ipilimumab 单药中位 OS 10.1 个月 vs gp100 疫苗 6.4 个月（死亡 HR 0.66，P=0.003）；ipilimumab+gp100 组 10.0 个月（HR 0.68，P<0.001）；两个 ipilimumab 组间无差异（HR 1.04，P=0.76）[1]。毒性代价明确：ipilimumab 组 10–15% 发生 3/4 级 irAE（对照 3%），14 例（2.1%）药物相关死亡中 7 例与 irAE 相关 [1]。ipilimumab 于 2011 年获 FDA 批准用于晚期黑色素瘤，成为免疫肿瘤学的标志性事件 [13]；其临床开发历程与抗 CTLA-4 药理学另有系统综述 [14, 15]。

#### 1.2 PD-1/PD-L1 阻断的关键试验

| 试验（药物/线数） | 主要终点 | 关键结果 | 安全性 | 来源 |
|---|---|---|---|---|
| Brahmer 2012，I 期（抗 PD-L1，多瘤种，n=207） | ORR | ORR 6–17%；24 周 SD 12–41%；16 例随访≥1 年缓解者中 8 例缓解≥1 年 | 3/4 级毒性 9% | [16] |
| CHECKMATE-066（nivolumab 一线，BRAF 野生型黑色素瘤，n=418） | OS | 1 年 OS 72.9% vs 42.1%（HR 0.42，P<0.001）；中位 PFS 5.1 vs 2.2 个月；ORR 40.0% vs 13.9% | 3/4 级 AE 11.7% vs 17.6% | [2] |
| KEYNOTE-002 最终（pembrolizumab 二线，ipilimumab 难治，n=540 随机） | OS | 中位 OS 13.4/14.7 vs 11.0 个月；10 mg/kg HR 0.74（P=0.011，未越过预设界限） | 3–5 级 AE 13.5%/16.8% vs 26.3% | [17] |
| KEYNOTE-006 最终（pembrolizumab 一线 vs ipilimumab，n=834） | OS | 中位 OS 未达到 vs 16.0 个月（HR 0.68/0.68）；24 个月 OS 率 55%/55% vs 43% | 优于 ipilimumab | [3] |

荟萃层面（Yun 2016，纳入抗 CTLA-4 与抗 PD-1 随机对照试验）：ICB 对比化疗/疫苗改善 6 个月 PFS 率（28.5% vs 17.7%）、1 年 OS 率（51.2% vs 38.8%）；抗 PD-1 对比抗 CTLA-4 在 PFS 与 ORR 获益更大，且 irAE 发生率显著升高（13.7% vs 2.4%，RR 6.74）[18]。

#### 1.3 作用机制

PD-1 为 T 细胞共抑制受体，肿瘤利用 PD-1/PD-L1 轴实现免疫逃逸，阻断后恢复 T 细胞抗肿瘤功能 [19, 20]。时相上，CTLA-4 主要在 T 细胞启动阶段（淋巴结）负调节共刺激，PD-1/PD-L1 主要在外周效应阶段（肿瘤微环境）抑制耗竭性 T 细胞 [14, 19, 20]。肿瘤免疫逃逸还依赖抗原呈递机器下调、免疫抑制性细胞因子、Treg/MDSC 招募等旁路机制 [21]。

#### 1.4 生物标志物与患者选择

KEYNOTE-006 预设分析（80.6% 患者为 PD-L1 阳性）：PD-L1 阳性肿瘤中 pembrolizumab 对比 ipilimumab 的 24 个月 PFS 率 33.2% vs 13.1%、OS 率 58.4% vs 45.0%；PD-L1 阴性肿瘤中 OS 相似（43.6% vs 31.8%），支持无论 PD-L1 状态均可用 pembrolizumab [22]。CHECKMATE-066 的生存获益在各 PD-L1 表达亚组一致 [2]。监管层面已建立 PD-L1 免疫组化伴随/互补诊断，但其预测价值须按适应症谨慎解读 [23]；联合治疗维度上预测性生物标志物仍不成熟 [6, 21]。

#### 1.5 免疫相关不良事件（irAE）

- 谱系与管理：CTLA-4 阻断 3/4 级 irAE 约 10–15% [1]；消化系统（肝炎、结肠炎）最常见，按 ASCO/ESMO 指南行分级糖皮质激素±免疫抑制剂管理 [13]。
- 双免联合显著加重毒性：真实世界 10 年队列（n=332，ipilimumab+nivolumab 一线）任何级别 irAE 92.8%、3/4 级 48.5%、70% 需全身糖皮质激素、30% 需二线免疫抑制 [7]。
- 神经系统（倾向匹配 6887 对）：ICI 对比化疗外周神经病变更少（3.2% vs 7.2%）、肌炎更多（2.1% vs 1.0%）、脑病相似（1.4% vs 1.0%）[24]。
- 预测与转归：治疗前较高淋巴细胞/单核细胞计数与 irAE 风险独立相关（OR 14.36/9.90）[25]；irAE 发生与更长 OS 相关（n=344，P<0.001），因毒性停药者仍可获生存获益 [26]。

#### 1.6 耐药与联合策略

- 耐药负担：NSCLC 中约 70–85% 患者对 PD-1 阻断原发耐药或后续获得性耐药 [6]，机制涉及肿瘤内在改变、微环境重塑与免疫细胞表型适应 [21]。原始机制研究：基质成纤维细胞经 MMP-9 切割表面 PD-L1 介导耐药，逃逸肿瘤呈间充质表型伴 TGFβ 信号增强 [27]；42.4% 初治 NSCLC 存在癌细胞选择性 TAP2 下调（髓系 IL-4—IL-4Rα 轴驱动），降低 PD-1 阻断敏感性 [28]。
- 双免联合：CheckMate 067 的 4 年结局已正式发表 [29]；据 2026 年综述转述，10 年最终随访显示联合组约 31% 患者出现超过 7 年的持久生存平台（此为二手转述，原文数字未直接核验）[30]。真实世界 10 年数据支持长尾生存：中位 OS 33.4 个月，5 年/10 年生存率 41%/36% [7]；统计建模估计 5 年无进展存活者可视为"功能性治愈"（至功能性治愈时间约 61–63 个月）[31]。联合价值高度依赖治疗情境：辅助双免（CheckMate 915）未优于 nivolumab 单药，新辅助联合（NADINA）则建立有效证据 [30]。克服耐药的方向包括双检查点阻断、代谢/血管共靶向、生物标志物引导与多组学/微生物组调控 [6, 21, 32]。

### 二、CAR-T 细胞治疗：血液肿瘤的成功与实体瘤的屏障

#### 2.1 anti-CD19 CAR-T 的注册性证据

- **B-ALL（tisagenlecleucel）**：FDA 批准用于复发/难治 B-ALL 的 CAR-T 共 2 个产品——tisagenlecleucel（<26 岁）与 brexucabtagene autoleucel（≥18 岁）[33]；tisagenlecleucel 是唯一获批儿科适应证的 CAR-T（难治 B 细胞前体 ALL 或≥2 次复发的 B-ALL）[34]。其主要限制为高复发率、显著毒性及采集/生产物流 [34]；CAR-T 后是否桥接造血干细胞移植仍是儿科 ALL 的关键决策轴 [35, 36]。
- **LBCL（axicabtagene ciloleucel，ZUMA-1）**：单臂多中心 I/II 期注册性试验（22 家中心，目标剂量 2×10⁶ CAR T 细胞/kg）[4]。关键数字：

| 指标 | 数值 | 来源 |
|---|---|---|
| ORR / CR（中位随访 15.4 个月，n=108） | 82%（89/108）/ 58%（63/108） | [4] |
| ORR / CR（27.1 个月随访，n=101） | 83%（84/101）/ 58%（59/101） | [4] |
| 中位 DOR / PFS / OS（27.1 个月） | 11.1 / 5.9 个月 / 未达到 | [4] |
| ≥3 级 CRS / 神经事件 | 11%（12/108）/ 32%（35/108）；2 例治疗相关死亡 | [4] |
| 高危亚组（双表达/高级别，n=37） | ORR 89%、CR 68% | [37] |
| 4 年 OS 率（51.1 个月随访） | 44%（中位 OS 25.8 个月）；EFS12⁻ vs EFS12⁺ 者 4 年 OS 91% vs 7% | [5] |
| 5 年随访 | 长期生存且无新安全信号；持续缓解与早期 CAR T 扩增相关 | [38] |
| 6 年探索性分析 | 60 个月 LREFS 总体 33.5%、达 CR 者 56.8%；12/24 个月仍 CR 者 72 个月 DSS 94.4%/100% | [39] |
| ≥65 岁亚组 | CR 率与 2 年持续缓解率与年轻者相近，神经毒性更高 | [40] |

- **总体未满足需求**：即便在血液恶性肿瘤，仍有 40–60% 患者未能获得持久缓解 [9]。

#### 2.2 CRS 与 ICANS：毒性谱系与管理

CRS 与 ICANS 是最常见的急性毒性，已有标准化分级与管理路径 [41]；毒性谱四大主体为 CRS、ICANS、肿瘤溶解综合征与 on-target/off-tumor 毒性，管理基于共识分级干预 [8]，治疗算法依托 ASTCT 共识分级及 EBMT/JACIE、NCCN 指南，趋势是更早干预 [42]。ZUMA-1 中 ≥3 级事件主要经 tocilizumab（45% 患者）和/或糖皮质激素（28%）控制，升压药/透析/插管使用率仅 17%/3%/3% [37]。风险预测方面，154 例 B 细胞淋巴瘤分析中 24.7% 在 CRS 后发生 ICANS，"CRS 24 小时内起病"与"第 3 天前达 2–4 级 CRS"可将患者分为高/中/低 ICANS 风险（47.4%/31.0%/8.2%）[43]。罕见但致命的免疫效应细胞相关噬血细胞样综合征（IEC-HS）：DESCAR-T 登记 42 例中位发病为输注后 9 天、中位铁蛋白 18,561 µg/L，依托泊苷反应率 77%，总体死亡率 81%（B-NHL 1 年 OS 仅 15.6% vs B-ALL 47.1%）[44]；另已识别"非经典及致死定义性"毒性 [45]。真实世界频率参考：单中心 38 例淋巴瘤 CAR-T 中 ≥1 级 CRS 63%、≥1 级 ICANS 29%、最佳 CR 56% [46]。

#### 2.3 实体瘤拓展的屏障

共识框架将实体瘤屏障归纳为五要素：抗原异质性、浸润/运输受损、代谢抑制、免疫抑制信号与 on-target/off-tumor 毒性 [10]；抗肿瘤活性最易在"靶向富集抗原 + 克服物理屏障的递送 + 工程化抗耗竭"时实现 [10]。以结肠癌为例，CEA、EGFR、MUC1、Frizzled 受体等是临床探索主线，但抗原异质性与免疫逃逸持续限制疗效 [47]。解决方向包括多抗原/逻辑门识别、装甲式与代谢工程、区域递送及生物标志物驱动的分层 [48, 49]；表观遗传编辑（敲除 TET2/DNMT3A 诱导记忆样非耗竭状态，靶向沉默 PD-1、LAG-3）已在概念验证中显示安全性 [9]。CAR-T 与 TIL 疗法在实体瘤屏障与解决方案上呈趋同态势 [50]。

#### 2.4 新型 CAR 设计

- 装甲式 CAR：共表达 IL-15、IL-7/CCL19 等细胞因子对抗免疫抑制 TME；显性负受体（TGFβRII）与 BiTE 共表达分别针对抑制信号与抗原逃逸 [11]。
- 逻辑门与通用型：SynNotch 等逻辑门电路、精确基因修饰与 off-the-shelf 设计用于克服耗竭与耐药 [51, 52]。
- 双靶点的制造成本约束：双 scFv 构建转导效率低于单靶（65–75% vs 92–98%），制备周期 18–28 天，单例成本 50–70 万美元 [51]。
- 纳米抗体（VHH）CAR：相比 scFv 具有可溶性、模块化与低免疫原性优势，支持双特异性/三价/逻辑门构型；以 BCMA 靶向为代表的早期临床显示鼓舞的安全性与活性 [12]。

### 三、跨方面综合：两条主线的互补格局

ICB 与 CAR-T 代表肿瘤免疫治疗的两种范式：前者解除免疫检查点对内源性 T 细胞的抑制（依赖宿主预存免疫与肿瘤免疫原性，获益呈长尾分布 [7, 31]），后者以工程化效应细胞直接重建抗肿瘤免疫（疗效强烈但受抗原逃逸与毒性制约 [9, 10]）。两者面临同构的科学问题——生物标志物缺失/不成熟（ICB [6, 23] vs CAR-T 微环境分层 [49]）、T 细胞耗竭（PD-1 耐药 [6] vs 实体瘤 CAR-T 屏障 [10]）与毒性管理（irAE [13] vs CRS/ICANS [8]）——且在机制上交汇：PD-1/LAG-3 沉默既是 ICB 耐药的对策，也被用于 CAR-T 的抗耗竭工程 [9, 32]。置信度标注：ICB 黑色素瘤生存获益（高置信，多项 III 期原始试验 [1-3]）；CheckMate-067 十年平台期数字（低置信，二手综述转述 [30]）；CAR-T 血液肿瘤疗效（高置信，ZUMA-1 系列多时间点一致 [4, 39]）；实体瘤 CAR-T 与纳米抗体 CAR 前景（低-中置信，以综述与早期临床为主 [10, 12]）。

## 局限性（Limitations）

- **原始文献缺口**：方面 1 未直接获取 Topalian 2012（nivolumab I 期）、Wolchok 2013（CheckMate-069）、Robert 2011（ipilimumab+达卡巴嗪）及 CheckMate-067 原文摘要（其 4 年记录缺摘要 [29]，十年"31% 平台"系综述间接转述 [30]）；PD-L1 证据限于黑色素瘤亚组分析，未覆盖 KEYNOTE-024 等 NSCLC 一线数据。方面 2 的 ELIANA（tisagenlecleucel）与 ZUMA-1 首报（均 NEJM）未能直接获取——两次 article_get 均失败（DOI 解析失败、PMID 解析至无关文献）；ELIANA 疗效经二手综述转述且未给出具体 ORR/CR 数字，ZUMA-1 数字取自 Lancet Oncol 2 年随访与 Blood 长期随访系列。
- **调用预算约束**：两 worker 各 10 次调用达硬性上限即停，检索广度受限于预设查询词；irAE 经典管理综述（Postow/Michot）与实体瘤 CAR-T 注册性试验原发数据未被覆盖。
- **证据类型偏倚**：耐药机制、实体瘤屏障与新型 CAR 设计的证据以综述与 I/II 期/早期临床为主（低-中置信）；部分 2025–2026 年新文献（PMID 42xxxxxx 段）尚缺充分同行评议时间沉淀。
- **适用范围**：ICB 证据主体来自黑色素瘤（外推至其他瘤种需谨慎）；CAR-T 结论限于 anti-CD19 血液肿瘤主线；TCR-T、TIL、癌症疫苗与溶瘤病毒按 light-research 的 2 方面设定未纳入。
- 检索语言为英文，未覆盖非英语文献与 2026 年下半年最新会议数据。

## References

[1] Hodi FS, O'Day SJ, McDermott DF, et al. Improved survival with ipilimumab in patients with metastatic melanoma. N Engl J Med. 2010;363(8):711-23. DOI: 10.1056/nejmoa1003466. PMID: 20525992.
[2] Robert C, Long GV, Brady B, et al. Nivolumab in previously untreated melanoma without BRAF mutation. N Engl J Med. 2015;372(4):320-30. DOI: 10.1056/nejmoa1412082. PMID: 25399552.
[3] Schachter J, Ribas A, Long GV, et al. Pembrolizumab versus ipilimumab for advanced melanoma: final overall survival results of a multicentre, randomised, open-label phase 3 study (KEYNOTE-006). Lancet. 2017;390(10105):1853-1862. DOI: 10.1016/s0140-6736(17)31601-x. PMID: 28822576.
[4] F. L, A. G, C. J, et al. Long-term safety and activity of axicabtagene ciloleucel in refractory large B-cell lymphoma (ZUMA-1): a single-arm, multicentre, phase 1-2 trial. The Lancet Oncology. 2018. DOI: 10.1016/s1470-2045(18)30864-7.
[5] C. J, F. L, A. G, et al. Long-Term (≥4 Year and ≥5 Year) Overall Survival (OS) By 12- and 24-Month Event-Free Survival (EFS): An Updated Analysis of ZUMA-1, the Pivotal Study of Axicabtagene Ciloleucel (Axi-Cel) in Patients (Pts) with Refractory Large B-Cell Lymphoma (LBCL). Blood. 2021. DOI: 10.1182/blood-2021-148078.
[6] Mariniello A, Borgeaud M, Weiner M, et al. Primary and Acquired Resistance to Immunotherapy with Checkpoint Inhibitors in NSCLC: From Bedside to Bench and Back. BioDrugs. 2025;39(2):215-235. DOI: 10.1007/s40259-024-00700-2. PMID: 39954220.
[7] Javaid A, Peres T, Schmitt AM, et al. 10-Years of First-Line Ipilimumab and Nivolumab in Advanced Melanoma: A Single Centre Experience. Int J Cancer. 2026. DOI: 10.1002/ijc.70653. PMID: 42426954.
[8] Yu-Gu Z, Diyuan Q, Arthur S, et al. Exploring CAR-T Cell Therapy Side Effects: Mechanisms and Management Strategies. Journal of Clinical Medicine. 2023. DOI: 10.3390/jcm12196124.
[9] Horvathova L, Rots MG, Wiersma VR. Epigenetic editing to advance CAR T cell therapy. Clin Epigenetics. 2026;18(1). DOI: 10.1186/s13148-026-02085-1. PMID: 41731598.
[10] Liu K, Pham VT, Fu S, et al. CAR T Cell Therapy in Solid Tumors: Lessons From Early-Phase Clinical Trials and Biological Barriers to Efficacy. Hematol Oncol. 2026;44(4):e70209. DOI: 10.1002/hon.70209. PMID: 42294616.
[11] S. S, Yuriy Z, Sergey AS, et al. Advancing CAR-T Therapy for Solid Tumors: From Barriers to Clinical Progress. Biomolecules. 2025. DOI: 10.3390/biom15101407.
[12] A. E, Fatemeh TR, Akram H, et al. Nanobody CAR-T cells in cancer: From molecular design to clinical translation. Biomedicine & pharmacotherapy = Biomedecine & pharmacotherapie. 2025. DOI: 10.1016/j.biopha.2025.118819.
[13] Myojin Y, Kodama T. Immune checkpoint inhibitor-associated hepatitis and colitis: current understanding and clinical approaches. Immunol Med. 2026;49(3):304-316. DOI: 10.1080/25785826.2026.2679874. PMID: 42228982.
[14] Wolchok JD, Hodi FS, Weber JS, et al. Development of ipilimumab: a novel immunotherapeutic approach for the treatment of advanced melanoma. Ann N Y Acad Sci. 2013;1291(1):1-13. DOI: 10.1111/nyas.12180. PMID: 23772560.
[15] Tosti G, Cocorocchio E, Pennacchioli E. Anti-cytotoxic T lymphocyte antigen-4 antibodies in melanoma. Clin Cosmet Investig Dermatol. 2013;6:245-56. DOI: 10.2147/ccid.s24246. PMID: 24204168.
[16] Brahmer JR, Tykodi SS, Chow LQM, et al. Safety and activity of anti-PD-L1 antibody in patients with advanced cancer. N Engl J Med. 2012;366(26):2455-65. DOI: 10.1056/nejmoa1200694. PMID: 22658128.
[17] Hamid O, Puzanov I, Dummer R, et al. Final analysis of a randomised trial comparing pembrolizumab versus investigator-choice chemotherapy for ipilimumab-refractory advanced melanoma. Eur J Cancer. 2017;86:37-45. DOI: 10.1016/j.ejca.2017.07.022. PMID: 28961465.
[18] Yun S, Vincelette ND, Green MR, et al. Targeting immune checkpoints in unresectable metastatic cutaneous melanoma: a systematic review and meta-analysis of anti-CTLA-4 and anti-PD-1 agents trials. Cancer Med. 2016;5(7):1481-91. DOI: 10.1002/cam4.732. PMID: 27167347.
[19] Hamanishi J, Mandai M, Matsumura N, et al. PD-1/PD-L1 blockade in cancer treatment: perspectives and issues. Int J Clin Oncol. 2016;21(3):462-73. DOI: 10.1007/s10147-016-0959-z. PMID: 26899259.
[20] Li Y, Li F, Jiang F, et al. A Mini-Review for Cancer Immunotherapy: Molecular Understanding of PD-1/PD-L1 Pathway & Translational Blockade of Immune Checkpoints. Int J Mol Sci. 2016;17(7). DOI: 10.3390/ijms17071151. PMID: 27438833.
[21] Saman H, Makni-Maalej K, El-Ella DMA, et al. Immune checkpoint blockade in cancer: current insights and future horizons. Discov Oncol. 2026;17(1):209. DOI: 10.1007/s12672-025-04361-7. PMID: 41483376.
[22] Carlino MS, Long GV, Schadendorf D, et al. Outcomes by line of therapy and programmed death ligand 1 expression in patients with advanced melanoma treated with pembrolizumab or ipilimumab in KEYNOTE-006: A randomised clinical trial. Eur J Cancer. 2018;101:236-243. DOI: 10.1016/j.ejca.2018.06.034. PMID: 30096704.
[23] Novotny JF, Cogswell J, Inzunza H, et al. Establishing a complementary diagnostic for anti-PD-1 immune checkpoint inhibitor therapy. Ann Oncol. 2016;27(10):1966-9. DOI: 10.1093/annonc/mdw288. PMID: 27502705.
[24] Abualrob MA, Alshehab S, Awad Y, et al. Comparative neurologic toxicity profiles of chemotherapy versus immune checkpoint inhibitors in melanoma: a propensity score-matched analysis. Support Care Cancer. 2026;34(6). DOI: 10.1007/s00520-026-10745-4. PMID: 42133101.
[25] Kinase S, Nagumo Y, Isoda B, et al. Blood parameters and whole-blood transcriptomics associated with immune-related adverse events in metastatic renal cell carcinoma during nivolumab plus ipilimumab. Sci Rep. 2026;16(1). DOI: 10.1038/s41598-026-46960-6. PMID: 42026114.
[26] Iessa K, Kantilal K, Garekyaragh I, et al. Immune-Related Adverse Events and Therapeutic Outcomes After Stopping Immune Checkpoint Inhibitors due to Toxicity Among Patients With Metastatic Melanoma (University Hospitals Sussex). Cancer Med. 2026;15(7):e72119. DOI: 10.1002/cam4.72119. PMID: 42482656.
[27] Zhao F, Evans K, Xiao C, et al. Stromal Fibroblasts Mediate Anti-PD-1 Resistance via MMP-9 and Dictate TGFβ Inhibitor Sequencing in Melanoma. Cancer Immunol Res. 2018;6(12):1459-1471. DOI: 10.1158/2326-6066.cir-18-0086. PMID: 30209062.
[28] Ranjan K, Rajendran BK, Deen IU, et al. IL-4 mediated TAP2 downregulation is a dominant and reversible mechanism of immune evasion and immunotherapy resistance in non-small cell lung cancer. Mol Cancer. 2025;24(1):80. DOI: 10.1186/s12943-025-02276-z. PMID: 40091029.
[29] Hodi FS, Chiarion-Sileni V, Gonzalez R, et al. Nivolumab plus ipilimumab or nivolumab alone versus ipilimumab alone in advanced melanoma (CheckMate 067): 4-year outcomes of a multicentre, randomised, phase 3 trial. Lancet Oncol. 2018;19(11):1480-1492. DOI: 10.1016/s1470-2045(18)30700-9. PMID: 30361170.
[30] Afuh R, Ashinze P, Banerjee S, et al. Nivolumab and ipilimumab combination therapy for melanoma efficacy, safety and clinical integration in metastatic and adjuvant settings. Discov Oncol. 2026;17(1). DOI: 10.1007/s12672-026-05202-x. PMID: 42168665.
[31] Cavallon A, Borget I, Robert C, et al. The concept of functional cure in advanced/metastatic melanoma treated with combined nivolumab and ipilimumab or nivolumab alone. Br J Cancer. 2026. DOI: 10.1038/s41416-026-03528-5. PMID: 42399508.
[32] Darzi A, Shokouhfar M, Farajee N, et al. Immune checkpoint inhibition in renal cell carcinoma: Mechanisms of resistance and emerging therapeutic strategies. Biomed Pharmacother. 2025;193:118875. DOI: 10.1016/j.biopha.2025.118875. PMID: 41349248.
[33] Othman T, Logan AC, Muffly L, et al. The Role of CAR T-Cell Therapy in Relapsed/Refractory Adult B-ALL. J Natl Compr Canc Netw. 2024;22(8):e247065. doi: 10.6004/jnccn.2024.7065. DOI: 10.6004/jnccn.2024.7065. PMID: 39413830.
[34] Fabrizio VA, Curran KJ. Clinical experience of CAR T cells for B cell acute lymphoblastic leukemia. Best Pract Res Clin Haematol. 2021;34(3):101305. DOI: 10.1016/j.beha.2021.101305. PMID: 34625231.
[35] Qayed M, Bleakley M, Shah NN. Role of chimeric antigen receptor T-cell therapy: bridge to transplantation or stand-alone therapy in pediatric acute lymphoblastic leukemia. Curr Opin Hematol. 2021;28(6):373-379. DOI: 10.1097/moh.0000000000000685. PMID: 34508031.
[36] Si LS, Grupp SA, DiNofia AM. Tisagenlecleucel for treatment of children and young adults with relapsed/refractory B-cell acute lymphoblastic leukemia. Pediatr Blood Cancer. 2021;68(9):e29123. DOI: 10.1002/pbc.29123. PMID: 34061452.
[37] S. N, A. G, C. J, et al. 2-Year Follow-up and High-Risk Subset Analysis of Zuma-1, the Pivotal Study of Axicabtagene Ciloleucel (Axi-Cel) in Patients with Refractory Large B Cell Lymphoma. Biology of Blood and Marrow Transplantation. 2018. DOI: 10.1182/blood-2018-99-111368.
[38] S. N, C. J, A. G, et al. Five-year follow-up of ZUMA-1 supports the curative potential of axicabtagene ciloleucel in refractory large B-cell lymphoma. Blood. 2023. DOI: 10.1182/blood.2022018893.
[39] S. N, C. J, A. G, et al. Curative Potential of Axicabtagene Ciloleucel (Axi-Cel): An Exploratory Long-Term Survival Assessment in Patients with Refractory Large B-Cell Lymphoma from ZUMA-1. Blood. 2023. DOI: 10.1182/blood-2023-174288.
[40] S. N, C. J, O. O, et al. Outcomes of older patients in ZUMA-1, a pivotal study of axicabtagene ciloleucel in refractory large B-cell lymphoma. Blood. 2020. DOI: 10.1182/blood.2019004162.
[41] S. N. Managing the toxicities of CAR T‐cell therapy. Hematological Oncology. 2019. DOI: 10.1002/hon.2595.
[42] Hideki G. CRS and ICANS in CAR T-cell therapy for large B-cell lymphoma. Journal of Clinical and Experimental Hematopathology. 2025. DOI: 10.3960/jslrt.25072.
[43] Nishihara H, Jinnouchi F, Ishihara D, et al. Early prediction of ICANS using CRS characteristics in B-cell lymphoma patients receiving CAR-T therapy. Int J Hematol. 2026. DOI: 10.1007/s12185-026-04257-4. PMID: 42489952.
[44] Gower N, Houot R, Pizot C, et al. Hemophagocytic lymphohistiocytosis-like syndrome after CD19-directed CAR T-cells for B-cell lymphoma and B-cell acute lymphoblastic leukemia: A LYSA, SFCE, and GRAALL study from the DESCAR-T registry. Hemasphere. 2026;10(7):e70425. DOI: 10.1002/hem3.70425. PMID: 42472032.
[45] K. R, Joshua AH, Saurabh D, et al. Noncanonical and mortality-defining toxicities of CAR T cell therapy. Nature Medicine. 2025. DOI: 10.1038/s41591-025-03813-5.
[46] Daniel AS, E. K, S. T, et al. Imaging-based Toxicity and Response Pattern Assessment Following CAR T-Cell Therapy. Radiology. 2021. DOI: 10.1148/radiol.2021210760.
[47] Raza A, Raza MA, Khan J, et al. Emerging Landscape of CAR-T Cell Therapy in Colon Cancer: Mechanistic Insights, Clinical Advances, Challenges, and Future Directions. Pathol Res Pract. 2026;287:156645. DOI: 10.1016/j.prp.2026.156645. PMID: 42574910.
[48] Rizkallah J, Wehbeh BED, Wassouf W, et al. Adoptive cell therapies in solid tumors: current clinical landscape, challenges, and future directions. Front Immunol. 2026;17:1800292. DOI: 10.3389/fimmu.2026.1800292. PMID: 42220535.
[49] Al SNSH, Masoud I, Tleyjeh A, et al. CAR-T cells in solid tumors: engineering, biomarkers, translational pathways and the road ahead. Front Immunol. 2026;17:1796675. DOI: 10.3389/fimmu.2026.1796675. PMID: 41993194.
[50] Bach DH, Hoang VT, Pham TV, et al. CAR-T and TIL therapies in solid tumors: barriers, clinical lessons, and convergent solutions. Cancer Cell Int. 2026;26(1). DOI: 10.1186/s12935-026-04425-w. PMID: 42477682.
[51] Mujibullah S, Dilip M, Umesh T, et al. Advancing breast cancer treatment through dual targeting CAR T cell therapy. Discover Oncology. 2025. DOI: 10.1007/s12672-025-04195-3.
[52] Garcia-Robledo JE, Cabrera-Salcedo S, Brandauer AM, et al. Engineering the next generation of CAR T- cells: precision modifications, logic gates and universal strategies to overcome exhaustion and tumor resistance. Front Oncol. 2025;15:1698442. DOI: 10.3389/fonc.2025.1698442. PMID: 41584599.

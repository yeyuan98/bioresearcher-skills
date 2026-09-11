# 研究计划：肿瘤免疫治疗（tumor immunotherapy）文献综述

- 模式：`no-interview light-research`（跳过访谈；仅取前 2 个研究方面）
- 语言：中文报告；引用采用 PMID 语义引键（`[@pmid:...]`）
- 硬性预算：每个方面的 worker 最多调用 10 次 biomcp 工具（约束性上限，不得放宽）

## 方面 1：checkpoint_inhibitors — 免疫检查点抑制剂（ICB）的里程碑研究与临床进展

ABSTRACT：聚焦 CTLA-4 与 PD-1/PD-L1 抑制剂在肿瘤治疗中的关键原始研究与高质量综述：
ipilimumab 首次延长黑色素瘤总生存的 III 期试验、nivolumab/pembrolizumab 的代表性
临床试验、PD-L1 等生物标志物、irAE 安全性、耐药与联合策略（含双免联合）。研究条目：
(1) ICB 里程碑原始试验（生存获益）；(2) 作用机制综述；(3) 生物标志物与患者选择；
(4) 免疫相关不良事件；(5) 原发性/继发性耐药机制。纳入标准：肿瘤适应症、ICB 主线
（CTLA-4/PD-1/PD-L1）、优先原始研究与权威综述。排除标准：纯疫苗治疗、溶瘤病毒、
非肿瘤自身免疫病 ICB 使用、案例报告。主要工具：article_search（可辅以 article_get
补全元数据），每方面总调用 ≤10 次。

## 方面 2：car_t_cell_therapy — CAR-T 细胞治疗的临床成就与实体瘤挑战

ABSTRACT：聚焦 CAR-T 细胞疗法：anti-CD19 CAR-T 在复发/难治 B 细胞恶性肿瘤
（ALL、DLBCL）中的关键注册性试验与长期随访（如 tisagenlecleucel、axicabtagene
ciloleucel），细胞因子释放综合征（CRS）与神经毒性（ICANS）管理，以及实体瘤拓展
的靶点选择与屏障（TME 异质性、T 细胞耗竭、归巢）。研究条目：(1) 血液肿瘤关键
临床试验；(2) 毒性谱与管理；(3) 实体瘤挑战与新型 CAR 设计（逻辑门、多靶点、
纳米抗体 CAR）。纳入标准：肿瘤 CAR-T（含临床前综述中的实体瘤策略）。排除标准：
非肿瘤 CAR-T（自身免疫病）、TCR-T、TIL 疗法（除非作对照简述）。主要工具：
article_search（可辅以 article_get），总调用 ≤10 次。

## 交付物

- reports/tumor_immunotherapy/checkpoint_inhibitors.md + evidence/checkpoint_inhibitors.jsonl
- reports/tumor_immunotherapy/car_t_cell_therapy.md + evidence/car_t_cell_therapy.jsonl
- reports/tumor_immunotherapy/final_report.md（render 生成编号引用与参考文献）
- reports/tumor_immunotherapy/final_report.html

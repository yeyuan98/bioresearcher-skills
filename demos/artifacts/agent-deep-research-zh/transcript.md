# Transcript — Deep research — tumor immunotherapy survey driven by a Chinese prompt / 深度研究——中文提问的肿瘤免疫治疗文献综述

- Scenario: `agent-deep-research-zh` (kind: agent, lang: zh)
- Outcome: **PASS**
- Session: 2026-09-06T06:10:51.908Z → 2026-09-06T06:24:25.435Z
- Replay: `node demos/run-demo.mjs --only agent-deep-research-zh --publish` (spends LLM tokens; manual-run only)

## Prompt / 提示词

```text
no-interview light-research: 使用 bioresearcher-deep-research 技能，帮我做一个关于肿瘤免疫治疗（tumor immunotherapy）的多方面文献综述并附引用。请用中文撰写报告，引用使用 PMID。
```

## Tool calls (16) / 工具调用

### 1. `skill` — completed

Input:
```json
{"name":"bioresearcher-deep-research"}
```
Output (trimmed):
```text
<skill_content name="bioresearcher-deep-research">
# Skill: bioresearcher-deep-research

# Bioresearcher Deep Research

Reference-based biomedical research: interview the user, split the topic into
research aspects, investigate each aspect with biomcp tools, then synthesize a
succinct, accurately cited report. Harness-agnostic: works with or without a
subagent/Task tool.

## What it does

- Decomposes a biomedical question (disease, drug, gene, variant, trial
  landscape, patent space, dataset) into 2-5 independent research aspects.
- Runs one focused worker per aspect - in parallel via the harness's
… [trimmed 325 more line(s)]
```

### 2. `read` — completed

Input:
```json
{"filePath":"/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/.opencode/skills/bioresearcher-deep-research/references/worker-protocol.md"}
```
Output (trimmed):
```text
<path>/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/.opencode/skills/bioresearcher-deep-research/references/worker-protocol.md</path>
<type>file</type>
<content>
1: # Worker Protocol
2: 
3: The canonical contract for per-aspect research workers - both parallel
4: subagents and the sequential fallback in the main conversation.
5: 
6: ## Overview
7: 
8: Each worker owns exactly ONE research aspect of a TOPIC. It queries biomcp
9: tools, collects identifiers, and writes one markdown file under
10: `reports/<TOPIC>/`. Workers never re-delegate, never fabricate, and never fall
11: back to internal knowledge for facts. Workers also never interview the user -
12: clarification is exclusively the orchestrator's Step 1 (SKILL.md).
… [trimmed 101 more line(s)]
```

### 3. `read` — completed

Input:
```json
{"filePath":"/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/.opencode/skills/bioresearcher-deep-research/references/tool-selection.md"}
```
Output (trimmed):
```text
<path>/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/.opencode/skills/bioresearcher-deep-research/references/tool-selection.md</path>
<type>file</type>
<content>
1: # Tool Selection
2: 
3: Route a research question to the correct biomcp tool, then shape the call with
4: `sections` / `limit` / pagination so payloads stay small.
5: 
6: ## Overview
7: 
8: biomcp (npm `biomcp`, pinned `biomcp@1.1`) exposes 56 tools: 41 core plus 15
9: environment-gated optional tools (3 database, 4 R analysis, 8 biowasm). This
10: file routes question types to tools; per-domain parameter detail lives in the
11: domain reference files.
12: 
… [trimmed 133 more line(s)]
```

### 4. `read` — completed

Input:
```json
{"filePath":"/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/.opencode/skills/bioresearcher-deep-research/references/citations.md"}
```
Output (trimmed):
```text
<path>/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/.opencode/skills/bioresearcher-deep-research/references/citations.md</path>
<type>file</type>
<content>
1: # Citation Formats
2: 
3: Numbered-citation formats per source type, with URL forms.
4: 
5: ## Overview
6: 
7: All findings are cited with numbered in-text markers ([1], [2, 3], [1-5]),
8: numbered by order of appearance, resolved against a bibliography at the end
9: of the document. Each source type has a fixed format so reports stay
10: consistent across workers and aspects.
11: 
12: ## In-text citation forms
… [trimmed 137 more line(s)]
```

### 5. `read` — completed

Input:
```json
{"filePath":"/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/.opencode/skills/bioresearcher-deep-research/references/report-template.md"}
```
Output (trimmed):
```text
<path>/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/.opencode/skills/bioresearcher-deep-research/references/report-template.md</path>
<type>file</type>
<content>
1: # Report Template
2: 
3: Mandatory structure for `final_report.md` (and the per-aspect files, in
4: lighter form). Ported from the bioresearcher agent's report standard.
5: 
6: ## Overview
7: 
8: Every report has exactly SIX mandatory sections, in this order. Every claim
9: carries provenance: a citation [N], a documented data source, or a described
10: analysis method.
11: 
12: ## Mandatory sections
… [trimmed 108 more line(s)]
```

### 6. `todowrite` — completed

Input:
```json
{"todos":[{"content":"Pre-check biomcp server connectivity + create reports/tumor_immunotherapy/.gitkeep","status":"in_progress","priority":"high"},{"content":"Aspect 1 worker: checkpoint_inhibitors (PD-1/PD-L1/CTLA-4 文献)","status":"pending","priority":"high"},{"content":"Aspect 2 worker: cellular_novel_therapies (CAR-T/双特异性/疫苗/溶瘤病毒)","status":"pending","priority":"high"},{"content":"Synthesize final_report.md (中文, PMID 引用, 6-section 结构)","status":"pending","priority":"high"},{"content":"Render final_report.html (uv→python3→pandoc ladder)","status":"pending","priority":"medium"}]}
```
Output (trimmed):
```text
[
  {
    "content": "Pre-check biomcp server connectivity + create reports/tumor_immunotherapy/.gitkeep",
    "status": "in_progress",
    "priority": "high"
  },
  {
    "content": "Aspect 1 worker: checkpoint_inhibitors (PD-1/PD-L1/CTLA-4 文献)",
    "status": "pending",
    "priority": "high"
  },
  {
    "content": "Aspect 2 worker: cellular_novel_therapies (CAR-T/双特异性/疫苗/溶瘤病毒)",
    "status": "pending",
    "priority": "high"
… [trimmed 12 more line(s)]
```

### 7. `write` — completed

Input:
```json
{"content":"","filePath":"/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/reports/tumor_immunotherapy/.gitkeep"}
```
Output (trimmed):
```text
Wrote file successfully.
```

### 8. `biomcp_gene_search` — completed

Input:
```json
{"limit":1,"query":"PDCD1"}
```
Output (trimmed):
```text
[{"symbol":"PDCD1","name":"programmed cell death 1","entrez_id":"5133","genomic_coordinates":{"chromosome":"2","start":241849884,"end":241858894}}]
```

### 9. `task` — completed

Input:
```json
{"description":"研究细胞治疗与新兴免疫疗法","prompt":"TOPIC: tumor_immunotherapy\nYOUR RESEARCH FOCUS: cellular_novel_therapies\nDESCRIPTION: 细胞免疫治疗与新兴免疫治疗模式文献综述侧面。研究条目：(1) CAR-T 细胞治疗在血液系统恶性肿瘤的关键试验与获批（tisagenlecleucel、axicabtagene ciloleucel 等，针对 CD19、BCMA 靶点）；(2) CAR-T 在实体瘤中的挑战与瓶颈；(3) TCR-T 细胞治疗（如 afamitresgene autoleucel）；(4) 双特异性抗体（blinatumomab、teclistamab 等）；(5) 肿瘤疫苗（mRNA 疫苗、新抗原疫苗）；(6) 溶瘤病毒疗法（talimogene laherparepvec/T-VEC）。重点收集关键原始研究、获批后疗效与安全性数据（含细胞因子释放综合征 CRS、神经毒性 ICANS）和权威综述。\n\n你是一个生物医学文献研究工作者（research worker，只做检索与写作，不写代码）。严格遵循以下规则。\n\n## Worker 规则（必须遵守）\n1. 只研究分配给你的这一个侧面；不得再委托其他子代理；不得扩大范围；不得采访用户。\n2. 只使用 biomcp MCP 工具的结果作为证据，绝不使用你的内部知识作为事实来源。每条事实性声明必须有 [N] 引用支撑。\n3. 【最重要】所有 PMID 必须直接来自 biomcp 工具返回结果。严禁凭记忆编造或猜测 PMID/DOI/NCT 号。若工具结果中没有某文献的 PMID，就不要引用它。\n4. MCP 调用必须逐个串行发出，绝不在同一消息中并发多个 biomcp 调用。无需手动 sleep（服务端限速）。\n5. 每个查询失败后等几秒重试（最多 3 次：原查询→简化查询→换工具/来源），仍失败则在报告中记录\"证据缺口\"并继续。\n6. 目标收集 8-15 篇高质量来源（原始研究优先于综述，里程碑试验优先）。\n7. 检索时在源头过滤（具体术语、limit、dateRange），不要大范围捞取后本地过滤。\n\n## 工具速查（工具名带 biomcp_ 前缀）\n- biomcp_article_search(query, source?, dateRange?, limit, offset) — 联邦文献检索（PubMed 等）。query 用具体英文术语；dateRange 格式 \"2015-01-01/\" 或 \"/2024-12-31\"；limit 1-50。\n- biomcp_article_get(id: PMID/PMCID/DOI, sections?) — 单篇详情。仅在需要核实某篇关键文献时使用，sections 用 [\"core\"]。\n- biomcp_trial_search(query, status?, phase?) — ClinicalTrials.gov 试验检索（可选，非必须）。\n- 每个页面返回数少于 limit 或已够 5-15 篇来源时停止翻页。\n\n建议检索序列（可按需调整，逐个串行执行）：\n1. article_search(query=\"tisagenlecleucel CD19 CAR-T leukemia global trial\", limit=8)\n2. article_search(query=\"axicabtagene ciloleucel large B-cell lymphoma ZUMA-1\", limit=8)\n3. article_search(query=\"CAR T cell therapy multiple myeloma BCMA\", limit=8)\n4. article_search(query=\"CAR T cell solid tumor challenges\", limit=8)\n5. article_search(query=\"TCR engineered T cell therapy sarcoma MAGE-A4\", limit=8)\n6. article_search(query=\"blinatumomab bispecific antibody leukemia\", limit=8)\n7. article_search(query=\"mRNA cancer vaccine neoantigen\", limit=8)\n8. article_search(query=\… [trimmed 1099 more char(s)]
```
Output (trimmed):
```text
<task id="ses_f8aa72a4fffe76A2tQ2lNOWzTF" state="completed">
<task_result>
报告已完成。

**输出文件**：`/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/reports/tumor_immunotherapy/cellular_novel_therapies.md`

**收集文献数**：18 篇（6 大主题全覆盖：CAR-T 血液肿瘤、实体瘤挑战、TCR-T、双特异性抗体、肿瘤疫苗、溶瘤病毒，含 CRS/ICANS 跨主题安全性分析及 2 个数据表格）

**PMID 列表**（按引用顺序）：
29385370 (ELIANA), 37880478 (tisa-cel vs SOC), 32045475 (JULIET), 39187161 (ZUMA-1 C3), 39094076 (axi-cel 5 年随访), 40928436 (BCMA CAR-T 综述), 41899614 (BCMA 真实世界 1272 例), 33824268 (Sterner 实体瘤屏障综述), 41472526 (afami-cel 评价), 38554725 (SPEARHEAD-1 原文), 28249141 (TOWER), 41485109 (teclistamab 汇总), 40227780 (teclistamab 真实世界 SLR), 38246194 (KEYNOTE-942), 41971684 (mRNA 疫苗/cevumeran), 32162802 (T-VEC 综述), 31171039 (OPTiM 最终分析), 39065766 (MASTERKEY-265 证据)

**证据缺口**：有 —— ZUMA-1 队列 1/2、JULIET、KarMMa-1/CARTITUDE-1、MajesTEC-1（2022 原始报告）及 MASTERKEY-265 的最初原文未在工具结果中直接返回，相关数据引自已检索到的后续分析/综述；一次 pubmed 源检索返回空结果（已用联邦检索成功替代）。
</task_result>
</task>
```

### 10. `task` — completed

Input:
```json
{"description":"研究检查点抑制剂文献","prompt":"TOPIC: tumor_immunotherapy\nYOUR RESEARCH FOCUS: checkpoint_inhibitors\nDESCRIPTION: 免疫检查点抑制剂（ICB）文献综述侧面。研究条目：(1) CTLA-4 抑制剂 ipilimumab 的里程碑随机试验与总生存获益；(2) PD-1/PD-L1 抑制剂（pembrolizumab、nivolumab、atezolizumab 等）在黑色素瘤、非小细胞肺癌等瘤种的里程碑三期试验；(3) 疗效预测生物标志物：PD-L1 表达、肿瘤突变负荷 TMB、MSI-H/dMMR；(4) 原发与继发耐药机制（综述文献）；(5) 免疫相关不良事件 irAE 及其管理；(6) 联合策略（双免疫联合、化疗联合）。重点收集 2010-2026 年高影响力原始研究与权威综述。\n\n你是一个生物医学文献研究工作者（research worker，只做检索与写作，不写代码）。严格遵循以下规则。\n\n## Worker 规则（必须遵守）\n1. 只研究分配给你的这一个侧面；不得再委托其他子代理；不得扩大范围；不得采访用户。\n2. 只使用 biomcp MCP 工具的结果作为证据，绝不使用你的内部知识作为事实来源。每条事实性声明必须有 [N] 引用支撑。\n3. 【最重要】所有 PMID 必须直接来自 biomcp 工具返回结果。严禁凭记忆编造或猜测 PMID/DOI/NCT 号。若工具结果中没有某文献的 PMID，就不要引用它。\n4. MCP 调用必须逐个串行发出，绝不在同一消息中并发多个 biomcp 调用。无需手动 sleep（服务端限速）。\n5. 每个查询失败后等几秒重试（最多 3 次：原查询→简化查询→换工具/来源），仍失败则在报告中记录\"证据缺口\"并继续。\n6. 目标收集 8-15 篇高质量来源（原始研究优先于综述，里程碑试验优先）。\n7. 检索时在源头过滤（具体术语、limit、dateRange），不要大范围捞取后本地过滤。\n\n## 工具速查（工具名带 biomcp_ 前缀）\n- biomcp_article_search(query, source?, dateRange?, limit, offset) — 联邦文献检索（PubMed 等）。query 用具体英文术语，如 \"ipilimumab overall survival melanoma randomized\"；dateRange 格式 \"2015-01-01/\" 或 \"/2024-12-31\"；limit 1-50。\n- biomcp_article_get(id: PMID/PMCID/DOI, sections?) — 单篇详情。仅在需要核实某篇关键文献时使用，sections 用 [\"core\"]。\n- biomcp_trial_search(query, status?, phase?) — ClinicalTrials.gov 试验检索（可选，非必须）。\n- 每个页面返回数少于 limit 或已够 5-15 篇来源时停止翻页。\n\n建议检索序列（可按需调整，逐个串行执行）：\n1. article_search(query=\"ipilimumab improved survival metastatic melanoma\", limit=8)\n2. article_search(query=\"pembrolizumab nivolumab advanced melanoma survival randomized trial\", limit=8)\n3. article_search(query=\"PD-1 inhibitor non-small cell lung cancer phase 3 overall survival\", limit=8)\n4. article_search(query=\"PD-L1 tumor mutation burden MSI biomarker immunotherapy response\", limit=8)\n5. article_search(query=\"immune checkpoint inhibitor resistance mechanisms review\", dateRange=\"2019-01-01/\", limit=8)\n6. article_search(query=\"immune-related adverse events checkpoint inhibitors… [trimmed 1111 more char(s)]
```
Output (trimmed):
```text
<task id="ses_f8aa75565ffeAcZ7KL2YQ6yFn9" state="completed">
<task_result>
研究任务完成。

**输出文件**：`/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/reports/tumor_immunotherapy/checkpoint_inhibitors.md`

**收集文献数**：16 篇（13 篇原始随机三期试验 + 2 篇经典耐药综述 + 1 篇 SITC irAE 指南），覆盖全部 6 个研究条目。

**PMID 列表**：
20525992（Hodi 2010, ipilimumab 里程碑）· 25891173（KEYNOTE-006）· 26028407（CheckMate-017）· 28636851（CheckMate-026）· 33872070（KEYNOTE-024 5 年）· 37423228（IPSOS atezolizumab）· 33264544 + 35427471（KEYNOTE-177 主/最终）· 37305681（TMB≥10 mut/Mb 验证）· 28187290（Sharma Cell 耐药框架）· 29319049（Jenkins BJC）· 42630122（耐药机制新综述）· 34172516（SITC irAE 指南）· 29562145（CheckMate 214）· 39282897（CheckMate 067 十年）· 36809080（KEYNOTE-189 5 年）

**证据缺口**：有——(1) KEYNOTE-024/189 的 2016/2018 NEJM 首报原文未直接检出，以同试验长期随访文献替代（数据完整）；(2) KEYNOTE-158 TMB 原始分析（Marabelle 2020）未命中，以 Mo 2023 验证研究替代；(3) IMpower130/110 未检出，以 IPSOS 替代；(4) CheckMate-057（非鳞二线）未专门检索；(5) semantic_scholar 源一次限流，已换源解决。所有 6 篇关键文献经 article_get 逐字核实数据。
</task_result>
</task>
```

### 11. `todowrite` — completed

Input:
```json
{"todos":[{"content":"Pre-check biomcp server connectivity + create reports/tumor_immunotherapy/.gitkeep","priority":"high","status":"completed"},{"content":"Aspect 1 worker: checkpoint_inhibitors (PD-1/PD-L1/CTLA-4 文献)","priority":"high","status":"completed"},{"content":"Aspect 2 worker: cellular_novel_therapies (CAR-T/双特异性/疫苗/溶瘤病毒)","priority":"high","status":"completed"},{"content":"Synthesize final_report.md (中文, PMID 引用, 6-section 结构)","priority":"high","status":"in_progress"},{"content":"Render final_report.html (uv→python3→pandoc ladder)","priority":"medium","status":"pending"}]}
```
Output (trimmed):
```text
[
  {
    "content": "Pre-check biomcp server connectivity + create reports/tumor_immunotherapy/.gitkeep",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Aspect 1 worker: checkpoint_inhibitors (PD-1/PD-L1/CTLA-4 文献)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Aspect 2 worker: cellular_novel_therapies (CAR-T/双特异性/疫苗/溶瘤病毒)",
    "status": "completed",
    "priority": "high"
… [trimmed 12 more line(s)]
```

### 12. `read` — completed

Input:
```json
{"filePath":"/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/reports/tumor_immunotherapy/checkpoint_inhibitors.md"}
```
Output (trimmed):
```text
<path>/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/reports/tumor_immunotherapy/checkpoint_inhibitors.md</path>
<type>file</type>
<content>
1: # 免疫检查点抑制剂（TOPIC: tumor_immunotherapy）
2: 
3: Scope: 本侧面聚焦免疫检查点抑制剂（immune checkpoint inhibitors, ICI）文献综述，覆盖六个研究条目：(1) CTLA-4 抑制剂 ipilimumab 的里程碑随机试验与总生存（OS）获益；(2) PD-1/PD-L1 抑制剂（pembrolizumab、nivolumab、atezolizumab）在黑色素瘤与非小细胞肺癌（NSCLC）的里程碑三期试验；(3) 疗效预测生物标志物（PD-L1 表达、肿瘤突变负荷 TMB、MSI-H/dMMR）；(4) 原发与继发耐药机制；(5) 免疫相关不良事件（irAE）及其管理；(6) 联合策略（双免疫联合、化疗联合）。证据时间范围 2010–2026 年，优先纳入高被引原始研究与权威综述/指南，全部文献条目来自 biomcp MCP 工具检索结果。
4: 
5: ## Findings
6: 
7: ### 1. CTLA-4 抑制剂 ipilimumab：首个延长转移性黑色素瘤 OS 的随机三期试验
8: 
9: - Hodi 等 2010 年在 NEJM 发表的 III 期试验（NCT00094653）纳入 676 例 HLA-A*0201 阳性、既往治疗失败的不可切除 III/IV 期黑色素瘤患者，按 3:1:1 随机接受 ipilimumab+gp100 疫苗、ipilimumab 单药或 gp100 单药 [1]。ipilimumab+gp100 组中位 OS 10.0 个月 vs gp100 单药 6.4 个月（死亡 HR 0.68, P<0.001）；ipilimumab 单药中位 OS 10.1 个月（HR 0.66, P=0.003）[1]。这是首个在随机试验中证明免疫检查点阻断可改善转移性黑色素瘤 OS 的研究 [1]。
10: - 该试验同时揭示了 CTLA-4 阻断的毒性特征：ipilimumab 组 3/4 级 irAE 发生率 10–15%（gp100 组 3%），14 例（2.1%）药物相关死亡中 7 例与 irAE 相关；作者强调多数不良事件经恰当处理后可逆 [1]。
11: 
12: ### 2. PD-1/PD-L1 抑制剂：黑色素瘤与 NSCLC 里程碑三期试验
… [trimmed 136 more line(s)]
```

### 13. `read` — completed

Input:
```json
{"filePath":"/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/reports/tumor_immunotherapy/cellular_novel_therapies.md"}
```
Output (trimmed):
```text
<path>/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1/reports/tumor_immunotherapy/cellular_novel_therapies.md</path>
<type>file</type>
<content>
1: # 细胞免疫治疗与新兴免疫治疗模式（TOPIC: tumor_immunotherapy）
2: 
3: Scope: 本侧面系统梳理肿瘤免疫治疗中细胞治疗与新兴模式的关键证据，涵盖：(1) CAR-T 细胞治疗在血液系统恶性肿瘤的关键注册试验与获批后疗效/安全性数据（tisagenlecleucel、axicabtagene ciloleucel，靶点 CD19；idecabtagene vicleucel、ciltacabtagene autoleucel，靶点 BCMA）；(2) CAR-T 在实体瘤中的挑战与瓶颈；(3) TCR-T 细胞治疗（afamitresgene autoleucel）；(4) 双特异性抗体（blinatumomab、teclistamab）；(5) 肿瘤疫苗（个体化新抗原 mRNA 疫苗）；(6) 溶瘤病毒疗法（talimogene laherparepvec/T-VEC）。重点收录里程碑原始研究与权威综述，并汇总细胞因子释放综合征（CRS）与神经毒性（ICANS）数据。全部证据来自 biomcp MCP 工具检索结果。
4: 
5: ## Findings
6: 
7: ### 1. CAR-T 细胞治疗在血液系统恶性肿瘤：关键试验与获批后数据
8: 
9: **Tisagenlecleucel（CD19）**：全球多中心、单臂 II 期注册试验 ELIANA（NCT02435849）纳入 75 例可评估的儿童与年轻成人复发/难治 B 细胞急性淋巴细胞白血病（B-ALL）患者，单次输注后 3 个月内总缓解率为 81%，且所有缓解者微小残留病（MRD）均为阴性；6 个月无事件生存（EFS）与总生存（OS）分别为 73% 与 90%，12 个月时分别为 50% 与 76%；CAR-T 细胞体内持久性最长可达 20 个月 [1]。基于患者水平校正的历史对照比较研究（ELIANA、ENSIGN 与 CCTL019B2001X 三项试验对比德国/奥地利登记库）显示，tisagenlecleucel 对比历史标准治疗显著改善 OS（HR 0.54，95% CI 0.41–0.71，p<0.001），2 年 OS 率为 59.49% 对 36.16%，总缓解率优势比值 OR 为 1.99（p<0.001）[2]。JULIET 研究（NCT02445248）则为 tisagenlecleucel 在成人复发/难治弥漫大 B 细胞淋巴瘤（DLBCL）中的全球 II 期注册研究，其细胞动力学分析（111 例）显示体内扩增程度与 CRS 严重程度及托珠单抗使用相关 [3]。
10: 
11: **Axicabtagene ciloleucel（CD19）**：ZUMA-1 试验安全性扩展队列 3（42 例入组、38 例输注）的 24 个月分析显示，任意级别 CRS 发生率 92%（≥3 级仅 3%），任意级别神经事件（NE）87%（≥3 级 42%），出现 1 例 5 级脑水肿；48 个月随访时中位 OS 为 34.8 个月；值得注意的是，预防性托珠单抗并未被推荐用于预防 CAR-T 相关不良事件，≥3 级神经毒性 CSF 中升高 [4]。真实世界长期随访方面，美国 Lymphoma CAR T Consortium 对 275 例标准治疗（standard-of-care）axi-cel 输注患者中位随访 58 个月的结果显示：5 年 PFS 29%、5 年 OS 40%、5 年淋巴瘤特异性生存 53%；但 5 年非复发死亡率（NRM）达 16.2%，超过半数 NRM 事件发生于 2 年以后，主要死因为感染与继发恶性肿瘤（24 例，9%，其中治疗相关髓系肿瘤 15 例）；≥60 岁患者复发风险更低但 NRM 风险显著更高（OR 4.5，95% CI 2.1–10.8）[5]。
12: 
… [trimmed 103 more line(s)]
```

### 14. `write` — completed

Input:
```json
{"content":"# 肿瘤免疫治疗多方面文献综述\n\nGenerated: 2026-09-06 | TOPIC: tumor_immunotherapy | Scope: 以两份研究侧面（light-research 模式）综述肿瘤免疫治疗的证据基础：免疫检查点抑制剂（ICI）与细胞免疫治疗/新兴免疫治疗模式，引用一律采用 PMID。\n\n## 执行摘要 (Executive Summary)\n\n肿瘤免疫治疗在过去十五年间从晚期黑色素瘤的首个总生存（OS）获益证据 [1]，发展为覆盖多瘤种的主流治疗支柱：PD-1/PD-L1 抑制剂在黑色素瘤、非小细胞肺癌（NSCLC）、微卫星不稳定（MSI-H/dMMR）结直肠癌等瘤种确立了生存优势 [2, 5, 8]，双免疫联合（nivolumab + ipilimumab）在黑色素瘤 10 年随访中位 OS 达 71.9 个月 [15]。与此同时，CAR-T 细胞治疗在血液系统恶性肿瘤实现了持久的完全缓解 [17, 21]，TCR-T [26]、双特异性抗体 [27, 28]、个体化新抗原 mRNA 疫苗 [30] 与溶瘤病毒 [33] 相继取得关键突破。\n\n关键发现：\n\n- CTLA-4 抑制剂 ipilimumab 是首个在随机三期试验中延长转移性黑色素瘤 OS 的免疫检查点抑制剂（中位 OS 10.1 vs 6.4 个月）[1]。\n- PD-1 抑制剂疗效与安全性均优于 CTLA-4：KEYNOTE-006 中 pembrolizumab 对比 ipilimumab 显著改善 PFS 与 OS，3–5 级治疗相关不良事件 10.1%–13.3% vs 19.9% [2]。\n- 生物标志物指导获益人群选择：PD-L1 TPS≥50% [5]、TMB≥10 mut/Mb [7] 与 MSI-H/dMMR [8, 9] 均有随机证据或验证研究支持，但任一单一标志物均不完备（CheckMate-026 阴性结果）[4]。\n- 耐药三分类框架（原发/适应性/获得性）是当前理解 ICI 应答异质性的标准概念体系 [10]。\n- CAR-T 治疗中 tisagenlecleucel 在儿童/年轻成人复发难治 B-ALL 的 3 个月总缓解率达 81%（均 MRD 阴性）[17]；真实世界 axi-cel 5 年 OS 40%，但 5 年非复发死亡率 16.2% 提示远期风险 [21]。\n- TCR-T（afami-cel，SPEARHEAD-1）在滑膜肉瘤/脂肪肉瘤 ORR 37%，实现工程化 T 细胞治疗实体瘤的概念验证 [26]；双特异性抗体 blinatumomab 与 teclistamab 分别在 B-ALL（OS HR 0.71）[27] 与三重暴露骨髓瘤（ORR 66.4%）[28] 获益。\n- 个体化新抗原 mRNA 疫苗联合 pembrolizumab（KEYNOTE-942）无复发生存 HR 0.561 [30]；溶瘤病毒 T-VEC 单药三期试验 DRR 19.0% vs 1.4% [33]，但与 PD-1 联合（MASTERKEY-265）未显示额外获益 [34]。\n\n## 数据来源 (Data Sources)\n\n| 来源 | 类型 | 查询/访问方式 | 访问日期 |\n|---|---|---|---|\n| biomcp_article_search（联邦检索：PubMed/Europe PMC/Semantic Scholar/LitSense） | 文献检索 | 见\"分析方法\"节各侧面查询；每查询 limit 5–8 | 2026-09-06 |\n| biomcp_article_get(sections=[\"core\"]) | 单篇核实 | 核实 8 篇关键文献数据（PMID 20525992、26028407、28636851、29562145、39282897、37305681、29385370、DOI 10.1038/s41408-021-00459-7） | 2026-09-06 |\n\n- 检索范围：2010–2026 年发表的原始研究与权威综述/指南；共纳入 34 篇来源（侧面一 16 篇：13 篇随机三期试验 + 2 篇耐药综述 + 1 篇 SITC 指南；侧面二 18 篇：覆盖 CAR-T、TCR-T、双特异性抗体、肿瘤疫苗、溶瘤病毒六大主题）。\n- 质量说明：优先纳入原始研究与长随访/最终分析；所有 PMID 均直接来自 biomcp 工具返回结果；个别里程碑试验的最初报告未在工具结果中返回，以同试验的后续分析或权威综述替代（详见\"局限性\"）。\n\n## 分析方法 (Analy… [trimmed 16509 more char(s)]
```
Output (trimmed):
```text
Wrote file successfully.
```

### 15. `bash` — completed

Input:
```json
{"command":"uv run --with markdown python .opencode/skills/bioresearcher-deep-research/scripts/markdown-to-html.py reports/tumor_immunotherapy/final_report.md -o reports/tumor_immunotherapy/final_report.html && ls -la reports/tumor_immunotherapy/final_report.html","workdir":"/home/administrator/git/bioresearcher-agent/bioresearcher-skills/demos/.runs/agent-deep-research-zh/20260906-141051-r1"}
```
Output (trimmed):
```text
wrote reports/tumor_immunotherapy/final_report.html
-rw-rw-r-- 1 administrator administrator 30098 Sep  6 14:24 reports/tumor_immunotherapy/final_report.html

```

### 16. `todowrite` — completed

Input:
```json
{"todos":[{"content":"Pre-check biomcp server connectivity + create reports/tumor_immunotherapy/.gitkeep","priority":"high","status":"completed"},{"content":"Aspect 1 worker: checkpoint_inhibitors (PD-1/PD-L1/CTLA-4 文献)","priority":"high","status":"completed"},{"content":"Aspect 2 worker: cellular_novel_therapies (CAR-T/双特异性/疫苗/溶瘤病毒)","priority":"high","status":"completed"},{"content":"Synthesize final_report.md (中文, PMID 引用, 6-section 结构)","priority":"high","status":"completed"},{"content":"Render final_report.html (uv→python3→pandoc ladder)","priority":"medium","status":"completed"}]}
```
Output (trimmed):
```text
[
  {
    "content": "Pre-check biomcp server connectivity + create reports/tumor_immunotherapy/.gitkeep",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Aspect 1 worker: checkpoint_inhibitors (PD-1/PD-L1/CTLA-4 文献)",
    "status": "completed",
    "priority": "high"
  },
  {
    "content": "Aspect 2 worker: cellular_novel_therapies (CAR-T/双特异性/疫苗/溶瘤病毒)",
    "status": "completed",
    "priority": "high"
… [trimmed 12 more line(s)]
```

## Final answer (verbatim) / 最终回答（原文）

文献综述完成。产出文件（`reports/tumor_immunotherapy/`）：

- **final_report.md** — 中文综述（六节结构：执行摘要/数据来源/分析方法/研究发现/局限性/参考文献），34 篇文献统一编号，引用均为 PMID
- **final_report.html** — 渲染版（uv 转换成功，30 KB）
- **checkpoint_inhibitors.md** — 侧面一：ICI 里程碑试验（Hodi 2010、KEYNOTE-006/024/177/189、CheckMate-017/026/214、067 十年随访）、生物标志物（PD-L1/TMB/MSI-H）、耐药框架、irAE 与 SITC 指南
- **cellular_novel_therapies.md** — 侧面二：CAR-T（ELIANA、ZUMA-1、BCMA）、TCR-T（SPEARHEAD-1）、双特异性抗体（TOWER、MajesTEC-1）、mRNA 新抗原疫苗（KEYNOTE-942）、溶瘤病毒（OPTiM）

局限性已在报告中如实记录：light-research 模式仅覆盖两个侧面（LAG-3/TIGIT、微生物组等未涉及）；部分里程碑试验首报原文未在检索结果中返回，以同试验长随访/最终分析文献替代（如 KEYNOTE-024 用 5 年随访 PMID 33872070）。所有 PMID 均直接来自 biomcp 工具结果，无凭记忆引用。

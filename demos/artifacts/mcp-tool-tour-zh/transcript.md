# Probe transcript — MCP tool tour — the BRAF V600E variant-to-trials chain (zh notes) / MCP 工具巡览——BRAF V600E 从变异到临床试验的调用链（中文注释）

- Scenario: `mcp-tool-tour-zh` (kind: mcp-probe, lang: zh) — deterministic stdio JSON-RPC calls, no LLM involved
- Outcome: **PASS**
- Server: biomcp 1.6.0
- Server command: `npx -y -p biomcp@1.6.0 biomcp`
- tools/list exposed 43 tool(s)
- Replay: `node demos/run-demo.mjs --only mcp-tool-tour-zh --publish` (network via npx; token-free)

## Probe calls (4) / 探针调用

### 1. `variant_search` — pass (956 ms)

Step 1 — structured variant lookup for BRAF V600E.
第 1 步——BRAF V600E 的结构化变异检索。

Request:
```json
{
  "gene": "BRAF",
  "hgvsp": "V600E",
  "limit": 3
}
```
Response (excerpt):
```text
[{"id":"rs113488022","gene":"BRAF","hgvs_p":"V600E","hgvs_c":"c.1799T>A","significance":"Pathogenic","gnomad_af":0.00000397994,"cadd_phred":32}]
```

### 2. `gene_get` — pass (775 ms)

Step 2 — gene context for BRAF (core section).
第 2 步——BRAF 基因背景信息（core 摘要部分）。

Request:
```json
{
  "symbol": "BRAF",
  "sections": [
    "core"
  ]
}
```
Response (excerpt):
```text
{"symbol":"BRAF","name":"B-Raf proto-oncogene, serine/threonine kinase","summary":"This gene encodes a protein belonging to the RAF family of serine/threonine protein kinases. This protein plays a role in regulating the MAP kinase/ERK signaling pathway, which affects cell division, differentiation, and secretion. Mutations in this gene, most commonly the V600E mutation, are the most frequently identified cancer-causing mutations in melanoma, and have been identified in various other cancers as well, including non-Hodgkin lymphoma, colorectal cancer, thyroid carcinoma, non-small cell lung carcinoma, hairy cell leukemia and adenocarcinoma of lung. Mutations in this gene are also associated with cardiofaciocutaneous, Noonan, and Costello syndromes, which exhibit overlapping phenotypes. A pseudogene of this gene has been identified on the X chromosome. [provided by RefSeq, Aug 2017].","chromosome":"7","position":"140719327-140925199"}
```

### 3. `gene_drugs` — pass (1318 ms)

Step 3 — drugs targeting BRAF (OpenTargets; response is an envelope {results, warnings?, errors?}).
第 3 步——作用于 BRAF 靶点的药物（OpenTargets；响应为 {results, warnings?, errors?} 信封）。

Request:
```json
{
  "symbol": "BRAF"
}
```
Response (excerpt):
```text
{"results":[{"drug_name":"SORAFENIB TOSYLATE","source":"opentargets","action_type":"Small molecule","phase":"APPROVAL","report_count":76},{"drug_name":"TOVORAFENIB","source":"opentargets","action_type":"Small molecule","phase":"APPROVAL","report_count":20},{"drug_name":"DABRAFENIB MESYLATE","source":"opentargets","action_type":"Small molecule","phase":"APPROVAL","report_count":4},{"drug_name":"REGORAFENIB","source":"opentargets","action_type":"Small molecule","phase":"PHASE_4","report_count":284},{"drug_name":"VEMURAFENIB","source":"opentargets","action_type":"Small molecule","phase":"PHASE_4","report_count":156},{"drug_name":"ENCORAFENIB","source":"opentargets","action_type":"Small molecule","phase":"PHASE_4","report_count":95},{"drug_name":"NAPORAFENIB","source":"opentargets","action_type":"Small molecule","phase":"PHASE_3","report_count":9},{"drug_name":"PLIXORAFENIB","source":"opentargets","action_type":"Small molecule","phase":"PHASE_2","report_count":7},{"drug_name":"BELVARAFENIB","source":"opentargets","action_type":"Small molecule","phase":"PHASE_2","report_count":4},{"drug_name":"RAF-265","source":"opentargets","action_type":"Small molecule","phase":"PHASE_2","report_count":3},{"drug_name":"LIFIRAFENIB","source":"opentargets","action_type":"Small molecule","phase":"PHASE_1_2","report_count":5},{"drug_name":"CEP-32496","source":"opentargets","action_type":"Small molecule","phase":"PHASE_1_2","report_count":4},{"drug_name":"XL-281","source":"opentargets","action_type":"Small molecule","phase":"PHASE_1_2","report_count":4},{"drug_name":"RG-7256","source":"opentargets","action_type":"Unknown","phase":"PHASE_1","report_count":3},{"drug_name":"ARQ-736","source":"opentargets","action_type":"Small molecule","phase":"PHASE_1","report_count":2},{"drug_name":"LY-3009120","source":"opentargets","action_type":"Small molecule","phase":"PHASE_1","report_count":2}]}
```

### 4. `trial_search` — pass (1086 ms)

Step 4 — interventional trials touching BRAF melanoma.
第 4 步——涉及 BRAF 黑色素瘤的介入性临床试验。

Request:
```json
{
  "query": "BRAF melanoma",
  "limit": 3
}
```
Response (excerpt):
```text
{"studies":[{"nct_id":"NCT01876212","title":"Dendritic Cell Vaccines + Dasatinib for Metastatic Melanoma","status":"COMPLETED","phase":["PHASE2"],"conditions":["Metastatic Melanoma"],"interventions":["BIOLOGICAL: DC vaccine","DRUG: Dasatinib"],"sponsor":"Walter J. Storkus"},{"nct_id":"NCT04310397","title":"Dabrafenib, Trametinib, and Spartalizumab for the Treatment of BRAF V600E or V600K Mutation Positive Stage IIIB/C/D Melanoma","status":"TERMINATED","phase":["PHASE2"],"conditions":["Pathologic Stage IIIB Cutaneous Melanoma AJCC v8","Pathologic Stage IIIC Cutaneous Melanoma AJCC v8","Pathologic Stage IIID Cutaneous Melanoma AJCC v8"],"interventions":["DRUG: Dabrafenib","BIOLOGICAL: Spartalizumab","PROCEDURE: Therapeutic Conventional Surgery","DRUG: Trametinib"],"sponsor":"M.D. Anderson Cancer Center"},{"nct_id":"NCT01271803","title":"A Study of Vemurafenib and GDC-0973 (Cobimetinib) in Participants With BRAFV600E Mutation-Positive Metastatic Melanoma","status":"COMPLETED","phase":["PHASE1"],"conditions":["Malignant Melanoma"],"interventions":["DRUG: Cobimetinib","DRUG: vemurafenib"],"sponsor":"Hoffmann-La Roche"}],"nextPageToken":"ZVNj7o2Elu8o3lpzTIj75q2tmpOQJJxuZ_Wk2fUW"}
```

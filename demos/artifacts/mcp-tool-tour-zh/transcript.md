# Probe transcript — MCP tool tour — the BRAF V600E variant-to-trials chain (zh notes) / MCP 工具巡览——BRAF V600E 从变异到临床试验的调用链（中文注释）

- Scenario: `mcp-tool-tour-zh` (kind: mcp-probe, lang: zh) — deterministic stdio JSON-RPC calls, no LLM involved
- Outcome: **PASS**
- Server: biomcp 1.4.0
- Server command: `npx -y -p biomcp@1.4.0 biomcp`
- tools/list exposed 41 tool(s)
- Replay: `node demos/run-demo.mjs --only mcp-tool-tour-zh --publish` (network via npx; token-free)

## Probe calls (4) / 探针调用

### 1. `variant_search` — pass (2028 ms)

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
[{"id":"rs113488022","gene":"BRAF","hgvs_p":"V600E","hgvs_c":"c.1799T>A","significance":"Pathogenic","gnomad_af":0.00000397994}]
```

### 2. `gene_get` — pass (1392 ms)

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

### 3. `gene_drugs` — pass (2297 ms)

Step 3 — drugs targeting BRAF.
第 3 步——作用于 BRAF 靶点的药物。

Request:
```json
{
  "symbol": "BRAF"
}
```
Response (excerpt):
```text
[{"drug_name":"BELVARAFENIB","source":"opentargets","action_type":"Small molecule"},{"drug_name":"PLIXORAFENIB","source":"opentargets","action_type":"Small molecule"},{"drug_name":"SORAFENIB","source":"opentargets","action_type":"Small molecule"},{"drug_name":"REGORAFENIB","source":"opentargets","action_type":"Small molecule"},{"drug_name":"TOVORAFENIB","source":"opentargets","action_type":"Small molecule"},{"drug_name":"DABRAFENIB MESYLATE","source":"opentargets","action_type":"Small molecule"},{"drug_name":"XL-281","source":"opentargets","action_type":"Small molecule"},{"drug_name":"DABRAFENIB","source":"opentargets","action_type":"Small molecule"},{"drug_name":"RG-7256","source":"opentargets","action_type":"Unknown"},{"drug_name":"LIFIRAFENIB","source":"opentargets","action_type":"Small molecule"},{"drug_name":"NAPORAFENIB","source":"opentargets","action_type":"Small molecule"},{"drug_name":"ENCORAFENIB","source":"opentargets","action_type":"Small molecule"},{"drug_name":"CEP-32496","source":"opentargets","action_type":"Small molecule"},{"drug_name":"SORAFENIB TOSYLATE","source":"opentargets","action_type":"Small molecule"},{"drug_name":"VEMURAFENIB","source":"opentargets","action_type":"Small molecule"},{"drug_name":"RAF-265","source":"opentargets","action_type":"Small molecule"},{"drug_name":"ARQ-736","source":"opentargets","action_type":"Small molecule"},{"drug_name":"LY-3009120","source":"opentargets","action_type":"Small molecule"}]
```

### 4. `trial_search` — pass (2061 ms)

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
{"studies":[{"nct_id":"NCT03415126","title":"A Study of ASN007 in Patients With Advanced Solid Tumors","status":"COMPLETED","interventions":["DRUG: ASN007: ascending doses","DRUG: ASN007 RD"]},{"nct_id":"NCT03898908","title":"Encorafenib and Binimetinib Before Local Treatment in Patients With BRAF Mutant Melanoma Metastatic to the Brain","status":"COMPLETED","interventions":["DRUG: encorafenib","DRUG: binimetinib","RADIATION: Whole brain radiation therapy","RADIATION: Radiosurgery/stereotactic radiosurgery"]},{"nct_id":"NCT05263453","title":"HL-085+Vemurafenib to Treat Advanced Melanoma Patients With BRAF V600E/K Mutation","status":"UNKNOWN","interventions":["DRUG: HL-085","DRUG: Vemurafenib"]}],"nextPageToken":"ZVt07cGHkvI2wRk2CJf6_LLtz5GYPNRrd7KrgP4ZmTuSu_E"}
```

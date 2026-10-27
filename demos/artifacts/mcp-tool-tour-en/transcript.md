# Probe transcript — MCP tool tour — true request/response pairs from 8 core tools / MCP 工具巡览——8 个核心工具的真实请求/响应样本

- Scenario: `mcp-tool-tour-en` (kind: mcp-probe, lang: en) — deterministic stdio JSON-RPC calls, no LLM involved
- Outcome: **PASS**
- Server: biomcp 1.6.0
- Server command: `npx -y -p biomcp@1.6.0 biomcp`
- tools/list exposed 43 tool(s)
- Replay: `node demos/run-demo.mjs --only mcp-tool-tour-en --publish` (network via npx; token-free)

## Probe calls (8) / 探针调用

### 1. `article_search` — pass (15075 ms)

Federated article search (PubMed + Europe PMC / Semantic Scholar / arXiv / PubTator / LitSense; response is an envelope {results, warnings?, errors?}); returns PMIDs + titles.
联邦文献检索（PubMed + Europe PMC / Semantic Scholar / arXiv / PubTator / LitSense，响应为 {results, warnings?, errors?} 信封），返回 PMID 与标题。

Request:
```json
{
  "query": "BRCA1 DNA repair",
  "limit": 3
}
```
Response (excerpt):
```text
{"results":[{"pmid":"37272060","pmcid":"PMC10243389","doi":"10.1080/15476286.2023.2220210","title":"Hybrid-seq deciphers the complex transcriptional profile of the human BRCA1 DNA repair associated gene.","authors":["Adamopoulos PG","Athanasopoulou K","Boti MA","Dimitroulis G","Daneva GN","Tsiakanikas P","Scorilas A."],"journal":"RNA Biol","journal_issn":"1547-6286","volume":"20","issue":"1","pages":"281-295","publication_date":"2023-01-01","cited_by":4,"is_open_access":true,"source":"europepmc"},{"pmid":"15546503","pmcid":"PMC11159131","doi":"10.1111/j.1349-7006.2004.tb02195.x","title":"Role of BRCA1 and BRCA2 as regulators of DNA repair, transcription, and cell cycle in response to DNA damage.","abstract":"BRCA1 (BReast-CAncer susceptibility gene 1) and BRCA2 are tumor suppressor genes, the mutant phenotypes of which predispose to breast and ovarian cancers. Intensive research has shown that BRCA proteins are involved in a multitude of pivotal cellular processes. In particular, both genes contribute to DNA repair and transcriptional regulation in response to DNA damage. Recent studies suggest that BRCA proteins are required for maintenance of chromosomal stability, thereby protecting the genome from damage. New data also show that BRCAs transcriptionally regulate some genes involved in DNA repair, the cell cycle, and apoptosis. Many of these functions are mediated by a large number of cellular proteins that interact with BRCAs. The functions of BRCA proteins are also linked to distinct and specific phosphorylation events; however, the extent to which phosphorylation-activated molecular pathways contribute to tumor suppressor activity remains unclear. Finally, the reasons why mutations in BRCA genes lead to the development of breast and ovarian cancers are not clearly understood. Elucidation of the precise molecular functions of BRCAs is expected to improve our understanding of hereditary as well as sporadic mammary carcinogenesis.","authors":["Yoshida Kiyotsugu","… [trimmed 3448 more char(s)]
```

### 2. `gene_get` — pass (842 ms)

Gene detail by HGNC symbol with section filtering (core summary here); 16 sections available.
按 HGNC 符号查询基因详情，可按 section 裁剪（此处 core 摘要）；共支持 16 个 section。

Request:
```json
{
  "symbol": "BRCA1",
  "sections": [
    "core"
  ]
}
```
Response (excerpt):
```text
{"symbol":"BRCA1","name":"BRCA1 DNA repair associated","summary":"This gene encodes a 190 kD nuclear phosphoprotein that plays a role in maintaining genomic stability, and it also acts as a tumor suppressor. The BRCA1 gene contains 22 exons spanning about 110 kb of DNA. The encoded protein combines with other tumor suppressors, DNA damage sensors, and signal transducers to form a large multi-subunit protein complex known as the BRCA1-associated genome surveillance complex (BASC). This gene product associates with RNA polymerase II, and through the C-terminal domain, also interacts with histone deacetylase complexes. This protein thus plays a role in transcription, DNA repair of double-stranded breaks, and recombination. Mutations in this gene are responsible for approximately 40% of inherited breast cancers and more than 80% of inherited breast and ovarian cancers. Alternative splicing plays a role in modulating the subcellular localization and physiological function of this gene. Many alternatively spliced transcript variants, some of which are disease-associated mutations, have been described for this gene, but the full-length natures of only some of these variants has been described. A related pseudogene, which is also located on chromosome 17, has been identified. [provided by RefSeq, May 2020].","chromosome":"17","position":"43044292-43170245"}
```

### 3. `variant_search` — pass (939 ms)

Structured variant query: gene + protein change (NEVER compound free text like "BRAF V600E").
结构化变异检索：gene + 蛋白变化（切勿使用 “BRAF V600E” 这类复合自由文本）。

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

### 4. `trial_search` — pass (1130 ms)

ClinicalTrials.gov search returning NCT IDs.
ClinicalTrials.gov 检索，返回 NCT 编号。

Request:
```json
{
  "query": "melanoma",
  "phase": "Phase 3",
  "limit": 3
}
```
Response (excerpt):
```text
{"studies":[{"nct_id":"NCT00779714","title":"Comparative Study of Individualized Sensitivity-Directed Chemotherapy Versus DTIC","status":"UNKNOWN","phase":["PHASE3"],"conditions":["Melanoma"],"interventions":["DRUG: DTIC (dacarbazine)","DRUG: paclitaxel + cisplatin","DRUG: treosulfan + cytarabine"],"sponsor":"University of Wuerzburg"},{"nct_id":"NCT06581406","title":"A Randomized, Phase 2/3 Study to Investigate the Efficacy and Safety of RP2 in Combination With Nivolumab in Immune Checkpoint Inhibitor-Naïve Adult Patients With Metastatic Uveal Melanoma","status":"RECRUITING","phase":["PHASE2","PHASE3"],"conditions":["Metastatic Uveal Melanoma"],"interventions":["BIOLOGICAL: RP2","BIOLOGICAL: Ipilimumab","BIOLOGICAL: Nivolumab"],"sponsor":"Replimune, Inc."},{"nct_id":"NCT01013623","title":"Stage IV Surgery Versus Best Medical Therapy","status":"TERMINATED","phase":["PHASE3"],"conditions":["Stage IV Resectable Melanoma"],"interventions":["PROCEDURE: Surgery","PROCEDURE: Surgery plus 2 adjuvant doses of BCG","OTHER: best medical therapy"],"sponsor":"Saint John's Cancer Institute"}],"nextPageToken":"ZVNj7o2Elu8o3lpzTIj75q2tmpOQJJxpbfeh3_g"}
```

### 5. `disease_search` — pass (1064 ms)

Disease ontology search (DOID/MONDO identifiers).
疾病本体检索（DOID/MONDO 标识符）。

Request:
```json
{
  "query": "melanoma",
  "limit": 3
}
```
Response (excerpt):
```text
{"results":[{"name":"esophageal melanoma","disease_id":"MONDO:0001192","doid":"DOID:1108"},{"name":"leptomeningeal melanoma","disease_id":"MONDO:0003761","doid":"DOID:6085"},{"name":"vaginal melanoma","disease_id":"MONDO:0006489"}]}
```

### 6. `patent_search` — pass (40358 ms)

Patent search (keyless: USPTO Public Search full-text 'ppubs' default US backend + Google Patents worldwide best-effort; EPO OPS / USPTO ODP backends activate with credentials; response is an envelope {patents, warnings?, errors?}), publication numbers like US11027025B2.
专利检索（免密钥：默认走 USPTO Public Search 全文 'ppubs' 美国后端 + Google Patents 全球尽力而为；配置凭证后启用 EPO OPS / USPTO ODP 后端；响应为 {patents, warnings?, errors?} 信封），返回如 US11027025B2 的公开号。

Request:
```json
{
  "query": "\"mRNA display\"",
  "limit": 3
}
```
Response (excerpt):
```text
{"patents":[{"publication_number":"US20230125614A1","title":"IN VIVO mRNA DISPLAY: LARGE-SCALE PROTEOMICS BY NEXT GENERATION SEQUENCING","publication_date":"2023-04-27","filing_date":"2021-03-05","assignee":["The Trustees of Columbia University in the City of New York"],"applicant":["The Trustees of Columbia University in the City of New York"],"cpc_codes":["C12N15/1062"],"status":"application","relevance_score":13.195778,"source":"ppubs"},{"publication_number":"US20140179551A1","title":"METHODS FOR THE SELECTION OF BINDING PROTEINS","publication_date":"2014-06-26","filing_date":"2012-05-16","assignee":["BRISTOL-MYERS SQUIBB COMPANY"],"applicant":["BRISTOL-MYERS SQUIBB COMPANY"],"cpc_codes":["C12N15/1037","C40B30/04","G01N33/6845"],"status":"application","relevance_score":13.163077,"source":"ppubs"},{"publication_number":"US9347058B2","title":"Methods for the selection of binding proteins","publication_date":"2016-05-24","filing_date":"2012-05-16","assignee":["Bristol-Myers Squibb Company"],"applicant":["Lipovsek; Dasa"],"cpc_codes":["C12N15/1037","C40B30/04","G01N33/6845"],"status":"granted","relevance_score":13.157136,"source":"ppubs"}],"total_hits":{"ppubs":1847},"errors":[{"source":"google_patents","message":"Search on source 'google_patents' failed: fetch failed (UND_ERR_CONNECT_TIMEOUT)"}],"total_hits_basis":{"ppubs":"matching US document families"},"seminal_prior_art":[{"publication_number":"WO1998/031700","co_cited_by":7,"cited_by":["US6841359B2","US7138253B2","US12474340B2","US9284548B2","US11970694B2","US11286481B2","US10195578B2"],"note":"PCT publication; national-phase equivalents (e.g. US grants) could not be resolved automatically. Try patent_get with \"family\", patent_search on the inventor name, or search this number externally."}],"mined_count":10}
```

### 7. `gtex_expression` — pass (1541 ms)

GTEx expression: top tissues for a gene (highest expression first).
GTEx 表达查询：基因表达量最高的组织（降序）。

Request:
```json
{
  "gene": "TP53",
  "limit": 5
}
```
Response (excerpt):
```text
{"gene_symbol":"TP53","gencode_id":"ENSG00000141510.19","dataset":"gtex_v11","unit":"TPM","tissues":[{"tissue":"Cells_EBV-transformed_lymphocytes","median_tpm":54.4686,"ontology_id":"EFO:0000572"},{"tissue":"Skin_Sun_Exposed_Lower_leg","median_tpm":25.8191,"ontology_id":"UBERON:8480050"},{"tissue":"Ovary","median_tpm":24.8206,"ontology_id":"UBERON:0000992"},{"tissue":"Skin_Not_Sun_Exposed_Suprapubic","median_tpm":24.4714,"ontology_id":"UBERON:0036149"},{"tissue":"Cells_Cultured_fibroblasts","median_tpm":23.6733,"ontology_id":"EFO:0002009"}]}
```

### 8. `pdb` — pass (2130 ms)

PDB structure search with metadata sections (4-character PDB IDs).
PDB 结构检索，可按 section 取元数据（4 字符 PDB 编号）。

Request:
```json
{
  "query": "KRAS",
  "sections": [
    "experiment"
  ]
}
```
Response (excerpt):
```text
[{"pdb_id":"6N65","score":1,"summary":{"pdb_id":"6N65","title":"KRAS G-quadruplex G16T mutant.","experimental_method":"X-RAY DIFFRACTION","resolution":1.6,"molecular_weight":14.17,"polymer_count":1,"polymer_composition":"DNA","deposition_date":"2018-11-25T00:00:00.000+00:00","release_date":"2020-04-15T00:00:00.000+00:00","doi":"10.1093/nar/gkaa262","pmid":32313953,"authors":["Schmidberger, J.W.","Ou, A.","Smith, N.M.","Iyer, K.S.","Bond, C.S."],"space_group":"P 1 21 1","unit_cell":{"a":33.693,"b":30.127,"c":52.97,"alpha":90,"beta":94.51,"gamma":90},"container_ids":{"polymer_entity_ids":["1"],"non_polymer_entity_ids":["2"],"assembly_ids":["1"]}}},{"pdb_id":"6SUU","score":0.9617681675959565,"summary":{"pdb_id":"6SUU","title":"NMR structure of KRAS32R G9T conformer G-quadruplex within KRAS promoter region","experimental_method":"SOLUTION NMR","molecular_weight":10.32,"polymer_count":1,"polymer_composition":"DNA","deposition_date":"2019-09-16T00:00:00.000+00:00","release_date":"2020-02-05T00:00:00.000+00:00","doi":"10.1093/nar/gkaa387","pmid":32432667,"authors":["Marquevielle, J.","Salgado, G."],"container_ids":{"polymer_entity_ids":["1"],"non_polymer_entity_ids":["2"],"assembly_ids":["1"]}}},{"pdb_id":"6T2G","score":0.9617681675959565,"summary":{"pdb_id":"6T2G","title":"NMR structure of KRAS32R G25T conformer G-quadruplex within KRAS promoter region","experimental_method":"SOLUTION NMR","molecular_weight":10.32,"polymer_count":1,"polymer_composition":"DNA","deposition_date":"2019-10-08T00:00:00.000+00:00","release_date":"2020-02-05T00:00:00.000+00:00","doi":"10.1093/nar/gkaa387","pmid":32432667,"authors":["Marquevielle, J.","Salgado, G."],"container_ids":{"polymer_entity_ids":["1"],"non_polymer_entity_ids":["2"],"assembly_ids":["1"]}}},{"pdb_id":"6T51","score":0.9617681675959565,"summary":{"pdb_id":"6T51","title":"NMR structure of KRAS22RT G-quadruplex forming within KRAS promoter region at physological temperature","experimental_method":"SOLUTION NMR","molecular_weigh… [trimmed 4212 more char(s)]
```

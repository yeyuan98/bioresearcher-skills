# Probe transcript — MCP tool tour — true request/response pairs from 8 core tools / MCP 工具巡览——8 个核心工具的真实请求/响应样本

- Scenario: `mcp-tool-tour-en` (kind: mcp-probe, lang: en) — deterministic stdio JSON-RPC calls, no LLM involved
- Outcome: **PASS**
- Server: biomcp 1.4.0
- Server command: `npx -y -p biomcp@1.4.0 biomcp`
- tools/list exposed 41 tool(s)
- Replay: `node demos/run-demo.mjs --only mcp-tool-tour-en --publish` (network via npx; token-free)

## Probe calls (8) / 探针调用

### 1. `article_search` — pass (4453 ms)

PubMed (federated with Europe PMC / Semantic Scholar / PubTator / LitSense) article search; returns PMIDs + titles.
PubMed 文献检索（联合 Europe PMC / Semantic Scholar / PubTator / LitSense），返回 PMID 与标题。

Request:
```json
{
  "query": "BRCA1 DNA repair",
  "limit": 3
}
```
Response (excerpt):
```text
[{"pmid":"37272060","pmcid":"PMC10243389","doi":"10.1080/15476286.2023.2220210","title":"Hybrid-seq deciphers the complex transcriptional profile of the human <i>BRCA1</i> DNA repair associated gene.","authors":["Adamopoulos PG","Athanasopoulou K","Boti MA","Dimitroulis G","Daneva GN","Tsiakanikas P","Scorilas A."],"journal":"RNA Biol","volume":"20","issue":"1","pages":"281-295","publication_date":"2023-01-01","cited_by":4,"is_open_access":true,"source":"europepmc"},{"pmid":"42715328","doi":"10.1126/sciadv.aeg1097","title":"GSK3β and Plk1 sequentially phosphorylate ATP-citrate lyase to promote homologous recombination.","abstract":"Accurate repair of DNA double-strand breaks (DSBs) by homologous recombination (HR) is essential for genome stability. Nuclear production of acetyl-coenzyme A (acetyl-CoA) by ATP-citrate lyase (ACLY) promotes HR, yet how ACLY is regulated during the DNA damage response (DDR) remains unclear. Here, we identify a phosphorylation-dependent signaling axis in which glycogen synthase kinase 3β (GSK3β) and Polo-like kinase 1 (Plk1) act sequentially on ACLY to facilitate HR-mediated repair of DSBs induced by ionizing radiation. Following AKT-dependent phosphorylation of ACLY at Ser, GSK3β phosphorylates ACLY at Thr, generating a docking site for Plk1, which in turn phosphorylates ACLY at Ser. This phosphorylation cascade, enhanced by radiation, sustains histone acetylation, supports the accumulation of BRCA1 and RAD51 at DSBs, and confers cellular resistance to poly(ADP-ribose) polymerase (PARP) inhibition. Together, our findings define an AKT-GSK3β-Plk1-ACLY signaling module that links the DDR to nuclear metabolism, revealing a critical mechanism by which kinase signaling facilitates acetyl-CoA-dependent chromatin remodeling to preserve genome integrity.","authors":["Zhou Shinan","Zhou Xinyu","Chen Qinfu","Yuan Xueying","Zhu Shukai","Huang Jun","Wang Fangwei","Yan Haiyan"],"journal":"Sci Adv","volume":"12","issue":"37","pages":"eaeg1097","public… [trimmed 3383 more char(s)]
```

### 2. `gene_get` — pass (1570 ms)

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

### 3. `variant_search` — pass (2277 ms)

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
[{"id":"rs113488022","gene":"BRAF","hgvs_p":"V600E","hgvs_c":"c.1799T>A","significance":"Pathogenic","gnomad_af":0.00000397994}]
```

### 4. `trial_search` — pass (1767 ms)

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
{"studies":[{"nct_id":"NCT03068455","title":"An Investigational Immuno-therapy Study of Nivolumab Combined With Ipilimumab Compared to Nivolumab by Itself After Complete Surgical Removal of Stage IIIb/c/d or Stage IV Melanoma","status":"COMPLETED","interventions":["BIOLOGICAL: nivolumab","BIOLOGICAL: ipilimumab"]},{"nct_id":"NCT05783882","title":"Prolgolimab 250 mg Q3W in Patients With Unresectable or Metastatic Melanoma","status":"UNKNOWN","interventions":["DRUG: Prolgolimab"]},{"nct_id":"NCT02938299","title":"Neoadjuvant L19IL2/L19TNF- Pivotal Study","status":"ACTIVE_NOT_RECRUITING","interventions":["DRUG: L19IL2 + L19TNF","PROCEDURE: Surgery"]}],"nextPageToken":"ZVt07cGHkvI2wRk2CJf6_LLtz5GYPNRrd7KrgP4TlDqatA"}
```

### 5. `disease_search` — pass (2492 ms)

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
[{"name":"esophageal melanoma","disease_id":"MONDO:0001192","doid":"DOID:1108"},{"name":"leptomeningeal melanoma","disease_id":"MONDO:0003761","doid":"DOID:6085"},{"name":"vaginal melanoma","disease_id":"MONDO:0006489"}]
```

### 6. `patent_search` — pass (18654 ms)

Patent search (Google Patents backend keyless; EPO OPS / USPTO backends activate with credentials), publication numbers like US11027025B2.
专利检索（免密钥走 Google Patents 后端；配置凭证后启用 EPO OPS / USPTO 后端），返回如 US11027025B2 的公开号。

Request:
```json
{
  "query": "\"mRNA display\"",
  "limit": 3
}
```
Response (excerpt):
```text
{"patents":[{"publication_number":"US20140179551A1","title":"METHODS FOR THE SELECTION OF BINDING PROTEINS","publication_date":"2014-06-26","filing_date":"2012-05-16","assignee":["BRISTOL-MYERS SQUIBB COMPANY"],"applicant":["BRISTOL-MYERS SQUIBB COMPANY"],"cpc_codes":["C12N15/1037","C40B30/04","G01N33/6845"],"status":"application","relevance_score":13.290792,"source":"ppubs"},{"publication_number":"US20160237423A1","title":"METHODS FOR THE SELECTION OF BINDING PROTEINS","publication_date":"2016-08-18","filing_date":"2016-04-29","assignee":["BRISTOL-MYERS SQUIBB COMPANY"],"applicant":["BRISTOL-MYERS SQUIBB COMPANY"],"cpc_codes":["C12N15/1037","C40B30/04","G01N33/6845"],"status":"application","relevance_score":13.290792,"source":"ppubs"},{"publication_number":"US9347058B2","title":"Methods for the selection of binding proteins","publication_date":"2016-05-24","filing_date":"2012-05-16","assignee":["Bristol-Myers Squibb Company"],"applicant":["Lipovsek; Dasa"],"cpc_codes":["C12N15/1037","C40B30/04","G01N33/6845"],"status":"granted","relevance_score":13.284651,"source":"ppubs"}],"total_hits":{"google_patents":11548,"ppubs":1832},"total_hits_basis":{"google_patents":"approximate","ppubs":"matching US document families"},"seminal_prior_art":[{"publication_number":"US6518018B1","co_cited_by":7,"cited_by":["US12474340B2","US6841359B2","US7138253B2","US11970694B2","US9284548B2","US11286481B2","US10195578B2"],"note":"US family member of WO1998/031700 (the co-cited PCT form), resolved via Google Patents.","title":"Selection of proteins using rna-protein fusions \n       ","assignee":"General Hospital Corp"}],"mined_count":10}
```

### 7. `gtex_expression` — pass (2953 ms)

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
{"gene_symbol":"TP53","gencode_id":"ENSG00000141510.18","dataset":"gtex_v10","unit":"TPM","tissues":[{"tissue":"Cells_EBV-transformed_lymphocytes","median_tpm":77.4845,"ontology_id":"EFO:0000572"},{"tissue":"Skin_Sun_Exposed_Lower_leg","median_tpm":37.4491,"ontology_id":"UBERON:0004264"},{"tissue":"Skin_Not_Sun_Exposed_Suprapubic","median_tpm":35.3415,"ontology_id":"UBERON:0036149"},{"tissue":"Cells_Cultured_fibroblasts","median_tpm":33.3962,"ontology_id":"EFO:0002009"},{"tissue":"Ovary","median_tpm":33.0791,"ontology_id":"UBERON:0000992"}]}
```

### 8. `pdb` — pass (3144 ms)

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
[{"pdb_id":"6N65","score":1,"summary":{"pdb_id":"6N65","title":"KRAS G-quadruplex G16T mutant.","experimental_method":"X-RAY DIFFRACTION","resolution":1.6,"molecular_weight":14.17,"polymer_count":1,"polymer_composition":"DNA","deposition_date":"2018-11-25T00:00:00.000+00:00","release_date":"2020-04-15T00:00:00.000+00:00","doi":"10.1093/nar/gkaa262","pmid":32313953,"authors":["Schmidberger, J.W.","Ou, A.","Smith, N.M.","Iyer, K.S.","Bond, C.S."],"space_group":"P 1 21 1","unit_cell":{"a":33.693,"b":30.127,"c":52.97,"alpha":90,"beta":94.51,"gamma":90},"container_ids":{"polymer_entity_ids":["1"],"non_polymer_entity_ids":["2"],"assembly_ids":["1"]}}},{"pdb_id":"6SUU","score":0.9617757817261462,"summary":{"pdb_id":"6SUU","title":"NMR structure of KRAS32R G9T conformer G-quadruplex within KRAS promoter region","experimental_method":"SOLUTION NMR","molecular_weight":10.32,"polymer_count":1,"polymer_composition":"DNA","deposition_date":"2019-09-16T00:00:00.000+00:00","release_date":"2020-02-05T00:00:00.000+00:00","doi":"10.1093/nar/gkaa387","pmid":32432667,"authors":["Marquevielle, J.","Salgado, G."],"container_ids":{"polymer_entity_ids":["1"],"non_polymer_entity_ids":["2"],"assembly_ids":["1"]}}},{"pdb_id":"6T2G","score":0.9617757817261462,"summary":{"pdb_id":"6T2G","title":"NMR structure of KRAS32R G25T conformer G-quadruplex within KRAS promoter region","experimental_method":"SOLUTION NMR","molecular_weight":10.32,"polymer_count":1,"polymer_composition":"DNA","deposition_date":"2019-10-08T00:00:00.000+00:00","release_date":"2020-02-05T00:00:00.000+00:00","doi":"10.1093/nar/gkaa387","pmid":32432667,"authors":["Marquevielle, J.","Salgado, G."],"container_ids":{"polymer_entity_ids":["1"],"non_polymer_entity_ids":["2"],"assembly_ids":["1"]}}},{"pdb_id":"6T51","score":0.9617757817261462,"summary":{"pdb_id":"6T51","title":"NMR structure of KRAS22RT G-quadruplex forming within KRAS promoter region at physological temperature","experimental_method":"SOLUTION NMR","molecular_weigh… [trimmed 4087 more char(s)]
```

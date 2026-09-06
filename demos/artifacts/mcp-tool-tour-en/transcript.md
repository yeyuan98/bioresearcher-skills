# Probe transcript — MCP tool tour — true request/response pairs from 8 core tools / MCP 工具巡览——8 个核心工具的真实请求/响应样本

- Scenario: `mcp-tool-tour-en` (kind: mcp-probe, lang: en) — deterministic stdio JSON-RPC calls, no LLM involved
- Outcome: **PASS**
- tools/list exposed 41 tool(s)
- Replay: `node demos/run-demo.mjs --only mcp-tool-tour-en --publish` (network via npx; token-free)

## Probe calls (8) / 探针调用

### 1. `article_search` — pass (9310 ms)

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
[{"doi":"10.1042/BJ20141077","title":"Protein stability versus function: effects of destabilizing missense mutations on BRCA1 DNA repair activity.","abstract":null,"authors":["David C. A. Gaboriau","P. Rowling","C. Morrison","L. Itzhaki"],"journal":"Biochemical Journal","publication_date":"2015","cited_by":12,"is_open_access":false,"source":"semantic_scholar"},{"doi":"10.1080/15476286.2023.2220210","title":"Hybrid-seq deciphers the complex transcriptional profile of the human BRCA1 DNA repair associated gene","abstract":"ABSTRACT Breast Cancer Gene 1 (BRCA1) is a tumour suppressor protein that modulates multiple biological processes including genomic stability and DNA damage repair. Although the main BRCA1 protein is well characterized, further proteomics studies have already identified additional BRCA1 isoforms with lower molecular weights. However, the accurate nucleotide sequence determination of their corresponding mRNAs is still a barrier, mainly due to the increased mRNA length of BRCA1 (~5.5 kb) and the limitations of the already implemented sequencing approaches. In the present study, we designed and employed a multiplexed hybrid sequencing approach (Hybrid-seq), based on nanopore and semi-conductor sequencing, aiming to detect BRCA1 alternative transcripts in a panel of human cancer and non-cancerous cell lines. The implementation of the described Hybrid-seq approach led to the generation of highly accurate long sequencing reads that enabled the identification of a wide spectrum of BRCA1 splice variants (BRCA1 sv.7 – sv.52), thus deciphering the transcriptional landscape of the human BRCA1 gene. In addition, demultiplexing of the sequencing data unveiled the expression profile and abundance of the described BRCA1 mRNAs in breast, ovarian, prostate, colorectal, lung and brain cancer as well as in non-cancerous human cell lines. Finally, in silico analysis supports that multiple detected mRNAs harbour open reading frames, being highly expected to encode putat… [trimmed 842 more char(s)]
```

### 2. `gene_get` — pass (1624 ms)

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

### 3. `variant_search` — pass (1413 ms)

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

### 4. `trial_search` — pass (2505 ms)

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
{"studies":[{"nct_id":"NCT00543205","title":"Pharmacokinetics of G3139 in Subjects With Advanced Melanoma, Including Those With Normal Hepatic Function and Those With Moderate Hepatic Impairment","status":"TERMINATED","interventions":["DRUG: Genasense® (G3139, oblimersen sodium)"]},{"nct_id":"NCT01597908","title":"Dabrafenib Plus Trametinib vs Vemurafenib Alone in Unresectable or Metastatic BRAF V600E/K Cutaneous Melanoma","status":"COMPLETED","interventions":["DRUG: Dabrafenib","DRUG: Vemurafenib","DRUG: Trametinib"]},{"nct_id":"NCT02752074","title":"A Phase 3 Study of Pembrolizumab + Epacadostat or Placebo in Subjects With Unresectable or Metastatic Melanoma (Keynote-252 / ECHO-301)","status":"COMPLETED","interventions":["DRUG: pembrolizumab + epacadostat","DRUG: pembrolizumab + placebo"]}],"nextPageToken":"ZVt07cGHkvI2wRk2CJf6_LLt1ZGdP8swd7KrgP4ZnziTvfE"}
```

### 5. `disease_search` — pass (1523 ms)

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

### 6. `patent_search` — pass (17858 ms)

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
{"patents":[{"publication_number":"US20140179551A1","title":"METHODS FOR THE SELECTION OF BINDING PROTEINS","publication_date":"2014-06-26","filing_date":"2012-05-16","assignee":["BRISTOL-MYERS SQUIBB COMPANY"],"applicant":["BRISTOL-MYERS SQUIBB COMPANY"],"cpc_codes":["C12N15/1037","C40B30/04","G01N33/6845"],"status":"application","relevance_score":13.290563,"source":"ppubs"},{"publication_number":"US20160237423A1","title":"METHODS FOR THE SELECTION OF BINDING PROTEINS","publication_date":"2016-08-18","filing_date":"2016-04-29","assignee":["BRISTOL-MYERS SQUIBB COMPANY"],"applicant":["BRISTOL-MYERS SQUIBB COMPANY"],"cpc_codes":["C12N15/1037","C40B30/04","G01N33/6845"],"status":"application","relevance_score":13.290563,"source":"ppubs"},{"publication_number":"US9347058B2","title":"Methods for the selection of binding proteins","publication_date":"2016-05-24","filing_date":"2012-05-16","assignee":["Bristol-Myers Squibb Company"],"applicant":["Lipovsek; Dasa"],"cpc_codes":["C12N15/1037","C40B30/04","G01N33/6845"],"status":"granted","relevance_score":13.28442,"source":"ppubs"}],"total_hits":{"google_patents":11548,"ppubs":1831},"total_hits_basis":{"google_patents":"approximate","ppubs":"matching US document families"},"seminal_prior_art":[{"publication_number":"US6518018B1","co_cited_by":6,"cited_by":["US12474340B2","US6841359B2","US7138253B2","US11970694B2","US9284548B2","US11286481B2"],"note":"US family member of WO1998/031700 (the co-cited PCT form), resolved via Google Patents.","title":"Selection of proteins using rna-protein fusions \n       ","assignee":"General Hospital Corp"}],"mined_count":10}
```

### 7. `gtex_expression` — pass (2686 ms)

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

### 8. `pdb` — pass (4021 ms)

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
[{"pdb_id":"6N65","score":1,"summary":{"pdb_id":"6N65","title":"KRAS G-quadruplex G16T mutant.","experimental_method":"X-RAY DIFFRACTION","resolution":1.6,"molecular_weight":14.17,"polymer_count":1,"polymer_composition":"DNA","deposition_date":"2018-11-25T00:00:00.000+00:00","release_date":"2020-04-15T00:00:00.000+00:00","doi":"10.1093/nar/gkaa262","pmid":32313953,"authors":["Schmidberger, J.W.","Ou, A.","Smith, N.M.","Iyer, K.S.","Bond, C.S."],"space_group":"P 1 21 1","unit_cell":{"a":33.693,"b":30.127,"c":52.97,"alpha":90,"beta":94.51,"gamma":90},"container_ids":{"polymer_entity_ids":["1"],"non_polymer_entity_ids":["2"],"assembly_ids":["1"]}}},{"pdb_id":"6SUU","score":0.9618643597408673,"summary":{"pdb_id":"6SUU","title":"NMR structure of KRAS32R G9T conformer G-quadruplex within KRAS promoter region","experimental_method":"SOLUTION NMR","molecular_weight":10.32,"polymer_count":1,"polymer_composition":"DNA","deposition_date":"2019-09-16T00:00:00.000+00:00","release_date":"2020-02-05T00:00:00.000+00:00","doi":"10.1093/nar/gkaa387","pmid":32432667,"authors":["Marquevielle, J.","Salgado, G."],"container_ids":{"polymer_entity_ids":["1"],"non_polymer_entity_ids":["2"],"assembly_ids":["1"]}}},{"pdb_id":"6T2G","score":0.9618643597408673,"summary":{"pdb_id":"6T2G","title":"NMR structure of KRAS32R G25T conformer G-quadruplex within KRAS promoter region","experimental_method":"SOLUTION NMR","molecular_weight":10.32,"polymer_count":1,"polymer_composition":"DNA","deposition_date":"2019-10-08T00:00:00.000+00:00","release_date":"2020-02-05T00:00:00.000+00:00","doi":"10.1093/nar/gkaa387","pmid":32432667,"authors":["Marquevielle, J.","Salgado, G."],"container_ids":{"polymer_entity_ids":["1"],"non_polymer_entity_ids":["2"],"assembly_ids":["1"]}}},{"pdb_id":"6T51","score":0.9618643597408673,"summary":{"pdb_id":"6T51","title":"NMR structure of KRAS22RT G-quadruplex forming within KRAS promoter region at physological temperature","experimental_method":"SOLUTION NMR","molecular_weigh… [trimmed 4120 more char(s)]
```

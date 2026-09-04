# Citation Formats

Numbered-citation formats per source type, with URL forms.

## Overview

All findings are cited with numbered in-text markers ([1], [2, 3], [1-5]),
numbered by order of appearance, resolved against a bibliography at the end
of the document. Each source type has a fixed format so reports stay
consistent across workers and aspects.

## In-text citation forms

```markdown
Single:    BRAF V600E occurs in ~50% of cutaneous melanomas [1].
Multiple:  Several studies confirm the association [1, 2, 3].
Range:     Extensively documented [1-5].
Timeline:  Approved in 2011 [1] and became standard of care [2, 3].
```

## Bibliography formats by source type

### Journal articles (from article_search / article_get)

```
[N] FirstAuthor AB, SecondAuthor CD, et al. Article Title. Journal. Year;Volume(Issue):Pages. PMID: XXXXXXXX.
```

Example:

```
[1] Chapman PB, Hauschild A, Robert C, et al. Improved survival with vemurafenib in melanoma with BRAF V600E mutation. N Engl J Med. 2011;364(26):2507-2516. PMID: 21639808.
```

When PMID is unavailable, use DOI: `DOI: 10.xxxx/xxxxx`. Both may be given.

### Clinical trials (from trial_search / trial_get)

```
[N] NCTXXXXXXXX: Official Title. Phase X. Sponsor: [sponsor]. Status: [status]. https://clinicaltrials.gov/study/NCTXXXXXXXX
```

Example:

```
[2] NCT04280705: A Study of Encorafenib Plus Cetuximab With or Without Nivolumab in Metastatic Colorectal Cancer. Phase 2. Sponsor: Pfizer. Status: Completed. https://clinicaltrials.gov/study/NCT04280705
```

### Patents (from patent_search / patent_get)

```
[N] [Assignee]. Title of invention. Patent publication number (status). URL
```

Example:

```
[3] ModernaTx, Inc. Nucleoside-modified mRNA encoding SARS-CoV-2 spike protein. US11027025B2 (granted). https://patents.google.com/patent/US11027025B2
```

EP/WO patents: use `https://register.epo.org/application?number=<number>` or
Google Patents.

### Genes (from gene_search / gene_get)

```
[N] SYMBOL: Full gene name. NCBI Gene ID: XXXXXX. HGNC: HGNC:XXXX. https://www.ncbi.nlm.nih.gov/gene/XXXXXX
```

Example:

```
[4] BRAF: B-Raf proto-oncogene, serine/threonine kinase. NCBI Gene ID: 673. HGNC: HGNC:1097. https://www.ncbi.nlm.nih.gov/gene/673
```

### Variants (from variant_search / variant_get / variant_oncokb)

```
[N] GENE p.PROTEINCHANGE (rsID): ClinVar significance [ClinVar ID]. URL
```

Example:

```
[5] BRAF p.V600E (rs113488022): Pathogenic/Likely pathogenic [ClinVar: 13961]. https://www.ncbi.nlm.nih.gov/clinvar/variation/13961
```

### Drugs (from drug_search / drug_get)

```
[N] Drug Name. Indication: [indication]. [ChEMBL ID / ChEBI ID / UNII when present]. URL
```

Example:

```
[6] Vemurafenib. Indication: BRAF V600E-mutant melanoma. ChEMBL: CHEMBL1229517. https://www.ebi.ac.uk/chembl/compound_report_card/CHEMBL1229517/
```

FDA label findings cite the safety section: append "Source: FDA label
(drug_get safety section)."

### Diseases (from disease_search / disease_get)

```
[N] Disease Name. Ontology ID ([DOID/MONDO/OMIM/EFO]). URL
```

Example:

```
[7] Cutaneous melanoma. MONDO:0002025. https://monarchinitiative.org/MONDO:0002025
```

### Datasets / sequences (geo_get / sra_get / genbank_get)

```
[N] GEO series GSEXXXXXX: [title]. [organism]. https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=GSEXXXXXX
[N] SRA run SRRXXXXXXX: [experiment description]. https://trace.ncbi.nlm.nih.gov/Traces/?run=SRRXXXXXXX
[N] GenBank accession XXXXXXXX.X: [definition]. https://www.ncbi.nlm.nih.gov/nuccore/XXXXXXXX.X
```

### Official web sources (fallback when biomcp lacks coverage)

```
[N] Page Title. Organization. Updated [date if shown]. URL. Accessed: YYYY-MM-DD.
```

## What to cite

| Source type | Cite? |
|-------------|-------|
| Tool-returned articles, trials, patents, annotations | Yes |
| Statistical/quantitative claims | Yes - always |
| Direct quotes | Yes |
| General textbook knowledge ("DNA has 4 bases") | No |

## Integrity rules

1. Verify identifiers exist in the tool output - never fabricate a PMID,
   NCT ID, or accession.
2. Cite primary sources over reviews when both are available.
3. Quote accurately; do not overstate findings beyond what the source says.
4. Per-aspect files keep their own [1..N]; the orchestrator re-numers all
   citations into one bibliography for final_report.md.
5. Access dates only for web sources (tools log their own query date).

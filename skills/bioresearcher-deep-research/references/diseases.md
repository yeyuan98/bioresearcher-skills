# Disease Research

Disease discovery, annotation, and cross-links via `disease_search` /
`disease_get` / `disease_drugs` / `disease_trials`.

## Overview

`disease_search` finds diseases by name/phenotype/keyword (MyDisease-backed);
`disease_get` retrieves detail by ontology ID; `disease_drugs` returns
OpenTargets drug-disease associations; `disease_trials` searches
ClinicalTrials.gov by the resolved disease name.

## Tools

### disease_search

| Parameter | Type | Notes |
|-----------|------|-------|
| query | string (required) | Disease name, phenotype, or keyword |
| limit | int 1-50, default 10 | Maximum results |
| offset | int >= 0, default 0 | Result offset |

Use it to obtain the canonical `disease_id` for `disease_get`.

### disease_get

| Parameter | Type | Notes |
|-----------|------|-------|
| disease_id | string (required) | Disease ID: DOID (`DOID:0060268`), MONDO, OMIM, OMOPS, EFO, Orphanet (`ORPHA...`/`Orphanet:...`), or UMLS CUI (`C0018794`, matches `C` + 7 digits) |
| sections | enum array, optional | `core`, `gene_associations`, `phenotypes`, `pathways`, `all` |
| limit | int 1-100, default 20 | Caps arrays (gene association rows, phenotype rows, etc.) |

Section contents: `core` = names, definitions, ontology cross-refs;
`gene_associations` = associated genes; `phenotypes` = HPO phenotype terms;
`pathways` = implicated pathways.

### disease_drugs

| Parameter | Type | Notes |
|-----------|------|-------|
| disease_id | string (required) | Disease ID (ontology ID or name resolvable via OpenTargets) |
| limit | int 1-50, default 20 | Caps the association list |

Sources drugs via OpenTargets.

### disease_trials

| Parameter | Type | Notes |
|-----------|------|-------|
| disease_id | string (required) | Disease ID OR plain disease name - IDs are resolved to a name first |
| limit | int 1-50, default 20 | Page size |

Returns compact `{nct_id, title, status}` rows; follow up with `trial_get`.

## Worked examples

Find the canonical ID, then annotate:

```json
{"query": "melanoma", "limit": 5}
```

```json
{"disease_id": "DOID:0060268", "sections": ["core", "gene_associations", "phenotypes"]}
```

Drugs associated with a disease:

```json
{"disease_id": "MONDO:0002025", "limit": 15}
```

Trial landscape directly (name accepted):

```json
{"disease_id": "pancreatic adenocarcinoma", "limit": 20}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `_error: Disease ... not found` from disease_trials | invalid/unresolvable ID | call `disease_search` first and copy the exact ID; supported formats are MONDO/DOID/OMIM (message text) plus EFO/Orphanet/CUI accepted by the resolver |
| disease_get 0 hits for a raw name | the tool wants an ID, not a name | resolve via `disease_search`, or use `disease_trials`/`disease_drugs` which accept names |
| Sections empty | over-narrow section set or sparse annotation for rare diseases | try `sections: ["all"]` and note data sparsity in the report |

## Integration notes

- Gene-centric disease questions can go the other way: `gene_diseases(symbol)`
  (references/genes.md) - note its DisGeNET/OpenTargets fallback semantics.
- Disease -> trials -> detail chain: `disease_trials` then `trial_get`
  (references/clinical-trials.md).
- MyDisease and Monarch are server-limited at 100 ms; OpenTargets at 500 ms -
  no manual throttling.

# Drug Research

Drug identity, regulatory status, labels, adverse events, and targets via
`drug_search` / `drug_get` / `drug_trials`.

## Overview

`drug_search` finds drugs by name/mechanism/keyword (MyChem-backed);
`drug_get` returns per-drug detail with sections spanning US/EU/WHO
regulatory data, FDA labels (safety), FAERS adverse events, targets, and
indications; `drug_trials` cross-links to clinical trials.

## Tools

### drug_search

| Parameter | Type | Notes |
|-----------|------|-------|
| query | string (required) | Drug name, mechanism, or keyword |
| limit | int 1-50, default 10 | Maximum results |
| offset | int >= 0, default 0 | Result offset |

### drug_get

| Parameter | Type | Notes |
|-----------|------|-------|
| name | string (required) | Drug name, e.g. "imatinib", "aspirin" |
| sections | enum array, optional | `core`, `us_regulatory`, `eu_regulatory`, `who_regulatory`, `safety`, `targets`, `indications`, `adverse_events`, `all` |
| limit | int 1-100, default 20 | For `adverse_events`, caps the number of ranked reaction rows |

Section semantics (important - commonly confused):

| Section | Contents |
|---------|----------|
| core | identity, identifiers, description |
| us_regulatory | US brand name + `fda_status` (e.g. approved) - NOT full labels, NOT approval history |
| eu_regulatory / who_regulatory | EMA / WHO regulatory summaries |
| safety | FDA LABEL TEXT: box_warning, warnings, adverse_reactions - this is where label prose lives |
| adverse_events | FDA FAERS adverse reactions RANKED by report count - no filters (no patient age/sex/date/reaction filtering) |
| targets | drug targets |
| indications | approved/use indications |
| all | every non-core section |

### drug_trials

| Parameter | Type | Notes |
|-----------|------|-------|
| drug | string (required) | Drug name |

## Worked examples

Label (safety) information for vemurafenib:

```json
{"name": "vemurafenib", "sections": ["safety"]}
```

Top FAERS adverse events (ranked, unfilterable):

```json
{"name": "imatinib", "sections": ["adverse_events"], "limit": 15}
```

Regulatory snapshot + targets + indications in one call:

```json
{"name": "trastuzumab",
 "sections": ["us_regulatory", "eu_regulatory", "targets", "indications"]}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| us_regulatory is surprisingly thin | it only carries brand name + fda_status | label text (warnings, box warning, adverse reactions) is in `safety` |
| Wanting FAERS filtered by age/sex/date | `adverse_events` exposes ranked counts only - no filters | take the ranked list and note the limitation in the report; do not claim subgroup-level FAERS results |
| 0 hits for a trade name | search index prefers generic/mechanism terms | `drug_search` by generic name or mechanism, then `drug_get` by the matched name |
| Payload too large | `sections: ["all"]` on a heavily annotated drug | request only the needed sections; lower `limit` for reaction rows |

## Integration notes

- Reverse direction (target -> drugs): `gene_drugs(symbol)`; disease ->
  drugs: `disease_drugs(disease_id)` (references/diseases.md).
- openFDA rate limits improve with `OPENFDA_API_KEY`
  (references/rate-limiting-auth.md).
- MyChem and openFDA are server-limited at 100 ms - no manual throttling.
- Cite drugs with identifiers (DrugBank/ChEMBL where present in core output)
  per references/citations.md.

# Clinical Trials Research

ClinicalTrials.gov search and detail via `trial_search` / `trial_get`.

## Overview

`trial_search` queries the ClinicalTrials.gov API v2 by condition,
intervention, or keyword with status/phase filters and CURSOR pagination.
`trial_get` retrieves one trial by NCT ID with selectable sections.

## Tools

### trial_search

| Parameter | Type | Notes |
|-----------|------|-------|
| query | string (required) | Condition, intervention, or keyword |
| status | string, optional | e.g. "Recruiting", "Completed" |
| phase | string, optional | e.g. "Phase 1", "Phase 2" |
| intervention_type | string, optional | e.g. "Drug", "Device" |
| limit | int 1-50, default 10 | Maximum results per page |
| page_token | string, optional | Cursor from the previous response - the ONLY pagination mechanism (no offset) |

Response includes a next-page token when more results exist; pass it back as
`page_token` to continue.

### trial_get

| Parameter | Type | Notes |
|-----------|------|-------|
| nct_id | string (required) | e.g. "NCT01234567" |
| sections | enum array, optional | `core`, `eligibility`, `locations`, `outcomes`, `all` |
| limit | int 1-100, default 20 | Caps array lengths (e.g. location rows) |

IMPORTANT: there is NO `protocol` section. Trial protocol content (design,
arms, eligibility) is covered by `core` + `eligibility`:

```json
{"nct_id": "NCT04280705", "sections": ["core", "eligibility"]}
```

Section contents: `core` = identification, status, phase, design, sponsors,
brief/official summary; `eligibility` = inclusion/exclusion criteria, sex,
age range, healthy-volunteer acceptance; `locations` = sites and contacts;
`outcomes` = primary/secondary outcome measures.

## Worked examples

Recruiting Phase 3 melanoma drug trials:

```json
{"query": "melanoma", "status": "Recruiting", "phase": "Phase 3",
 "intervention_type": "Drug", "limit": 20}
```

Page deeper with the cursor from the previous response:

```json
{"query": "melanoma", "status": "Recruiting", "phase": "Phase 3",
 "limit": 20, "page_token": "<token from previous response>"}
```

Outcome measures for one trial:

```json
{"nct_id": "NCT04511078", "sections": ["outcomes"]}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| Sections missing after requesting "protocol" | no such section exists | request `["core","eligibility"]` for protocol content |
| Same first page returned repeatedly | retrying with the same args re-issues page 1 | thread `page_token` from each response; do not use offset-style paging |
| 0 hits for a valid condition | overly narrow combined filters | drop filters one at a time (keep `query`), then re-apply selectively |
| Trial not found for an NCT ID | typo or unindexed/very new record | verify the NCT ID via `trial_search(query="NCT04511078")` |

## Integration notes

- Cross-entity shortcuts avoid manual query crafting: `drug_trials(drug)`,
  `gene_trials(symbol)`, `disease_trials(disease_id)`, `variant_trials(variant)`
  return compact nct_id/title/status lists - then use `trial_get` for detail.
- `disease_trials` accepts a disease ID (DOID/MONDO/OMIM) or a plain disease
  name; IDs are resolved to a name before searching.
- Cite trials by NCT ID with the clinicaltrials.gov URL (references/citations.md).
- ClinicalTrials.gov API is server-limited at 100 ms intervals - no manual
  throttling needed.

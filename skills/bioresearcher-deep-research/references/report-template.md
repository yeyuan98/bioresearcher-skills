# Report Template

Mandatory structure for `final_report.md` (and the per-aspect files, in
lighter form). Ported from the bioresearcher agent's report standard.

## Overview

Every report has exactly SIX mandatory sections, in this order. Every claim
carries provenance: a citation [N], a documented data source, or a described
analysis method.

## Mandatory sections

```markdown
  # [Research Topic Title]

Generated: [YYYY-MM-DD] | TOPIC: <TOPIC> | Scope: [1-2 sentence research question]

  ## Executive Summary
[2-3 sentence overview of key findings with the most critical citations [1, 2]]

Key findings:
- [Finding 1 [1]]
- [Finding 2 [2, 3]]
- [Finding 3 [4]]

  ## Data Sources
[Table: source | type | query/accession | date accessed]
[Scope: records retrieved, date range, filters applied]
[Quality notes: gaps, known biases]

  ## Analysis Methodology
[Aspects researched and how (worker/sequential mode)]
[Tools used per aspect with key query parameters]
[Validation steps and error handling (retries, fallbacks)]

  ## Findings
[Organized by research question; each subsection = one theme]
[Key data points with confidence and citation: metric | value | confidence | source]
[Evidence tables where numeric comparisons exist]

  ## Limitations
[Data gaps: what could not be found and why]
[Methodological constraints: source coverage, date windows, auth-gated tools skipped]
[Generalizability: where findings apply and where they may not]

  ## References
[Numbered bibliography in references/citations.md format, ordered by first appearance]
```

## Per-aspect file structure (lighter)

```markdown
  # [Aspect Name] (TOPIC: <TOPIC>)

Scope: [1 paragraph from the worker ABSTRACT]

  ## Findings
[Findings with in-text citations [1], [2, 3]]

  ## Tool / Query Log
[tool + key arguments, e.g. article_search(query="...", dateRange="2021-01-01/", limit=15)]

  ## Evidence Gaps
[queries that failed after retries, with reasons]

  ## References
[numbered bibliography]
```

## Citation placement rules

- In-text: [1] single; [2, 3] list; [1-5] range - numbered by ORDER OF
  APPEARANCE across the document.
- The Executive Summary cites only the most critical sources.
- Every table row with a number has a Source column.
- Bibliography is ordered by number, not alphabetized.

## Provenance standard

BAD (no provenance):

```markdown
BRAF V600E is found in 50% of melanomas.
```

GOOD:

```markdown
BRAF V600E mutations occur in approximately 50% of cutaneous melanomas [1],
consistent with earlier estimates of 40-60% prevalence [2, 3].
```

Where the claim derives from an analysis rather than a document, name the
method and input: "based on trial_search(query='melanoma', phase='Phase 3')
conducted 2026-09-04, 42 recruiting trials of which 28 list a BRAF/MEK
combination [4]."

## Quality checklist (before finalizing)

- [ ] All six sections present, in order
- [ ] Every claim has provenance (citation / source / method)
- [ ] All in-text [N] present in References; no orphan references
- [ ] Identifiers included in references (PMIDs, DOIs, NCT IDs, patent IDs, accessions)
- [ ] Access dates for web/official-site sources
- [ ] Limitations honest about gaps and auth-gated tools not used
- [ ] Findings re-numbered into one bibliography in final_report.md
- [ ] Conflicting findings surfaced, not silently dropped

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Missing Data Sources section | Document every tool query and accession |
| "We analyzed the data" methodology | Name tools + parameters + steps |
| Absolute-truth tone in Findings | Mark confidence; hedge appropriately |
| No Limitations | Always include coverage gaps and constraints |

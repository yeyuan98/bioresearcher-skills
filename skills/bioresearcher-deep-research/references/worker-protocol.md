# Worker Protocol

The canonical contract for per-aspect research workers - both parallel
subagents and the sequential fallback in the main conversation.

## Overview

Each worker owns exactly ONE research aspect of a TOPIC. It queries biomcp
tools, collects identifiers, and writes one markdown report plus its evidence
ledger under `reports/<TOPIC>/`. Workers never re-delegate, never fabricate, and never fall
back to internal knowledge for facts. Workers also never interview the user -
clarification and plan review are exclusively the orchestrator's domain (SKILL.md).

## Worker prompt template (orchestrator fills this in)

```
TOPIC: <TOPIC>
YOUR RESEARCH FOCUS: <RESEARCH-ASPECT>
DESCRIPTION: <ABSTRACT>
SKILL_DIR: <absolute skill dir>   # Tier B only; resolve before dispatch
```

- ABSTRACT: <200 words describing the exact focus, a list of detailed
  research items to investigate, and the aspect's inclusion definition +
  binding exclusion criteria (negative examples welcome). Numeric caps
  inside it (source limits, call budgets) are binding on the worker.
- Tier B (generic subagent): the orchestrator should ALSO inline into the
  prompt the Worker Rules below, the per-domain tool cheatsheet from
  `references/tool-selection.md`, the cite-key marker summary from
  `references/citations.md`, and the evidence-verification discipline from
  `references/analysis-methods.md` - generic subagents may not have access
  to this skill's files. The template's `SKILL_DIR` line carries the
  resolved absolute script path.
- Tier A (dedicated `bioresearcher-dr-worker` plugin subagent): the worker
  reads this file plus `references/tool-selection.md`,
  `references/citations.md`, and `references/analysis-methods.md` itself at
  startup (via `${CLAUDE_PLUGIN_ROOT}`); the orchestrator sends ONLY the
  filled-in template below.

## File protocol

- Output files (exactly TWO - together they are the self-contained
  deliverable for the aspect):
  - `reports/<TOPIC>/<YOUR-FOCUS>.md` — the aspect report, where `<YOUR-FOCUS>`
    is the underscore-separated aspect name (e.g. `clinical_landscape.md`).
  - `reports/<TOPIC>/evidence/<YOUR-FOCUS>.jsonl` — the evidence ledger, one
    JSON record per potentially-citable source (see Worker rule 8). The
    ledger supplies every bibliography entry later; the pair
    (report + ledger) must be understandable without any other context.
- The write tool auto-creates parent directories - never use bash mkdir.
- Report file structure: title, one-paragraph scope summary, findings with
  cite-key markers, tool/query log (which biomcp tools + key argument
  values), and explicit evidence gaps. No bibliography section - the
  orchestrator's `render` step generates numbering and References from the
  ledger.
- The ABSTRACT the orchestrator sends you defines the aspect's inclusion
  definition and binding exclusion criteria; apply them per
  `references/analysis-methods.md` (criterion vs keyword).

## Worker rules

1. Stay focused: execute only the assigned aspect; do NOT delegate to other
   subagents (no re-delegation), and do not expand scope.
2. Tool selection: query biomcp tools per `references/tool-selection.md`;
   filter at the source (specific terms, `limit`, `sections`) - never retrieve
   broadly and filter locally.
3. Sequential MCP calls only - never issue concurrent biomcp calls. No manual
   sleep timers are needed between calls (server-side limiters pace each
   source); the only exceptions are HPA `protein_atlas`/`expression` sections
   and GEO supplementary downloads, which are unthrottled - space those out.
4. No internal knowledge: use only biomcp tool results or official sources.
   If evidence is missing after retries, say so explicitly in the report.
5. Citations: every claim gets a semantic cite-key marker - `[@pmid:21639808]`,
   groups `[@pmid:a; @nct:NCT00000000]` - using the keys the ledger actually
   derived (the `add` banner echoes them). Capture identifiers as you go:
   PMIDs, PMCIDs, DOIs, NCT IDs, patent IDs, GEO/SRA accessions, database IDs.
   Never hand-number citations and never write a bibliography.
6. Retry logic: if a query fails, wait a few seconds, retry with a simpler
   query; at most 3 attempts per query before recording the gap and moving on.
7. Writing: succinct, accurate, professional - academic standard.
8. Evidence ledger (mandatory): maintain
      `reports/<TOPIC>/evidence/<YOUR-FOCUS>.jsonl` as you search.
    - AFTER EACH biomcp search/get call, append one record per source you
      might cite, copying fields VERBATIM from the tool result object -
      batched: ALL records from one tool result go into ONE `add` call
      (see below). Fields the tool did not provide are `null` - NEVER invent
      values. Records without titles (e.g. LitSense hint results) are
      acceptable as-is. Never hold more than one tool result's worth of
      un-appended records, and never stage records in per-record scratch
      files - compose the batch array directly in the append call.
    - Canonical record shapes - one JSON line per source; copy the line for
      your source type and fill fields verbatim (omit optionals you lack).
      biomcp-native field spellings (`ids.nct_id`, top-level `phase`/
      `status`/`sponsor`, ...) are also accepted and normalized
      automatically, but prefer the canonical forms below:

      ```jsonl
      {"schema":"bioresearcher-evidence/1","type":"article","ids":{"pmid":"21639808","pmcid":"PMC3549296","doi":"10.1056/nejmoa1103782"},"title":"...","authors":["Chapman Paul B"],"journal":"N Engl J Med","year":"2011","volume":"364","issue":"26","pages":"2507-16","url":"https://pubmed.ncbi.nlm.nih.gov/21639808/","provenance":[{"aspect":"<YOUR-FOCUS>","tool":"article_search","args":{},"retrieved_at":"<ISO>"}]}
      {"schema":"bioresearcher-evidence/1","type":"trial","ids":{"nct":"NCT04280705"},"title":"Official Title","meta":{"phase":"Phase 2","sponsor":"Pfizer","status":"Completed"},"url":"https://clinicaltrials.gov/study/NCT04280705","provenance":[...]}
      {"schema":"bioresearcher-evidence/1","type":"patent","ids":{"patent":"US11027025B2"},"title":"Title of invention","meta":{"assignee":"ModernaTx, Inc.","status":"granted"},"url":"https://patents.google.com/patent/US11027025B2","provenance":[...]}
      {"schema":"bioresearcher-evidence/1","type":"gene","ids":{"ncbi_gene":"673","hgnc":"HGNC:1097"},"title":"B-Raf proto-oncogene, serine/threonine kinase","meta":{"symbol":"BRAF"},"url":"https://www.ncbi.nlm.nih.gov/gene/673","provenance":[...]}
      {"schema":"bioresearcher-evidence/1","type":"variant","ids":{"clinvar":"13961","rs":"rs113488022"},"title":"NM_004333.6(BRAF):c.1799T>A","meta":{"gene":"BRAF","protein_change":"V600E","significance":"Pathogenic"},"provenance":[...]}
      {"schema":"bioresearcher-evidence/1","type":"drug","ids":{"chembl":"CHEMBL1229517"},"title":"vemurafenib","meta":{"indication":"BRAF V600E-mutant melanoma","source_section":"FDA label (drug_get safety section)"},"provenance":[...]}
      {"schema":"bioresearcher-evidence/1","type":"disease","ids":{"mondo":"MONDO:0002025"},"title":"Cutaneous melanoma","url":"https://monarchinitiative.org/MONDO:0002025","provenance":[...]}
      {"schema":"bioresearcher-evidence/1","type":"dataset","ids":{"geo":"GSE12345"},"title":"Series title","provenance":[...]}
      {"schema":"bioresearcher-evidence/1","type":"web","ids":{"url":"https://..."},"title":"Page Title","meta":{"organization":"FDA","accessed":"2026-09-10"},"provenance":[...]}
      {"schema":"bioresearcher-evidence/1","type":"other","ids":{"url":"https://..."},"title":"Any other citable source (FDA page, guideline, ...)","provenance":[...]}
      ```

      Omit `key` - the ledger derives it from the ids (`pmid:` > `doi:` >
      `pmcid:` for articles, `nct:` for trials, ...).
    - Title-less records (typical: LitSense hits return only
      `pmid`/`pmcid`/`score`) MUST be enriched via `article_get(pmid)` - one
      sequential, server-paced call - BEFORE they may be cited; on failure
      take the standard retry ladder (rule 6), then leave the record in the
      ledger with a gap note in the aspect file - the orchestrator's verify
      step backfills what it can.
    - With Bash available (the orchestrator provides `SKILL_DIR` in the
      prompt): append with
      `python3 <SKILL_DIR>/scripts/evidence-ledger.py add <file> --stdin`,
      substituting the SKILL_DIR value from your prompt LITERALLY - it is a
      path string, NOT an environment variable (`$SKILL_DIR` in a shell
      resolves to nothing and breaks the call). Pass a JSON ARRAY of the
      batch's records (a heredoc works well), or equivalently
      `add <file> @<batch.json>` with an array file. Both validate,
      normalize, and accept every record in one call, and the banner echoes
      the derived canonical keys - cite those keys. Re-adding the same key
      MERGES fill-only (never overwrites a non-null value): later adds for
      the same source are safe and expected (e.g. enriching a record after a
      `_get` call), and a key that lives only in another aspect's ledger is
      remedied by re-adding the record to your OWN ledger. Do NOT issue one
      `add` per record and do NOT write per-record scratch files first -
      every append is a tool call (an LLM turn), so batch per search result.
      `retrieved_at` carries the real UTC time of the call (e.g.
      `date -u +%Y-%m-%dT%H:%M:%SZ`) - never a rounded or placeholder
      timestamp. Fields the tool did not return stay null; values inferred
      from your own query parameters (e.g. a phase filter) may enter `meta`
      ONLY with the filter captured in `provenance.args` and the inference
      disclosed in the report. Without Bash ONLY (e.g. the Claude plugin
      worker): write raw JSONL lines with the Write tool; the orchestrator's
      merge validates them.
    - BEFORE reporting completion, run
      `python3 <SKILL_DIR>/scripts/evidence-ledger.py check <file> --markers <YOUR-FOCUS>.md` -
      it must exit 0: no quarantined lines, and every `[@key]` marker in
      your aspect file resolves to a ledger record (markers are ONLY for
      resolvable cited sources - a mention-by-id in prose stays plain text,
      e.g. "the pivotal trial, NCT02435849, was not found"). Without Bash,
      re-read the ledger and match the markers manually.
9. Evidence quality: apply the evidence-verification discipline
   (`references/analysis-methods.md`) to every claim - direction of
   causality, quantitative fidelity, criterion vs keyword, axis discipline,
   primary vs downstream.

## Restart / gap top-up (orchestrator-dispatched)

Aspect-file ownership is SERIALIZED, never concurrent: a top-up worker
adopts the original worker's contract only after that worker has terminated.
The orchestrator dispatches it with the prior worker's evidence-gaps list:

- Append to the SAME per-aspect ledger via `add` (upsert merge is safe).
- Update the SAME aspect .md via read-then-targeted edits confined to the
  gap sections - never rewrite unrelated content, other aspects, or the
  orchestrator's draft.
- End with `check <file> --markers <aspect>.md` (exit 0) before reporting.

## Retry ladder (per query)

```
attempt 1: original query
  fail -> wait a few seconds
attempt 2: simplified query (fewer terms, broader limit)
  fail -> wait a few seconds
attempt 3: alternate tool/source (see references/tool-selection.md routing)
  fail -> record "evidence gap" in the aspect file with the failed query; continue
```

## Parallel execution (orchestrator with subagent/Task tool)

- Pick the tier by capability: dedicated `bioresearcher-dr-worker` subagent
  (Tier A) when the harness offers it; otherwise generic subagents with the
  inlined cheatsheet (Tier B). Do not mix tiers within one topic.
- Launch workers in parallel in batches of up to 5.
- Track each aspect in the todo list; mark complete when its output file
  exists with cite-key markers throughout AND its evidence ledger file
  exists, passes `check` (exit 0), and covers every cited key.
- If a worker fails or stalls, restart it (same prompt), max 3 restarts.
- Tell the user up front: "If subagents are stuck without progress for too
  long, interrupt and ask me to resume work."

## Sequential degradation (no subagent tool)

If the harness has no subagent/Task tool, the SAME protocol runs inline in the
main conversation, one aspect at a time:

1. Announce the aspect being worked on.
2. Apply Worker rules 2-9 exactly (same tool selection, retries, citation
   discipline, evidence ledger, evidence quality, file protocol).
3. Write `reports/<TOPIC>/<ASPECT>.md` and
   `reports/<TOPIC>/evidence/<ASPECT>.jsonl` before moving to the next aspect.
4. After the last aspect, proceed to synthesis (SKILL.md Step 5).

Sequential mode trades latency for context - keep per-aspect tool calls lean
(strict `limit`, narrow `sections`) so the accumulated context stays usable.

## Aspect completion checklist

- [ ] Output file exists at `reports/<TOPIC>/<ASPECT>.md`
- [ ] Evidence ledger exists at `reports/<TOPIC>/evidence/<ASPECT>.jsonl`
      and passes `evidence-ledger.py check <file> --markers <ASPECT>.md`
      with exit 0 (Tier A without Bash: re-read the ledger and match the
      markers manually)
- [ ] Every cite-key marker `[@...]` used in the aspect file resolves to a
      ledger record (no invented keys)
- [ ] Every claim has a citation, source note, or method note
- [ ] Findings obey the aspect's inclusion/exclusion boundaries and the
      evidence-verification discipline
- [ ] Identifiers included (PMIDs / DOIs / NCT IDs / patent IDs / accessions)
- [ ] Tool/query log included
- [ ] Evidence gaps (if any) explicitly listed

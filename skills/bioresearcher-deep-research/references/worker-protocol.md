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
```

- ABSTRACT: <200 words describing the exact focus of the aspect and a list of
  detailed research items to investigate.
- Tier B (generic subagent): the orchestrator should ALSO inline into the
  prompt the Worker Rules below, the per-domain tool cheatsheet from
  `references/tool-selection.md`, and the citation format summary from
  `references/citations.md` - generic subagents may not have access to this
  skill's files.
- Tier A (dedicated `bioresearcher-dr-worker` plugin subagent): the worker
  reads this file plus `references/tool-selection.md` and
  `references/citations.md` itself at startup (via
  `${CLAUDE_PLUGIN_ROOT}`); the orchestrator sends ONLY the filled-in
  template below.

## File protocol

- Output files (exactly TWO):
  - `reports/<TOPIC>/<YOUR-FOCUS>.md` — the aspect report, where `<YOUR-FOCUS>`
    is the underscore-separated aspect name (e.g. `clinical_landscape.md`).
  - `reports/<TOPIC>/evidence/<YOUR-FOCUS>.jsonl` — the evidence ledger, one
    JSON record per potentially-citable source (see Worker rule 8).
- The write tool auto-creates parent directories - never use bash mkdir.
- The report file must be self-contained: a reader should understand the
  findings, the tools/queries used, and the sources cited without any other
  context.
- Report file structure: title, one-paragraph scope summary, findings with
  in-text citations, tool/query log (which biomcp tools + key argument
  values), and a full bibliography.

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
5. Citations: every claim gets [N] references; keep a numbered bibliography in
   `references/citations.md` format. Capture identifiers as you go: PMIDs,
  PMCIDs, DOIs, NCT IDs, patent IDs, GEO/SRA accessions, database IDs.
6. Retry logic: if a query fails, wait a few seconds, retry with a simpler
   query; at most 3 attempts per query before recording the gap and moving on.
7. Writing: succinct, accurate, professional - academic standard.
8. Evidence ledger (mandatory): maintain
   `reports/<TOPIC>/evidence/<YOUR-FOCUS>.jsonl` as you search.
   - AFTER EACH biomcp search/get call, append one record per source you
     might cite, copying fields VERBATIM from the tool result object
     (`pmid`, `pmcid`, `doi`, `title`, `authors`, `journal`,
     `publication_date`, `volume`, `issue`, `pages` for articles; the
     analogous identifier fields for other types). Fields the tool did not
     provide are `null` - NEVER invent values. Records without titles
     (e.g. LitSense hint results) are acceptable as-is.
   - Record shape: `{"schema": "bioresearcher-evidence/1", "key":
     "pmid:<PMID>" (or the canonical key for the type), "type": "article",
     "ids": {...}, "title": ..., "authors": [...], "journal": ..., "year":
     ..., "volume": ..., "issue": ..., "pages": ..., "url": ...,
     "provenance": [{"aspect": "<YOUR-FOCUS>", "tool": "<tool name>",
     "args": {...}, "retrieved_at": "<ISO timestamp>"}]}`.
   - Title-less records (typical: LitSense hits return only
     `pmid`/`pmcid`/`score`) MUST be enriched via `article_get(pmid)` - one
     sequential, server-paced call - BEFORE they may be cited; on failure
     take the standard retry ladder (rule 6), then leave the record in the
     ledger with a gap note in the aspect file - the orchestrator's verify
     step backfills what it can.
   - With Bash available: use
     `python3 <skill_dir>/scripts/evidence-ledger.py add <file> '<record JSON>'`
     for validation and normalization. Without Bash: write raw JSONL lines
     with the Write tool; the orchestrator's merge validates them.
   - BEFORE writing the bibliography, RE-READ your ledger file; compose
     every References entry by COPYING ledger fields. A bibliography entry
     must not contain any field absent from the ledger.

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
  exists, ends with a bibliography, AND its evidence ledger file exists with
  at least one record per cited source.
- If a worker fails or stalls, restart it (same prompt), max 3 restarts.
- Tell the user up front: "If subagents are stuck without progress for too
  long, interrupt and ask me to resume work."

## Sequential degradation (no subagent tool)

If the harness has no subagent/Task tool, the SAME protocol runs inline in the
main conversation, one aspect at a time:

1. Announce the aspect being worked on.
2. Apply Worker rules 2-8 exactly (same tool selection, retries, citation
   discipline, evidence ledger, file protocol).
3. Write `reports/<TOPIC>/<ASPECT>.md` and
   `reports/<TOPIC>/evidence/<ASPECT>.jsonl` before moving to the next aspect.
4. After the last aspect, proceed to synthesis (SKILL.md Step 5).

Sequential mode trades latency for context - keep per-aspect tool calls lean
(strict `limit`, narrow `sections`) so the accumulated context stays usable.

## Aspect completion checklist

- [ ] Output file exists at `reports/<TOPIC>/<ASPECT>.md`
- [ ] Evidence ledger exists at `reports/<TOPIC>/evidence/<ASPECT>.jsonl`
      with at least one record per cited source (rule 8)
- [ ] Every claim has a citation, source note, or method note
- [ ] Bibliography present, numbered by order of appearance, every entry
      copied from ledger fields (no field absent from the ledger)
- [ ] Identifiers included (PMIDs / DOIs / NCT IDs / patent IDs / accessions)
- [ ] Tool/query log included
- [ ] Evidence gaps (if any) explicitly listed

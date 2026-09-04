# Worker Protocol

The canonical contract for per-aspect research workers - both parallel
subagents and the sequential fallback in the main conversation.

## Overview

Each worker owns exactly ONE research aspect of a TOPIC. It queries biomcp
tools, collects identifiers, and writes one markdown file under
`reports/<TOPIC>/`. Workers never re-delegate, never fabricate, and never fall
back to internal knowledge for facts.

## Worker prompt template (orchestrator fills this in)

```
TOPIC: <TOPIC>
YOUR RESEARCH FOCUS: <RESEARCH-ASPECT>
DESCRIPTION: <ABSTRACT>
```

- ABSTRACT: <200 words describing the exact focus of the aspect and a list of
  detailed research items to investigate.
- The orchestrator should ALSO inline into the prompt: the Worker Rules below,
  the per-domain tool cheatsheet from `references/tool-selection.md`, and the
  citation format summary from `references/citations.md` - subagents may not
  have access to this skill's files.

## File protocol

- Output file: `reports/<TOPIC>/<YOUR-FOCUS>.md` where `<YOUR-FOCUS>` is the
  underscore-separated aspect name (e.g. `clinical_landscape.md`).
- The write tool auto-creates parent directories - never use bash mkdir.
- The file must be self-contained: a reader should understand the findings,
  the tools/queries used, and the sources cited without any other context.
- File structure: title, one-paragraph scope summary, findings with in-text
  citations, tool/query log (which biomcp tools + key argument values), and a
  full bibliography.

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

- Launch workers in parallel in batches of up to 5.
- Track each aspect in the todo list; mark complete when its output file
  exists and ends with a bibliography.
- If a worker fails or stalls, restart it (same prompt), max 3 restarts.
- Tell the user up front: "If subagents are stuck without progress for too
  long, interrupt and ask me to resume work."

## Sequential degradation (no subagent tool)

If the harness has no subagent/Task tool, the SAME protocol runs inline in the
main conversation, one aspect at a time:

1. Announce the aspect being worked on.
2. Apply Worker rules 2-7 exactly (same tool selection, retries, citation
   discipline, file protocol).
3. Write `reports/<TOPIC>/<ASPECT>.md` before moving to the next aspect.
4. After the last aspect, proceed to synthesis (SKILL.md Step 5).

Sequential mode trades latency for context - keep per-aspect tool calls lean
(strict `limit`, narrow `sections`) so the accumulated context stays usable.

## Aspect completion checklist

- [ ] Output file exists at `reports/<TOPIC>/<ASPECT>.md`
- [ ] Every claim has a citation, source note, or method note
- [ ] Bibliography present, numbered by order of appearance
- [ ] Identifiers included (PMIDs / DOIs / NCT IDs / patent IDs / accessions)
- [ ] Tool/query log included
- [ ] Evidence gaps (if any) explicitly listed

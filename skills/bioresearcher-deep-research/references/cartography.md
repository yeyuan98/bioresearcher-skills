# Empirical Cartography (map-first mode)

Optional Stage-1 field mapping for the deep-research skill: discover the
method/category landscape empirically BEFORE proposing the research plan,
then run the standard aspect workflow on user-selected categories. This mode
is field-, community-, and question-agnostic: it applies to any
category-discovery question in the biomedical realm (methods, approaches,
evidence classes, taxonomies, landscapes), in any discipline.

## When map-first applies

- OFFER it (inside the Step 1 interview, one extra question, only when the
  query is category-discovery shaped): the deliverable is a taxonomy or
  landscape - "what methods/approaches/classes/evidence types exist for X",
  "landscape of X", "how is X done across ...", "categories of X".
- Do NOT offer for entity-anchored queries (one drug, variant, trial, gene,
  disease) - the default workflow is already right.
- The `map-first` prefix forces the mode on without the offer question.
- Default OFF: with map-first off, every workflow step, file, gate, and
  report section is identical to the non-cartography skill. The only
  default-mode addition is the conditional offer question itself.

## Primary scope vs context scope

The user designates a PRIMARY SCOPE - the literature segment where category
recall is the success criterion - defined by any combination of community,
discipline, disease/therapeutic area, modality, technique family, organism,
data type, or question type. Everything else is CONTEXT SCOPE: mapped for
awareness, never exhaustively. The orchestrator infers a candidate primary
scope from query vocabulary (e.g. "industry-ready", "clinical practice",
"food science", "diagnostic assay development") and asks for confirmation
in the same interview message - the recall target depends on it, and users
rarely name it spontaneously. If the user declines to specify, run with the
scope implied by the query terms and record the assumption in plan.md.

## Two-tier dispatch

Focus tier (2 workers, scoped to the primary scope, method-unpinned):

- `cartography_synthesis_mining` - transcribe the scope's OWN synthesis
  ecosystem (reviews, guidelines, consensus statements, position papers,
  protocol series): harvest their section structures as candidate
  categories and expand via backward citations (article_get
  sections=["citation"]) to founding anchors. The scope's own taxonomies
  are the recall target.
- `cartography_boundary_vocabulary` - hunt categories that answer the
  question's underlying information need but self-describe under different
  terms: adjacent vocabulary, hypernyms, enabling/auxiliary measurements,
  neighboring endpoints. Ask, per formulation of the information need:
  "what does this scope call the things that do X?"

Context tier (1-2 workers, fully anti-pinned, breadth across the rest of
the field) - pick archetypes by question shape:

- `cartography_context_principle` - enumerate the distinct
  experimental/analytical principles by which the question is answered;
  let the categories emerge from retrieved records.
- `cartography_context_casespace` - partition the question's object space
  (barriers, diseases, organisms, tissues, modalities - whatever partitions
  it) and map category coverage per stratum.
- `cartography_context_segment` - sweep how OTHER communities/disciplines
  frame and categorize the same question; vocabulary differences are
  themselves findings.

Budget: ~15-25 biomcp calls per cartographer (hard cap 30); parallel
batches of up to 5; Tier A/B dispatch and the Tier C sequential fallback
follow SKILL.md Step 4, using the cartographer template below.

Conditional remediation axis (orchestrator-dispatched after the focus tier
returns, only when needed):

- `cartography_venue_sweep` - fires IFF the focus tier found fewer than two
  field-spanning syntheses OR the interview flagged an emerging area: sweep
  the primary scope's primary-literature venues for categories its thin
  synthesis ecosystem under-covers.

## Anti-pinning contract (binding on every cartographer)

1. No method names, assay names, or category lists enter a cartographer
   prompt. Focus-tier prompts pin the PRIMARY SCOPE and the question's
   information need - never methods. Context-tier prompts pin nothing but
   the question.
2. A category may be listed ONLY if anchored in retrieved records: either
   >= 1 retrieved synthesis whose structure demonstrably contains it, OR
   >= 2 primary records found via search.
3. Never assert a category from model memory; memory shapes query design
   only. A failed query line is logged under Evidence Gaps - never turned
   into a category.
4. Probe deliberately across the assigned axis before concluding; do not
   stop at the first handful of categories.

## Cartographer prompt template

```md
TOPIC: <TOPIC>
YOUR RESEARCH FOCUS: cartography_<axis>
AXIS: <archetype name + one-line instantiation, e.g. "case-space partition:
the variable that partitions this question's object space is <variable>">
PRIMARY SCOPE: <primary scope - focus tier only; context tier: "none -
stay anti-pinned">
MISSION: Produce an empirically anchored, high-level map of the major
method/category families for <question>, entering the field from your
axis. 15-30 categories maximum (merge near-duplicates and say so).
OUTPUT: reports/<TOPIC>/category_map_<axis>.md (title; one-paragraph scope
summary; ONE subsection per category: name, one-line description, 1-3
anchor papers as cite-key markers, maturity signals - synthesis existence,
approximate hit volume, founding era - and which queries surfaced it; then
"## Query Log" and "## Evidence Gaps" with failed query lines) plus
reports/<TOPIC>/evidence/cartography_<axis>.jsonl.
SKILL_DIR: <absolute skill dir>   # Tier B only; resolve before dispatch
EXECUTION RULE: Do NOT read or inspect evidence-ledger.py or other skill
scripts; all schemas and commands are fully specified here.
```

Tier B orchestrators additionally inline the anti-pinning contract, the
anchoring rule, the ledger discipline (worker-protocol.md rules 5-8), and
the completion-gate command. Cartographers follow every Worker rule in
`references/worker-protocol.md` (sequential calls, retry ladder, verbatim
ledger records, no bibliography) with the category map replacing the
aspect report and `check --markers category_map_<axis>.md` as the gate.

## Taxonomy merge + coverage audit (orchestrator)

Merge all axis maps into `reports/<TOPIC>/category_taxonomy.md`:

- Deduplicated category list; per category: name, one-line description,
  anchors, maturity signals, surfaced-by axes (cross-axis confirmation is
  a robustness signal), and an adoption tier (1 = established /
  industry-grade, 2 = discovery-grade, 3 = emerging/niche) - tiers are
  scope-relative and the taxonomy must say so explicitly.
- "## Coverage Audit" section: reconcile the merged map against the
  enumerated method/category lists of >= 2 scope-internal syntheses. Any
  category a synthesis enumerates that the map lacks must be added (with
  anchors) or explained as a declared gap. If the scope yielded fewer than
  2 syntheses, anchor the audit on cross-axis overlap instead and flag
  synthesis scarcity (this also triggers the venue-sweep remediation).
- "## Unanchored Leads" section: suspected-but-unanchored territories,
  listed as the query lines tried - never as categories.

## Interaction matrix

| Mode | Behavior |
|------|----------|
| Default, heuristic fired | Step 1 interview includes ONE offer question ("empirical field mapping first?" - recommend ON) and, if accepted, primary-scope confirmation in the same message; nothing else changes |
| Default, heuristic not fired | Identical to the non-cartography skill: no question, no cartography files |
| `map-first` | Cartography on without the offer question; the interview still runs (scope + clarifiers) unless `no-interview` is also present |
| `map-first` + `no-interview` | Cartography on; taxonomy -> plan conversion is autonomous: record the category-selection rationale and coverage-audit outcome in plan.md + assumptions.md, and state in the report Limitations that scope selection was not user-reviewed |
| `no-interview` alone | Identical to the non-cartography skill (Step 1 is skipped, so no offer fires) |

Cartography does NOT waive the Step 2 plan review: with map-first on (and
no `no-interview`), the taxonomy walk-through IS the plan review - present
the taxonomy with tiers, coverage-audit results, and a recommended category
selection, then iterate with the user until the plan is confirmed (same
rounding rules as Step 2). Selected categories become the Step 3 aspects
(standard deep-dive ABSTRACTs; the taxonomy's inclusion signals seed the
ABSTRACT boundaries; the set may exceed 5 when the user insists - batch
dispatches accordingly). Categories discovered but not selected stay
citable: their cartography ledgers merge into sources.jsonl in Step 5a
like any aspect ledger, and the report carries them in the optional
landscape section (`references/report-template.md`).

## Report integration

- Landscape section (map-first only): one line per discovered-but-
  unselected category, citing its cartography anchors - acknowledged, not
  researched; the report must say so.
- Decision guide by question scenario (map-first default-on): one compact
  "scenario -> recommended method sequence -> tier -> caveat" table per
  user-confirmed question scenario, built only from ledger-verified
  sources, tiers labeled scope-relative.
- The field's own taxonomy disagreements (syntheses classifying the same
  subject differently) are reported in Analysis Methodology or Findings,
  never silently resolved.

## Degradation + consistency

- No subagent tool: run axes sequentially in the main conversation (same
  contract, leaner budgets).
- Server unavailable: cartography cannot run - proceed with the default
  workflow and say so explicitly.
- map-first OFF: behavior is identical to the non-cartography skill
  (steps, files, gates, report structure). The existing agent-test
  deep-research suite (q01-q07) is the regression guarantee and stays
  unchanged.

## Out of scope / future work

- Report update mode (re-running an existing report): a verify-and-refresh
  worker tier for previously covered core areas - deliberately NOT part of
  map-first, which always researches from scratch.

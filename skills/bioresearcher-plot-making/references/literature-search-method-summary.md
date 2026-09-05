# Literature Search Method Summary Specification

This guide specifies the production of publication-grade figures that synthesize complex, heterogeneous biomedical literature, clinical case registers, and preclinical assay cascades into standardized vector graphics.

---

## 1. Provenance Architecture & Verification Protocol

Literature syntheses risk metric drift, recall errors, and false categorizations. Enforce strict verification before drawing:

1. **NCBI E-Utilities Primary Verification**:
   - Verify every PMID against NCBI E-Utilities (`esummary` / `efetch`).
   - Extract and cross-check official publication year, journal, author list, and compound identifiers.
   - *Case Lesson*: LLM recall frequently confuses adjacent PMIDs (e.g. unrelated papers or case reports). Never transcribe PMIDs from memory.
2. **Evidence Balance Principle**:
   - For every flagged safety risk or adverse event, include at least one well-tolerated benchmark or counterexample.
   - For uncharacterized areas, include dedicated "evidence gap" indicators (gray markers) rather than omitting the domain.
3. **Information Partitioning**:
   - **On-Figure**: High-level qualitative hazard descriptors, developmental stage markers, and compact PMID tags (`tag_right(ax, "PMIDs ...", y)`).
   - **In Legends (`LEGENDS.md`)**: Full quantitative cohort sizes, trial names, percentage incidences, and detailed assay parameters.

---

## 2. Declarative Data Contracts

Decouple literature curation from matplotlib scripts using structured TSV tables.

### Contract A: Developmental Case Register (`literature_cases.tsv`)
Represents clinical and preclinical benchmark cases mapped across development:
```tsv
entity_name	structural_tag	hazard_description	development_stage	status	pmids
Agent_Alpha	Kinase inhibitor (type II)	Grade-3 hepatotoxicity; Phase 3 terminated	phase 3	adverse_signal	00000001
Agent_Beta	Kinase inhibitor (type I)	Tolerated benchmark; 0% transaminase elevation	approved	no_signal	00000002
Agent_Gamma	Proteolysis degrader	Chronic tissue accumulation; under-reported	preclinical	under_reported	00000003
```
*Valid Stages*: `preclinical | phase 1 | phase 2 | phase 3 | approved`  
*Valid Statuses*: `adverse_signal (red) | no_signal (green) | under_reported (gray)`

### Contract B: Preclinical Detection Cascade (`assay_cascade.tsv`)
Represents orthogonal screening assays arranged in a tiered detection matrix:
```tsv
assay_name	readout	method_family	screening_stage	pmids
Reporter gene panel	Stress pathway activation	flow cytometry	preclinical	00000004
Viability panel	Growth inhibition IC50	biochemical	in vitro lead	00000005
Surface plasmon res	Binding kinetics	biochemical	orthogonal screen	00000006
```
*Valid Method Families*: `in silico | proteomics | flow cytometry | biochemical | MS bioanalysis | imaging | in vivo`

### Contract C: Structured Evidence Matrix (`evidence_table.tsv`)
Represents single-panel literature landscapes:
```tsv
row_id	scope_tag	citation	journal	pmid	test_system	sample_matrix	analytical_method	readout
1	core	Author 2025	Nat Commun	00000010	Engineered kinase inhibitor	A549 cells	Phosphoproteomics	ERK pathway suppression
2	protocol	Author 2016	Nat Protoc	00000011	Morphological assay	HeLa cells	High-content imaging	Phenotypic feature matrix
3	transfer	Author 2024	Bioorg Chem	00000012	Small-molecule reference	HepG2 spheroids	LC-MS/MS	Off-target binding screen
```
*Valid Scope Tags*: `core (amber badge) | protocol (dagger †) | transfer (double dagger ‡) | benchmark`

---

## 3. Visual Archetype 1: The Three-Panel Composite (180 x 120 mm)

The Three-Panel Composite pairs a biological concept schematic with an empirical case register and an assay detection matrix:

```
+------------------------------------------+-------------------------------------------+
| Panel a: Mechanistic Concept Diagram     | Panel b: Developmental Case Register      |
| [0.035, 0.355, 0.435, 0.585]             | [0.525, 0.355, 0.440, 0.585]              |
| - Topological cellular layout            | - Interventions + structural tags         |
| - Membrane bilayers & receptors          | - Plain-language hazard summaries         |
| - Compartments: cytosol, lysosome, mito  | - Developmental timeline dot axis         |
| - Directional trajectory of risk         | - Tri-color status dots (red/green/gray)  |
+------------------------------------------+-------------------------------------------+
| Panel c: Preclinical Detection Cascade Matrix Strip [0.035, 0.050, 0.930, 0.270]     |
| - Columns: Assay | What it reads out | Method Family Chip (colored) | Typical Stage  |
| - Alternating row banding (#F7F7F7) | Fixed column grid anchors                      |
+--------------------------------------------------------------------------------------+
```

### Layout Rules
- **Panel a (Mechanics)**: Maintain strict biological topology. Receptors must sit within lipid bilayers with lumen/extracellular orientation preserved. Intracellular routes must terminate in bounded organelle compartments.
- **Panel b (Cases)**: Position timeline stage columns with alternating baselines ($y = 9.50$ vs $8.98$) to prevent PDF text merging. Stagger rows with a pitch of $1.35$–$1.45$ data units. Directly above the provenance footer, always render the explicit status dot glyph legend:
  ```python
  for x_pt, col, lbl in [(0.30, PALETTE["danger"], "adverse signal"),
                         (3.40, PALETTE["safe"], "no signal"),
                         (6.70, PALETTE["gap"], "under-reported")]:
      axb.plot(x_pt, 0.85, "o", color=col, ms=4.0, mec="white", mew=0.5)
      axb.text(x_pt + 0.25, 0.85, lbl, fontsize=5.2, color=col, fontweight="bold", va="center")
  ```
- **Panel c (Assays)**: Full-width strip with alternating row backgrounds (`#F7F7F7`). Method family chips use rounded boxes (`FancyBboxPatch`, rounding 0.10) with bold 5.2 pt white text. Always include the assay PMID provenance footer at valid data coordinate $y = 0.35$ (inside $[0, 10]$):
  ```python
  tag_right(axc, "assay PMIDs: " + " · ".join(unique_pmids), 0.35)
  ```

---

## 4. Visual Archetype 2: Single-Panel Structured Evidence Table (180 x 124–128 mm)

For emerging literature landscapes, synthesize heterogeneous study designs into an vector-rendered evidence table:

- **Single Axis**: `[0.030, 0.035, 0.940, 0.920]`
- **Header Banner**: Bold thematic title with scope qualification text.
- **Fixed Column Grid**: Allocate horizontal positions based on data complexity:
  - Column 1: Row index / scope badge
  - Column 2: Citation (`Author YYYY`), Journal, PMID
  - Column 3: Test System / Compound
  - Column 4: Sample Matrix / Cell Type
  - Column 5: Analytical Workflow
  - Column 6: Quantitative / Phenotypic Readout
- **Font-Aware Text Wrapping**: Wrap multi-line cell entries dynamically using `wrap_cell_text()` to prevent text from overflowing column bounds and failing collision audits.
- **Taxonomic Footnote**: Include explicit scope exclusions and sample boundaries at the bottom of the table.

---

## 5. Low-Level Matplotlib Engineering Patterns

### Dynamic Text Spacing
Proportional fonts cause character-count heuristics to fail. Always compute inline spacing using `right_edge`:
```python
from plot_helpers import right_edge

t_name = axb.text(0.15, top - 0.34, case.entity_name, fontsize=6.2, fontweight="bold")
tag_x = right_edge(axb, t_name) + 0.30
axb.text(tag_x, top - 0.34, case.structural_tag, fontsize=5.2, color="#5A5A5A")
```

### Provenance Edge Pinning
Pin citations flush against panel right edges using blended transforms:
```python
from plot_helpers import tag_right

tag_right(axa, "mechanistic anchors: PMIDs 12345678, 23456789", 0.22)
```

### Eliminating PDF Baseline Merging
When multiple headers share identical vertical coordinates, PDF extraction tools merge adjacent words into single garbled text runs. Always alternate header baselines:
```python
stages = [
    ("preclinical", 5.95, 9.50),
    ("phase 1",     7.20, 8.98),
    ("phase 3",     8.40, 9.50),
    ("approved",    9.42, 8.98),
]
for name, x, y in stages:
    axb.text(x, y, name, fontsize=5.2, color="#5A5A5A", fontweight="bold", ha="center")
```

---

## 6. Literature Summary QA Gate Checklist

Before certifying any literature summary figure for release, verify:

- [ ] Every PMID is validated against NCBI E-Utilities (`esummary`/`efetch`).
- [ ] At least one tolerated counterexample and any evidence gaps are explicitly displayed.
- [ ] Script resolves paths via `Path(__file__).resolve().parent`.
- [ ] Biological topology is correct (bilayers, organelles, flow directions).
- [ ] Column header baselines are staggered to prevent PDF text merging.
- [ ] Inline text runs are spaced using `right_edge` dynamic metrics.
- [ ] Table cells are wrapped using `wrap_cell_text` (no column overflow).
- [ ] Figure passes `require_matplotlib_panel_alignment` with deviation $\le 1.5\text{ pt}$.
- [ ] Vector PDF passes `audit_figure_collisions.py` with 0 FAIL.
- [ ] All rendered text meets the $\ge 5.0\text{ pt}$ font size floor.

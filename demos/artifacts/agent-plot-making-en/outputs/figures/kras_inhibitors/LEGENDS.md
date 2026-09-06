# LEGENDS.md — fig1_kras_landscape

## Figure 1 | Conformational plasticity and binder interaction landscape of KRAS

**a**, Structural overlay of KRAS G12C ON and OFF switch states (headless PyMOL
ray-traced render; probe-pass anchors from `render_anchors.json`). Vector labels
mark the KRAS core (right anchor) and the Switch-II lobe with its covalent
inhibitor AMG 510 / sotorasib (left anchor). Opaque soft-gray receptor surface
with two-sided lighting and +18° cavity tilt; no in-scene bitmap text.

**b**, Per-residue Cα displacement (Å) between the two switch states across
residues 1–169 (chain A, `conformer_rmsf.tsv`). Shaded bands mark the Switch-I
(residues 30–38) and Switch-II (residues 60–69) regions. Peak callouts are
placed at algorithmic windowed maxima (Asp33 = 3.25 Å in Switch-I; Glu63 =
4.12 Å in Switch-II). The dashed line marks the sequence mean (0.62 Å),
integrated into the y-axis as a two-line tick label to avoid in-plot box
collisions.

**c**, Binder–residue interaction hotspot matrix (`binder_hotspot_matrix.tsv`).
Cell shade encodes buried surface area (BSA) per receptor residue (Å², Blues
scale, horizontal colorbar below). Black dots mark hydrogen bonds and blue
triangles mark salt bridges (glyph legend below panel). Columns are grouped by
consensus site — Switch-I (Y32), Switch-II (G60, Q61, E62, Y64), Pocket (H95,
Y96, Q99), and Core (V9, G12) — with site chips above and vertical partition
dividers; residue headers use staggered baselines. Rows: Sotorasib, Adagrasib,
BI-2852, MRTX-1133, Monobody NS1.

**d**, Total interface BSA (Å²) per binder, stacked by receptor subunit
(`binder_summary_data.tsv`): dark segments = primary (chain A) contribution,
light segments = secondary/scaffold contribution (Monobody NS1 only, 135.2 Å²).
Stack totals equal the exact sum of partitioned chain values (asserted at
generation time). Bar colors encode binder modality (blue, small molecule;
green, protein binder; legend inside panel). Row order is synchronized with the
heatmap in **c** (top-to-bottom).

### Data provenance

| Binder | Modality | Target site | PDB entry |
| --- | --- | --- | --- |
| Sotorasib (AMG 510) | Small molecule | Switch-II | 6OIM |
| Adagrasib (MRTX-849) | Small molecule | Switch-II | 6USZ |
| BI-2852 | Small molecule | Switch-I | 6GJ8 |
| MRTX-1133 | Small molecule | Switch-II | 7RPZ |
| Monobody NS1 | Protein | Allosteric | 5V6V |

### QA certification (three-layer pipeline)

| Gate | Result |
| --- | --- |
| Layer 1 — static preflight (sans-serif, 7 pt base, `pdf.fonttype=42`, `svg.fonttype='none'`) | PASS |
| Layer 2 — `audit_panel_alignment.py` (≤ 1.5 pt, 4 comparisons) | PASS — 0 fail, 0 warn (`fig1_kras_landscape.alignment.json`) |
| Layer 2 — `audit_figure_collisions.py` (0 FAIL required) | PASS — 0 fail, 0 warn (`fig1_kras_landscape.collision-audit.json`) |
| Layer 2 — `audit_pdf_text.py` (≥ 5.0 pt glyph floor) | PASS — minimum found 5.2 pt, 0 runs below |
| Layer 3 — vision-model semantic review | PASS — panel a labels legible and frame-contained; panel c/d row order synchronized; Switch-I/Switch-II bands labeled |

### Files

- `fig1_kras_landscape.pdf` — vector (submission)
- `fig1_kras_landscape.svg` — editable vector
- `fig1_kras_landscape.png` — 300 dpi raster
- `fig1_kras_landscape.py` — deterministic generation script (uv env: `../../.venv/bin/python`)
- `data/` — declarative input contracts (TSV/JSON/PNG) copied from `../../data/`

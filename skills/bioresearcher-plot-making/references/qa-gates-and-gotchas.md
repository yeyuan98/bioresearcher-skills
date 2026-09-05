# Quality Assurance Gates and Hard-Earned Gotchas

This guide details the three-layer quality assurance (QA) pipeline and provides the complete catalog of hard-earned scientific plotting gotchas.

---

## 1. The Three-Layer Quality Assurance Architecture

Every figure produced under `bioresearcher-plot-making` must pass three independent verification layers before publication.

```
+-----------------------------------------------------------------------------------+
| LAYER 1: STATIC SOURCE PREFLIGHT (Fast AST Check)                                 |
| - Verifies rcParams: font.family='sans-serif', font floor >= 5.0 pt               |
| - Verifies vector export: pdf.fonttype=42, svg.fonttype='none'                    |
| - Confirms explicit panel alignment gate call in script source                    |
+-----------------------------------------------------------------------------------+
                                         │ PASS
                                         ▼
+-----------------------------------------------------------------------------------+
| LAYER 2: RENDER-TIME DETERMINISTIC GEOMETRY GATES                                 |
| 1. Panel Alignment Gate (scripts/audit_panel_alignment.py):                       |
|    - Measures panel bounding boxes; enforces max tolerance <= 1.5 pt on rows/cols |
|    - Exports *.alignment.json audit trail and *.alignment.svg overlay            |
| 2. Vector PDF Collision Audit (scripts/audit_figure_collisions.py):                |
|    - Detects text-text collisions, text-stroke crossings, canvas clipping         |
|    - Enforces 0 FAIL (contained chip/badge fills permitted with WARN review)      |
| 3. Glyph Floor Stream Audit (scripts/audit_pdf_text.py):                          |
|    - Decodes PDF FlateDecode streams; verifies all 'Tf' font operators >= 5.0 pt  |
+-----------------------------------------------------------------------------------+
                                         │ PASS
                                         ▼
+-----------------------------------------------------------------------------------+
| LAYER 3: VISION-MODEL PERCEPTUAL INSPECTION                                       |
| - Single-question semantic verification queries                                   |
| - Evaluates biological topology, pocket illumination, and unoccluded views        |
+-----------------------------------------------------------------------------------+
```

---

## 2. Bundled Execution of Layer 2 QA Tools

The skill bundles three deterministic audit tools under `scripts/`:

### A. Panel Alignment Gate (`audit_panel_alignment.py`)
Verifies that multi-panel rows and columns align to within $1.5\text{ pt}$:
```python
from audit_panel_alignment import require_matplotlib_panel_alignment

# Multi-panel composite layout
require_matplotlib_panel_alignment(
    fig,
    json_out="figure.alignment.json",
    overlay_svg="figure.alignment.svg",
    tolerance_pt=1.5,
    strict=True,
    panel_ids={axa: "a", axb: "b", axc: "c"},
    row_groups=[["a", "b"]],
)

# Single-panel table layout (invariant: provide panel_ids to generate audit trail)
require_matplotlib_panel_alignment(
    fig,
    json_out="table.alignment.json",
    overlay_svg="table.alignment.svg",
    tolerance_pt=1.5,
    panel_ids={ax: "a"},
)
```

### B. Vector PDF Collision Audit (`audit_figure_collisions.py`)
Extracts text and path geometry from exported PDFs using PyMuPDF to flag overlaps:
```bash
./.venv/bin/python skills/bioresearcher-plot-making/scripts/audit_figure_collisions.py figure.pdf --json-out figure.collision-audit.json
```
- **FAIL Criteria**: Uncontained text-text collisions, text-stroke crossings, or canvas clipping.
- **WARN Criteria**: Contained text overlays (e.g. text inside colored method family chips).

### C. Glyph Size Floor Audit (`audit_pdf_text.py`)
Parses low-level PDF font definitions to ensure no text falls below $5.0\text{ pt}$:
```bash
./.venv/bin/python skills/bioresearcher-plot-making/scripts/audit_pdf_text.py figure.pdf --min-pt 5.0
```

---

## 3. The Catalog of Hard-Earned Gotchas

### Process & Environment
1. **Silent CWD Audit Pass Trap**:
   - *Failure*: Saving with relative paths (`fig.pdf`) writes to the process current working directory. Running from repo root writes outputs to root while QA scripts audit stale files in the subfolder.
   - *Fix*: Always resolve paths via `Path(__file__).resolve().parent`.
2. **Silent Text Patch Failure**:
   - *Failure*: Replacing text coordinates via regex or string replacement fails silently when surrounding lines drift, creating near-duplicate elements that trigger collision failures.
   - *Fix*: Verify exact string replacements; rerun full QA suite after every edit.

### 3D Macromolecular Rendering
3. **Multi-Ligand Clutter**:
   - *Failure*: Superimposing multiple full macromolecular binders completely buries the receptor.
   - *Fix*: Prune binders to contact fragments: `byres ((ligand) within 8.0 of receptor) extend 3`.
4. **Dark Cavity & Back-Face Voids**:
   - *Failure*: Transparent surfaces produce black internal faces and polygon clipping.
   - *Fix*: Use an opaque soft-gray surface (`#CDCDD4`) with `two_sided_lighting 1`, `ambient 0.50`, and a $+18^\circ$ camera tilt.
5. **Distorted In-Scene Raster Labels**:
   - *Failure*: PyMOL bitmap text (`cmd.label`) pixelates and scales unpredictably.
   - *Fix*: Run a probe render pass to export 2D projected coordinates (`render_anchors.json`); render native vector text in Matplotlib.
6. **Multi-Ligand Crystal Mixing**:
   - *Failure*: Co-crystal PDBs containing multiple binders aggregate improperly when filtered only by PDB ID.
   - *Fix*: Key interface extraction on the tuple: `(pdb_id, copy_id, binder_id)`.

### Geometry & Axes Alignment
7. **`aspect='equal'` Letterbox Desync**:
   - *Failure*: `aspect='equal'` letterboxes axes within declared rectangles; row panels silently drift in height by points.
   - *Fix*: Panels sharing a row must have identical physical aspect ratios or use `equal=False`.
8. **Hidden Rounded-Corner Arcs**:
   - *Failure*: `FancyBboxPatch` corners cut inward; text near rectangular edges collides with curvature strokes.
   - *Fix*: Leave generous internal padding ($> 1.5 \times \text{rounding\_size}$).
9. **Unclipped Text Spills**:
   - *Failure*: `Patch` artists are clipped to axes by default, but `Text` has `clip_on=False`.
   - *Fix*: Never park text outside declared axes limits; labels spill into neighboring subplots.
10. **Curved Arrow Apex Bulges**:
    - *Failure*: Curved arrows (`arc3,rad=0.2`) bulge outward; markers on paths get flagged as text-through-stroke.
    - *Fix*: Place badges beside paths, not on them. Keep curvature radius minimal.

### Typography & Text Metrics
11. **Glyph Advance vs Ink Bbox**:
    - *Failure*: `get_window_extent()` only measures drawn ink, ignoring font side bearings; inline text runs collide.
    - *Fix*: Use `right_edge()` combining ink bbox and renderer advance width.
12. **PDF Text Run Merging**:
    - *Failure*: Adjacent column headers sharing an identical vertical baseline get merged into garbled text runs by PDF parsers.
    - *Fix*: Stagger vertical baselines alternately ($y = 9.50$ vs $8.98$).
13. **Legend Accumulation Drift**:
    - *Failure*: Chaining dynamic text measurements sequentially across horizontal legends accumulates errors.
    - *Fix*: For static legend items, use fixed relative offsets rather than chained dynamic measurements.
14. **Multi-Line Independent Centering Spill**:
    - *Failure*: Multi-line text with `ha='center'` centers each line independently; one long line breaks container bounds and clips or collides with adjacent strokes.
    - *Fix*: Keep line lengths balanced or compute explicit block centering using `wrap_cell_text()`.

### Data Synthesis & Quantitative Mechanics
15. **In-Plot Mean Box Collisions**:
    - *Failure*: Placing a mean baseline text box inside a profile plot collides with high data spikes.
    - *Fix*: Remove in-plot box; integrate mean label directly into y-axis tick labels (`f"{mean:.2f}\n(mean)"`).
16. **Manual Callout Coordinate Drift**:
    - *Failure*: Manually placing peak callout arrows leads to arrows pointing at sub-peaks or background noise.
    - *Fix*: Compute callout coordinates via algorithmic peak picking (`np.argmax(...)`).

### Vision Model Inspection
17. **Vision LLM Timeout on Complex Prompts**:
    - *Failure*: Asking multiple visual questions in one prompt causes timeouts and hallucinations.
    - *Fix*: Ask single-question, short prompts sequentially. Trust measured PDF coordinates for geometry.

### Synchronized Multi-Panel Plots
18. **`imshow` vs `barh` Vertical Inversion & Row Drift**:
    - *Failure*: Matplotlib `imshow` defaults to top-to-bottom (`origin="upper"`), whereas `barh` plots bottom-to-top. Furthermore, default 5% axis margins cause horizontal bar centers to drift by multiple points from heatmap rows.
    - *Fix*: Invert y-coordinates (`y_pos = np.arange(n)[::-1]`) AND explicitly set `ax.set_ylim(-0.5, n - 0.5)` to eliminate vertical row drift.

# Structural Biology Binder Visualization Specification

This guide specifies the production of publication-grade figures for protein–binder complexes, conformational plasticity, and multi-ligand interaction landscapes.

---

## 1. Domain Abstraction: The Entity-State-Topology-Matrix (ESTM) Model

To keep visualization pipelines target-agnostic, abstract concrete biological entities into four standardized roles:

1. **Target Receptor Entity**:
   - **Primary Subunit**: Functional or catalytic chain carrying core interaction domains.
   - **Secondary Subunit**: Heterodimer partner, invariant light chain, or structural scaffold.
   - **Domain Architecture**: Contiguous residue intervals defining structural subdomains.
2. **Conformational & Dynamic States**:
   - **Reference State**: Apo, resting, wild-type, or physiological baseline structure.
   - **Perturbed State**: Holo, active, acidic/basic, mutant, or simulated conformation.
   - **Displacement Metric**: Euclidean vector displacement ($\Delta r_i = \|\mathbf{r}_i^{\text{state}_2} - \mathbf{r}_i^{\text{state}_1}\|_2$) or root-mean-square fluctuation (RMSF).
3. **Binder Modality Registry**:
   - Modalities: Monoclonal antibodies/Fabs, engineered scaffold proteins, cyclic/linear peptides, small molecules.
   - Status: Active lead, preclinical benchmark, terminated/failed candidate, evidence gap.
4. **Interaction Hotspot Topology**:
   - Consensus Sites: Spatially segregated binding pockets (e.g. Site 1, Site 2).
   - Interaction Dimensions: Continuous buried surface area (BSA) and discrete non-covalent contacts (hydrogen bonds, salt bridges).

---

## 2. Declarative Data Contracts

Decouple scientific data curation from rendering code by adhering to strict TSV/JSON schemas.

### Contract A: Conformer Dynamics (`conformer_rmsf.tsv`)
Stores per-residue C$\alpha$ displacement between structural states:
```tsv
resnum	resname	chain_id	chain_role	domain	displacement_A	b_factor
10	ALA	A	Primary	Domain1	0.4500	42.10
11	GLY	A	Primary	Domain1	0.3200	38.50
90	ASP	A	Primary	Domain2	0.2150	22.40
2	VAL	B	Secondary	Scaffold	0.4120	18.20
```

### Contract B: Binder Hotspot Matrix (`binder_hotspot_matrix.tsv`)
Composite column headers `<site>:<residue>` enable automatic generation of vertical partition dividers and site header chips. Cells use triple-encoding: `BSA_A2|HBOND_FLAG|SALTBRIDGE_FLAG`:
```tsv
binder_name	modality	target_site	Site1:R101	Site1:D105	Site2:K201	Site2:E204
Binder_Fab_1	FAB	Site1	112.5|1|0	84.2|1|0	0.0|0|0	0.0|0|0
Binder_Fc_2	FC	Site1	46.3|1|0	107.7|0|0	0.0|0|0	0.0|0|0
Binder_Protein_3	PROTEIN	Site2	0.0|0|0	0.0|0|0	188.3|1|0	0.0|0|0
```

### Contract C: Binder Summary Metrics (`binder_summary_data.tsv`)
Stores energetic metrics partitioned by receptor subunit:
```tsv
binder_id	binder_name	modality	target_site	bsa_primary	bsa_secondary	bsa_total	n_hbonds	n_saltbridges
PDB1	Binder_Fab_1	FAB	Site1	520.0	80.0	600.0	4	0
PDB2	Binder_Fc_2	FC	Site1	310.0	22.0	332.0	2	1
PDB3	Binder_Protein_3	PROTEIN	Site2	640.0	90.0	730.0	6	2
```

### Contract D: Projected Chain Anchors (`render_anchors.json`)
Stores 2D projection coordinates $(c_x, c_y)$ extracted from PyMOL camera probe passes:
```json
{
  "frame": [2200, 1500],
  "chain_labels": {
    "primary": {
      "display_text": "Primary Subunit",
      "cx": 0.85,
      "cy": 0.50,
      "side": "right"
    },
    "secondary": {
      "display_text": "Secondary Subunit",
      "cx": 0.15,
      "cy": 0.50,
      "side": "left"
    }
  }
}
```

---

## 3. Headless PyMOL Orchestration Protocol

Run PyMOL directly from the project-local uv environment (`./uv venv .venv` once, then `VIRTUAL_ENV="$(pwd)/.venv" ./uv pip install pymol-open-source`).
Execution modes:
- **Python API**: Run scripts using `./.venv/bin/python script.py` with `from pymol import cmd`.
- **Virtualenv CLI**: Run standalone PyMOL scripts via `./.venv/bin/pymol -cq script.py`.

Adhere to these essential rendering rules:

### A. Contact-Fragment Pruning & Ligand Display
Superimposing full-length macromolecular complexes buries the receptor. Prune protein binders to contact interfaces:
```python
# Select residues within 8.0 Angstroms of receptor, extend by 3 residues for ribbon continuity
frag_sel = f"byres (({ligand_obj} and ({ligand_chains})) within 8.0 of ({receptor_obj}))"
cmd.select(f"frag_{code}", f"byres (({frag_sel}) extend 3)")
cmd.show("cartoon", f"frag_{code}")

# Small molecules / covalent inhibitors: show in sticks with element coloring (orange carbons)
cmd.show("sticks", f"{ligand_obj} and not polymer")
cmd.color("orange", f"{ligand_obj} and name C*")
```

### B. Camera Orientation Modes (Disentangled)

Disentangle the camera framing based on panel objective:

- **Mode A (Conformational Ribbon Superposition)**:
  Used when comparing structural states (apo vs holo, active vs inactive) to view secondary structure without cavity foreshortening:
  ```python
  cmd.orient("ref_structure")
  cmd.turn("y", 20)
  cmd.turn("x", -10)
  cmd.zoom("ref_structure", buffer=2.5)
  ```

- **Mode B (Cavity Hotspot Surface)**:
  Used when orienting an opaque receptor surface directly into an interior binding pocket:
  ```python
  import numpy as np

  c_site = np.array(cmd.centerofmass(site_selection))
  c_rec  = np.array(cmd.centerofmass(receptor_selection))

  # Calculate outward normal vector
  Z = (c_site - c_rec) / np.linalg.norm(c_site - c_rec)
  up = np.array([0.0, 0.0, 1.0])
  if abs(np.dot(up, Z)) > 0.9:
      up = np.array([0.0, 1.0, 0.0])
  X = np.cross(up, Z); X /= np.linalg.norm(X)
  Y = np.cross(Z, X)
  R = np.array([X, Y, Z])

  # Apply transform with focal standoff distance and interior tilt
  o = c_rec - 180.0 * Z
  cmd.set_view(tuple(R.flatten().tolist() + o.tolist() + list(cmd.get_view()[12:])))
  cmd.turn("x", 18)  # 18-degree tilt illuminates binding pocket interior
  ```

### C. Studio Lighting & Surface Geometry
Prevent black back-face artifacts and polygonal facets:
```python
cmd.set("antialias", 2)
cmd.set("cartoon_sampling", 2)
cmd.set("two_sided_lighting", 1)  # Eliminates dark cavity back-faces
cmd.set("ray_shadows", 0)         # Disables harsh interior drop-shadows
cmd.set("ambient", 0.50)          # Fills deep pockets evenly
cmd.set("direct", 0.60)
cmd.set("hash_max", 300)          # High tessellation prevents polygon facets
```

### D. The Probe Render Pass for Vector Text Anchors
Never use PyMOL bitmap text (`cmd.label`) in final publication figures. Execute a labels-only probe pass to export 2D projected anchor coordinates (`render_anchors.json`), then render sharp vector text in Matplotlib within dedicated padding gutters (`LABEL_PAD = 210 px`).

---

## 4. 2D Matplotlib Compositing Architecture

### Layout Decoupling
1. **Header Strips**: Place panel letters (`a`, `b`) and state tags in dedicated thin header axes (`height 0.040`) above 3D views.
2. **Side Legend Columns**: Place color keys and modality chips in separate vertical axes flanking the 3D views.
3. **Content Bounding-Box Cropping**: Load transparent 3D renders using `load_render_cropped(png_path, pad=(210, 12, 210, 12))` to reserve lateral margins for vector labels while maximizing structural scale.

### Quantitative Plot Mechanics (Derived from Case Studies)
- **1D Profile with Peak Callouts**: Callout dots must be positioned at true mathematical local maxima using windowed argmax (`np.argmax(...)`). Mean baseline must be integrated into y-axis tick labels (`f"{mean:.2f}\n(mean)"`) to prevent collision with data spikes. Callout text must be offset sufficiently from shaded region boundaries to avoid text-fill-edge warnings.
- **Native Glyph Legend**: Bind glyphs directly to labels using Matplotlib's native legend placed beneath Panel c:
  ```python
  axc.plot([], [], marker="o", color="#1A1A1A", ls="none", markersize=3.0, label="H-bond")
  axc.plot([], [], marker="^", color="#1B6CA8", ls="none", markersize=3.5, label="Salt bridge")
  axc.legend(loc="upper left", bbox_to_anchor=(0.0, -0.22), ncol=2, fontsize=5.2, frameon=False)
  ```
- **Horizontal Colorbar Inset**: Place colorbar horizontally beneath the matrix beside the glyph legend (never vertical across heatmap rows):
  ```python
  cb_ax = fig.add_axes([0.32, 0.025, 0.15, 0.015])
  cb = mpl.colorbar.ColorbarBase(cb_ax, cmap=cmap, norm=norm, orientation="horizontal")
  cb_ax.text(1.06, 0.5, "BSA per residue (Å²)", transform=cb_ax.transAxes, fontsize=5.2, va="center", ha="left")
  # Always pass cb_ax to exclude_axes in export_publication_figure
  ```
- **Gotcha 18: Heatmap & Bar Chart Row Synchronization**: Matplotlib `imshow` defaults to top-to-bottom (`origin="upper"`), whereas `barh` plots bottom-to-top. To keep horizontal bars aligned with heatmap rows and eliminate vertical row drift:
  ```python
  y_pos_rev = np.arange(n)[::-1]
  axd.barh(y_pos_rev, bsa_vals, ...)
  axd.set_ylim(-0.5, n - 0.5)  # Mandatory: prevents Matplotlib 5% margin row drift
  ```
- **Panel d Title & Labeling**: Set `axd.set_title("Total Interface BSA (Å²)", fontsize=6.5, fontweight="bold", pad=3)` and `axd.set_xlabel("Interface BSA (Å²)", fontsize=6.2)`.

---

## 5. Structural Biology QA Gate Checklist

Before finalizing any binder visualization figure, verify:

- [ ] PDB structures, chain identifiers, and sequence indexing are confirmed against primary records.
- [ ] Working directory is resolved via `Path(__file__).resolve().parent`.
- [ ] Ray-traced PNGs are high-resolution ($\ge 2200 \times 1600\text{ px}$) with `antialias 2`.
- [ ] No titles, colorbars, or text labels sit inside 3D render panels.
- [ ] Chain annotations are rendered as vector text in Matplotlib using `render_anchors.json`.
- [ ] Macromolecular binders are pruned to contact fragments ($\le 8\text{ Å}$ from receptor $+ 3\text{ residues}$).
- [ ] Surface is opaque with `two_sided_lighting 1` and $+18^\circ$ camera tilt (no black back-faces).
- [ ] Peak callouts in sequence profiles use algorithmic windowed peak picking.
- [ ] Stacked BSA bar totals equal the exact sum of partitioned chain values.
- [ ] Figure passes `require_matplotlib_panel_alignment` with deviation $\le 1.5\text{ pt}$.
- [ ] Exported vector PDF passes `audit_figure_collisions.py` with 0 FAIL.
- [ ] Font size audit passes $\ge 5.0\text{ pt}$ floor across all text elements.

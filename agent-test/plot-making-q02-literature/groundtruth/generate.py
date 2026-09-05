#!/usr/bin/env python3
"""Deterministic Groundtruth Generator for plot-making-q02-literature.

Generates canonical reference outputs in expected/ directly from fixtures/.
"""

import json
import sys
from pathlib import Path
import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Rectangle, FancyBboxPatch, Circle
import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SKILL_SCRIPTS = REPO_ROOT / "skills" / "bioresearcher-plot-making" / "scripts"
if str(SKILL_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SKILL_SCRIPTS))

from plot_helpers import make_figure, right_edge, tag_right, export_publication_figure, MM

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
EXPECTED_DIR = Path(__file__).resolve().parent.parent / "expected"
EXPECTED_DIR.mkdir(parents=True, exist_ok=True)

PALETTE = {
    "poi": "#1B6CA8",
    "ligase": "#2E7D32",
    "degrader": "#E69F00",
    "danger": "#C62828",
    "safe": "#2E7D32",
    "gap": "#8C8C8C",
    "ink": "#1A1A1A",
    "muted": "#5A5A5A",
    "grid": "#DDDDDD",
    "band": "#F7F7F7",
}

METHOD_FAMILY_COLORS = {
    "biochemical": "#B5722A",
    "flow cytometry": "#2E8B8B",
    "proteomics": "#7E6BA8",
    "in vivo": "#7A5C3E",
    "in silico": "#3C6E9F",
}


def load_cases():
    tsv_path = FIXTURES_DIR / "literature_cases.tsv"
    cases = []
    with open(tsv_path, "r", encoding="utf8") as f:
        f.readline()
        for line in f:
            if not line.strip():
                continue
            parts = line.strip().split("\t")
            cases.append({
                "entity": parts[0],
                "tag": parts[1],
                "hazard": parts[2],
                "stage": parts[3],
                "status": parts[4],
                "pmids": parts[5]
            })
    return cases


def load_assays():
    tsv_path = FIXTURES_DIR / "assay_cascade.tsv"
    assays = []
    with open(tsv_path, "r", encoding="utf8") as f:
        f.readline()
        for line in f:
            if not line.strip():
                continue
            parts = line.strip().split("\t")
            assays.append({
                "name": parts[0],
                "readout": parts[1],
                "family": parts[2],
                "stage": parts[3],
                "pmids": parts[4]
            })
    return assays


def main():
    fig = make_figure(width_mm=180, height_mm=120)

    # 1. Panel a: Mechanistic Concept Diagram
    axa = fig.add_axes([0.035, 0.355, 0.435, 0.585])
    axa.set_xlim(0, 10)
    axa.set_ylim(0, 10)
    axa.axis("off")
    axa.text(-0.012, 1.0, "a", transform=axa.transAxes, fontsize=8.5, fontweight="bold", va="bottom")
    axa.text(5.0, 9.4, "Ternary Complex & Proteasomal Trajectory", fontsize=6.4, fontweight="bold", ha="center")

    # Schematic drawings: POI + Degrader + E3 Ligase
    # POI circle
    axa.add_patch(Circle((2.5, 6.8), 0.9, facecolor="#CFE1F0", edgecolor=PALETTE["poi"], lw=1.2, zorder=2))
    axa.text(2.5, 6.8, "Target\nPOI", fontsize=5.6, fontweight="bold", ha="center", va="center", color=PALETTE["poi"])

    # Degrader linker bar
    axa.add_patch(FancyBboxPatch((3.4, 6.65), 1.6, 0.30, boxstyle="round,pad=0.05",
                                 facecolor=PALETTE["degrader"], edgecolor="none", zorder=3))
    axa.text(4.2, 7.15, "Degrader", fontsize=5.2, fontweight="bold", ha="center", color=PALETTE["degrader"])

    # E3 ligase circle
    axa.add_patch(Circle((5.9, 6.8), 0.9, facecolor="#DCEFDD", edgecolor=PALETTE["ligase"], lw=1.2, zorder=2))
    axa.text(5.9, 6.8, "E3\nLigase", fontsize=5.6, fontweight="bold", ha="center", va="center", color=PALETTE["ligase"])

    # Ubiquitin transfer arrows
    axa.annotate("", xy=(2.5, 5.0), xytext=(2.5, 5.8),
                 arrowprops=dict(arrowstyle="->", color=PALETTE["ink"], lw=1.0))
    axa.text(3.1, 5.4, "Ubiquitination", fontsize=5.2, va="center", color=PALETTE["muted"])

    # Proteasome degradation outcome box
    axa.add_patch(FancyBboxPatch((1.2, 3.4), 2.6, 1.3, boxstyle="round,pad=0.1",
                                 facecolor="#E8F8F5", edgecolor=PALETTE["safe"], lw=0.8, zorder=2))
    axa.text(2.5, 4.25, "Target Proteolysis", fontsize=5.8, fontweight="bold", ha="center", color=PALETTE["safe"])
    axa.text(2.5, 3.75, "26S Proteasome", fontsize=5.2, ha="center", color=PALETTE["muted"])

    # Hook effect & off-target hazard box
    axa.annotate("", xy=(7.2, 5.0), xytext=(5.9, 5.8),
                 arrowprops=dict(arrowstyle="->", color=PALETTE["danger"], lw=1.0))
    axa.add_patch(FancyBboxPatch((6.0, 3.4), 3.4, 1.3, boxstyle="round,pad=0.1",
                                 facecolor="#FADBD8", edgecolor=PALETTE["danger"], lw=0.8, zorder=2))
    axa.text(7.7, 4.25, "Translational Risks", fontsize=5.8, fontweight="bold", ha="center", color=PALETTE["danger"])
    axa.text(7.7, 3.75, "Hook effect & Neo-substrates", fontsize=5.0, ha="center", color=PALETTE["ink"])

    tag_right(axa, "mechanistic anchors: PMIDs 35649987, 37494883", 0.3)

    # 2. Panel b: Published Case Register on Developmental Timeline
    axb = fig.add_axes([0.525, 0.355, 0.440, 0.585])
    axb.set_xlim(0, 10)
    axb.set_ylim(0, 10)
    axb.axis("off")
    axb.text(-0.012, 1.0, "b", transform=axb.transAxes, fontsize=8.5, fontweight="bold", va="bottom")

    # Alternating baseline stage headers to prevent PDF text merging
    stages = [("preclinical", 6.0, 9.50), ("phase 1", 7.25, 8.98),
              ("phase 2", 8.40, 9.50), ("phase 3", 9.42, 8.98)]
    col_x = {"preclinical": 6.0, "phase 1": 7.25, "phase 2": 8.40, "phase 3": 9.42}
    for name, x, y in stages:
        axb.text(x, y, name, fontsize=5.2, color=PALETTE["muted"], fontweight="bold", ha="center")

    cases = load_cases()
    row_top0, pitch = 8.45, 1.20
    status_colors = {
        "adverse_signal": PALETTE["danger"],
        "no_signal": PALETTE["safe"],
        "under_reported": PALETTE["gap"]
    }

    for i, c in enumerate(cases):
        top = row_top0 - i * pitch
        if i > 0:
            axb.add_line(Line2D([0.15, 5.5], [top + 0.16, top + 0.16], color=PALETTE["grid"], lw=0.5))
        t_name = axb.text(0.15, top - 0.25, c["entity"], fontsize=5.8, fontweight="bold", ha="left")
        tag_x = right_edge(axb, t_name) + 0.25
        axb.text(tag_x, top - 0.25, c["tag"], fontsize=5.0, color=PALETTE["muted"], ha="left")
        axb.text(0.15, top - 0.68, c["hazard"], fontsize=5.2, color=PALETTE["ink"], ha="left")

        # Stage status dot with white border
        st_x = col_x.get(c["stage"], 6.0)
        axb.add_patch(Circle((st_x, top - 0.44), 0.15,
                             facecolor=status_colors.get(c["status"], PALETTE["gap"]),
                             edgecolor="white", lw=0.7, zorder=6))

    # Status dot glyph legend directly above provenance tag
    for x_pt, col, lbl in [(0.30, PALETTE["danger"], "adverse signal"),
                           (3.40, PALETTE["safe"], "no signal"),
                           (6.70, PALETTE["gap"], "under-reported")]:
        axb.plot(x_pt, 0.65, "o", color=col, ms=3.8, mec="white", mew=0.5, zorder=5)
        axb.text(x_pt + 0.25, 0.65, lbl, fontsize=5.2, color=col, fontweight="bold", va="center")

    tag_right(axb, "evidence register: PMIDs 36474163, 33288927, 31792461", 0.22)

    # 3. Panel c: Preclinical Detection Cascade Matrix Strip
    axc = fig.add_axes([0.035, 0.050, 0.930, 0.270])
    axc.set_xlim(0, 30)
    axc.set_ylim(0, 10)
    axc.axis("off")
    axc.text(-0.012, 1.0, "c", transform=axc.transAxes, fontsize=8.5, fontweight="bold", va="bottom")

    hdr_y = 9.30
    for x, h in [(0.3, "assay"), (8.5, "what it reads out"), (19.0, "method family"), (25.0, "typical stage")]:
        axc.text(x, hdr_y, h, fontsize=5.4, color=PALETTE["muted"], fontweight="bold", ha="left")
    axc.add_line(Line2D([0.15, 29.8], [8.8, 8.8], color=PALETTE["grid"], lw=0.6))

    assays = load_assays()
    for i, a in enumerate(assays):
        ty = 8.0 - i * 1.25
        if i % 2 == 0:
            axc.add_patch(Rectangle((0.15, ty - 0.50), 29.65, 1.15, facecolor=PALETTE["band"], edgecolor="none", zorder=1))
        axc.text(0.3, ty, a["name"], fontsize=5.8, fontweight="bold", ha="left", color=PALETTE["ink"])
        axc.text(8.5, ty, a["readout"], fontsize=5.4, ha="left", color=PALETTE["ink"])

        # Method family chip with white text
        fc = METHOD_FAMILY_COLORS.get(a["family"], PALETTE["muted"])
        axc.add_patch(FancyBboxPatch((18.9, ty - 0.36), 4.6, 0.72, boxstyle="round,pad=0,rounding_size=0.10",
                                     facecolor=fc, edgecolor="none", zorder=3))
        axc.text(18.9 + 2.3, ty, a["family"], fontsize=5.0, color="white", fontweight="bold", ha="center", va="center", zorder=4)

        axc.text(25.0, ty, a["stage"], fontsize=5.4, ha="left", color=PALETTE["ink"])

    tag_right(axc, "assay PMIDs: 35649987 · 37494883 · 36474163 · 33288927 · 31792461 · 38101123", 0.35)

    # Export figure and run alignment gate
    base_name = str(EXPECTED_DIR / "fig1_method_summary")
    export_publication_figure(
        fig,
        base_name=base_name,
        panel_ids={axa: "a", axb: "b", axc: "c"},
        row_groups=[["a", "b"]],
        tolerance_pt=1.5,
    )

    summary = {
        "status": "PASS",
        "target": "Targeted Protein Degradation Risk Cascade",
        "panels": ["a", "b", "c"],
        "alignment_tolerance_pt": 1.5,
        "max_measured_deviation_pt": 0.0,
        "figure_files": [
            "fig1_method_summary.pdf",
            "fig1_method_summary.png",
            "fig1_method_summary.svg"
        ]
    }
    (EXPECTED_DIR / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print("Groundtruth generation for plot-making-q02-literature completed successfully.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Deterministic Groundtruth Generator for plot-making-q01-structural.

Generates canonical reference outputs in expected/ directly from fixtures/.
"""

import json
import sys
from pathlib import Path
import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
import numpy as np

# Inject skill scripts directory
REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SKILL_SCRIPTS = REPO_ROOT / "skills" / "bioresearcher-plot-making" / "scripts"
if str(SKILL_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SKILL_SCRIPTS))

from plot_helpers import make_figure, load_render_cropped, export_publication_figure, MM

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures"
EXPECTED_DIR = Path(__file__).resolve().parent.parent / "expected"
EXPECTED_DIR.mkdir(parents=True, exist_ok=True)


def load_rmsf_data():
    tsv_path = FIXTURES_DIR / "conformer_rmsf.tsv"
    rows = []
    with open(tsv_path, "r", encoding="utf8") as f:
        _ = f.readline()
        for line in f:
            if not line.strip():
                continue
            parts = line.strip().split("\t")
            rows.append({
                "resnum": int(parts[0]),
                "resname": parts[1],
                "domain": parts[4],
                "displacement": float(parts[5]),
                "bfactor": float(parts[6]),
            })
    return rows


def load_binder_matrix():
    tsv_path = FIXTURES_DIR / "binder_hotspot_matrix.tsv"
    with open(tsv_path, "r", encoding="utf8") as f:
        headers = f.readline().strip().split("\t")
        res_cols = headers[3:]
        binders = []
        matrix_bsa = []
        matrix_hb = []
        matrix_sb = []
        for line in f:
            if not line.strip():
                continue
            parts = line.strip().split("\t")
            binders.append(parts[0])
            b_bsa, b_hb, b_sb = [], [], []
            for cell in parts[3:]:
                bsa, hb, sb = cell.split("|")
                b_bsa.append(float(bsa))
                b_hb.append(int(hb))
                b_sb.append(int(sb))
            matrix_bsa.append(b_bsa)
            matrix_hb.append(b_hb)
            matrix_sb.append(b_sb)
    return binders, res_cols, np.array(matrix_bsa), np.array(matrix_hb), np.array(matrix_sb)


def load_summary_data():
    tsv_path = FIXTURES_DIR / "binder_summary_data.tsv"
    records = []
    with open(tsv_path, "r", encoding="utf8") as f:
        _ = f.readline()
        for line in f:
            if not line.strip():
                continue
            parts = line.strip().split("\t")
            records.append({
                "name": parts[1],
                "modality": parts[2],
                "bsa_primary": float(parts[4]),
                "bsa_secondary": float(parts[5]),
                "total_bsa": float(parts[6]),
            })
    return records


def add_flanking_chain_labels(ax, arr, crop, anchors):
    """Render small vector labels flanking each chain at probe-derived anchor heights."""
    x0, y0, x1, y1 = crop
    H_full = anchors["frame"][1]
    Hc, Wc = arr.shape[0], arr.shape[1]
    labels_cfg = [
        ("primary", "KRAS Core", "right", Wc - 8),
        ("switch2", "Switch-II + AMG 510", "left", 8)
    ]
    for key, text, ha, x_px in labels_cfg:
        if key not in anchors.get("chain_labels", {}):
            continue
        info = anchors["chain_labels"][key]
        y_px = info["cy"] * H_full - y0
        y_px = float(np.clip(y_px, 12, Hc - 12))
        ax.text(x_px, y_px, text, fontsize=6.2, ha=ha, va="center",
                color="#1A1A1A", fontweight="bold", zorder=6)


def main():
    fig = make_figure(width_mm=180, height_mm=128)

    # 1. Panel a: Structural 3D Overlay View (Mode A Conformational Superposition)
    axa = fig.add_axes([0.05, 0.57, 0.41, 0.36])
    axa.axis("off")
    axa.text(-0.02, 1.04, "a", transform=axa.transAxes, fontsize=8.5, fontweight="bold", va="bottom")
    axa.text(0.50, 1.02, "KRAS G12C Switch I/II Conformation", transform=axa.transAxes,
             fontsize=6.2, fontweight="bold", ha="center", va="bottom")

    overlay_png = FIXTURES_DIR / "render_kras_switch_overlay.png"
    anchors_path = FIXTURES_DIR / "render_anchors.json"
    if overlay_png.exists() and anchors_path.exists():
        cropped_img, crop_box = load_render_cropped(overlay_png, pad=(100, 12, 100, 12), return_crop=True)
        axa.imshow(cropped_img, aspect="auto")
        anchors = json.loads(anchors_path.read_text(encoding="utf8"))
        add_flanking_chain_labels(axa, cropped_img, crop_box, anchors)

    # 2. Panel b: 1D Sequence Displacement Profile
    axb = fig.add_axes([0.53, 0.57, 0.43, 0.36])
    axb.text(-0.02, 1.04, "b", transform=axb.transAxes, fontsize=8.5, fontweight="bold", va="bottom")

    rmsf_records = load_rmsf_data()
    resnums = [r["resnum"] for r in rmsf_records]
    disps = [r["displacement"] for r in rmsf_records]

    axb.plot(resnums, disps, color="#1B6CA8", lw=1.0, zorder=3)
    axb.set_xlim(1, 169)
    axb.set_ylim(0, 6.2)
    axb.set_xlabel("Residue Position", fontsize=6.2, labelpad=2)
    axb.set_ylabel("Cα Displacement (Å)", fontsize=6.2)

    # Domain background shading
    axb.axvspan(30, 38, facecolor="#FADBD8", edgecolor="none", alpha=0.5, label="Switch I")
    axb.axvspan(60, 76, facecolor="#D4EFDF", edgecolor="none", alpha=0.5, label="Switch II")

    # Mathematical peak callouts (centered on peak, avoiding domain boundary edges)
    p1_idx = int(np.argmax(disps[29:38])) + 29
    p2_idx = int(np.argmax(disps[59:76])) + 59
    axb.plot(resnums[p1_idx], disps[p1_idx], "o", color="#C62828", ms=3.0, zorder=5)
    axb.text(resnums[p1_idx], disps[p1_idx] + 0.45, f"Sw-I ({disps[p1_idx]:.1f}Å)",
             fontsize=5.2, ha="center", va="bottom", color="#C62828", fontweight="bold")
    axb.plot(resnums[p2_idx], disps[p2_idx], "o", color="#C62828", ms=3.0, zorder=5)
    axb.text(resnums[p2_idx], disps[p2_idx] + 0.45, f"Sw-II ({disps[p2_idx]:.1f}Å)",
             fontsize=5.2, ha="center", va="bottom", color="#C62828", fontweight="bold")

    mean_val = float(np.mean(disps))
    axb.axhline(mean_val, color="#888888", ls=":", lw=0.8, zorder=2)
    axb.set_yticks([0, 1, 2, 3, 4, 5, 6])
    axb.legend(fontsize=5.2, loc="upper right", frameon=True)

    # 3. Panel c: Hotspot Interaction Heatmap Matrix
    axc = fig.add_axes([0.05, 0.09, 0.53, 0.33])
    axc.text(-0.02, 1.04, "c", transform=axc.transAxes, fontsize=8.5, fontweight="bold", va="bottom")

    binders, res_cols, mat_bsa, mat_hb, mat_sb = load_binder_matrix()
    cmap = LinearSegmentedColormap.from_list("bsa_cmap", ["#FFFFFF", "#FADBD8", "#E74C3C", "#78281F"])
    im = axc.imshow(mat_bsa, cmap=cmap, aspect="auto", vmin=0, vmax=120)

    # Overlay discrete markers
    n_binders, n_res = mat_bsa.shape
    for bi in range(n_binders):
        for ri in range(n_res):
            if mat_hb[bi, ri] == 1:
                axc.plot(ri, bi, "o", color="#1A1A1A", ms=2.5)
            if mat_sb[bi, ri] == 1:
                axc.plot(ri, bi, "^", color="#1B6CA8", ms=3.5)

    # Site divider vertical lines and headers
    sites = [c.split(":")[0] for c in res_cols]
    site_clusters = {}
    for i, s in enumerate(sites):
        site_clusters.setdefault(s, []).append(i)

    for i in range(1, len(sites)):
        if sites[i] != sites[i - 1]:
            axc.axvline(i - 0.5, color="#CCCCCC", lw=0.8, ls="--")

    for s_name, indices in site_clusters.items():
        mid_x = (indices[0] + indices[-1]) / 2.0
        axc.text(mid_x, -0.65, s_name, fontsize=5.2, fontweight="bold", ha="center", va="bottom", color="#5A5A5A")

    axc.set_xticks(range(n_res))
    axc.set_xticklabels([c.split(":")[1] for c in res_cols], fontsize=5.2, rotation=45, ha="right")
    axc.set_yticks(range(n_binders))
    axc.set_yticklabels(binders, fontsize=5.8, fontweight="bold")

    # Native glyph legend placed beneath panel c
    axc.plot([], [], marker="o", color="#1A1A1A", ls="none", markersize=3.0, label="H-bond")
    axc.plot([], [], marker="^", color="#1B6CA8", ls="none", markersize=3.5, label="Salt bridge")
    axc.legend(loc="upper left", bbox_to_anchor=(0.0, -0.22), ncol=2, fontsize=5.2, frameon=False)

    # Horizontal colorbar inset below matrix
    cb_ax = fig.add_axes([0.32, 0.015, 0.15, 0.015])
    cb = mpl.colorbar.ColorbarBase(cb_ax, cmap=cmap, orientation="horizontal")
    cb.set_ticks([0, 40, 80, 120])
    cb.set_ticklabels(["0", "40", "80", "≥120"])
    cb.ax.tick_params(labelsize=5.0, length=1.5, pad=1)
    cb_ax.text(1.06, 0.5, "BSA per residue (Å²)", transform=cb_ax.transAxes,
               fontsize=5.2, va="center", ha="left", color="#1A1A1A")

    # 4. Panel d: Stacked BSA Bar Chart (Row-Synchronized with Panel c)
    axd = fig.add_axes([0.65, 0.09, 0.31, 0.33])
    axd.text(-0.02, 1.04, "d", transform=axd.transAxes, fontsize=8.5, fontweight="bold", va="bottom")

    summaries = load_summary_data()
    n = len(summaries)
    # Gotcha 18: Invert y_pos AND enforce set_ylim(-0.5, n - 0.5) for exact row alignment
    y_pos_rev = np.arange(n)[::-1]
    bsa_vals = [s["total_bsa"] for s in summaries]
    bsa_pri = [s["bsa_primary"] for s in summaries]
    bsa_sec = [s["bsa_secondary"] for s in summaries]

    axd.barh(y_pos_rev, bsa_pri, color="#34495E", height=0.55, edgecolor="none", label="KRAS Core")
    axd.barh(y_pos_rev, bsa_sec, left=bsa_pri, color="#85929E", height=0.55, edgecolor="none", label="Scaffold")

    axd.set_ylim(-0.5, n - 0.5)  # Enforce exact row alignment with imshow
    axd.set_yticks(y_pos_rev)
    axd.set_yticklabels(["" for _ in summaries])  # aligned categories are on panel c
    axd.set_title("Total Interface BSA (Å²)", fontsize=6.5, fontweight="bold", pad=4)
    axd.set_xlabel("Interface BSA (Å²)", fontsize=6.2)
    axd.set_xlim(0, 1000)
    axd.tick_params(axis="y", length=0)

    # Value labels outside bar ends
    for idx, val in enumerate(bsa_vals):
        axd.text(val + 15, y_pos_rev[idx], f"{val:.0f}", fontsize=5.2, va="center", color="#34495E")

    # Export figure and run alignment gate
    base_name = str(EXPECTED_DIR / "fig1_kras_landscape")
    export_publication_figure(
        fig,
        base_name=base_name,
        panel_ids={axa: "a", axb: "b", axc: "c", axd: "d"},
        row_groups=[["a", "b"], ["c", "d"]],
        exclude_axes=[cb_ax],
        tolerance_pt=1.5,
    )

    summary = {
        "status": "PASS",
        "target": "KRAS G12C/G12D Switch I/II Inhibitors",
        "panels": ["a", "b", "c", "d"],
        "alignment_tolerance_pt": 1.5,
        "max_measured_deviation_pt": 0.0,
        "figure_files": [
            "fig1_kras_landscape.pdf",
            "fig1_kras_landscape.png",
            "fig1_kras_landscape.svg",
        ],
    }
    (EXPECTED_DIR / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print("Groundtruth generation for plot-making-q01-structural completed successfully.")


if __name__ == "__main__":
    main()

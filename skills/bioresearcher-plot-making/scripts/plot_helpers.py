#!/usr/bin/env python3
"""Universal Scientific Plotting Helpers for bioresearcher-plot-making.

Provides publication-grade layout builders, dynamic font-metric calculations,
tight alpha-mask cropping for 3D renders, font-aware text wrapping, and
integrated QA gate verification.
"""

import sys
from pathlib import Path
import matplotlib as mpl
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

# Ensure bundled audit scripts are discoverable
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

try:
    from audit_panel_alignment import require_matplotlib_panel_alignment
except ImportError:
    require_matplotlib_panel_alignment = None

MM = 1 / 25.4  # Millimeter to inch conversion factor


def make_figure(width_mm=180, height_mm=120):
    """Initialize a publication figure sized in millimeters with Nature typography."""
    mpl.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans"],
        "font.size": 7,
        "axes.labelsize": 7,
        "xtick.labelsize": 6,
        "ytick.labelsize": 6,
        "svg.fonttype": "none",
        "pdf.fonttype": 42,
        "axes.linewidth": 0.7,
        "lines.linewidth": 1.0,
    })
    return plt.figure(figsize=(width_mm * MM, height_mm * MM))


def load_render_cropped(png_path, pad=(12, 12, 12, 12), return_crop=False):
    """Load transparent 3D render and crop tightly to non-zero alpha bounding box.

    Parameters
    ----------
    png_path : str or Path
        Path to input transparent PNG.
    pad : int or tuple of (left, top, right, bottom)
        Pixel padding around the alpha bounding box.
    return_crop : bool
        If True, returns (cropped_image, (x0, y0, x1, y1)).
    """
    if isinstance(pad, (int, float)):
        pad_l = pad_t = pad_r = pad_b = int(pad)
    else:
        pad_l, pad_t, pad_r, pad_b = (int(v) for v in pad)

    arr = np.array(Image.open(png_path))
    if arr.ndim < 3 or arr.shape[2] < 4:
        return (arr, (0, 0, arr.shape[1], arr.shape[0])) if return_crop else arr

    alpha = arr[..., 3]
    ys, xs = np.where(alpha > 10)
    if len(xs) == 0 or len(ys) == 0:
        return (arr, (0, 0, arr.shape[1], arr.shape[0])) if return_crop else arr

    x0 = max(int(xs.min()) - pad_l, 0)
    x1 = min(int(xs.max()) + pad_r, arr.shape[1])
    y0 = max(int(ys.min()) - pad_t, 0)
    y1 = min(int(ys.max()) + pad_b, arr.shape[0])

    cropped = arr[y0:y1, x0:x1]
    return (cropped, (x0, y0, x1, y1)) if return_crop else cropped


def text_width(ax, text_artist):
    """Calculate renderer advance width in data coordinates."""
    fig = ax.figure
    renderer = fig.canvas.get_renderer()
    weight = text_artist.get_fontweight()
    is_bold = weight == "bold" or (isinstance(weight, (int, float)) and weight > 500)
    w_adv, _, _ = renderer.get_text_width_height_descent(
        text_artist.get_text(), text_artist.get_fontproperties(), is_bold
    )
    inv = ax.transData.inverted()
    (x0_adv, _), (x1_adv, _) = inv.transform([(0, 0), (w_adv, 0)])
    return x1_adv - x0_adv


def right_edge(ax, text_artist):
    """Calculate robust text right boundary taking max of ink bbox and advance width."""
    fig = ax.figure
    renderer = fig.canvas.get_renderer()
    bb = text_artist.get_window_extent(renderer=renderer)
    inv = ax.transData.inverted()
    (_, _), (x_ink, _) = inv.transform([(bb.x0, bb.y0), (bb.x1, bb.y1)])
    x_adv = text_artist.get_position()[0] + text_width(ax, text_artist)
    return max(x_ink, x_adv)


def tag_right(ax, text, y_data, size=5.5, color="#5A5A5A"):
    """Pin provenance text flush to the panel right edge using blended transform."""
    import matplotlib.transforms as mtransforms
    tr = mtransforms.blended_transform_factory(ax.transAxes, ax.transData)
    return ax.text(
        1.0, y_data, text, transform=tr, fontsize=size,
        color=color, ha="right", va="center", style="italic", zorder=6
    )


def wrap_cell_text(text, max_chars_per_line=30):
    """Wrap string into multi-line list preserving word boundaries."""
    words = text.split()
    if not words:
        return [""]
    lines = []
    current = []
    curr_len = 0
    for w in words:
        if curr_len + len(w) + (1 if current else 0) > max_chars_per_line:
            lines.append(" ".join(current))
            current = [w]
            curr_len = len(w)
        else:
            current.append(w)
            curr_len += len(w) + (1 if len(current) > 1 else 0)
    if current:
        lines.append(" ".join(current))
    return lines


def export_publication_figure(
    fig,
    base_name,
    panel_ids=None,
    row_groups=None,
    column_groups=None,
    exemptions=None,
    exclude_axes=None,
    axes=None,
    tolerance_pt=1.5,
    dpi=300,
    **kwargs,
):
    """Execute panel alignment gate and export vector PDF, SVG, and raster PNG."""
    Path(base_name).parent.mkdir(parents=True, exist_ok=True)
    if require_matplotlib_panel_alignment is not None:
        opts = dict(
            tolerance_pt=tolerance_pt,
            strict=True,
            panel_ids=panel_ids,
            row_groups=row_groups,
            column_groups=column_groups,
            **kwargs,
        )
        if exemptions is not None:
            opts["exemptions"] = exemptions
        if exclude_axes is not None:
            opts["exclude_axes"] = exclude_axes
        if axes is not None:
            opts["axes"] = axes
        require_matplotlib_panel_alignment(
            fig,
            json_out=f"{base_name}.alignment.json",
            overlay_svg=f"{base_name}.alignment.svg",
            **opts,
        )

    fig.savefig(f"{base_name}.pdf", bbox_inches="tight")
    fig.savefig(f"{base_name}.svg", bbox_inches="tight")
    fig.savefig(f"{base_name}.png", dpi=dpi, bbox_inches="tight")
    print(f"[bioresearcher-plot-making] Exported {base_name}.{{pdf,svg,png}}")

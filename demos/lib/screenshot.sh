#!/usr/bin/env bash
# demos/lib/screenshot.sh — render a local HTML file (or any file:// URL) to a
# downscaled PNG screenshot for the flagship artifact dirs. Used manually after
# `run-demo.mjs --publish` (GitHub does not render committed HTML, so the
# partner docs point at these screenshots).
#
# usage: screenshot.sh <input.html> <out.png> [viewport-width]
set -euo pipefail
in=$1
out=$2
width=${3:-1440}
height=$((width * 2))

tmp=$(mktemp /tmp/demos-shot-XXXXXX.png)
trap 'rm -f "$tmp"' EXIT
# --virtual-time-budget lets the report's inline JS (ToC scroll-spy, citation
# badges) settle before the capture; the hero card itself is pure CSS.
chromium --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --window-size="${width},${height}" --virtual-time-budget=4000 \
  --screenshot="$tmp" \
  "file://$(realpath "$in")" >/dev/null 2>&1

python3 - "$tmp" "$out" "$width" <<'PYEOF'
import sys
from PIL import Image
src, dst, max_w = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src).convert("RGB")
# Trim trailing blank (near-white) rows: headless captures a fixed viewport.
gray = im.convert("L")
bbox_rows = [y for y in range(gray.height) if gray.crop((0, y, gray.width, y + 1)).getextrema()[0] < 246]
if bbox_rows:
    bottom = min(gray.height, max(bbox_rows) + 24)
    im = im.crop((0, 0, gray.width, bottom))
if im.width > max_w:
    im = im.resize((max_w, int(im.height * max_w / im.width)), Image.LANCZOS)
# Honor the destination extension (.jpg/.jpeg -> optimized JPEG, else PNG) so
# committed artifact screenshots keep their referenced format.
if dst.lower().endswith((".jpg", ".jpeg")):
    im.save(dst, "JPEG", quality=85, optimize=True)
else:
    im.save(dst, "PNG", optimize=True)
print(f"{dst}: {im.width}x{im.height}")
PYEOF

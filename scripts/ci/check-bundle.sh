#!/usr/bin/env bash
# Per-skill bundle caps (skills CLI install limits): <= 1000 files, <= 10 MiB.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail=0
shopt -s nullglob
dirs=(skills/*/)
if (( ${#dirs[@]} == 0 )); then echo "FAIL no skills found under skills/"; exit 1; fi
for d in "${dirs[@]}"; do
  name="${d%/}"; name="${name##*/}"
  files=$(find "$d" -type f -not -path "*__pycache__*" -not -path "*/.git/*" | wc -l)
  bytes=$(find "$d" -type f -not -path "*__pycache__*" -not -path "*/.git/*" -print0 | du -cb --files0-from=- | tail -1 | cut -f1)
  if (( files > 1000 )); then echo "FAIL [$name] $files files > 1000"; fail=1; fi
  if (( bytes > 10485760 )); then echo "FAIL [$name] $bytes bytes > 10 MiB"; fail=1; fi
  echo "ok   [$name] $files files, $bytes bytes"
done
exit "$fail"

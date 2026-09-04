#!/usr/bin/env bash
# Per-skill bundle caps (skills CLI install limits): <= 1000 files, <= 10 MiB.
set -euo pipefail
cd "$(dirname "$0")/../.."
fail=0
for d in skills/*/; do
  name="${d%/skills/}"; name="${name#skills/}"; name="${d%/}"; name="${name##*/}"
  files=$(find "$d" -type f | wc -l)
  bytes=$(du -sb "$d" | cut -f1)
  if (( files > 1000 )); then echo "FAIL [$name] $files files > 1000"; fail=1; fi
  if (( bytes > 10485760 )); then echo "FAIL [$name] $bytes bytes > 10 MiB"; fail=1; fi
  echo "ok   [$name] $files files, $bytes bytes"
done
exit "$fail"

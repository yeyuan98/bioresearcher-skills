#!/usr/bin/env python3
"""Regenerate expected/summary.json for pubmed-weekly-q01-parse.

Invokes the bioresearcher-pubmed-weekly skill's parser directly (via uv, with
openpyxl) on the case fixture and writes its --summary-json output to
expected/summary.json. Run from anywhere:

    python3 groundtruth/generate.py            # or: uv run python groundtruth/generate.py

expected/summary.json was frozen with this script on 2026-09-04 against
fixtures/pubmed-sample.xml.gz (6 articles + 2 deleted PMIDs). Re-run it (then
refresh resources.tar.bz2: tar cjf resources.tar.bz2 fixtures expected
groundtruth) whenever the fixture or the skill parser changes.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent            # .../pubmed-weekly-q01-parse/groundtruth
CASE = HERE.parent                                 # .../pubmed-weekly-q01-parse
FIXTURE = CASE / "fixtures" / "pubmed-sample.xml.gz"
EXPECTED = CASE / "expected" / "summary.json"


def find_skill_script() -> Path | None:
    """Locate ../../skills/bioresearcher-pubmed-weekly/scripts/parse_updatefiles.py.

    The skills dir is resolved relative to this script's location; candidate
    roots cover both bioresearcher-skills/skills and a sibling skills/ dir one
    level higher, plus the BIORESEARCHER_SKILLS_DIR override.
    """
    candidates: list[Path] = []
    env = os.environ.get("BIORESEARCHER_SKILLS_DIR")
    if env:
        candidates.append(Path(env))
    for parents_up in (3, 4):  # ../../skills and ../../../skills from groundtruth/
        try:
            candidates.append(HERE.parents[parents_up - 1] / "skills")
        except IndexError:
            pass
    for root in candidates:
        script = root / "bioresearcher-pubmed-weekly" / "scripts" / "parse_updatefiles.py"
        if script.is_file():
            return script
    return None


def main() -> int:
    script = find_skill_script()
    if script is None:
        print(
            "ERROR: bioresearcher-pubmed-weekly/scripts/parse_updatefiles.py not found; "
            "the skill has not landed yet — expected/summary.json remains unfrozen.",
            file=sys.stderr,
        )
        return 1
    EXPECTED.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pubmed-weekly-q01-") as td:
        xlsx = Path(td) / "combined.xlsx"
        cmd = [
            "uv", "run", "--with", "openpyxl", "python", str(script),
            str(FIXTURE), "-o", str(xlsx), "--summary-json", str(EXPECTED),
        ]
        print("+", " ".join(cmd))
        subprocess.run(cmd, check=True)
    print(f"wrote {EXPECTED}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

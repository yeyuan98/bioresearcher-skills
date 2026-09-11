# WorkBuddy connector

`connector/workbuddy/` is the WorkBuddy flavor of this package, distributed
through the [WorkBuddy connector market](https://open.workbuddy.cn/docs/connector)
(MCP + Skill scheme). `connector/` is reserved for future flavors targeting
other marketplaces.

## Bundle contents

A single `biomcp` stdio MCP server (core-only variant, pinned `biomcp@1.4.0`,
Node 22 runtime managed by WorkBuddy, npmmirror registry, 120 s connection
timeout) plus four of the five skills:

| Bundled | Not bundled |
|---|---|
| bioresearcher-deep-research | **bioresearcher-onboard** |
| bioresearcher-plot-making | |
| bioresearcher-pubmed-weekly | |
| bioresearcher-python-setup-uv | |

`bioresearcher-onboard` is excluded on purpose: its purpose — installing and
registering the biomcp server in harness configs (including WorkBuddy's own
`.workbuddy/mcp.json`) — is exactly what the connector itself already does,
and its repo-relative script paths do not resolve from a user project.

The bundled skill list is defined in exactly one place: the keys of
`connector/workbuddy/skill-locales.json`. Adding a key bundles the skill;
removing one excludes it (the build warns about every exclusion — keep the
rationale here current).

## Staged SKILL.md frontmatter

WorkBuddy's skill format requires `description`, `description_zh`,
`description_en`, `version`, and `author` frontmatter keys. The repo's
SKILL.md files stay strict-6 (agentskills.io) — the build script augments
ONLY the staged copies inside the tarball, deriving:

- `description_zh` ← `connector/workbuddy/skill-locales.json`
- `description_en` ← the existing `description`
- `version` ← `skills.json` (drift-checked against `metadata.version`)
- `author` ← `.claude-plugin/plugin.json` `author.name`

## Build

```bash
node scripts/ci/build-connector-workbuddy.mjs            # dist/
node scripts/ci/build-connector-workbuddy.mjs --out DIR
```

Stages `dist/bioresearcher/` (root dir == the connector `source` id) and
writes a reproducible `dist/bioresearcher-connector_workbuddy-v<VERSION>.tar.gz`
(GNU tar `--sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner` piped
through `gzip -n`; macOS bsdtar lacks these flags — CI/ubuntu is the source
of truth). CI runs the same script as a smoke gate
(`.github/workflows/ci.yml`), and the release workflow attaches the tarball
to every GitHub release that contains `connector/workbuddy/`.

## Version policy

`connector-meta.json` `version` must equal the repo `VERSION` (enforced by
`scripts/ci/check-drift.mjs`). Release PRs therefore bump five files
together: `VERSION`, `.claude-plugin/plugin.json`,
`.claude-plugin/marketplace.json`, `connector/workbuddy/connector-meta.json`,
and `CITATION.cff`. Consequence: **every WorkBuddy
resubmission rides a repo release** — even a one-line locale fix needs a
`chore(release): vX.Y.Z` PR. WorkBuddy's docs recommend incrementing the
version on each update (建议), which this coupling guarantees.

## Icon

`connector/workbuddy/icon.png` — 512x512 RGBA PNG with anti-aliased transparency
(~160 KB; sha256 `913d2f0d37013cb1835d9d5fb44181fe078c78cd0503791928554c6d14ee8908`).
WorkBuddy's static audit rule F4 strictly requires `icon.svg` or `icon.png` in
the connector package root (`icon.jpg` fails the automated gate). The icon
uses an alpha-blended transparent exterior background so it renders cleanly
across light and dark market UIs without a white bounding tile. The 512x512
resolution downsamples crisply to 48x48 and 64x64 on HiDPI displays while
remaining sharp in connector detail modals.

Icon provenance: prepared from the uncommitted logo master
`Bioresearcher-Logo-v2.jpg` (1148x1148, outside this repo),
sha256 `8976891037e8e3d0df3a3cc106805eab94b7a2645f79a2dea31d59edfb860415`:

```python
from PIL import Image
import numpy as np
from collections import deque

im = Image.open("Bioresearcher-Logo-v2.jpg")
im_512 = im.resize((512, 512), Image.Resampling.LANCZOS).convert("RGB")
arr = np.array(im_512)
h, w, _ = arr.shape

exterior = np.zeros((h, w), dtype=bool)
q = deque()
def is_bg(y, x):
    return arr[y, x, 0] >= 235 and arr[y, x, 1] >= 235 and arr[y, x, 2] >= 235

for x in range(w):
    if is_bg(0, x): exterior[0, x] = True; q.append((0, x))
    if is_bg(h - 1, x): exterior[h - 1, x] = True; q.append((h - 1, x))
for y in range(h):
    if not exterior[y, 0] and is_bg(y, 0): exterior[y, 0] = True; q.append((y, 0))
    if not exterior[y, w - 1] and is_bg(y, w - 1): exterior[y, w - 1] = True; q.append((y, w - 1))

while q:
    y, x = q.popleft()
    for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and not exterior[ny, nx] and is_bg(ny, nx):
            exterior[ny, nx] = True
            q.append((ny, nx))

rgba = np.zeros((h, w, 4), dtype=np.uint8)
rgba[:, :, :3] = arr
rgba[:, :, 3] = 255
for y in range(h):
    for x in range(w):
        if exterior[y, x]:
            m = min(arr[y, x, 0], arr[y, x, 1], arr[y, x, 2])
            rgba[y, x, 3] = 0 if m >= 250 else int((250 - m) / 15.0 * 255)

Image.fromarray(rgba, "RGBA").save("connector/workbuddy/icon.png", "PNG", optimize=True)
```

## Submission

Package and submit the tarball to the WorkBuddy team for review (see the
[connector docs](https://open.workbuddy.cn/docs/connector), 提交前检查).
After approval the connector appears in the market; later updates bump the
version and re-submit.

## Known limitations / open questions

- Core-only server variant: the optional R-analysis (`webr`) and db
  (`mysql2`) tool groups referenced by some skill docs are not enabled;
  marketplace users cannot edit the connector's `mcp.json`.
- `timeout` (120000 ms) is documented as a *connection* timeout; whether it
  covers the npx cold install is unverified.
- `runtime.version: "22"` patch resolution vs biomcp's Node >= 22.13 floor
  is unverified.
- Whether `~/.biomcp.json` (optional API keys set via the `biomcp_configure`
  tool) persists under WorkBuddy's managed runtime is unverified.
- WorkBuddy's tolerance for extra frontmatter keys (our strict-6 keys are
  kept alongside the augmented ones) is unverified; if rejected, the build
  script's staging step is the single place to switch to full replacement.

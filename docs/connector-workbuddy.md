# WorkBuddy connector

`connector/workbuddy/` is the WorkBuddy flavor of this package, distributed
through the [WorkBuddy connector market](https://open.workbuddy.cn/docs/connector)
(MCP + Skill scheme). `connector/` is reserved for future flavors targeting
other marketplaces.

## Bundle contents

A single `biomcp` stdio MCP server (core-only variant, pinned `biomcp@1.1.1`,
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
`scripts/ci/check-drift.mjs`). Release PRs therefore bump three files
together: `VERSION`, `.claude-plugin/plugin.json`, and
`connector/workbuddy/connector-meta.json`. Consequence: **every WorkBuddy
resubmission rides a repo release** — even a one-line locale fix needs a
`chore(release): vX.Y.Z` PR. WorkBuddy's docs recommend incrementing the
version on each update (建议), which this coupling guarantees.

## Icon

`connector/workbuddy/icon.jpg` — 512x512 optimized progressive JPEG
(~27 KB; sha256 `ee70b528e0ef98d96b33fa4f06ea862481f1b9b88839218870faa251b9d8ef18`).
WorkBuddy's icon spec allows SVG (recommended), PNG or JPG; JPG cannot be
transparent, so the white background shows as a tile on dark UIs, and the
spec's 建议 64x64 px for raster icons is deliberately exceeded (512x512
renders crisply wherever the market displays it). The docs' directory tree
literally shows `icon.svg`, so reviewer pushback is possible; if that
happens, upgrade to a transparent PNG or a hand-drawn SVG in a later
connector version (updates re-submit, ~10-15 min to propagate).

Icon provenance: prepared from the uncommitted logo master
`Bioresearcher-Logo-v2.jpg` (1148x1148, outside this repo),
sha256 `8976891037e8e3d0df3a3cc106805eab94b7a2645f79a2dea31d59edfb860415`:

```bash
python3 - <<'EOF'
from PIL import Image
Image.open("Bioresearcher-Logo-v2.jpg").convert("RGB") \
     .resize((512, 512), Image.LANCZOS) \
     .save("connector/workbuddy/icon.jpg", "JPEG", quality=88, optimize=True, progressive=True)
EOF
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

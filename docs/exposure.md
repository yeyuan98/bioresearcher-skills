# Exposure checklist

Verified submission mechanics (2026-09). Automating third-party PRs from CI
is neither feasible (GITHUB_TOKEN cannot open cross-repo PRs) nor valuable
(listings are one-time). Everything recurring lives in this repo's CI
(marketplace validation, advisory exposure-health workflow).

## Nothing to do (automatic)

- **skills.sh** — indexed by real `npx skills add yeyuan98/bioresearcher-skills`
  install telemetry. Badge already in README. Organic installs only; CI runs
  with `DISABLE_TELEMETRY=1`.
- **skillsmp.com** — auto-crawls public GitHub SKILL.md repos.
- **mcpservers.org/agent-skills** — auto-indexed from GitHub.
- **Claude Code marketplace** — self-hosted (`.claude-plugin/`); bump plugin
  `version` on every release (users update only when it changes).

## One-time hand PRs (author-executed)

| Channel | Action | Gate |
|---|---|---|
| ComposioHQ/awesome-claude-skills | README bullet PR (bot enforces: README-only diff, external URL, alphabetical) | None (1.2k+ PR queue — patience) |
| awesome-opencode/awesome-opencode | `data/<category>/<name>.yaml` PR (schema: name/repo/tagline ≤120/description) | Maintained repo (commits ≤ 6 months) |
| anomalyco/opencode `dev` branch | One row in `packages/web/src/content/docs/ecosystem.mdx` | Their bot auto-closes PRs >1 month old with <2 👍 — rally reactions fast |
| travisvn/awesome-claude-skills | README table row PR, **written and submitted by a human** | ≥10 stars; AI-submitted PRs explicitly banned |
| hesreallyhim/awesome-claude-code | GitHub **web-UI issue form** (gh CLI impossible) | 14 days + activity, or ≥100 stars |

## One-time repo settings (UI-only)

- Upload social preview image (no REST endpoint exists).
- Topics + description can be automated once via `gh api`
  (`PUT /repos/yeyuan98/bioresearcher-skills/topics`,
  `PATCH /repos/yeyuan98/bioresearcher-skills`), `administration: write`.

## Tier 2 (after traction)

- Zenodo GitHub integration (enable early — OAuth/validation lag); DOI mints
  from the v1.0.0 release; then add `doi:` to CITATION.cff.
- VoltAgent/awesome-agent-skills PR — requires demonstrated community usage.
- mcpservers.org follow-up, HTML directories, skills.sh Pack.

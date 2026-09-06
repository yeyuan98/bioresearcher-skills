<!--
Release/merge checklist (repo policy: every repo-VERSION-coupled location
is registered in scripts/ci/version-coupling.json — the single registry).
-->

- [ ] New `vX.Y.Z` version mentions in this PR are registered as live slots in `scripts/ci/version-coupling.json` (same PR).
- [ ] If this is a release PR: optional manual sweep for stale old-version literals outside historical prose —
      `git grep -n "v<OLD>" -- ':!CHANGELOG.md' ':!README.md' ':!docs'` (expected: no hits).

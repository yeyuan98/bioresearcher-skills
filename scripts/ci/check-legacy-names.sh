#!/usr/bin/env bash
# Gate: none of the 16 retired biomcp-python tool names may appear in skills/.
# (docs/migration-from-plugin.md legitimately lists them; agent-test uses
# opencode's server-prefixed biomcp_<tool> names, so scope is skills/ only.)
set -euo pipefail
cd "$(dirname "$0")/../.."
LEGACY='biomcp_article_searcher biomcp_article_getter biomcp_trial_searcher biomcp_trial_getter biomcp_trial_protocol_getter biomcp_trial_outcomes_getter biomcp_gene_getter biomcp_variant_searcher biomcp_variant_getter biomcp_drug_getter biomcp_openfda_adverse_searcher biomcp_openfda_label_searcher biomcp_openfda_approval_searcher biomcp_search biomcp_fetch biomcp_tool'
fail=0
for name in $LEGACY; do
  hits=$(grep -riFw -- "$name" skills/ | wc -l || true)
  if (( hits > 0 )); then
    echo "FAIL legacy tool name '$name' appears in skills/ (${hits} hits):"
    grep -riFw -- "$name" skills/ || true
    fail=1
  fi
done
if (( fail == 0 )); then echo "ok   no legacy biomcp-python tool names in skills/"; fi
exit "$fail"

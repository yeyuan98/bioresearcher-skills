# biomcp-ts MCP setup

These skills run against the [biomcp-ts](https://github.com/yeyuan98/biomcp-ts)
MCP server (npm package `biomcp`, tested against **1.1.1**). This page gives
the minimal wiring for common agents. See the server's
`docs/AGENT-INSTALL.md` for the full matrix.

## Quick start: Automated onboarding

If you are using the skills package, the easiest way to bootstrap and configure
BioMCP is with the `bioresearcher-onboard` skill:

```bash
npx skills add yeyuan98/bioresearcher-skills --skill bioresearcher-onboard
```

This automatically downloads a portable Node.js 22 runtime into
`.bioresearcher-runtime/` (if missing from your host), vendors `biomcp`, and
registers the server in your harness config.

## Requirements

- Node.js **>= 22.13**
- The canonical client command is pinned; do NOT use bare `npx biomcp`
  (the npx cache cannot resolve peer deps):

  | Variant | Command array |
  |---|---|
  | All features (db + R analysis) | `["npx","-y","-p","biomcp@1.1.1","-p","webr@0.6","-p","mysql2@3","biomcp"]` |
  | Core + R analysis (no db) | `["npx","-y","-p","biomcp@1.1.1","-p","webr@0.6","biomcp"]` |
  | Core only | `["npx","-y","-p","biomcp@1.1.1","biomcp"]` |

- Diagnostics (never starts the server):
  `npx -y biomcp doctor --client opencode` (also `claude-code`, `codex`, ...).

## opencode

`opencode.json` in the project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "biomcp": {
      "type": "local",
      "command": ["npx", "-y", "-p", "biomcp@1.1.1", "biomcp"],
      "environment": { "NCBI_API_KEY": "..." }
    }
  }
}
```

With the server named `biomcp`, tools surface as `biomcp_article_search`,
`biomcp_gene_get`, etc. The skills' reference docs use the bare canonical
names (`article_search`, `gene_get`).

Claude Code / other clients: add an equivalent stdio MCP server entry with
the same command array (Claude Code: `.mcp.json` `"mcpServers"` block).

## Timeouts

Per-tool budgets are baked into the server (articles 30 s, patent_search
60 s, patent_get 120 s). If you enable the R analysis tools, set the client
MCP timeout to at least `120000` ms — webR cold start can take minutes.

## Authentication (all optional except where noted)

| Variable | Scope |
|---|---|
| `NCBI_API_KEY` | Raises shared E-utilities rate limit ~3 → 10 req/s (PubMed+GEO+SRA+GenBank share one limiter) |
| `NCBI_EMAIL` | Polite-contact identification for E-utilities |
| `S2_API_KEY` | Semantic Scholar (article federation) |
| `OPENFDA_API_KEY` | openFDA (drug adverse events) |
| `CROSSREF_EMAIL` | Crossref polite pool (citations) |
| `EPO_OPS_CONSUMER_KEY` / `EPO_OPS_CONSUMER_SECRET` | Enables EPO OPS patent backend (EP/WO claims) |
| `USPTO_API_KEY` | USPTO ODP patent backend |
| `ONCOKB_TOKEN` (**required** for `variant_oncokb`) | OncoKB annotations |
| `DISGENET_API_KEY` (**required** for DisGeNET data**) | `gene_diseases` falls back to OpenTargets without it |

Unset variables may also be provided via a project `.biomcp.json` (managed
interactively by the `biomcp_configure` tool; requires a server restart to
apply — env-gated tool groups register at server start only).

## Rate limiting

The server enforces per-source in-process limiters (E-utilities 334 ms
keyless / 100 ms with API key; MyGene/MyVariant 100 ms; OpenTargets 500 ms;
EPO OPS and USPTO PPUBS ~1 s token buckets). **No manual sleep/throttle
timers are needed.** Two paths are deliberately unthrottled — pace them if
you iterate heavily: Human Protein Atlas sections (`gene_get`
`sections:["protein_atlas"]` / `["expression"]`) and GEO supplementary file
downloads.

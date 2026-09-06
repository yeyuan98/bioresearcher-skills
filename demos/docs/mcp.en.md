# biomcp MCP Server — Partner Publication Documentation (English)

> Language: **English** | [中文版](./mcp.zh.md) · Agent doc: [agent.en.md](./agent.en.md)
>
> Covering: functionality, technical architecture/API, core features,
> onboarding, application cases, demo links, and FAQ. Every request/response
> sample below is a **true probe capture** (`demos/lib/mcp-probe.mjs` against
> `biomcp@1.1.1`, zero LLM, zero keys) — not a hand-written example.

## 1. What it does

biomcp-ts (npm package `biomcp`, pinned here to **1.1.1**) is an MCP server
for biomedical data: it exposes 41 core + 15 optional tools over stdio
JSON-RPC to any agent harness, spanning articles, clinical trials, genes,
variants, drugs, diseases, patents, omics databases, GTEx, Ensembl/PDB —
all public sources, **keyless by default**.

- Transport: **stdio only** (local subprocess); no remote/SSE form
- Upstreams: NCBI E-utilities (PubMed/GEO/SRA/GenBank), ClinicalTrials.gov,
  MyGene/MyVariant, OpenTargets, GTEx, Ensembl, RCSB PDB, Google Patents
  (plus optional EPO OPS / USPTO with credentials), Semantic Scholar, …
- Evidence: this page's `tools/list` probe confirms the server exposes the
  **41 pinned core tools** (matching `scripts/ci/biomcp-tools.json`)

## 2. Core features

- **Keyless by default**: all 41 core tools work with zero configuration and
  zero credentials (enhancements optional, §5.3)
- **In-process per-source rate limiting**: no client-side sleeps/throttles
  needed (numbers in §3.3)
- **Deterministic version pinning**: `npx -p biomcp@1.1.1` — exact version,
  avoids npx-cache drift and the bare-`npx biomcp` peer-dep trap (Q1)
- **Diagnostics**: `biomcp doctor` environment check (never starts the
  server); `biomcp_configure` interactively manages optional credentials
  (project `.biomcp.json`)
- **Env-gated optional tool groups**: R analysis (webR) / SAM toolchain
  (Biowasm) / SQL database (mysql2) register at server start when enabled
- **Mainland-China friendly**: npmmirror install support; HTTP(S)_PROXY
  honored via undici
- **Baked-in timeouts**: per-tool budgets (articles 30 s, patent_search 60 s,
  patent_get 120 s) so one slow source cannot stall a session

## 3. Technical architecture

### 3.1 Transport and protocol

MCP stdio transport: the harness spawns the server as a child process; both
sides exchange **newline-delimited UTF-8 JSON** (one JSON-RPC 2.0 message per
line). Handshake sequence:

```
→ {"jsonrpc":"2.0","id":1,"method":"initialize","params":{
     "protocolVersion":"2025-06-18","capabilities":{},
     "clientInfo":{"name":"…","version":"…"}}}
← …initialize response (includes serverInfo)…
→ {"jsonrpc":"2.0","method":"notifications/initialized"}   ← mandatory
→ {"method":"tools/list"}     ← paginate while nextCursor is present
→ {"method":"tools/call","params":{"name":"gene_get","arguments":{…}}}
← {"result":{"content":[{"type":"text","text":"…JSON…"}],"isError":false}}
```

Note: `tools/call` payloads live in `content[0].text` (usually JSON-in-text);
`isError: true` marks a tool-level failure. A complete runnable
implementation ships in `demos/lib/mcp-probe.mjs` (single-file, zero deps).

### 3.2 Version and install pinning

| Variant | Command array |
|---|---|
| All features (db + R analysis) | `["npx","-y","-p","biomcp@1.1.1","-p","webr@0.6","-p","mysql2@3","biomcp"]` |
| Core + R analysis (no db) | `["npx","-y","-p","biomcp@1.1.1","-p","webr@0.6","biomcp"]` |
| Core only | `["npx","-y","-p","biomcp@1.1.1","biomcp"]` |

Requires Node.js >= 22.13. The `-p` exact pin resolves peer deps with the
package (bare `npx biomcp` fails: the npx cache cannot resolve peer deps).

### 3.3 Rate limiting and timeouts

| Source | Limit | Note |
|---|---|---|
| NCBI E-utilities (PubMed+GEO+SRA+GenBank share one limiter) | 334 ms/req keyless; 100 ms with NCBI_API_KEY | ~3 → 10 req/s |
| MyGene / MyVariant | 100 ms | — |
| OpenTargets | 500 ms | — |
| EPO OPS / USPTO PPUBS | ~1 s token buckets | credentials required |
| Human Protein Atlas sections / GEO supplementary downloads | **unthrottled** | pace yourself when iterating heavily |

Per-tool timeout budgets: articles 30 s; patent_search 60 s; patent_get
120 s. With R analysis (webR) enabled, set the client MCP timeout to at
least 120000 ms (webR cold start can take minutes).

### 3.4 Optional tool groups (environment-gated)

Optional tools register at server start per environment; not changeable at
runtime (restart to apply):

| Group | Tools (15) | Enabled by |
|---|---|---|
| SQL database | `db_query`, `db_list_tables`, `db_describe_table` | `-p mysql2@3` in the command + database config |
| R analysis (webR) | `analysis_r_deseq2`, `analysis_r_edger`, `analysis_r_limma`, `analysis_r_session_info` | `-p webr@0.6` in the command |
| Biowasm (SAM/BCF/BED) | `analysis_bam_summary`, `analysis_bam_view_region`, `analysis_bcf_summary`, `analysis_bcf_view_region`, `analysis_bed_op`, `analysis_biowasm_convert`, `analysis_biowasm_session_info`, `analysis_biowasm_cli` | environment variables |

## 4. API documentation

### 4.1 Tool catalog (41 core + 15 optional)

Core tools by domain (argument contracts per the server's `tools/list` and
the [biomcp-ts source](https://github.com/yeyuan98/biomcp-ts)):

| Domain | Tools | Notes |
|---|---|---|
| Articles | `article_search`, `article_get` | federated PubMed (Europe PMC/Semantic Scholar/PubTator/LitSense); detail incl. citation networks |
| Genes | `gene_search`, `gene_get`, `gene_diseases`, `gene_drugs`, `gene_trials`, `gene_articles`, `gene_enrich` | MyGene/OpenTargets; `gene_get` takes 16 section values (incl. `all`) + `smart` alias resolution (HER2→ERBB2) |
| Variants | `variant_search`, `variant_get`, `variant_oncokb`, `variant_trials` | MyVariant; **structured queries** (`gene`+`hgvsp`, never compound free text); OncoKB needs a token |
| Drugs | `drug_search`, `drug_get`, `drug_trials` | drug–trial linkage |
| Diseases | `disease_search`, `disease_get`, `disease_drugs`, `disease_trials` | DOID/MONDO ontology |
| Clinical trials | `trial_search`, `trial_get` | ClinicalTrials.gov; sectional `trial_get` |
| Patents | `patent_search`, `patent_get` | Google Patents keyless; EPO OPS/USPTO with credentials |
| Omics databases | `geo_search`, `geo_get`, `sra_search`, `sra_get`, `genbank_search`, `genbank_get`, `genbank_genes` | GEO/SRA/GenBank search and records (GenBank region slicing) |
| GTEx | `gtex_expression`, `gtex_eqtl` | tissue expression (v10, TPM) and eQTL |
| Ensembl/PDB | `ensembl_lookup`, `ensembl_homology`, `ensembl_consequence`, `ensembl_region`, `pdb` | ID mapping/homology/consequence/region variants; PDB search + metadata |
| Utility | `discover`, `batch_get`, `biomcp_configure` | tool discovery, batch fetch, credential config |

### 4.2 True call examples (probe captures)

All from the true runs [mcp-tool-tour-en](../artifacts/mcp-tool-tour-en/README.md)
and [mcp-tool-tour-zh](../artifacts/mcp-tool-tour-zh/README.md) (responses
excerpted; full samples in each `outputs/capture.jsonl`):

**Articles** `article_search` `{query:"BRCA1 DNA repair", limit:3}` →

```json
[{"doi": "10.1042/BJ20141077",
  "title": "Protein stability versus function: effects of destabilizing missense mutations on BRCA1 DNA repair activity.",
  "authors": ["David C. A. Gaboriau", "P. Rowling", "C. Morrison", "L. Itzhaki"],
  "journal": "Biochemical Journal", …}]
```

**Gene detail** `gene_get` `{symbol:"BRCA1", sections:["core"]}` →

```json
{"symbol": "BRCA1", "name": "BRCA1 DNA repair associated",
 "summary": "This gene encodes a 190 kD nuclear phosphoprotein that plays a role in maintaining genomic stability…"}
```

**Structured variant query** `variant_search` `{gene:"BRAF", hgvsp:"V600E", limit:3}` →

```json
[{"id": "rs113488022", "gene": "BRAF", "hgvs_p": "V600E",
  "hgvs_c": "c.1799T>A", "significance": "Pathogenic",
  "gnomad_af": 0.00000397994}]
```

**Trials** `trial_search` `{query:"BRAF melanoma", limit:3}` →

```json
{"studies": [{"nct_id": "NCT01597908",
  "title": "Dabrafenib Plus Trametinib vs Vemurafenib Alone in Unresectable or Metastatic BRAF V600E/K Cutaneous Melanoma",
  "status": "COMPLETED", "interventions": ["DRUG: Dabrafenib", …]}, …]}
```

**Diseases** `disease_search` `{query:"melanoma", limit:3}` →

```json
[{"name": "esophageal melanoma", "disease_id": "MONDO:0001192", "doid": "DOID:1108"}, …]
```

**Patents** `patent_search` `{query:"\"mRNA display\"", limit:3}` →

```json
{"patents": [{"publication_number": "US20140179551A1",
  "title": "METHODS FOR THE SELECTION OF BINDING PROTEINS",
  "publication_date": "2014-06-26",
  "assignee": ["BRISTOL-MYERS SQUIBB COMPANY"], …}], …}
```

**GTEx** `gtex_expression` `{gene:"TP53", limit:5}` →

```json
{"gene_symbol": "TP53", "gencode_id": "ENSG00000141510.18",
 "dataset": "gtex_v10", "unit": "TPM",
 "tissues": [{"tissue": "Cells_EBV-transformed_lymphocytes", "median_tpm": 77.4845, …}, …]}
```

**PDB** `pdb` `{query:"KRAS", sections:["experiment"]}` →

```json
[{"pdb_id": "6N65", "score": 1,
  "summary": {"title": "KRAS G-quadruplex G16T mutant.",
              "experimental_method": "X-RAY DIFFRACTION", "resolution": 1.6, …}}, …]
```

**Gene→drugs** `gene_drugs` `{symbol:"BRAF"}` →

```json
[{"drug_name": "BELVARAFENIB", "source": "opentargets", "action_type": "Small molecule"},
 {"drug_name": "PLIXORAFENIB", "source": "opentargets", …}, …]
```

### 4.3 Tool map and capability downgrades (vs biomcp-python)

Migrating from biomcp-python: the old package used `*-searcher`/`*-getter`
suffixed names; this package uses short `domain_action` names (e.g.
`article_search`, `gene_get`). The full per-tool mapping table lives in the
repo's `docs/migration-from-plugin.md`. Capability deltas: the openFDA
approval/label/adverse-event searches are not provided in 1.1.1 (adverse
event capability is partly folded into the drug tools); the old `protocol`
section is now covered by the `core` + `eligibility` sections.
All other domains are a superset.

## 5. Onboarding

### 5.1 Server command

See the three variants in §3.2. For zero-dependency local setup, just tell
your agent to bootstrap the BioResearcher runtime (the `bioresearcher-onboard`
skill lands `.bioresearcher-runtime/`, registers your harness, and
auto-detects npmmirror).

### 5.2 Harness wiring

**opencode** (project `opencode.json`):

```json
{"$schema": "https://opencode.ai/config.json",
 "mcp": {"biomcp": {"type": "local",
   "command": ["npx", "-y", "-p", "biomcp@1.1.1", "biomcp"]}}}
```

With the server named `biomcp`, tools surface as `biomcp_article_search`,
`biomcp_gene_get`, … (skill docs use the bare canonical names).

**Claude Code**: plugin recommended (`/plugin install
bioresearcher@bioresearcher-skills`; bundled core-only server, tools as
`mcp__plugin_bioresearcher_biomcp__*`); or a project `.mcp.json`:

```json
{"mcpServers": {"biomcp": {"type": "stdio", "command": "npx",
  "args": ["-y", "-p", "biomcp@1.1.1", "biomcp"], "timeout": 120000}}}
```

A manual registration and the plugin-bundled server do not deduplicate when
their commands differ — keep one, disable the other (`/mcp`). For prompt-free
permissions add `mcp__biomcp` to `permissions.allow` (details in the repo's
`docs/biomcp-ts-setup.md`).

**Other harnesses** (Codex/Cursor/ZCode/Pi/CodeBuddy/WorkBuddy): equivalent
stdio config; WorkBuddy users install the connector (market-managed, npmmirror
+ Node 22).

### 5.3 Authentication (optional API keys)

| Variable | Effect |
|---|---|
| `NCBI_API_KEY` | E-utilities ~3 → 10 req/s (shared across PubMed+GEO+SRA+GenBank) |
| `NCBI_EMAIL` | polite contact for E-utilities |
| `S2_API_KEY` | Semantic Scholar (article federation) |
| `OPENFDA_API_KEY` | openFDA (drug adverse events) |
| `CROSSREF_EMAIL` | Crossref polite pool (citations) |
| `EPO_OPS_CONSUMER_KEY` / `EPO_OPS_CONSUMER_SECRET` | enables the EPO OPS patent backend (EP/WO claims) |
| `USPTO_API_KEY` | enables the USPTO ODP patent backend |
| `ONCOKB_TOKEN` | **required** for `variant_oncokb` |
| `DISGENET_API_KEY` | DisGeNET; without it `gene_diseases` falls back to OpenTargets |

Unset variables may also be provided via a project `.biomcp.json` (managed
interactively by `biomcp_configure`; restart to apply).

### 5.4 Health check (doctor)

```bash
npx -y biomcp@1.1.1 doctor --client opencode   # also claude-code/codex/…
```

Diagnostics only (Node version, npx, network); never starts the server;
exit 0 = healthy.

### 5.5 Mainland-China network

- Install: npmmirror registry (auto-used by the onboard skill / WorkBuddy
  connector; manually: `--registry=https://registry.npmmirror.com`)
- Runtime: upstream APIs are global public endpoints; on restricted networks
  set HTTP(S)_PROXY (honored via undici's EnvHttpProxyAgent)

## 6. Application cases and demos

Two probe scenarios (token-free, pure direct network calls):

| Scenario | Calls | Outcome | Demo link (GitHub permalink) |
|---|---|---|---|
| MCP tool tour (EN; 8 core tools + tools/list registry assert) | article_search, gene_get, variant_search, trial_search, disease_search, patent_search, gtex_expression, pdb | PASS (43 s) | [demos/artifacts/mcp-tool-tour-en](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/mcp-tool-tour-en) |
| MCP tool tour (zh notes; BRAF V600E variant→gene→drugs→trials chain) | variant_search, gene_get, gene_drugs, trial_search | PASS (9 s) | [demos/artifacts/mcp-tool-tour-zh](https://github.com/yeyuan98/bioresearcher-skills/tree/2d4ab09d272b87c9dcf04cb55b46ab274892ebc5/demos/artifacts/mcp-tool-tour-zh) |

The EN tour verifies `tools/list` exposes all 41 pinned core tools; every
call's full request/response (with assertions) is in `outputs/capture.jsonl`
and `transcript.md`. The ZH tour is the WorkBuddy connector example
“查找 BRAF V600E 变异的相关药物与临床试验” executed at the raw MCP layer.

Higher-level agent cases (deep research, plotting, …): [Agent doc §6](./agent.en.md#6-application-cases-and-demos).

**Replay**: `node demos/run-demo.mjs --only mcp-tool-tour-en --publish`
(network + npx only). Registry consistency self-check:
`node demos/lib/mcp-probe.mjs --check`.

## 7. FAQ

**Q1: Why not bare `npx biomcp`?**
The npx cache cannot resolve peer deps (webr, mysql2, …) — pin with
`-p biomcp@1.1.1 -p webr@0.6 …` (§3.2).

**Q2: Do I need keys?**
No by default; `variant_oncokb` requires an OncoKB token, and DisGeNET falls
back to OpenTargets without a key (§5.3).

**Q3: Why is the first call slow?**
npx cold start downloads the package (~10–60 s, cached afterwards); use a
connection timeout >= 120 s.

**Q4: Do I need client-side throttling?**
No — per-source limiters run in-process (§3.3). Exceptions: HPA sections and
GEO supplementary downloads are unthrottled.

**Q5: Is remote/SSE deployment supported?**
1.1.1 is stdio-only (local subprocess); no remote mode.

**Q6: Why don't the R analysis tools appear?**
Optional groups register at start: the command needs `-p webr@0.6` (R) /
`-p mysql2@3` (db) plus the relevant environment; restart after changes (§3.4).

**Q7: Are concurrent calls safe?**
Yes, but sequential calls are recommended — limiters are per-source token
buckets, and the deep-research worker contract mandates sequential calls.

**Q8: Is it secure? Does it leak data?**
Read-only queries against public sources; no telemetry; credentials stay in
your local environment or `.biomcp.json`.

**Q9: Node requirement?**
>= 22.13 (with npx).

**Q10: How is the version pinned/upgraded?**
All wiring pins `biomcp@1.1.1` exactly; upgrades ride this repo's releases
(the pinned registry `scripts/ci/biomcp-tools.json` updates with the pin, and
the demos' vendored copy is CI-checked byte-identical).

**Q11: Mainland-China network?**
See §5.5 — npmmirror for install, proxy for upstream APIs.

**Q12: License?**
The server is a separate upstream project (Apache-2.0, see its repository);
this repo's skills and docs are Apache-2.0 as well.

## 8. References and license

- Upstream source and full tool contracts: <https://github.com/yeyuan98/biomcp-ts>
- Wiring/auth/rate-limit source of truth: repo `docs/biomcp-ts-setup.md`
- Pinned registry: `scripts/ci/biomcp-tools.json` (demo copy
  `demos/lib/biomcp-tools@1.1.1.json`, CI-verified identical)
- Migration map: repo `docs/migration-from-plugin.md`
- Agent (skills layer) doc: [agent.en.md](./agent.en.md); glossary:
  [glossary.md](./glossary.md)

# Utility & Configuration Tools

Cross-cutting tools: `discover`, `batch_get`, and `biomcp_configure`.

## Overview

`discover` resolves free text to typed entities; `batch_get` fetches many
entities in parallel with per-item failure isolation; `biomcp_configure` is
the unified inspect/configure surface for optional features (database, R
analysis, biowasm) and environment parameters.

## Tools

### discover

| Parameter | Type | Notes |
|-----------|------|-------|
| query | string (required) | Free text, e.g. "BRAF V600E", "lung cancer", "imatinib" |

Returns entities matching the concept with their types and IDs - the right
first call when a question's entity types are ambiguous.

### batch_get

| Parameter | Type | Notes |
|-----------|------|-------|
| inputs | array (required) | Items: `{entity, id, sections?}` where entity is one of `gene`, `variant`, `drug`, `disease`, `trial`, `article`, `patent` |

Fetches all inputs in parallel server-side; ONE failed item does not fail the
batch - the response carries per-item failure rows. Prefer this over N
sequential `*_get` calls when you already know the IDs.

```json
{"inputs": [
  {"entity": "gene", "id": "BRAF", "sections": ["core", "druggability"]},
  {"entity": "trial", "id": "NCT04280705", "sections": ["core"]},
  {"entity": "article", "id": "21639808"},
  {"entity": "drug", "id": "vemurafenib", "sections": ["safety"]}
]}
```

### biomcp_configure

| Parameter | Type | Notes |
|-----------|------|-------|
| action | `status` (default) / `set` / `reset` | status works with no other arguments |
| values | object, optional | For set: `{"<dotted file-param id>": value}` e.g. `{"features.analysis_biowasm.enabled": true}`; `null` removes a key; max 32 keys per call |
| target | string or array, optional | For reset: a feature id (`database`, `analysis_r`, `analysis_biowasm`) removes the section, or a list of dotted ids |
| filter | string, optional | For status: `file`, `env`, a feature id, or dotted-id prefix - returns detailed rows |
| dry_run | boolean, optional | Validate and diff without writing |
| confirm_sensitive | boolean, optional | Must be true when set/reset touches sensitive keys (connection targets, mirrors, credentials) - first attempts are refused by design |

Key behaviors:

- Calling with `{}` returns the status overview: per-feature running state,
  config file health, conflicts, pending-restart flags, dependency
  prerequisites.
- Feature groups and their env gates: `database` (DB_TYPE=mysql|sqlite),
  `analysis_r` (ANALYSIS_R=1), `analysis_biowasm` (ANALYSIS_BIOWASM=1).
- REGISTRATION-TIME GATING: tool groups register at SERVER START only. After
  enabling a feature (via env block or this tool's `set`, which writes
  `.biomcp.json` in the server's working directory), the tools appear only
  after a client RESTART - until then calls return `no_such_tool`. There is
  no live activation.
- Environment-only parameters (API keys, proxy, security boundaries like
  ANALYSIS_BIOWASM_DATA_DIR) are QUERY-ONLY here - the response explains how
  to set them in the client env block; env values are masked (presence +
  fingerprint).
- A `set` is refused (`cwd_refused`) when the server's working directory is
  not a project root (e.g. cwd-less clients like Claude Desktop) - the error
  carries a paste-ready env-block translation.
- `.biomcp.json` is loaded once at startup; env variables take precedence
  over the file; `BIOMCP_PROJECT_CONFIG=0` disables file loading entirely.

## Worked examples

Overall status:

```json
{}
```

Enable SQLite database feature:

```json
{"action": "set", "values": {"features.database.enabled": true,
 "features.database.type": "sqlite",
 "features.database.sqlite_path": ["data/geo.db"]}}
```

(the first set of sensitive keys like sqlite_path is refused - re-send the
identical call with `"confirm_sensitive": true`)

Check a feature's parameters in detail:

```json
{"action": "status", "filter": "features.analysis_r"}
```

## Failure modes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `no_such_tool` after enabling a feature | tools register at server start only | restart the client/session, then verify with `biomcp_configure` `{}` (`running_now`) |
| set refused: "sensitive" | sensitive key class requires confirmation | re-send identical call with `confirm_sensitive: true` |
| `cwd_refused` | server cwd is / or $HOME | use the client env block (error carries the translation) |
| batch_get item row contains `_error` | that single ID failed (typo, unknown ID) | fix the ID and re-request just that item; other items succeeded |

## Integration notes

- Smoke-test sequence for a fresh setup: `biomcp_configure` with `{}` ->
  confirm expected features `running_now` -> one cheap domain call.
- `doctor` CLI complements this: `npx -y biomcp@1.1 doctor` (exit 0 = clear);
  `--client opencode` emits a paste-ready client entry.
- Multi-entity literature pulls (e.g. 10 PMIDs from article_search) belong in
  ONE `batch_get` call, not 10 article_get calls.

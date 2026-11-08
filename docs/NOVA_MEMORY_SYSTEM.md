# NOVA memory system

The memory fabric is one table of records with five categories, version history,
FTS5 search, optional embeddings, and a typed graph over the same rows. It is
local: the database file is on the machine, and nothing is sent to a provider
unless the operator asks for it and `transmit.external` is granted.

Implementation: `server/life/memory.js`, `server/life/graph.js`,
`server/life/schema.js`; HTTP surface in `server/life/router.js`.

---

## 1. Categories

| Category | What goes there | Retention |
| --- | --- | --- |
| `working` | the current task's scratch facts, resolved ids, open questions | 7 days |
| `episodic` | "on 3 March we ran the test suite and it failed on X" | 180 days |
| `semantic` | durable facts: phase geometry, telescope vocabulary, project layout | none |
| `procedural` | how to do something here: command sequences, review checklists | none |
| `personal` | the user's stated preferences | none |

Retention is enforced by `POST /memory/expire`, which deletes rows whose
`expires_at` has passed and returns their ids. Expiry is not a background timer:
it runs when asked, so a quieter machine does no surprise writes.

Not everything becomes memory. A conversation is only remembered when a memory is
created explicitly (through the UI or the API), and the default visibility is
`private`.

## 2. Record shape

```json
{
  "id": "mem_…",
  "category": "semantic",
  "title": "Moon phase geometry",
  "body": "The illuminated fraction follows the Sun–Earth–Moon elongation.",
  "language": "en",
  "tags": ["moon", "geometry"],
  "source": "manual",
  "visibility": "private",
  "confidence": 1,
  "pinned": false,
  "version": 3,
  "createdAt": "…",
  "updatedAt": "…",
  "expiresAt": null
}
```

`title` must be 1–200 characters and `body` at most 20 000. A credential in the
title or body is refused with `SECRET_IN_MEMORY` (422); free text that merely
contains something that looks like a key is redacted by
`security.redactSecrets()` before it reaches storage, and the redaction is
recorded in the audit log.

## 3. Search

`GET /memory/search?q=…&category=…&limit=…` scores every candidate:

```
score = 0.45 · keyword
      + 0.20 · recency
      + 0.15 · confidence
      + 0.10 · pinned
      + 0.10 · cosine(queryEmbedding, memoryEmbedding)
```

- Keyword uses FTS5 `bm25` when available, otherwise token overlap. The response
  reports `strategy`: `fts`, `fts+vector`, or `tokens`.
- Recency is an exponential decay with a 30-day half-life.
- The vector term only exists when an embedding adapter is configured **and**
  both the query and the memory have embeddings; otherwise it contributes 0 and
  the response says the strategy is `fts`. No embedding is fabricated.
- Each hit includes its components (`keyword`, `recency`, `confidence`, `pinned`,
  `vector`) so a user can see why something ranked first.

## 4. Multilingual retrieval

Language detection is script-based (`language.js`): Sinhala `\u0D80–\u0DFF`,
Tamil `\u0B80–\u0BFF`, Latin → English, otherwise `und`. Texts are normalised
(NFC, zero-width characters stripped) and checked for well-formed Unicode.

Cross-language recall comes from a reviewed glossary bridge of 18 concept
entries, each with `en`, `si` and `ta` spellings (moon, star, planet, orbit,
telescope, observation, mission, galaxy, nebula, gravity, light year, eclipse,
research, memory, skill, security, test, weather). A query is expanded to the
same concept in all three languages before scoring, so a Sinhala query can reach
an English memory. This is a bounded, readable bridge — not a translation model,
and not a claim of general cross-lingual understanding.

Measured per language by the benchmark suite: `lang-en` / `lang-si` / `lang-ta`
detection, and `mem-si-cross` (Sinhala query against an English memory). See
`NOVA_EVALUATION_FRAMEWORK.md` for the run results.

## 5. Versions, corrections, reverts

- Every edit writes the previous state to `memory_versions` and increments
  `version`. `GET /memory/:id` returns the current record.
- `POST /memory/:id/revert { version }` restores that version **as a new
  version**; history is append-only, so a revert is visible in the log.
- `POST /memory/:id/correct { body?, reason? }` records a correction and links it
  to the original with `RELATED_TO`, preserving the wrong version instead of
  erasing it.
- `DELETE /memory/:id` requires `memory.delete`; foreign keys cascade the
  versions.

## 6. Duplicate suppression

On create, candidate records are compared by token Jaccard similarity. A
duplicate is merged only when **similarity ≥ 0.8 and at least 8 shared tokens**.
The second condition matters: short titles like "moon" and "moon phase" can score
high on Jaccard while being different facts.

## 7. Knowledge graph

`graph.link(from, relation, to)` writes a typed edge into `memory_links`;
`GET /graph?type=memory&id=…` returns the neighbourhood, and `GET /graph` returns
counts by relation. Node types: `memory`, `task`, `skill`, `experience`,
`evidence`, `project`. Relation types: `EXPERIENCE_CREATED_SKILL`,
`TASK_USED_SKILL`, `MEMORY_SUPPORTS_TASK`, `EVIDENCE_VERIFIES_RESULT`,
`SKILL_DEPENDS_ON_SKILL`, `PROJECT_ASSOCIATED_WITH_MEMORY`,
`TASK_PRODUCED_EXPERIENCE`, `SKILL_PRODUCED_VERSION`, `RELATED_TO`.

Self-links are rejected (`SELF_LINK`), as are unknown node or relation types.

## 8. Export, delete, backup

| Action | Endpoint | Guarantee |
| --- | --- | --- |
| Export everything | `GET /api/nova/life/export` | requires `memory.read`; returns all tables for this user as JSON |
| Delete this user's data | `DELETE /api/nova/life/data` | removes user rows in a transaction; keeps install-level permissions so the app is not left in an unusable state |
| Backup | `POST /api/nova/life/backup` | copies the SQLite file beside the original with a timestamp; returns the file name only |

The Supabase migration stores the same records in `life_*` tables with RLS, so a
hosted deployment can hold the same shape. The local SQLite file remains the
source of truth for the engine.

## 9. Limits and honest gaps

- Search is lexical + optional vectors; there is no learned reranker.
- The glossary covers astronomy-adjacent concepts plus a few engineering terms.
  A general-purpose Sinhala/Tamil semantic search is out of scope and is not
  claimed.
- Embeddings are optional and are only stored when an adapter produced them.
- Memory is per user id (`local` in single-user mode); cross-device sync is not
  implemented locally.

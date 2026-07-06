# Japanese Vocab App — Design

**Date:** 2026-07-05
**Status:** Approved by user (brainstorming session)

## Purpose

Nhat has 2+ years of italki lesson notes plus Genki and Quartet vocabulary living in an Obsidian vault (~15,700 vocab entries, plus grammar points and example sentences). The primary pain: mid-lesson, he needs to look up a word in about two seconds — Japanese→meaning or English→Japanese — and today that means manually digging through monthly markdown files. This app turns the vault into a fast, searchable personal corpus, with browse/stats/SRS layered on later.

## Source Data

Vault path: `/Users/nhattran/documents/obsidian-main/nhat-mind/efforts/japanese-learning`

- `Lessons/<year>/<YYYY-MM>.md` — monthly files, `## YYYY-MM-DD` day headings, three Obsidian callout types per day:
  - `> [!example]+ Vocabulary` — bullets in `語（よみ）- gloss` format (mostly enriched; some 2023–2024 files have bare unglossed bullets)
  - `> [!tip]+ Grammar & Patterns`
  - `> [!quote]+ Example Sentences`
- `Vocabulary/Genki/Genki-LXX.md` and `Vocabulary/Quartet-1/Quartet-LXX.md` — per-chapter files with frontmatter (`textbook`, `chapter`, `entry_count`) and section headings (e.g. `## 読み 1`)
- `Grammar/*.md` — reference notes
- Known messiness (from the vault's enrichment handoff doc): full-width spaces (U+3000), occasional NBSP, `）-` no-space glosses, nested sub-bullets (example sentences under a parent word), `＝`/`VS` style lines, stray bold markers.

**The vault is read-only to this app.** Obsidian remains the note-taking home; the app re-indexes as notes change.

## User & Environment

- Single user, local laptop (macOS), used in a browser tab next to the italki video call.
- Japanese typed via macOS IME (romaji keystrokes produce kana/kanji), so search must handle kana, kanji, and English input. Romaji-literal matching is a nice-to-have, not required.

## Approach (decided)

Local web app: Node.js/TypeScript, indexer → SQLite → Hono API server → Vite/React frontend. Chosen over a fully static client-side app (SRS/stats need a real store) and an Obsidian plugin (constrained UI, locks future iteration).

## Architecture

One project, three parts:

1. **Indexer** — parses the vault into SQLite. Full parse at server start; a chokidar file-watcher re-indexes a changed file (debounced against Obsidian autosaves). Per-file indexing is delete-then-reinsert, so edits/deletions never leave stale rows. The SQLite notes data is a disposable cache — rebuildable from the vault at any time.
2. **Server** — Hono, single process, one port. JSON API + serves the built frontend. `npm start` → open browser tab.
3. **Frontend** — Vite + React + TypeScript. Search-first, keyboard-driven.

Database file: `data/vocab.db` via `better-sqlite3`. Phase 3 SRS tables live in the same file and are the only non-rebuildable data (back up separately when we get there).

## Data Model

- **`entries`** — one row per parsed bullet:
  - `term` (還付), `reading` (かんぷ), `gloss` (refund), `raw` (original line verbatim)
  - `kind`: `vocab` | `grammar` | `sentence`
  - `source_type`: `lesson` | `genki` | `quartet` | `grammar-note`
  - `source_ref`: lesson date (`2025-06-02`) or chapter (`Quartet-1 L5 読1`)
  - `file`, `line` (for provenance / jump-to-source)
  - `parent_id` — sub-bullets (example sentences under a word) attach to their parent entry
- **`words`** — a table computed during indexing: one row per normalized term with aggregate columns (occurrence count, sources, first/last seen), so one word aggregates all its occurrences (textbook chapters + every lesson date). Rebuilt alongside `entries`.
- **Search index:** pre-normalized folded columns (`term_f`, `reading_f`, `gloss_f`, `raw_f` — NFKC, lowercase, katakana→hiragana, whitespace stripped) queried with indexed `LIKE` scans, ranked in JS. Parenthesized readings are extracted at parse time so かんぷ, 還付, and "refund" all match the same row. *(Amended from FTS5: FTS5's tokenizers can't substring-match 2-character Japanese queries — the most common case — while a LIKE scan over ~16k rows returns in single-digit milliseconds. The query layer is isolated in one module so this can be revisited if the corpus grows 10×.)*

**Parser resilience:** tolerate full-width spaces, NBSP, `）-` glosses, bare unglossed bullets (indexed anyway — searchable by Japanese), nested bullets, `＝`/`VS` lines. Any line that can't be classified is still indexed as raw text (never invisible), and an "unparsed lines" report page lists what fell through so the parser can improve over time.

## Search Experience (Phase 1 core)

- One search box; results render in <~50ms as you type.
- Input detection: Japanese (kana/kanji) matches term + reading; English matches glosses; kana matches both readings and kana-only words.
- Ranking: exact match > prefix match > frequency across lessons > recency.
- Result rows are self-sufficient at a glance: term, reading, gloss, source badges (`Genki L8`, `Quartet L5`, `×7 lessons`) — no click needed to get the answer.
- Word detail view (Enter/click): every occurrence across notes — chapters, lesson dates, and the user's own example sentences from those lessons, sub-bullets inline.
- Filters as one-key toggles: All / Vocab / Grammar / Sentences.

## API Surface

- `GET /api/search?q=&kind=` — ranked results
- `GET /api/word/:term` — all occurrences of a normalized term
- Phase 2: `GET /api/browse`, `GET /api/stats`
- Phase 3: `POST /api/review` etc. (spec'd later)

## Phases

- **Phase 1 (now):** indexer + watcher, search API, search UI + word detail. Replaces the mid-lesson workflow by itself.
- **Phase 2:** browse (by month/date, by textbook chapter) and stats (totals, per-month growth, most-encountered words, textbook coverage vs. real-lesson appearances).
- **Phase 3:** SRS review — flashcards from the user's own entries, SM-2-style scheduling, review history in SQLite. Gets its own mini-spec.
- **Future direction (not designed):** desktop/mobile packaging.

## Error Handling

- Vault unreachable at startup → clear message; serve the last-built index if one exists.
- A file that fails to parse → log, skip, keep serving. The server never crashes mid-lesson.
- Watcher debounced; per-file re-index keeps updates cheap.

## Testing

- **Parser: the correctness core.** Unit tests against real snippets from the vault — enriched lines, bare 2023 lines, full-width spaces, nested sub-bullets, `）-` variants, frontmatter, section headings.
- **Search API:** integration tests against a fixture DB — Japanese, English, and kana queries; ranking sanity.
- **UI:** kept simple; verified by use.

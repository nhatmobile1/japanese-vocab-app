# Browse Views, Theme & Font — Design

**Date:** 2026-07-10
**Status:** Approved by user (brainstorming session)
**Builds on:** `2026-07-05-japanese-vocab-app-design.md` (Phase 1, merged). This is the first slice of Phase 2 (browse), plus UI fixes.

## Motivation (user feedback after real use)

1. The auto dark theme is hard to read; the Mincho display font is disliked.
2. No way to browse: all vocab, grammar organized by grammar point, sentences in a sensible order.

Corpus at design time: 13,688 vocab entries (~9,400 distinct words), 384 grammar entries (~331 distinct points), 2,973 sentences.

## Part 1: Theme & Font

### Font
- Drop the Mincho serif entirely. All text — including headline terms — uses sans.
- Bundle **Noto Sans JP** locally via `@fontsource/noto-sans-jp` (weights 400, 500, 700), imported in the frontend so it is served from `web/dist` (offline-capable, no CDN/network fonts).
- Stacks become: `--font-ui` and `--font-display` = `'Noto Sans JP', 'Hiragino Sans', -apple-system, 'Segoe UI', sans-serif`. `--font-mono` unchanged.

### Theme
- **Light is the default, always.** Remove the `@media (prefers-color-scheme: dark)` auto-switch.
- A sun/moon toggle button in the header switches themes. Choice persists in `localStorage` (`theme` = `light` | `dark`); applied as `data-theme="dark"` on `<html>` before first paint (inline script in `index.html` to avoid a flash).
- Dark palette is recalibrated for readability: keep near-black background, but selection becomes a subtle dark highlight block (not solid vermillion); accent used for text/borders only.

## Part 2: Browse Views

### Navigation model
The existing tabs (All / Vocab / Grammar / Sentences) become **views** with one rule:
- **Empty search box** → the view shows its full browsable list (All view stays blank, ready to search).
- **Typing** → filters within the view (existing search behavior with `kind` param).
Keyboard behavior (↑↓/Enter/Esc/`/`), word detail, and the All view's search flow are unchanged.

### Vocab view
- One row per distinct word (same row layout as search results: term, reading, gloss, badges).
- Sort control with four options:
  - **Recently learned** (default): `last_seen` DESC, textbook-only words last.
  - **あいうえお**: by kana reading (`reading_sort` — see schema), dictionary order.
  - **Most encountered**: `lesson_count` DESC, then `occurrence_count` DESC.
  - **By textbook chapter**: Genki L0→L23, then Quartet L1→L12 (`chapter_sort`), lesson-only words last.
- Click/Enter on a row → existing word detail view.
- Paged: 100 per page, "Load more" button at the bottom (no infinite scroll).

### Grammar view
- One row per distinct grammar point (grouped by `norm_term`), showing pattern (term), gloss, and lesson-count badge.
- Sorts: Recently learned (default), あいうえお, Most encountered. No textbook sort.
- Click → existing word detail view (occurrences + example sentences).

### Sentences view
- Chronological timeline, newest first, grouped under month headers (e.g. `2026-06`); each sentence row shows its lesson date and raw text (readings inline as written in the notes).
- Search filters the timeline (existing `kind=sentence` search). Same 100-row paging with month grouping computed client-side from the page rows.
- Sentences are not clickable (no detail view target); rows are display-only.

## API

New endpoint, server-side sorting/paging (approach chosen over shipping the corpus to the client: instant first paint, phone-friendly over Tailscale, SQL sorts are ~ms):

`GET /api/browse?kind=vocab|grammar|sentence&sort=recent|reading|frequency|chapter&page=N`

- `vocab`/`grammar`: returns `{ total, page, results: SearchResultWord[] }` — one item per distinct word, reusing the search result shape (normTerm, term, reading, gloss, occurrenceCount, lessonCount, sources). Backed by the `words` table (see schema) filtered by kind.
- `sentence`: returns `{ total, page, results: Entry[] }` — sentence entries ordered by `source_ref` DESC, then `line`. `sort` is ignored for sentences.
- Page size fixed at 100. Invalid `kind`/`sort` → 400 JSON error. `page` beyond the end → empty results.
- `chapter` sort is only valid for `kind=vocab` (400 otherwise).

## Schema changes (words table, computed at rebuild)

`rebuildWords` gains three columns; the table remains a disposable rebuild artifact (no migration — `CREATE TABLE` is updated and the DB file is rebuilt on start):

- `kind` — `'vocab'` or `'grammar'`: the dominant kind among the group's entries (ties → vocab). Enables kind-filtered browse without regrouping at query time.
- `reading_sort` — kana sort key: `reading` if present, else the folded term (`norm_term`); NULL when the term has no kana rendering (sorted last under あいうえお).
- `chapter_sort` — sortable textbook key from the group's first textbook source: `1-08` for Genki L8, `2-05` for Quartet I L5 (zero-padded); NULL for lesson-only words (sorted last under chapter sort).

## Frontend structure

- `App.tsx` gains view-state handling: current tab + per-view sort + accumulated pages; renders `BrowseList` when the query is empty and the tab isn't All.
- New components: `BrowseList` (rows + Load more + sort control), `SortSelect`, `ThemeToggle`, `MonthGroup` (sentences).
- Keyboard: ↑↓/Enter work over browse rows identically to search results.

## Error handling

- Browse fetch failure → same inline error style as search ("couldn't load — is the server running?").
- Theme toggle is pure client-side; no failure mode beyond localStorage unavailability (falls back to light, no crash).

## Testing

- API: ordering tests per sort (fixture words with distinct dates/counts/readings/chapters), kind filtering, paging boundaries (page 0, last page, past-the-end), 400 cases.
- `rebuildWords`: unit tests for `kind` dominance, `reading_sort` fallback, `chapter_sort` derivation (Genki/Quartet/lesson-only).
- Theme/font and view UI verified by use (consistent with Phase 1's approach).

## Out of scope (unchanged from Phase 2 backlog)

Stats, unparsed-report UI page, SRS (Phase 3), other deferred hardening items.

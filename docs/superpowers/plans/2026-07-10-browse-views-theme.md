# Browse Views, Theme & Font Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browsable, sortable Vocab/Grammar/Sentence views, a light-default theme with a dark-mode toggle, and Noto Sans JP everywhere.

**Architecture:** The `words` table gains three computed-at-rebuild columns (`kind`, `reading_sort`, `chapter_sort`) behind a `user_version` schema bump. A new `GET /api/browse` endpoint does SQL-side sorting/paging (100/page). The frontend promotes the existing filter tabs to views: empty query = browsable list, typing = filtered search. Theme becomes explicit (`data-theme` attribute + localStorage), fonts become bundled Noto Sans JP.

**Tech Stack:** Existing stack (TypeScript strict/ESM, better-sqlite3, Hono, Vitest, Vite + React) plus `@fontsource/noto-sans-jp`.

**Spec:** `docs/superpowers/specs/2026-07-10-browse-views-theme-design.md`

## Global Constraints

- Work on branch `feature/browse-views` (branch from `main` before Task 1).
- The vault is **read-only** — nothing under the vault path is ever written.
- ESM with `.js` extensions on relative imports; TypeScript strict; `npm run typecheck` (both projects) must pass at every commit.
- Full test suite (`npx vitest run`) must pass at every commit; frontend tasks also require `npm run build` clean.
- Page size is exactly **100**. Sort keys are exactly `recent | reading | frequency | chapter`. Kind keys are exactly `vocab | grammar | sentence`.
- No CDN/network fonts — Noto Sans JP is bundled via `@fontsource/noto-sans-jp` and served from `web/dist`.
- Theme default is **light always**; dark only via the toggle; persisted as localStorage key `theme` = `'dark'` (anything else = light).
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

```
src/db.ts                      # MODIFY: schema v2 (words columns + kind index + user_version migration)
src/indexer.ts                 # MODIFY: rebuildWords computes kind/reading_sort/chapter_sort
src/indexer.test.ts            # MODIFY: new describe block for sort metadata
src/app.ts                     # MODIFY: ENTRY_COLUMNS to module scope; add GET /api/browse
src/app.test.ts                # MODIFY: browse endpoint tests
web/index.html                 # MODIFY: pre-paint theme script
web/src/main.tsx               # MODIFY: fontsource imports
web/src/ThemeToggle.tsx        # CREATE: sun/moon toggle
web/src/SentenceTimeline.tsx   # CREATE: month-grouped sentence list
web/src/App.tsx                # MODIFY: views + sorts + load-more (full rewrite shown)
web/src/api.ts                 # MODIFY: browseWords/browseSentences
web/src/types.ts               # MODIFY: BrowsePage<T>
web/src/styles.css             # MODIFY: fonts, data-theme dark block, new component styles
README.md                      # MODIFY: browse/theme docs
```

---

### Task 1: words schema v2 + sort metadata in rebuildWords

**Files:**
- Modify: `src/db.ts` (whole `createSchema` + new `SCHEMA_VERSION`)
- Modify: `src/indexer.ts` (`rebuildWords` + new `chapterSortKey` helper + one import)
- Test: `src/indexer.test.ts` (new describe block)

**Interfaces:**
- Consumes: `isKanaOnly(s: string): boolean` from `src/lib/japanese.js` (existing).
- Produces (Task 2 relies on these exact columns): `words.kind` (`'vocab' | 'grammar'`), `words.reading_sort` (`TEXT NULL`), `words.chapter_sort` (`TEXT NULL`, format `1-08` Genki / `2-05` Quartet), plus `CREATE INDEX idx_words_kind ON words(kind)`.
- Migration: `PRAGMA user_version` bump to 2 drops the old `words` table once (it is a rebuild artifact; `rebuildWords` repopulates it on the next index).

- [ ] **Step 1: Write the failing tests**

In `src/indexer.test.ts`, add this describe block **between** the existing `describe('indexVault', ...)` and `describe('reindexFile / removeFile', ...)` blocks (the removeFile test deletes the Quartet file, which would change 流れる's chapter_sort — order matters):

```ts
describe('words sort metadata', () => {
  const get = (sql: string) =>
    db.prepare(sql).get() as {
      kind: string;
      reading_sort: string | null;
      chapter_sort: string | null;
    };

  test('kind is the dominant kind of the group', () => {
    expect(get(`SELECT kind FROM words WHERE term = '還付'`).kind).toBe('vocab');
    expect(get(`SELECT kind FROM words WHERE norm_term = '倍'`).kind).toBe('grammar');
  });

  test('reading_sort uses the reading, falls back to kana-only norm terms, else NULL', () => {
    expect(get(`SELECT reading_sort FROM words WHERE term = '還付'`).reading_sort).toBe('かんぷ');
    // The grammar-note bullet 〜させる has no furigana; its norm_term させる is kana-only.
    expect(get(`SELECT reading_sort FROM words WHERE norm_term = 'させる'`).reading_sort).toBe('させる');
    // もう1年 has no kana rendering (digit + kanji) → NULL, sorted last.
    expect(get(`SELECT reading_sort FROM words WHERE term = 'もう1年'`).reading_sort).toBe(null);
  });

  test('chapter_sort derives from the first textbook source', () => {
    expect(get(`SELECT chapter_sort FROM words WHERE term = '雨'`).chapter_sort).toBe('1-08');
    expect(get(`SELECT chapter_sort FROM words WHERE term = '流れる'`).chapter_sort).toBe('2-05');
    expect(get(`SELECT chapter_sort FROM words WHERE term = '還付'`).chapter_sort).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/indexer.test.ts`
Expected: FAIL — `no such column: kind` (words table has no kind column yet).

- [ ] **Step 3: Update db.ts**

Replace the entire contents of `src/db.ts` with:

```ts
import Database from 'better-sqlite3';

// v2: words gained kind / reading_sort / chapter_sort. words is a rebuild
// artifact, so migration is just "drop and let rebuildWords repopulate".
const SCHEMA_VERSION = 2;

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createSchema(db);
  return db;
}

export function createSchema(db: Database.Database): void {
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < SCHEMA_VERSION) {
    db.exec('DROP TABLE IF EXISTS words;');
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT,
      reading TEXT,
      gloss TEXT,
      raw TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('vocab','grammar','sentence')),
      source_type TEXT NOT NULL CHECK (source_type IN ('lesson','genki','quartet','grammar-note')),
      source_ref TEXT NOT NULL,
      section TEXT,
      file TEXT NOT NULL,
      line INTEGER NOT NULL,
      parent_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,
      norm_term TEXT,
      term_f TEXT,
      reading_f TEXT,
      gloss_f TEXT,
      raw_f TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entries_file ON entries(file);
    CREATE INDEX IF NOT EXISTS idx_entries_norm ON entries(norm_term);
    CREATE INDEX IF NOT EXISTS idx_entries_parent ON entries(parent_id);

    CREATE TABLE IF NOT EXISTS words (
      norm_term TEXT PRIMARY KEY,
      term TEXT NOT NULL,
      reading TEXT,
      gloss TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('vocab','grammar')),
      occurrence_count INTEGER NOT NULL,
      lesson_count INTEGER NOT NULL,
      sources TEXT NOT NULL,
      first_seen TEXT,
      last_seen TEXT,
      reading_sort TEXT,
      chapter_sort TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_words_kind ON words(kind);

    CREATE TABLE IF NOT EXISTS unparsed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file TEXT NOT NULL,
      line INTEGER NOT NULL,
      text TEXT NOT NULL,
      reason TEXT NOT NULL
    );
  `);
}
```

- [ ] **Step 4: Update rebuildWords in indexer.ts**

In `src/indexer.ts`, change the japanese.js import line to also import `isKanaOnly`:

```ts
import { foldForSearch, isKanaOnly, normalizeTerm } from './lib/japanese.js';
```

Add this helper directly above `rebuildWords`:

```ts
/** Sortable textbook key from the first textbook source: Genki L8 → "1-08", Quartet I L5 → "2-05". */
function chapterSortKey(sources: { sourceType: string; sourceRef: string }[]): string | null {
  for (const s of sources) {
    if (s.sourceType !== 'genki' && s.sourceType !== 'quartet') continue;
    const m = s.sourceRef.match(/L(\d+)/i);
    if (!m) continue;
    return `${s.sourceType === 'genki' ? '1' : '2'}-${m[1].padStart(2, '0')}`;
  }
  return null;
}
```

Then replace the entire `rebuildWords` function with:

```ts
export function rebuildWords(db: Database.Database): void {
  db.exec('DELETE FROM words');
  const rows = db
    .prepare(
      `SELECT * FROM entries
       WHERE norm_term IS NOT NULL AND kind IN ('vocab','grammar') AND parent_id IS NULL`,
    )
    .all() as Array<{
    norm_term: string;
    term: string;
    reading: string | null;
    gloss: string | null;
    kind: string;
    source_type: string;
    source_ref: string;
  }>;

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const g = groups.get(r.norm_term);
    if (g) g.push(r);
    else groups.set(r.norm_term, [r]);
  }

  const ins = db.prepare(`
    INSERT INTO words (norm_term, term, reading, gloss, kind, occurrence_count, lesson_count,
                       sources, first_seen, last_seen, reading_sort, chapter_sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const [normTerm, group] of groups) {
    const display =
      group.find((r) => r.reading && r.gloss) ?? group.find((r) => r.gloss) ?? group[0];
    const seen = new Set<string>();
    const sources: { sourceType: string; sourceRef: string }[] = [];
    for (const r of group) {
      const key = `${r.source_type}:${r.source_ref}`;
      if (!seen.has(key)) {
        seen.add(key);
        sources.push({ sourceType: r.source_type, sourceRef: r.source_ref });
      }
    }
    // Textbooks first, then lessons newest-first.
    sources.sort((a, b) =>
      a.sourceType === 'lesson' && b.sourceType === 'lesson'
        ? b.sourceRef.localeCompare(a.sourceRef)
        : (a.sourceType === 'lesson' ? 1 : 0) - (b.sourceType === 'lesson' ? 1 : 0),
    );
    const lessonRefs = [...new Set(group.filter((r) => r.source_type === 'lesson').map((r) => r.source_ref))].sort();

    const vocabCount = group.filter((r) => r.kind === 'vocab').length;
    const kind = vocabCount * 2 >= group.length ? 'vocab' : 'grammar';
    const anyReading = group.find((r) => r.reading)?.reading ?? null;
    const readingSort = anyReading ?? (isKanaOnly(normTerm) ? normTerm : null);

    ins.run(
      normTerm,
      display.term,
      display.reading,
      display.gloss,
      kind,
      group.length,
      lessonRefs.length,
      JSON.stringify(sources),
      lessonRefs[0] ?? null,
      lessonRefs[lessonRefs.length - 1] ?? null,
      readingSort,
      chapterSortKey(sources),
    );
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: full suite passes (the existing `words groups across sources` tests still pass — columns were added, none removed); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/db.ts src/indexer.ts src/indexer.test.ts
git commit -m "feat: words sort metadata (kind, reading_sort, chapter_sort) with schema v2"
```

---

### Task 2: GET /api/browse

**Files:**
- Modify: `src/app.ts`
- Test: `src/app.test.ts` (new describe block)

**Interfaces:**
- Consumes: `words` columns from Task 1; existing `ENTRY_COLUMNS` concept from `/api/word`.
- Produces (Task 4 relies on this exact contract):
  - `GET /api/browse?kind=vocab|grammar&sort=recent|reading|frequency|chapter&page=N` → `{ total: number, page: number, results: SearchResultWord[] }` (`score` always 0).
  - `GET /api/browse?kind=sentence&page=N` → `{ total, page, results: Entry[] }` (top-level sentence entries, `source_ref` DESC).
  - 400 JSON `{error}` for invalid kind, invalid sort, or `chapter` with a non-vocab kind. Page size 100; past-the-end pages return `results: []`.

- [ ] **Step 1: Write the failing tests**

Append to `src/app.test.ts` (inside the file, after the existing describes):

```ts
describe('GET /api/browse', () => {
  const terms = async (qs: string) => {
    const res = await app.request(`/api/browse?${qs}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; results: { term: string }[] };
    return { total: body.total, list: body.results.map((r) => r.term) };
  };

  test('vocab recent: newest lesson first, textbook-only last', async () => {
    const { total, list } = await terms('kind=vocab&sort=recent');
    expect(list).toEqual(['還付', '流れる', 'もう1年', '雨']);
    expect(total).toBe(4);
  });

  test('vocab reading: あいうえお order, unreadable terms last', async () => {
    const { list } = await terms('kind=vocab&sort=reading');
    expect(list).toEqual(['雨', '還付', '流れる', 'もう1年']);
  });

  test('vocab frequency: most lessons first', async () => {
    const { list } = await terms('kind=vocab&sort=frequency');
    expect(list).toEqual(['還付', '流れる', 'もう1年', '雨']);
  });

  test('vocab chapter: Genki, then Quartet, lesson-only words last', async () => {
    const { list } = await terms('kind=vocab&sort=chapter');
    expect(list).toEqual(['雨', '流れる', '還付', 'もう1年']);
  });

  test('grammar view lists grammar points, recent first', async () => {
    const { total, list } = await terms('kind=grammar&sort=recent');
    expect(total).toBe(2);
    expect(list).toEqual(['〜倍', '〜させる']);
  });

  test('sentences: newest first with total', async () => {
    const res = await app.request('/api/browse?kind=sentence');
    const body = (await res.json()) as { total: number; results: { raw: string }[] };
    expect(body.total).toBe(1);
    expect(body.results[0].raw).toContain('もらいました');
  });

  test('invalid kind, invalid sort, and chapter-on-grammar are 400', async () => {
    expect((await app.request('/api/browse?kind=bogus')).status).toBe(400);
    expect((await app.request('/api/browse?kind=vocab&sort=bogus')).status).toBe(400);
    expect((await app.request('/api/browse?kind=grammar&sort=chapter')).status).toBe(400);
  });

  test('page past the end returns empty results', async () => {
    const res = await app.request('/api/browse?kind=vocab&sort=recent&page=7');
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app.test.ts`
Expected: the new tests FAIL with status 404 (route doesn't exist; the JSON-404 handler lives in server.ts, so `app.request` returns Hono's default 404).

- [ ] **Step 3: Implement the endpoint**

In `src/app.ts`:

1. Move `ENTRY_COLUMNS` out of the `/api/word` handler to module scope (delete the const inside the handler), and add the browse constants — the top of the file becomes:

```ts
import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { search } from './search.js';

const ENTRY_COLUMNS =
  'id, term, reading, gloss, raw, kind, source_type, source_ref, section, file, line, parent_id, norm_term';

const PAGE_SIZE = 100;

// NULLS-LAST orderings; norm_term as the final tiebreaker keeps paging stable.
const WORD_SORTS: Record<string, string> = {
  recent: 'last_seen IS NULL, last_seen DESC, occurrence_count DESC, norm_term',
  reading: 'reading_sort IS NULL, reading_sort, norm_term',
  frequency: 'lesson_count DESC, occurrence_count DESC, norm_term',
  chapter: 'chapter_sort IS NULL, chapter_sort, reading_sort IS NULL, reading_sort, norm_term',
};

interface WordRow {
  norm_term: string;
  term: string;
  reading: string | null;
  gloss: string | null;
  kind: string;
  occurrence_count: number;
  lesson_count: number;
  sources: string;
}

function wordToResult(w: WordRow) {
  return {
    normTerm: w.norm_term,
    term: w.term,
    reading: w.reading,
    gloss: w.gloss,
    kind: w.kind,
    occurrenceCount: w.occurrence_count,
    lessonCount: w.lesson_count,
    sources: JSON.parse(w.sources) as { sourceType: string; sourceRef: string }[],
    score: 0,
  };
}
```

2. Add the route inside `createApp`, after the `/api/search` handler:

```ts
  app.get('/api/browse', (c) => {
    const kind = c.req.query('kind') ?? '';
    const sort = c.req.query('sort') || 'recent';
    const page = Math.max(0, Math.trunc(Number(c.req.query('page')) || 0));

    if (kind !== 'vocab' && kind !== 'grammar' && kind !== 'sentence') {
      return c.json({ error: 'invalid kind' }, 400);
    }

    if (kind === 'sentence') {
      const total = (
        db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE kind = 'sentence' AND parent_id IS NULL`).get() as { n: number }
      ).n;
      const results = db
        .prepare(
          `SELECT ${ENTRY_COLUMNS} FROM entries WHERE kind = 'sentence' AND parent_id IS NULL
           ORDER BY source_ref DESC, file, line LIMIT ? OFFSET ?`,
        )
        .all(PAGE_SIZE, page * PAGE_SIZE);
      return c.json({ total, page, results });
    }

    if (!(sort in WORD_SORTS)) return c.json({ error: 'invalid sort' }, 400);
    if (sort === 'chapter' && kind !== 'vocab') {
      return c.json({ error: 'chapter sort is vocab-only' }, 400);
    }

    const total = (
      db.prepare('SELECT COUNT(*) AS n FROM words WHERE kind = ?').get(kind) as { n: number }
    ).n;
    const rows = db
      .prepare(`SELECT * FROM words WHERE kind = ? ORDER BY ${WORD_SORTS[sort]} LIMIT ? OFFSET ?`)
      .all(kind, PAGE_SIZE, page * PAGE_SIZE) as WordRow[];
    return c.json({ total, page, results: rows.map(wordToResult) });
  });
```

(The `${WORD_SORTS[sort]}` interpolation is safe: `sort` was validated against the object's own keys two lines above; no user text reaches the SQL.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: all pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/app.ts src/app.test.ts
git commit -m "feat: /api/browse with sorted, paged word and sentence lists"
```

---

### Task 3: Light-default theme toggle + Noto Sans JP

**Files:**
- Modify: `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx` (header only), `web/src/styles.css`, `package.json` (dependency)
- Create: `web/src/ThemeToggle.tsx`

**Interfaces:**
- Consumes: CSS custom properties already defined in `styles.css` (`--line`, `--ink`, `--focus`, …).
- Produces: `<ThemeToggle />` component (no props) used by Task 4's App rewrite; `data-theme="dark"` on `<html>` as the only dark-mode trigger; `.header-row` wrapper class in the header.

- [ ] **Step 1: Install the font**

```bash
npm install @fontsource/noto-sans-jp
```

- [ ] **Step 2: Import font weights**

In `web/src/main.tsx`, add these imports at the very top (before the App import):

```ts
import '@fontsource/noto-sans-jp/400.css';
import '@fontsource/noto-sans-jp/500.css';
import '@fontsource/noto-sans-jp/700.css';
```

- [ ] **Step 3: Pre-paint theme script**

In `web/index.html`, add this script inside `<head>`, directly after the `<title>` line (before the module script loads, so there is no light→dark flash):

```html
    <script>
      try {
        if (localStorage.getItem('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
      } catch (e) {}
    </script>
```

- [ ] **Step 4: Create the toggle component**

Create `web/src/ThemeToggle.tsx`:

```tsx
import { useState } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* private mode etc. — theme still applies for this session */
    }
    setTheme(next);
  };

  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
```

- [ ] **Step 5: Mount the toggle in the header**

In `web/src/App.tsx`: add `import ThemeToggle from './ThemeToggle';` after the WordDetail import, and wrap the search input so the header becomes:

```tsx
      <header className="search-header">
        <div className="header-row">
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="還付 · かんぷ · refund …"
            className="search-input"
            spellCheck={false}
          />
          <ThemeToggle />
        </div>
        <nav className="filter-tabs">
```

(the rest of the header is unchanged; Task 4 rewrites this file fully and keeps this structure).

- [ ] **Step 6: Update styles.css**

Four targeted edits:

1. Replace the font variables (currently `--font-ui: 'Hiragino Sans', ...` and the multi-line `--font-display: 'Hiragino Mincho ProN', ...`) with:

```css
  --font-ui: 'Noto Sans JP', 'Hiragino Sans', -apple-system, 'Segoe UI', sans-serif;
  --font-display: var(--font-ui);
```

2. Replace the entire `@media (prefers-color-scheme: dark) { :root { ... } }` block with an explicit attribute selector and a calmer palette (selection becomes a quiet dark block, accent reserved for text/borders):

```css
:root[data-theme='dark'] {
  --bg: #101114;
  --ink: #e8e8e6;
  --muted: #9a9da3;
  --accent: #ff6a4d;
  --accent-ink: #101114;
  --line: #2a2c30;
  --line-strong: #e8e8e6;
  --selected-bg: #26292e;
  --selected-ink: #ffffff;
  --focus: #ff6a4d;
}
```

3. In the design-rationale comment at the top of the file, replace the Mincho bullet (the lines about "Mincho (serif) for the headline term …") with:

```
    - Noto Sans JP everywhere (bundled locally, no network fonts) — the user
      found Mincho hard to read; light theme is the default, dark is opt-in.
```

4. Add header-row/toggle styles after the `.search-input:focus` rule block:

```css
.header-row {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}

.header-row .search-input {
  flex: 1;
}

.theme-toggle {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  padding: 0 0.75rem;
  cursor: pointer;
  font-family: var(--font-ui);
}

.theme-toggle:hover {
  color: var(--ink);
  border-color: var(--line-strong);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
```

- [ ] **Step 7: Verify**

Run: `npm run build && npm run typecheck && npx vitest run`
Expected: all clean (fontsource CSS resolves through Vite; woff2 files land in `web/dist/assets/`).

Then `npm run dev`, open http://localhost:5173 and check: app loads **light** regardless of macOS setting; toggle switches to dark and back; reload preserves the choice; the big term text renders in a sans face (no serifs).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json web/
git commit -m "feat: light-default theme with dark toggle; bundle Noto Sans JP"
```

---

### Task 4: Browse views UI

**Files:**
- Modify: `web/src/types.ts`, `web/src/api.ts`, `web/src/App.tsx` (full rewrite below), `web/src/styles.css` (additions)
- Create: `web/src/SentenceTimeline.tsx`

**Interfaces:**
- Consumes: `/api/browse` contract from Task 2; `ThemeToggle` from Task 3; existing `WordDetail`, `SearchResultWord`, `Entry`.
- Produces: the finished views. No later task consumes code from this one.

- [ ] **Step 1: Add types**

Append to `web/src/types.ts`:

```ts
export interface BrowsePage<T> {
  total: number;
  page: number;
  results: T[];
}
```

- [ ] **Step 2: Add API functions**

In `web/src/api.ts`, change the type import to `import type { BrowsePage, Entry, SearchResultWord, WordResponse } from './types';` and append:

```ts
export async function browseWords(
  kind: string,
  sort: string,
  page: number,
  signal?: AbortSignal,
): Promise<BrowsePage<SearchResultWord>> {
  const res = await fetch(
    `/api/browse?kind=${encodeURIComponent(kind)}&sort=${encodeURIComponent(sort)}&page=${page}`,
    { signal },
  );
  if (!res.ok) throw new Error(`browse failed: ${res.status}`);
  return (await res.json()) as BrowsePage<SearchResultWord>;
}

export async function browseSentences(
  page: number,
  signal?: AbortSignal,
): Promise<BrowsePage<Entry>> {
  const res = await fetch(`/api/browse?kind=sentence&page=${page}`, { signal });
  if (!res.ok) throw new Error(`browse failed: ${res.status}`);
  return (await res.json()) as BrowsePage<Entry>;
}
```

- [ ] **Step 3: Create SentenceTimeline**

Create `web/src/SentenceTimeline.tsx`:

```tsx
import type { Entry } from './types';

function byMonth(entries: Entry[]): { month: string; items: Entry[] }[] {
  const groups: { month: string; items: Entry[] }[] = [];
  for (const e of entries) {
    const month = e.source_ref.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.month === month) last.items.push(e);
    else groups.push({ month, items: [e] });
  }
  return groups;
}

export default function SentenceTimeline({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return <p className="empty">No sentences yet</p>;
  return (
    <div className="timeline">
      {byMonth(entries).map((g) => (
        <section key={g.month}>
          <h2 className="month-header">{g.month}</h2>
          <ul>
            {g.items.map((e) => (
              <li key={e.id} className="occurrence">
                <span className="badge date">{e.source_ref}</span>
                <span className="entry-raw">{e.raw}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite App.tsx**

Replace the entire contents of `web/src/App.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { browseSentences, browseWords, searchApi } from './api';
import type { Entry, SearchResultWord } from './types';
import SentenceTimeline from './SentenceTimeline';
import ThemeToggle from './ThemeToggle';
import WordDetail from './WordDetail';

const KINDS = [
  { key: 'all', label: 'All' },
  { key: 'vocab', label: 'Vocab' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'sentence', label: 'Sentences' },
];

const WORD_SORTS = [
  { key: 'recent', label: 'Recent' },
  { key: 'reading', label: 'あいうえお' },
  { key: 'frequency', label: 'Most seen' },
  { key: 'chapter', label: 'Chapter' },
];

function sourceBadges(r: SearchResultWord): string[] {
  const badges = r.sources
    .filter((s) => s.sourceType !== 'lesson')
    .map((s) => s.sourceRef);
  if (r.lessonCount === 1) {
    const d = r.sources.find((s) => s.sourceType === 'lesson');
    if (d) badges.push(d.sourceRef);
  } else if (r.lessonCount > 1) {
    badges.push(`×${r.lessonCount} lessons`);
  }
  return badges;
}

function WordRows({
  rows,
  sel,
  onSel,
  onOpen,
}: {
  rows: SearchResultWord[];
  sel: number;
  onSel: (i: number) => void;
  onOpen: (r: SearchResultWord) => void;
}) {
  return (
    <>
      {rows.map((r, i) => (
        <li
          key={`${r.normTerm ?? r.term}-${i}`}
          className={i === sel ? 'result selected' : 'result'}
          onClick={() => onOpen(r)}
          onMouseEnter={() => onSel(i)}
        >
          <span className="term">{r.term}</span>
          {r.reading && r.reading !== r.term && <span className="reading">{r.reading}</span>}
          <span className="gloss">{r.gloss ?? ''}</span>
          <span className="badges">
            {sourceBadges(r).map((b) => (
              <span key={b} className="badge">
                {b}
              </span>
            ))}
          </span>
        </li>
      ))}
    </>
  );
}

export default function App() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [results, setResults] = useState<SearchResultWord[]>([]);
  const [sort, setSort] = useState('recent');
  const [words, setWords] = useState<SearchResultWord[]>([]);
  const [sentences, setSentences] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState(0);
  const [detail, setDetail] = useState<SearchResultWord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const searching = q.trim().length > 0;
  const browsing = !searching && kind !== 'all';
  // Chapter sort only exists for vocab; fall back when the Grammar tab is active.
  const effectiveSort = kind === 'grammar' && sort === 'chapter' ? 'recent' : sort;

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (!searching) {
        setResults([]);
        setError(null);
        return;
      }
      try {
        setResults(await searchApi(q, kind, ctrl.signal));
        setSel(0);
        setError(null);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError('Search failed — is the server running?');
        }
      }
    }, 100);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, kind, searching]);

  useEffect(() => {
    if (!browsing) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        if (kind === 'sentence') {
          const data = await browseSentences(0, ctrl.signal);
          setSentences(data.results);
          setTotal(data.total);
        } else {
          const data = await browseWords(kind, effectiveSort, 0, ctrl.signal);
          setWords(data.results);
          setTotal(data.total);
        }
        setPage(0);
        setSel(0);
        setError(null);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setError('Couldn’t load the list — is the server running?');
        }
      }
    })();
    return () => ctrl.abort();
  }, [browsing, kind, effectiveSort]);

  const loadMore = async () => {
    try {
      if (kind === 'sentence') {
        const data = await browseSentences(page + 1);
        setSentences((s) => [...s, ...data.results]);
      } else {
        const data = await browseWords(kind, effectiveSort, page + 1);
        setWords((w) => [...w, ...data.results]);
      }
      setPage((p) => p + 1);
      setError(null);
    } catch {
      setError('Couldn’t load more — is the server running?');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (detail) setDetail(null);
        else {
          setQ('');
          inputRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detail]);

  const navRows = searching ? results : browsing && kind !== 'sentence' ? words : [];

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, navRows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && navRows[sel]) {
      setDetail(navRows[sel]);
    }
  };

  const loaded = kind === 'sentence' ? sentences.length : words.length;

  return (
    <div className="app">
      <header className="search-header">
        <div className="header-row">
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="還付 · かんぷ · refund …"
            className="search-input"
            spellCheck={false}
          />
          <ThemeToggle />
        </div>
        <nav className="filter-tabs">
          {KINDS.map((k) => (
            <button
              key={k.key}
              className={kind === k.key ? 'tab active' : 'tab'}
              onClick={() => setKind(k.key)}
            >
              {k.label}
            </button>
          ))}
        </nav>
        {browsing && kind !== 'sentence' && (
          <nav className="sort-tabs" aria-label="Sort order">
            {WORD_SORTS.filter((s) => !(kind === 'grammar' && s.key === 'chapter')).map((s) => (
              <button
                key={s.key}
                className={effectiveSort === s.key ? 'tab active' : 'tab'}
                onClick={() => setSort(s.key)}
              >
                {s.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {error && <p className="error">{error}</p>}

      {detail ? (
        <WordDetail result={detail} onBack={() => setDetail(null)} />
      ) : searching ? (
        <ul className="results">
          <WordRows rows={results} sel={sel} onSel={setSel} onOpen={setDetail} />
          {results.length === 0 && !error && <li className="empty">No matches for “{q}”</li>}
        </ul>
      ) : browsing ? (
        <>
          {kind === 'sentence' ? (
            <SentenceTimeline entries={sentences} />
          ) : (
            <ul className="results">
              <WordRows rows={words} sel={sel} onSel={setSel} onOpen={setDetail} />
            </ul>
          )}
          {loaded < total && (
            <button className="load-more" onClick={loadMore}>
              Load more ({loaded} of {total})
            </button>
          )}
        </>
      ) : (
        <ul className="results" />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add styles**

Append to `web/src/styles.css`:

```css
/* --- Browse views ------------------------------------------------------ */

.sort-tabs {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.4rem;
}

.sort-tabs .tab {
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
}

.load-more {
  display: block;
  margin: 1rem auto 0;
  padding: 0.45rem 1.25rem;
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--ink);
  font-family: var(--font-ui);
  font-size: 0.85rem;
  cursor: pointer;
}

.load-more:hover {
  background: var(--selected-bg);
  color: var(--selected-ink);
}

.load-more:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.timeline section {
  margin-top: 0.5rem;
}

.timeline ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.month-header {
  font-size: 0.85rem;
  text-transform: none;
  letter-spacing: 0.08em;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
  padding-bottom: 0.25rem;
  margin: 1.25rem 0 0.5rem;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: Verify build and behavior**

Run: `npm run build && npm run typecheck && npx vitest run`
Expected: all clean.

Then `npm run dev`, open http://localhost:5173, verify each:

1. All tab + empty box → blank, typing searches (unchanged behavior).
2. Vocab tab + empty box → list appears, Recent order (newest lesson words first); sort tabs switch to あいうえお / Most seen / Chapter and the list re-sorts.
3. Grammar tab → grammar points list; no Chapter sort tab shown.
4. Sentences tab → month headers, newest first; no sort tabs.
5. Typing in any tab filters within that kind; clearing returns to the list.
6. ↑↓/Enter open word detail from a browse list; Esc returns; sentences are not selectable.
7. Load more appends the next 100 and the counter updates.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat: browsable vocab/grammar/sentence views with sorts and paging"
```

---

### Task 5: Real-vault verification + README

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything prior.
- Produces: the finished deliverable, verified against the real vault.

- [ ] **Step 1: Verify against the real vault**

```bash
npm start &
sleep 8
curl -s 'http://localhost:3456/api/browse?kind=vocab&sort=recent' | head -c 300
curl -s 'http://localhost:3456/api/browse?kind=vocab&sort=chapter' | head -c 300
curl -s 'http://localhost:3456/api/browse?kind=grammar&sort=frequency' | head -c 300
curl -s 'http://localhost:3456/api/browse?kind=sentence' | head -c 300
kill %1
```

Expected: vocab recent's first result is from a recent lesson (last_seen within the newest lesson month); chapter sort's first result carries a `Genki L0…` source badge; grammar total ≈ 300–350; sentence total ≈ 2,900–3,000 with `2026-` dates first. Record actual outputs in the report. The schema-v2 migration must show in the logs as a normal startup (old `data/vocab.db` is upgraded silently — no crash).

- [ ] **Step 2: Update the README**

In `README.md`, replace the `## Search` section with:

```markdown
## Search & Browse

- Kanji (還付), kana (かんぷ / カンプ), or English (refund) — one box.
- `/` focuses search · ↑↓ select · Enter opens word detail · Esc goes back.
- Tabs are views: **All** searches everything; **Vocab** / **Grammar** browse
  the full sorted list when the box is empty (Recent · あいうえお · Most seen ·
  Chapter) and filter as you type; **Sentences** is a newest-first timeline
  grouped by month.
- The ☾/☀ button toggles dark mode (light is the default; choice is saved).
- `/api/unparsed` lists vault lines the parser couldn't classify.
```

- [ ] **Step 3: Full gate + commit**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all clean.

```bash
git add README.md
git commit -m "docs: document browse views and theme toggle"
```

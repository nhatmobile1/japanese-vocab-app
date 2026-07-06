# Japanese Vocab App — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web app that indexes a read-only Obsidian vault of Japanese notes into SQLite and gives instant bidirectional (Japanese↔English) vocab lookup with a word-detail corpus view.

**Architecture:** A parser layer turns three kinds of markdown files (monthly lesson files, textbook chapter files, grammar notes) into structured entries. An indexer writes them to SQLite with pre-folded search columns and rebuilds a `words` aggregate table; a chokidar watcher re-indexes changed files. A Hono server exposes `/api/search`, `/api/word/:normTerm`, `/api/status`, `/api/unparsed` and serves a Vite/React search UI.

**Tech Stack:** Node 20+, TypeScript (strict, ESM), better-sqlite3, Hono + @hono/node-server, chokidar, Vitest, Vite + React 18.

**Spec:** `docs/superpowers/specs/2026-07-05-japanese-vocab-app-design.md` (approved; search uses normalized-column LIKE scans per the spec's amendment, not FTS5).

## Global Constraints

- The vault is **read-only**. No code may ever write, rename, or delete anything under the vault path.
- Default vault path (exact): `/Users/nhattran/documents/obsidian-main/nhat-mind/efforts/japanese-learning` (env override `VAULT_PATH`).
- DB file: `data/vocab.db` (env `DB_PATH`), gitignored, disposable — always fully rebuildable from the vault.
- Server port: `3456` (env `PORT`).
- `package.json` has `"type": "module"`; all imports use ESM with `.js` extensions on relative paths.
- TypeScript strict mode; `npm run typecheck` must pass at every commit.
- The server must never crash because of a malformed vault file: parse failures are caught per-file, logged, and skipped.
- Full-width characters are first-class: full-width spaces (U+3000), full-width parens （）, NBSP (U+00A0) all appear in real data.
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Real Data Shapes (reference for all parser tasks)

Lesson files `Lessons/<year>/<YYYY-MM>.md`: frontmatter, then repeated:

```markdown
## 2025-06-02

> [!example]+ Vocabulary
> -   手作り（てづくり）- handmade
> -   作（つく）りましたか - did you make it?
> -   アットホーム - homey; cozy
> -   もう1年（ねん）- one more year
>     -   税金（ぜいきん）の還付（かんぷ）- tax refund

> [!tip]+ Grammar & Patterns
> -   〜倍 - times

> [!quote]+ Example Sentences
> -   ケーキと　なにを　のみました
```

Textbook files `Vocabulary/Genki/Genki-LXX.md`, `Vocabulary/Quartet-1/Quartet-LXX.md`: frontmatter with `textbook:` and `chapter:`, `##` section headings, `[!example]` callouts. Genki glosses carry part-of-speech markers: `雨（あめ） - rain *n.*`. Quartet has bracket annotations: `空く（［～が］あく） - to become available [vi.]`. Index files (`Genki.md`, `Quartet-1.md`) have `textbook:` but **no `chapter:`** — skip them.

Grammar files `Grammar/*.md`: reference notes with `##` sections; only callout bullets are indexed in Phase 1.

Known messiness: `）- gloss` (no space before dash), full-width spaces inside sentences, NBSP, stray `**`, bare unglossed bullets in 2023–2024 files, `＝`/`VS` lines, files at vault root starting with `_` (skip).

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, .gitignore
src/
  config.ts               # paths + port from env
  lib/japanese.ts         # kana folding, reading extraction, normalization
  parser/types.ts         # ParsedEntry, ParseResult, UnparsedLine
  parser/parseVocabLine.ts    # one bullet → {term, reading, gloss}
  parser/parseLessonFile.ts   # monthly lesson file → ParseResult
  parser/parseTextbookFile.ts # Genki/Quartet chapter file → ParseResult
  parser/parseGrammarNote.ts  # Grammar/*.md → ParseResult
  db.ts                   # openDb, createSchema
  indexer.ts              # indexVault, reindexFile, removeFile, rebuildWords
  search.ts               # search(db, q, kind) → ranked word groups
  app.ts                  # createApp(db) — Hono routes (testable)
  server.ts               # main: index, watch, listen
  watcher.ts              # chokidar + per-file debounce
tests/fixture.ts          # writes a miniature vault to a temp dir
src/**/*.test.ts          # colocated unit tests
web/
  index.html, vite.config.ts
  src/main.tsx, App.tsx, WordDetail.tsx, api.ts, types.ts, styles.css
```

---

### Task 1: Project scaffold + Japanese text utilities

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/lib/japanese.ts`
- Test: `src/lib/japanese.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces (used by every later task):
  - `kataToHira(s: string): string`
  - `hasKanji(s: string): boolean`
  - `isKanaOnly(s: string): boolean`
  - `stripReadings(s: string): string` — `見上げる（みあげる）` → `見上げる`
  - `extractReading(head: string): string | null` — best-effort hiragana rendering
  - `foldForSearch(s: string): string` — NFKC + lowercase + kata→hira + strip all whitespace
  - `normalizeTerm(term: string): string` — foldForSearch after dropping `［…］` and edge `～〜`

- [ ] **Step 1: Scaffold the project**

Create `package.json`:

```json
{
  "name": "japanese-vocab-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently -k \"tsx watch src/server.ts\" \"vite --config web/vite.config.ts\"",
    "build": "vite build --config web/vite.config.ts",
    "start": "npm run build && tsx src/server.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "web/src", "tests"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
});
```

Create `.gitignore`:

```
node_modules/
data/
web/dist/
*.log
.DS_Store
```

Run:

```bash
npm install hono @hono/node-server better-sqlite3 chokidar
npm install -D typescript tsx vitest @types/node @types/better-sqlite3 concurrently
```

Expected: both installs succeed; `package-lock.json` created.

- [ ] **Step 2: Write the failing test**

Create `src/lib/japanese.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
  extractReading,
  foldForSearch,
  hasKanji,
  isKanaOnly,
  kataToHira,
  normalizeTerm,
  stripReadings,
} from './japanese.js';

describe('kataToHira', () => {
  test('folds katakana to hiragana, leaves the rest', () => {
    expect(kataToHira('アットホーム')).toBe('あっとほーむ');
    expect(kataToHira('雨とrain')).toBe('雨とrain');
  });
});

describe('hasKanji / isKanaOnly', () => {
  test('detects kanji including 々', () => {
    expect(hasKanji('次々と')).toBe(true);
    expect(hasKanji('こぼれ')).toBe(false);
  });
  test('kana-only accepts hiragana, katakana, ー and punctuation used in readings', () => {
    expect(isKanaOnly('ぼっくすせき')).toBe(true);
    expect(isKanaOnly('アットホーム')).toBe(true);
    expect(isKanaOnly('あく')).toBe(true);
    expect(isKanaOnly('見る')).toBe(false);
    expect(isKanaOnly('')).toBe(false);
  });
});

describe('stripReadings', () => {
  test('removes whole-word and per-kanji reading groups', () => {
    expect(stripReadings('見上げる（みあげる）')).toBe('見上げる');
    expect(stripReadings('作（つく）りましたか')).toBe('作りましたか');
    expect(stripReadings('日本語（にほんご）の勉強（べんきょう）')).toBe('日本語の勉強');
  });
  test('removes reading groups that carry ［…］ asides (Quartet style)', () => {
    expect(stripReadings('空く（［～が］あく）')).toBe('空く');
    expect(stripReadings('流れてくる（［すしが］ながれてくる）')).toBe('流れてくる');
  });
  test('keeps non-reading parens', () => {
    expect(stripReadings('度（たび）- times (x time)')).toBe('度- times (x time)');
  });
});

describe('extractReading', () => {
  test('whole-word furigana', () => {
    expect(extractReading('見上げる（みあげる）')).toBe('みあげる');
    expect(extractReading('乗り換え（のりかえ）')).toBe('のりかえ');
    expect(extractReading('涙（なみだ）')).toBe('なみだ');
  });
  test('whole-word furigana on a katakana-prefixed word', () => {
    expect(extractReading('ボックス席（ぼっくすせき）')).toBe('ぼっくすせき');
  });
  test('per-kanji furigana in a longer phrase', () => {
    expect(extractReading('作（つく）りましたか')).toBe('つくりましたか');
    expect(extractReading('日本語（にほんご）の勉強（べんきょう）')).toBe('にほんごのべんきょう');
  });
  test('Quartet ［…］ asides are dropped from readings', () => {
    expect(extractReading('空く（［～が］あく）')).toBe('あく');
  });
  test('kana-only head returns itself folded', () => {
    expect(extractReading('アットホーム')).toBe('あっとほーむ');
  });
  test('returns null when bare kanji remain', () => {
    expect(extractReading('大切な文化')).toBe(null);
  });
});

describe('foldForSearch / normalizeTerm', () => {
  test('folds case, width, katakana, and strips all whitespace kinds', () => {
    expect(foldForSearch('ケーキと　なにを')).toBe('けーきとなにを');
    expect(foldForSearch('Tax Refund')).toBe('taxrefund');
  });
  test('normalizeTerm drops ［…］ and edge tildes', () => {
    expect(normalizeTerm('〜倍')).toBe('倍');
    expect(normalizeTerm('［～が］空く')).toBe('空く');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/japanese.test.ts`
Expected: FAIL — cannot find module `./japanese.js`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/japanese.ts`:

```ts
const KANJI_RE = /[㐀-䶿一-鿿々〆]/;
const KANJI_RUN = '[\\u3400-\\u4dbf\\u4e00-\\u9fff々〆]+';
// Hiragana, katakana, prolonged sound mark, iteration marks, and light punctuation
// that appears inside furigana readings.
const KANA_ONLY_RE = /^[ぁ-ゖァ-ヺー-ヾゝゞー・、。～]+$/;

export function kataToHira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export function hasKanji(s: string): boolean {
  return KANJI_RE.test(s);
}

export function isKanaOnly(s: string): boolean {
  return s.length > 0 && KANA_ONLY_RE.test(s);
}

/** Paren content minus ［…］ asides and whitespace: "［～が］あく" → "あく". */
function cleanParenInner(inner: string): string {
  return inner.replace(/［[^］]*］/g, '').replace(/[\s　 ]/g, '');
}

/** Remove furigana groups (（…） whose content is kana); keep other parens. */
export function stripReadings(s: string): string {
  return s.replace(/（([^（）]*)）/g, (m, inner: string) =>
    isKanaOnly(cleanParenInner(inner)) ? '' : m,
  );
}

/** Kana chars of `pre`, in order, must all appear in order within `reading`. */
function kanaIsSubsequence(pre: string, reading: string): boolean {
  const kana = [...kataToHira(pre)].filter((c) => /[ぁ-ゖー]/.test(c));
  let i = 0;
  for (const c of reading) if (i < kana.length && c === kana[i]) i++;
  return i === kana.length;
}

/**
 * Best-effort hiragana rendering of a Japanese head.
 * Handles whole-word furigana (乗り換え（のりかえ）), per-kanji furigana
 * (作（つく）りましたか), and kana-only heads. Returns null when bare kanji
 * remain unreadable.
 */
export function extractReading(head: string): string | null {
  const h = head.trim();

  // Whole-word furigana: a single trailing （…） whose kana covers the head's kana.
  const t = h.match(/^([^（）]+)（([^（）]*)）$/);
  if (t) {
    const r = cleanParenInner(t[2]);
    if (isKanaOnly(r) && kanaIsSubsequence(t[1], r)) return kataToHira(r);
  }

  // Per-kanji furigana: replace each kanji-run（reading） with its reading.
  const substituted = h.replace(
    new RegExp(`(${KANJI_RUN})（([^（）]*)）`, 'g'),
    (m, _kanji: string, inner: string) => {
      const r = cleanParenInner(inner);
      return isKanaOnly(r) ? r : m;
    },
  );

  const flat = stripReadings(substituted).replace(/[\s　 ]/g, '');
  if (flat && !hasKanji(flat) && isKanaOnly(flat)) return kataToHira(flat);
  return null;
}

/** NFKC + lowercase + katakana→hiragana + strip every kind of whitespace. */
export function foldForSearch(s: string): string {
  return kataToHira(s.normalize('NFKC').toLowerCase()).replace(/[\s　 ]/g, '');
}

/** Grouping key for a term: drop ［…］ asides and leading/trailing ～〜, then fold. */
export function normalizeTerm(term: string): string {
  return foldForSearch(term.replace(/［[^］]*］/g, '').replace(/^[～〜]+|[～〜]+$/g, ''));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/japanese.test.ts && npm run typecheck`
Expected: all tests PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/lib/
git commit -m "feat: scaffold project and add Japanese text utilities"
```

---

### Task 2: Vocab line parser

**Files:**
- Create: `src/parser/parseVocabLine.ts`
- Test: `src/parser/parseVocabLine.test.ts`

**Interfaces:**
- Consumes: `stripReadings`, `extractReading` from `src/lib/japanese.js`
- Produces:
  - `interface VocabLineParts { term: string | null; reading: string | null; gloss: string | null }`
  - `parseVocabLine(text: string): VocabLineParts` — input is the bullet text *after* the `> -` marker

- [ ] **Step 1: Write the failing test**

Create `src/parser/parseVocabLine.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { parseVocabLine } from './parseVocabLine.js';

describe('parseVocabLine', () => {
  test('standard enriched line, no space before dash', () => {
    expect(parseVocabLine('涙（なみだ）- tears')).toEqual({
      term: '涙',
      reading: 'なみだ',
      gloss: 'tears',
    });
  });

  test('Genki style with spaces around dash and part-of-speech marker', () => {
    expect(parseVocabLine('雨（あめ） - rain *n.*')).toEqual({
      term: '雨',
      reading: 'あめ',
      gloss: 'rain n.',
    });
  });

  test('katakana loanword', () => {
    expect(parseVocabLine('アットホーム - homey; cozy')).toEqual({
      term: 'アットホーム',
      reading: null,
      gloss: 'homey; cozy',
    });
  });

  test('per-kanji furigana phrase', () => {
    expect(parseVocabLine('作（つく）りましたか - did you make it?')).toEqual({
      term: '作りましたか',
      reading: 'つくりましたか',
      gloss: 'did you make it?',
    });
  });

  test('Quartet bracket aside', () => {
    expect(parseVocabLine('空く（［～が］あく） - to become available [vi.]')).toEqual({
      term: '空く',
      reading: 'あく',
      gloss: 'to become available [vi.]',
    });
  });

  test('bare bullet with no gloss (2023-style)', () => {
    expect(parseVocabLine('ケーキと　なにを　のみました')).toEqual({
      term: 'ケーキと　なにを　のみました',
      reading: null,
      gloss: null,
    });
  });

  test('gloss containing hyphenated words is not split again', () => {
    expect(parseVocabLine('ううん - uh-uh; no *exp.*')).toEqual({
      term: 'ううん',
      reading: null,
      gloss: 'uh-uh; no exp.',
    });
  });

  test('strips bold markers and NBSP', () => {
    expect(parseVocabLine('**梅雨（つゆ）** - rainy season')).toEqual({
      term: '梅雨',
      reading: 'つゆ',
      gloss: 'rainy season',
    });
  });

  test('gloss with parens survives', () => {
    expect(parseVocabLine('度（たび）- times (x time, each time); degree')).toEqual({
      term: '度',
      reading: 'たび',
      gloss: 'times (x time, each time); degree',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/parseVocabLine.test.ts`
Expected: FAIL — cannot find module `./parseVocabLine.js`.

- [ ] **Step 3: Write the implementation**

Create `src/parser/parseVocabLine.ts`:

```ts
import { extractReading, stripReadings } from '../lib/japanese.js';

export interface VocabLineParts {
  term: string | null;
  reading: string | null;
  gloss: string | null;
}

// A gloss separator is a dash that follows either a closing full-width paren
// (）- gloss) or whitespace ( - gloss), and is itself followed by whitespace.
// Hyphens inside words (uh-uh) never match because they lack surrounding space.
const SEP_RE = /）[-–—][\s　]|[\s　][-–—][\s　]/;

export function parseVocabLine(text: string): VocabLineParts {
  const cleaned = text.replace(/\*/g, '').replace(/ /g, ' ').trim();

  const m = SEP_RE.exec(cleaned);
  let head = cleaned;
  let gloss: string | null = null;
  if (m) {
    const headEnd = m.index + (m[0].startsWith('）') ? 1 : 0);
    head = cleaned.slice(0, headEnd).trim();
    gloss = cleaned.slice(m.index + m[0].length).trim() || null;
  }

  const term = stripReadings(head).trim() || null;
  const reading = head.includes('（') ? extractReading(head) : null;
  return { term, reading, gloss };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/parseVocabLine.test.ts && npm run typecheck`
Expected: all PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/parser/
git commit -m "feat: parse a vocab bullet into term, reading, gloss"
```

---

### Task 3: Lesson file parser

**Files:**
- Create: `src/parser/types.ts`, `src/parser/parseLessonFile.ts`
- Test: `src/parser/parseLessonFile.test.ts`

**Interfaces:**
- Consumes: `parseVocabLine` (Task 2)
- Produces:

```ts
// src/parser/types.ts
export type EntryKind = 'vocab' | 'grammar' | 'sentence';
export type SourceType = 'lesson' | 'genki' | 'quartet' | 'grammar-note';

export interface ParsedEntry {
  term: string | null;
  reading: string | null;
  gloss: string | null;
  raw: string;
  kind: EntryKind;
  sourceType: SourceType;
  sourceRef: string;
  section: string | null;
  line: number;
  children: ParsedEntry[];
}

export interface UnparsedLine {
  line: number;
  text: string;
  reason: string;
}

export interface ParseResult {
  entries: ParsedEntry[];
  unparsed: UnparsedLine[];
}
```

  - `parseLessonFile(content: string): ParseResult`

- [ ] **Step 1: Create the shared types file**

Create `src/parser/types.ts` with exactly the content shown in the Interfaces block above.

- [ ] **Step 2: Write the failing test**

Create `src/parser/parseLessonFile.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { parseLessonFile } from './parseLessonFile.js';

const SAMPLE = `---
tags: [japanese, lessons, 2025]
month: 2025-06
---

# June 2025 — Japanese Lessons

## 2025-06-01

> [!example]+ Vocabulary
> -   涙（なみだ）- tears
> -   もう1年（ねん）- one more year
>     -   税金（ぜいきん）の還付（かんぷ）- tax refund

## 2025-06-02

> [!example]+ Vocabulary
> -   手作り（てづくり）- handmade

> [!tip]+ Grammar & Patterns
> -   〜倍 - times

> [!quote]+ Example Sentences
> -   ケーキと　なにを　のみました

> [!note]+ Something Else
> -   this should be reported, not indexed
`;

describe('parseLessonFile', () => {
  const result = parseLessonFile(SAMPLE);

  test('extracts vocab entries with their lesson date', () => {
    const namida = result.entries.find((e) => e.term === '涙');
    expect(namida).toMatchObject({
      reading: 'なみだ',
      gloss: 'tears',
      kind: 'vocab',
      sourceType: 'lesson',
      sourceRef: '2025-06-01',
    });
  });

  test('nested bullets become children of the preceding top-level entry', () => {
    const parent = result.entries.find((e) => e.term === 'もう1年');
    expect(parent?.children).toHaveLength(1);
    expect(parent?.children[0]).toMatchObject({
      term: '税金の還付',
      gloss: 'tax refund',
    });
  });

  test('tip callouts become grammar, quote callouts become sentences', () => {
    expect(result.entries.find((e) => e.raw.includes('〜倍'))?.kind).toBe('grammar');
    const sentence = result.entries.find((e) => e.kind === 'sentence');
    expect(sentence?.sourceRef).toBe('2025-06-02');
    expect(sentence?.gloss).toBe(null);
  });

  test('bullets in unknown callouts go to unparsed, not entries', () => {
    expect(result.entries.some((e) => e.raw.includes('should be reported'))).toBe(false);
    expect(result.unparsed.some((u) => u.reason === 'bullet in unknown callout')).toBe(true);
  });

  test('counts: 5 top-level entries across both days (涙, もう1年, 手作り, 〜倍, sentence)', () => {
    expect(result.entries).toHaveLength(5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/parser/parseLessonFile.test.ts`
Expected: FAIL — cannot find module `./parseLessonFile.js`.

- [ ] **Step 4: Write the implementation**

Create `src/parser/parseLessonFile.ts`:

```ts
import { parseVocabLine } from './parseVocabLine.js';
import type { EntryKind, ParsedEntry, ParseResult, UnparsedLine } from './types.js';

const CALLOUT_KIND: Record<string, EntryKind> = {
  example: 'vocab',
  tip: 'grammar',
  quote: 'sentence',
};

const BULLET_RE = /^>([\s　]*)-[\s　]+(.*)$/;

export function parseLessonFile(content: string): ParseResult {
  const entries: ParsedEntry[] = [];
  const unparsed: UnparsedLine[] = [];
  let date: string | null = null;
  let kind: EntryKind | null = null;
  let inUnknownCallout = false;
  let lastTop: ParsedEntry | null = null;

  content.split('\n').forEach((line, i) => {
    const lineNo = i + 1;

    const dm = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/);
    if (dm) {
      date = dm[1];
      kind = null;
      inUnknownCallout = false;
      lastTop = null;
      return;
    }

    const cm = line.match(/^>\s*\[!(\w+)\]/);
    if (cm) {
      kind = CALLOUT_KIND[cm[1].toLowerCase()] ?? null;
      inUnknownCallout = kind === null;
      lastTop = null;
      return;
    }

    if (!line.startsWith('>')) {
      if (line.trim()) {
        kind = null;
        inUnknownCallout = false;
        lastTop = null;
      }
      return;
    }

    const bm = line.match(BULLET_RE);
    if (!bm) {
      if (kind && line.replace(/^>/, '').trim()) {
        unparsed.push({ line: lineNo, text: line, reason: 'non-bullet line in callout' });
      }
      return;
    }

    if (inUnknownCallout) {
      unparsed.push({ line: lineNo, text: line, reason: 'bullet in unknown callout' });
      return;
    }
    if (!kind) return;
    if (!date) {
      unparsed.push({ line: lineNo, text: line, reason: 'bullet before any date heading' });
      return;
    }

    const parts = parseVocabLine(bm[2]);
    const entry: ParsedEntry = {
      ...parts,
      raw: bm[2].trim(),
      kind,
      sourceType: 'lesson',
      sourceRef: date,
      section: null,
      line: lineNo,
      children: [],
    };

    if (bm[1].length > 2 && lastTop) lastTop.children.push(entry);
    else {
      entries.push(entry);
      lastTop = entry;
    }
  });

  return { entries, unparsed };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/parser/parseLessonFile.test.ts && npm run typecheck`
Expected: all PASS; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/parser/
git commit -m "feat: parse monthly lesson files into dated entries"
```

---

### Task 4: Textbook and grammar-note parsers

**Files:**
- Create: `src/parser/parseTextbookFile.ts`, `src/parser/parseGrammarNote.ts`
- Test: `src/parser/parseTextbookFile.test.ts`, `src/parser/parseGrammarNote.test.ts`

**Interfaces:**
- Consumes: `parseVocabLine` (Task 2), types (Task 3)
- Produces:
  - `parseTextbookFile(content: string): ParseResult` — returns empty result for index/MOC files (frontmatter lacking `chapter:`)
  - `parseGrammarNote(content: string, fileName: string): ParseResult`

- [ ] **Step 1: Write the failing tests**

Create `src/parser/parseTextbookFile.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { parseTextbookFile } from './parseTextbookFile.js';

const QUARTET = `---
tags: [japanese, vocabulary, quartet]
textbook: QUARTET I
chapter: L5
entry_count: 113
---

# QUARTET I Lesson 5 — Vocabulary

## 読み 1 (読1)

> [!example]+ Vocabulary (62)
> -   流れる（ながれる） - to flow
> -   空く（［～が］あく） - to become available [vi.]
`;

const GENKI = `---
tags: [japanese, vocabulary, genki]
textbook: Genki 3rd Edition
chapter: L8
---

## 会話・文法編 (Conversation & Grammar)

> [!example]+ Vocabulary (71)
> -   雨（あめ） - rain *n.*
`;

const INDEX_FILE = `---
tags: [japanese, vocabulary, genki, moc]
textbook: Genki 3rd Edition
---

# Genki — Vocabulary Index

| Chapter | Words |
|---|---|
`;

describe('parseTextbookFile', () => {
  test('Quartet chapter: sourceType, sourceRef, section', () => {
    const r = parseTextbookFile(QUARTET);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({
      term: '流れる',
      reading: 'ながれる',
      gloss: 'to flow',
      kind: 'vocab',
      sourceType: 'quartet',
      sourceRef: 'Quartet I L5',
      section: '読み 1 (読1)',
    });
  });

  test('Genki chapter maps to genki sourceType', () => {
    const r = parseTextbookFile(GENKI);
    expect(r.entries[0]).toMatchObject({
      term: '雨',
      sourceType: 'genki',
      sourceRef: 'Genki L8',
      section: '会話・文法編 (Conversation & Grammar)',
    });
  });

  test('index files without chapter frontmatter are skipped entirely', () => {
    const r = parseTextbookFile(INDEX_FILE);
    expect(r.entries).toHaveLength(0);
    expect(r.unparsed).toHaveLength(0);
  });
});
```

Create `src/parser/parseGrammarNote.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { parseGrammarNote } from './parseGrammarNote.js';

const NOTE = `---
tags: [japanese, grammar, reference]
---

# 日本語 Grammar Quick Reference

## 1. Causative Form 〜させる

Some prose that is not indexed.

> [!tip]+ Pattern
> -   〜させる - to make/let someone do
`;

describe('parseGrammarNote', () => {
  test('indexes callout bullets as grammar entries with file-based sourceRef', () => {
    const r = parseGrammarNote(NOTE, 'Grammar-Quick-Reference.md');
    expect(r.entries).toHaveLength(1);
    expect(r.entries[0]).toMatchObject({
      kind: 'grammar',
      sourceType: 'grammar-note',
      sourceRef: 'Grammar-Quick-Reference',
      section: '1. Causative Form 〜させる',
      gloss: 'to make/let someone do',
    });
  });

  test('prose and headings are ignored without unparsed noise', () => {
    const r = parseGrammarNote(NOTE, 'Grammar-Quick-Reference.md');
    expect(r.unparsed).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/parser/parseTextbookFile.test.ts src/parser/parseGrammarNote.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the implementations**

Create `src/parser/parseTextbookFile.ts`:

```ts
import { parseVocabLine } from './parseVocabLine.js';
import type { ParsedEntry, ParseResult, SourceType, UnparsedLine } from './types.js';

const BULLET_RE = /^>([\s　]*)-[\s　]+(.*)$/;

function parseFrontmatter(content: string): Record<string, string> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function parseTextbookFile(content: string): ParseResult {
  const fm = parseFrontmatter(content);
  if (!fm.textbook || !fm.chapter) return { entries: [], unparsed: [] }; // index/MOC file

  const tb = fm.textbook.toLowerCase();
  const sourceType: SourceType = tb.includes('genki') ? 'genki' : 'quartet';
  const label =
    sourceType === 'genki'
      ? 'Genki'
      : `Quartet ${(fm.textbook.match(/quartet\s+(\S+)/i)?.[1] ?? 'I').toUpperCase()}`;
  const sourceRef = `${label} ${fm.chapter}`;

  const entries: ParsedEntry[] = [];
  const unparsed: UnparsedLine[] = [];
  let section: string | null = null;
  let inVocab = false;
  let lastTop: ParsedEntry | null = null;

  content.split('\n').forEach((line, i) => {
    const lineNo = i + 1;

    const hm = line.match(/^##\s+(.+?)\s*$/);
    if (hm) {
      section = hm[1];
      inVocab = false;
      lastTop = null;
      return;
    }

    const cm = line.match(/^>\s*\[!(\w+)\]/);
    if (cm) {
      inVocab = cm[1].toLowerCase() === 'example';
      lastTop = null;
      return;
    }

    if (!line.startsWith('>')) {
      if (line.trim()) {
        inVocab = false;
        lastTop = null;
      }
      return;
    }

    const bm = line.match(BULLET_RE);
    if (!bm) {
      if (inVocab && line.replace(/^>/, '').trim()) {
        unparsed.push({ line: lineNo, text: line, reason: 'non-bullet line in callout' });
      }
      return;
    }
    if (!inVocab) return;

    const parts = parseVocabLine(bm[2]);
    const entry: ParsedEntry = {
      ...parts,
      raw: bm[2].trim(),
      kind: 'vocab',
      sourceType,
      sourceRef,
      section,
      line: lineNo,
      children: [],
    };

    if (bm[1].length > 2 && lastTop) lastTop.children.push(entry);
    else {
      entries.push(entry);
      lastTop = entry;
    }
  });

  return { entries, unparsed };
}
```

Create `src/parser/parseGrammarNote.ts`:

```ts
import { parseVocabLine } from './parseVocabLine.js';
import type { ParsedEntry, ParseResult } from './types.js';

const BULLET_RE = /^>([\s　]*)-[\s　]+(.*)$/;

export function parseGrammarNote(content: string, fileName: string): ParseResult {
  const sourceRef = fileName.replace(/\.md$/, '');
  const entries: ParsedEntry[] = [];
  let section: string | null = null;
  let inCallout = false;
  let lastTop: ParsedEntry | null = null;

  content.split('\n').forEach((line, i) => {
    const hm = line.match(/^##\s+(.+?)\s*$/);
    if (hm) {
      section = hm[1];
      inCallout = false;
      lastTop = null;
      return;
    }
    if (/^>\s*\[!\w+\]/.test(line)) {
      inCallout = true;
      lastTop = null;
      return;
    }
    if (!line.startsWith('>')) {
      if (line.trim()) {
        inCallout = false;
        lastTop = null;
      }
      return;
    }
    const bm = line.match(BULLET_RE);
    if (!bm || !inCallout) return;

    const parts = parseVocabLine(bm[2]);
    const entry: ParsedEntry = {
      ...parts,
      raw: bm[2].trim(),
      kind: 'grammar',
      sourceType: 'grammar-note',
      sourceRef,
      section,
      line: i + 1,
      children: [],
    };
    if (bm[1].length > 2 && lastTop) lastTop.children.push(entry);
    else {
      entries.push(entry);
      lastTop = entry;
    }
  });

  return { entries, unparsed: [] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/parser/ && npm run typecheck`
Expected: all parser tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/parser/
git commit -m "feat: parse textbook chapters and grammar notes"
```

---

### Task 5: Database schema + indexer

**Files:**
- Create: `src/config.ts`, `src/db.ts`, `src/indexer.ts`, `tests/fixture.ts`
- Test: `src/indexer.test.ts`

**Interfaces:**
- Consumes: all parsers (Tasks 2–4), `normalizeTerm`/`foldForSearch` (Task 1)
- Produces:
  - `config: { vaultPath: string; dbPath: string; port: number }`
  - `openDb(path: string): Database.Database` — schema created, WAL mode
  - `indexVault(db, vaultPath): { files: number; entries: number }` — full rebuild inside one transaction
  - `reindexFile(db, vaultPath, relPath): void` — delete + reinsert one file, then `rebuildWords`
  - `removeFile(db, relPath): void`
  - `rebuildWords(db): void`
  - `makeFixtureVault(dir: string): void` (tests/fixture.ts) — reused by Tasks 6–7
- DB columns (exact): `entries(id, term, reading, gloss, raw, kind, source_type, source_ref, section, file, line, parent_id, norm_term, term_f, reading_f, gloss_f, raw_f)`; `words(norm_term, term, reading, gloss, occurrence_count, lesson_count, sources, first_seen, last_seen)`; `unparsed(id, file, line, text, reason)`

- [ ] **Step 1: Create config**

Create `src/config.ts`:

```ts
export const config = {
  vaultPath:
    process.env.VAULT_PATH ??
    '/Users/nhattran/documents/obsidian-main/nhat-mind/efforts/japanese-learning',
  dbPath: process.env.DB_PATH ?? 'data/vocab.db',
  port: Number(process.env.PORT ?? 3456),
};
```

- [ ] **Step 2: Write the test fixture helper**

Create `tests/fixture.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

const LESSON = `---
month: 2025-06
---

## 2025-06-01

> [!example]+ Vocabulary
> -   還付（かんぷ）- refund
> -   流れる（ながれる）- flowing
> -   もう1年（ねん）- one more year
>     -   税金（ぜいきん）の還付（かんぷ）- tax refund

> [!quote]+ Example Sentences
> -   還付（かんぷ）をもらいました

## 2025-06-02

> [!example]+ Vocabulary
> -   還付（かんぷ）- refund (again)

> [!tip]+ Grammar & Patterns
> -   〜倍 - times

> [!wat]+ Unknown
> -   mystery bullet
`;

const QUARTET = `---
textbook: QUARTET I
chapter: L5
---

## 読み 1 (読1)

> [!example]+ Vocabulary
> -   流れる（ながれる） - to flow
`;

const GENKI = `---
textbook: Genki 3rd Edition
chapter: L8
---

## 会話・文法編

> [!example]+ Vocabulary
> -   雨（あめ） - rain *n.*
`;

const GENKI_INDEX = `---
textbook: Genki 3rd Edition
---

# Index — no chapter, must be skipped
`;

const GRAMMAR = `---
tags: [grammar]
---

## Causative

> [!tip]+ Pattern
> -   〜させる - to make someone do
`;

export function makeFixtureVault(dir: string): void {
  const write = (rel: string, content: string) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  write('Lessons/2025/2025-06.md', LESSON);
  write('Vocabulary/Quartet-1/Quartet-L05.md', QUARTET);
  write('Vocabulary/Genki/Genki-L08.md', GENKI);
  write('Vocabulary/Genki/Genki.md', GENKI_INDEX);
  write('Grammar/Causative.md', GRAMMAR);
  write('_meta-notes.md', '# should be skipped');
}
```

- [ ] **Step 3: Write the failing test**

Create `src/indexer.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type Database from 'better-sqlite3';
import { openDb } from './db.js';
import { indexVault, reindexFile, removeFile } from './indexer.js';
import { makeFixtureVault } from '../tests/fixture.js';

let vault: string;
let db: Database.Database;

beforeAll(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-fixture-'));
  makeFixtureVault(vault);
  db = openDb(':memory:');
  indexVault(db, vault);
});

afterAll(() => {
  db.close();
  fs.rmSync(vault, { recursive: true, force: true });
});

describe('indexVault', () => {
  test('indexes lesson, textbook, and grammar entries; skips _files and index files', () => {
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    // 6 top-level lesson entries (4 vocab incl duplicate 還付, 1 sentence, 1 grammar) + 1 child
    expect(count(`SELECT COUNT(*) AS n FROM entries WHERE source_type = 'lesson'`)).toBe(7);
    expect(count(`SELECT COUNT(*) AS n FROM entries WHERE source_type = 'quartet'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM entries WHERE source_type = 'genki'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM entries WHERE source_type = 'grammar-note'`)).toBe(1);
  });

  test('children carry parent_id', () => {
    const child = db
      .prepare(`SELECT * FROM entries WHERE gloss = 'tax refund'`)
      .get() as { parent_id: number | null };
    expect(child.parent_id).not.toBe(null);
  });

  test('unknown-callout bullets land in unparsed', () => {
    const rows = db.prepare(`SELECT * FROM unparsed`).all() as { reason: string }[];
    expect(rows.some((r) => r.reason === 'bullet in unknown callout')).toBe(true);
  });

  test('words groups across sources: 流れる has lesson + quartet occurrences', () => {
    const w = db
      .prepare(`SELECT * FROM words WHERE term = '流れる'`)
      .get() as { occurrence_count: number; sources: string; lesson_count: number };
    expect(w.occurrence_count).toBe(2);
    expect(w.lesson_count).toBe(1);
    const sources = JSON.parse(w.sources) as { sourceType: string; sourceRef: string }[];
    expect(sources.map((s) => s.sourceType).sort()).toEqual(['lesson', 'quartet']);
  });

  test('words tracks first/last seen lesson dates for repeated word', () => {
    const w = db
      .prepare(`SELECT * FROM words WHERE term = '還付'`)
      .get() as { occurrence_count: number; first_seen: string; last_seen: string };
    expect(w.occurrence_count).toBe(2);
    expect(w.first_seen).toBe('2025-06-01');
    expect(w.last_seen).toBe('2025-06-02');
  });
});

describe('reindexFile / removeFile', () => {
  test('reindexing a changed file replaces its rows', () => {
    const rel = 'Vocabulary/Genki/Genki-L08.md';
    const p = path.join(vault, rel);
    fs.writeFileSync(
      p,
      fs.readFileSync(p, 'utf8') + '> -   曇り（くもり） - cloudy weather *n.*\n',
    );
    reindexFile(db, vault, rel);
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE source_type = 'genki'`).get() as { n: number }).n;
    expect(n).toBe(2);
  });

  test('removeFile deletes rows and rebuilds words', () => {
    removeFile(db, 'Vocabulary/Quartet-1/Quartet-L05.md');
    const w = db.prepare(`SELECT * FROM words WHERE term = '流れる'`).get() as { occurrence_count: number };
    expect(w.occurrence_count).toBe(1);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/indexer.test.ts`
Expected: FAIL — modules `./db.js` / `./indexer.js` not found.

- [ ] **Step 5: Write db.ts**

Create `src/db.ts`:

```ts
import Database from 'better-sqlite3';

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createSchema(db);
  return db;
}

export function createSchema(db: Database.Database): void {
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
      occurrence_count INTEGER NOT NULL,
      lesson_count INTEGER NOT NULL,
      sources TEXT NOT NULL,
      first_seen TEXT,
      last_seen TEXT
    );

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

- [ ] **Step 6: Write indexer.ts**

Create `src/indexer.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { foldForSearch, normalizeTerm } from './lib/japanese.js';
import { parseGrammarNote } from './parser/parseGrammarNote.js';
import { parseLessonFile } from './parser/parseLessonFile.js';
import { parseTextbookFile } from './parser/parseTextbookFile.js';
import type { ParsedEntry, ParseResult } from './parser/types.js';

type Route = 'lesson' | 'textbook' | 'grammar';

export function routeFile(relPath: string): Route | null {
  const rel = relPath.split(path.sep).join('/');
  if (/^Lessons\/\d{4}\/\d{4}-\d{2}\.md$/.test(rel)) return 'lesson';
  if (rel.startsWith('Vocabulary/') && rel.endsWith('.md')) return 'textbook';
  if (rel.startsWith('Grammar/') && rel.endsWith('.md')) return 'grammar';
  return null;
}

export function listVaultFiles(vaultPath: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.') || name.startsWith('_')) continue;
      const abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) walk(abs);
      else if (name.endsWith('.md')) out.push(path.relative(vaultPath, abs));
    }
  };
  walk(vaultPath);
  return out.sort();
}

function parseByRoute(route: Route, content: string, relPath: string): ParseResult {
  if (route === 'lesson') return parseLessonFile(content);
  if (route === 'textbook') return parseTextbookFile(content);
  return parseGrammarNote(content, path.basename(relPath));
}

function insertEntries(db: Database.Database, relPath: string, entries: ParsedEntry[]): number {
  const stmt = db.prepare(`
    INSERT INTO entries (term, reading, gloss, raw, kind, source_type, source_ref, section,
                         file, line, parent_id, norm_term, term_f, reading_f, gloss_f, raw_f)
    VALUES (@term, @reading, @gloss, @raw, @kind, @sourceType, @sourceRef, @section,
            @file, @line, @parentId, @normTerm, @termF, @readingF, @glossF, @rawF)
  `);
  let count = 0;
  const insertOne = (e: ParsedEntry, parentId: number | null): void => {
    const info = stmt.run({
      term: e.term,
      reading: e.reading,
      gloss: e.gloss,
      raw: e.raw,
      kind: e.kind,
      sourceType: e.sourceType,
      sourceRef: e.sourceRef,
      section: e.section,
      file: relPath,
      line: e.line,
      parentId,
      normTerm: e.term ? normalizeTerm(e.term) : null,
      termF: e.term ? foldForSearch(e.term) : null,
      readingF: e.reading ? foldForSearch(e.reading) : null,
      glossF: e.gloss ? e.gloss.normalize('NFKC').toLowerCase() : null,
      rawF: foldForSearch(e.raw),
    });
    count++;
    for (const child of e.children) insertOne(child, Number(info.lastInsertRowid));
  };
  for (const e of entries) insertOne(e, null);
  return count;
}

/** Delete + reinsert one file's rows. Caller wraps in a transaction. */
function indexFile(db: Database.Database, vaultPath: string, relPath: string): number {
  const route = routeFile(relPath);
  db.prepare('DELETE FROM entries WHERE file = ?').run(relPath);
  db.prepare('DELETE FROM unparsed WHERE file = ?').run(relPath);
  if (!route) return 0;

  const content = fs.readFileSync(path.join(vaultPath, relPath), 'utf8');
  const result = parseByRoute(route, content, relPath);
  const n = insertEntries(db, relPath, result.entries);
  const ins = db.prepare('INSERT INTO unparsed (file, line, text, reason) VALUES (?, ?, ?, ?)');
  for (const u of result.unparsed) ins.run(relPath, u.line, u.text, u.reason);
  return n;
}

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
    INSERT INTO words (norm_term, term, reading, gloss, occurrence_count, lesson_count,
                       sources, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    ins.run(
      normTerm,
      display.term,
      display.reading,
      display.gloss,
      group.length,
      lessonRefs.length,
      JSON.stringify(sources),
      lessonRefs[0] ?? null,
      lessonRefs[lessonRefs.length - 1] ?? null,
    );
  }
}

export function indexVault(
  db: Database.Database,
  vaultPath: string,
): { files: number; entries: number } {
  const files = listVaultFiles(vaultPath);
  let entries = 0;
  db.transaction(() => {
    db.exec('DELETE FROM entries; DELETE FROM unparsed;');
    for (const rel of files) {
      try {
        entries += indexFile(db, vaultPath, rel);
      } catch (err) {
        console.error(`[indexer] failed to index ${rel}:`, err);
      }
    }
    rebuildWords(db);
  })();
  return { files: files.length, entries };
}

export function reindexFile(db: Database.Database, vaultPath: string, relPath: string): void {
  db.transaction(() => {
    indexFile(db, vaultPath, relPath);
    rebuildWords(db);
  })();
}

export function removeFile(db: Database.Database, relPath: string): void {
  db.transaction(() => {
    db.prepare('DELETE FROM entries WHERE file = ?').run(relPath);
    db.prepare('DELETE FROM unparsed WHERE file = ?').run(relPath);
    rebuildWords(db);
  })();
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/indexer.test.ts && npm run typecheck`
Expected: all PASS; typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/config.ts src/db.ts src/indexer.ts tests/ src/indexer.test.ts
git commit -m "feat: index vault files into SQLite with words aggregation"
```

---

### Task 6: Search with ranking

**Files:**
- Create: `src/search.ts`
- Test: `src/search.test.ts`

**Interfaces:**
- Consumes: `openDb`, `indexVault`, fixture (Task 5), `foldForSearch` (Task 1)
- Produces:

```ts
export interface SearchResultWord {
  normTerm: string | null;
  term: string;              // display term (words.term, else entry term, else raw)
  reading: string | null;
  gloss: string | null;
  kind: string;              // kind of the best-matching entry
  occurrenceCount: number;
  lessonCount: number;
  sources: { sourceType: string; sourceRef: string }[];
  score: number;
}
export function search(db, q: string, kind?: string, now?: Date): SearchResultWord[];
```

- [ ] **Step 1: Write the failing test**

Create `src/search.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type Database from 'better-sqlite3';
import { openDb } from './db.js';
import { indexVault } from './indexer.js';
import { search } from './search.js';
import { makeFixtureVault } from '../tests/fixture.js';

let vault: string;
let db: Database.Database;

beforeAll(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-search-'));
  makeFixtureVault(vault);
  db = openDb(':memory:');
  indexVault(db, vault);
});

afterAll(() => {
  db.close();
  fs.rmSync(vault, { recursive: true, force: true });
});

describe('search', () => {
  test('kanji query finds the word', () => {
    const r = search(db, '還付');
    expect(r[0].term).toBe('還付');
    expect(r[0].occurrenceCount).toBe(2);
  });

  test('kana query matches via reading', () => {
    const r = search(db, 'かんぷ');
    expect(r[0].term).toBe('還付');
  });

  test('katakana query is folded to hiragana', () => {
    const r = search(db, 'カンプ');
    expect(r[0].term).toBe('還付');
  });

  test('English query matches gloss', () => {
    const r = search(db, 'refund');
    expect(r[0].term).toBe('還付');
  });

  test('exact match outranks substring match', () => {
    // 還付 (exact) must beat 税金の還付 (contains) for query 還付
    const r = search(db, '還付');
    expect(r[0].term).toBe('還付');
    const idx = r.findIndex((x) => x.term === '税金の還付');
    expect(idx).toBeGreaterThan(0);
  });

  test('kind filter restricts results', () => {
    const r = search(db, '倍', 'grammar');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.kind === 'grammar')).toBe(true);
    expect(search(db, '倍', 'sentence')).toHaveLength(0);
  });

  test('results grouped: two 還付 lesson entries collapse into one word', () => {
    const r = search(db, '還付');
    expect(r.filter((x) => x.term === '還付')).toHaveLength(1);
  });

  test('sentences are searchable', () => {
    const r = search(db, 'もらいました');
    expect(r.some((x) => x.kind === 'sentence')).toBe(true);
  });

  test('empty and whitespace queries return nothing', () => {
    expect(search(db, '')).toHaveLength(0);
    expect(search(db, '   ')).toHaveLength(0);
  });

  test('LIKE wildcards in the query are escaped', () => {
    expect(search(db, '%')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/search.test.ts`
Expected: FAIL — module `./search.js` not found.

- [ ] **Step 3: Write the implementation**

Create `src/search.ts`:

```ts
import type Database from 'better-sqlite3';
import { foldForSearch } from './lib/japanese.js';

export interface SearchResultWord {
  normTerm: string | null;
  term: string;
  reading: string | null;
  gloss: string | null;
  kind: string;
  occurrenceCount: number;
  lessonCount: number;
  sources: { sourceType: string; sourceRef: string }[];
  score: number;
}

interface Row {
  id: number;
  term: string | null;
  reading: string | null;
  gloss: string | null;
  raw: string;
  kind: string;
  source_type: string;
  source_ref: string;
  norm_term: string | null;
  term_f: string | null;
  reading_f: string | null;
  gloss_f: string | null;
  w_term: string | null;
  w_reading: string | null;
  w_gloss: string | null;
  occurrence_count: number | null;
  lesson_count: number | null;
  sources: string | null;
  last_seen: string | null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => '\\' + c);

function glossWords(glossF: string | null): string[] {
  return glossF ? glossF.split(/[;,/()]|\s+/).filter(Boolean) : [];
}

function scoreRow(r: Row, qJa: string, qEn: string, now: Date): number {
  let s: number;
  if (r.term_f === qJa || r.reading_f === qJa) s = 100;
  else if (r.gloss_f === qEn) s = 90;
  else if (r.term_f?.startsWith(qJa) || r.reading_f?.startsWith(qJa)) s = 60;
  else if (glossWords(r.gloss_f).some((w) => w.startsWith(qEn))) s = 50;
  else if (r.term_f?.includes(qJa) || r.reading_f?.includes(qJa)) s = 30;
  else if (r.gloss_f?.includes(qEn)) s = 20;
  else s = 10; // matched only in raw text

  s += Math.min(r.occurrence_count ?? 1, 10);
  if (r.last_seen && now.getTime() - Date.parse(r.last_seen) < 90 * 86400e3) s += 5;
  return s;
}

export function search(
  db: Database.Database,
  q: string,
  kind = 'all',
  now = new Date(),
): SearchResultWord[] {
  const qJa = foldForSearch(q);
  const qEn = q.normalize('NFKC').toLowerCase().trim();
  if (!qJa) return [];

  const likeJa = `%${escapeLike(qJa)}%`;
  const likeEn = `%${escapeLike(qEn)}%`;
  const rows = db
    .prepare(
      `SELECT e.id, e.term, e.reading, e.gloss, e.raw, e.kind, e.source_type, e.source_ref,
              e.norm_term, e.term_f, e.reading_f, e.gloss_f,
              w.term AS w_term, w.reading AS w_reading, w.gloss AS w_gloss,
              w.occurrence_count, w.lesson_count, w.sources, w.last_seen
       FROM entries e
       LEFT JOIN words w ON w.norm_term = e.norm_term
       WHERE (@kind = 'all' OR e.kind = @kind)
         AND (e.term_f LIKE @ja ESCAPE '\\'
           OR e.reading_f LIKE @ja ESCAPE '\\'
           OR e.gloss_f LIKE @en ESCAPE '\\'
           OR e.raw_f LIKE @ja ESCAPE '\\')
       LIMIT 3000`,
    )
    .all({ kind, ja: likeJa, en: likeEn }) as Row[];

  const best = new Map<string, { row: Row; score: number }>();
  for (const r of rows) {
    const key = r.norm_term ?? `#${r.id}`;
    const score = scoreRow(r, qJa, qEn, now);
    const cur = best.get(key);
    if (!cur || score > cur.score) best.set(key, { row: r, score });
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || (b.row.lesson_count ?? 0) - (a.row.lesson_count ?? 0))
    .slice(0, 50)
    .map(({ row, score }) => ({
      normTerm: row.norm_term,
      term: row.w_term ?? row.term ?? row.raw,
      reading: row.w_reading ?? row.reading,
      gloss: row.w_gloss ?? row.gloss,
      kind: row.kind,
      occurrenceCount: row.occurrence_count ?? 1,
      lessonCount: row.lesson_count ?? (row.source_type === 'lesson' ? 1 : 0),
      sources: row.sources
        ? (JSON.parse(row.sources) as { sourceType: string; sourceRef: string }[])
        : [{ sourceType: row.source_type, sourceRef: row.source_ref }],
      score,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/search.test.ts && npm run typecheck`
Expected: all PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/search.ts src/search.test.ts
git commit -m "feat: ranked bidirectional search over indexed entries"
```

---

### Task 7: HTTP API, server entrypoint, file watcher

**Files:**
- Create: `src/app.ts`, `src/server.ts`, `src/watcher.ts`
- Test: `src/app.test.ts`

**Interfaces:**
- Consumes: `search` (Task 6), `openDb`/`indexVault`/`reindexFile`/`removeFile` (Task 5), `config`
- Produces:
  - `createApp(db: Database.Database): Hono` — all `/api/*` routes; static serving added in server.ts only
  - `startWatcher(db, vaultPath): FSWatcher`
  - API shapes:
    - `GET /api/search?q=<query>&kind=<all|vocab|grammar|sentence>` → `{ query, results: SearchResultWord[] }`
    - `GET /api/word/:normTerm` (URI-encoded) → `{ word, occurrences: [entry + children[]], mentions: entry[] }`, 404 if unknown
    - `GET /api/status` → `{ entryCount, wordCount, unparsedCount, fileCount }`
    - `GET /api/unparsed` → `{ rows: [{file, line, text, reason}] }`

- [ ] **Step 1: Write the failing test**

Create `src/app.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type Database from 'better-sqlite3';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { indexVault } from './indexer.js';
import { makeFixtureVault } from '../tests/fixture.js';

let vault: string;
let db: Database.Database;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-app-'));
  makeFixtureVault(vault);
  db = openDb(':memory:');
  indexVault(db, vault);
  app = createApp(db);
});

afterAll(() => {
  db.close();
  fs.rmSync(vault, { recursive: true, force: true });
});

describe('GET /api/search', () => {
  test('returns ranked results', async () => {
    const res = await app.request('/api/search?q=refund');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { term: string }[] };
    expect(body.results[0].term).toBe('還付');
  });

  test('empty query returns empty results, not an error', async () => {
    const res = await app.request('/api/search?q=');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { results: unknown[] }).results).toHaveLength(0);
  });
});

describe('GET /api/word/:normTerm', () => {
  test('returns occurrences with children and mentions', async () => {
    const res = await app.request(`/api/word/${encodeURIComponent('還付')}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      word: { term: string; occurrence_count: number };
      occurrences: { source_ref: string; children: unknown[] }[];
      mentions: { raw: string }[];
    };
    expect(body.word.term).toBe('還付');
    expect(body.occurrences).toHaveLength(2);
    // the sentence 還付（かんぷ）をもらいました and the child 税金の還付 mention it
    expect(body.mentions.length).toBeGreaterThanOrEqual(1);
  });

  test('unknown word returns 404', async () => {
    const res = await app.request('/api/word/zzzzzz');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/status and /api/unparsed', () => {
  test('status reports counts', async () => {
    const body = (await (await app.request('/api/status')).json()) as {
      entryCount: number;
      wordCount: number;
      unparsedCount: number;
    };
    expect(body.entryCount).toBeGreaterThan(5);
    expect(body.wordCount).toBeGreaterThan(3);
    expect(body.unparsedCount).toBeGreaterThanOrEqual(1);
  });

  test('unparsed lists flagged lines', async () => {
    const body = (await (await app.request('/api/unparsed')).json()) as {
      rows: { reason: string }[];
    };
    expect(body.rows.some((r) => r.reason === 'bullet in unknown callout')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app.test.ts`
Expected: FAIL — module `./app.js` not found.

- [ ] **Step 3: Write app.ts**

Create `src/app.ts`:

```ts
import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { search } from './search.js';

export function createApp(db: Database.Database): Hono {
  const app = new Hono();

  app.get('/api/search', (c) => {
    const q = c.req.query('q')?.trim() ?? '';
    const kind = c.req.query('kind') ?? 'all';
    if (!q) return c.json({ query: q, results: [] });
    return c.json({ query: q, results: search(db, q, kind) });
  });

  app.get('/api/word/:normTerm', (c) => {
    const normTerm = decodeURIComponent(c.req.param('normTerm'));
    const word = db.prepare('SELECT * FROM words WHERE norm_term = ?').get(normTerm);
    const parents = db
      .prepare(
        `SELECT * FROM entries WHERE norm_term = ? AND parent_id IS NULL
         ORDER BY source_type, source_ref DESC`,
      )
      .all(normTerm) as { id: number }[];
    if (!word && parents.length === 0) return c.json({ error: 'not found' }, 404);

    const childStmt = db.prepare('SELECT * FROM entries WHERE parent_id = ? ORDER BY line');
    const occurrences = parents.map((p) => ({ ...p, children: childStmt.all(p.id) }));
    const mentions = db
      .prepare(
        `SELECT * FROM entries
         WHERE raw_f LIKE ? ESCAPE '\\' AND (norm_term IS NULL OR norm_term != ?)
         ORDER BY source_ref DESC LIMIT 100`,
      )
      .all(`%${normTerm.replace(/[\\%_]/g, (ch) => '\\' + ch)}%`, normTerm);

    return c.json({ word: word ?? null, occurrences, mentions });
  });

  app.get('/api/status', (c) => {
    const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    return c.json({
      entryCount: n('SELECT COUNT(*) AS n FROM entries'),
      wordCount: n('SELECT COUNT(*) AS n FROM words'),
      unparsedCount: n('SELECT COUNT(*) AS n FROM unparsed'),
      fileCount: n('SELECT COUNT(DISTINCT file) AS n FROM entries'),
    });
  });

  app.get('/api/unparsed', (c) => {
    return c.json({ rows: db.prepare('SELECT * FROM unparsed ORDER BY file, line').all() });
  });

  return app;
}
```

- [ ] **Step 4: Write watcher.ts and server.ts**

Create `src/watcher.ts`:

```ts
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type Database from 'better-sqlite3';
import { reindexFile, removeFile } from './indexer.js';

const DEBOUNCE_MS = 400;

export function startWatcher(db: Database.Database, vaultPath: string): FSWatcher {
  const timers = new Map<string, NodeJS.Timeout>();

  const schedule = (absPath: string, gone: boolean) => {
    if (!absPath.endsWith('.md')) return;
    const rel = path.relative(vaultPath, absPath);
    if (path.basename(rel).startsWith('_')) return;
    clearTimeout(timers.get(rel));
    timers.set(
      rel,
      setTimeout(() => {
        timers.delete(rel);
        try {
          if (gone) removeFile(db, rel);
          else reindexFile(db, vaultPath, rel);
          console.log(`[watcher] reindexed ${rel}`);
        } catch (err) {
          console.error(`[watcher] failed on ${rel}:`, err);
        }
      }, DEBOUNCE_MS),
    );
  };

  const watcher = chokidar.watch(vaultPath, {
    ignoreInitial: true,
    ignored: /(^|[/\\])\../,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });
  watcher
    .on('add', (p) => schedule(p, false))
    .on('change', (p) => schedule(p, false))
    .on('unlink', (p) => schedule(p, true));
  return watcher;
}
```

Create `src/server.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.js';
import { config } from './config.js';
import { openDb } from './db.js';
import { indexVault } from './indexer.js';
import { startWatcher } from './watcher.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = openDb(config.dbPath);

const vaultExists = fs.existsSync(config.vaultPath);
if (!vaultExists) {
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM entries').get() as { n: number }).n;
  if (existing > 0) {
    console.warn(`[server] vault not found at ${config.vaultPath} — serving stale index (${existing} entries)`);
  } else {
    console.error(`[server] vault not found at ${config.vaultPath} and no existing index. Set VAULT_PATH.`);
    process.exit(1);
  }
} else {
  const t0 = Date.now();
  const { files, entries } = indexVault(db, config.vaultPath);
  console.log(`[server] indexed ${entries} entries from ${files} files in ${Date.now() - t0}ms`);
  startWatcher(db, config.vaultPath);
}

const app = createApp(db);
app.use('/*', serveStatic({ root: './web/dist' }));
app.get('*', serveStatic({ path: './web/dist/index.html' }));

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`[server] http://localhost:${config.port}`);
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: entire suite PASSES; typecheck clean.

- [ ] **Step 6: Smoke-test the server against the real vault**

Run:

```bash
tsx src/server.ts &
sleep 3
curl -s 'http://localhost:3456/api/status'
curl -s 'http://localhost:3456/api/search?q=%E9%82%84%E4%BB%98' | head -c 600
kill %1
```

Expected: status shows `entryCount` in the ~15,000–17,000 range; the search for 還付 returns results with `"term":"還付"`. (Frontend 404s are fine — web/dist doesn't exist yet.)

- [ ] **Step 7: Commit**

```bash
git add src/app.ts src/app.test.ts src/server.ts src/watcher.ts
git commit -m "feat: HTTP API, server entrypoint, and vault file watcher"
```

---

### Task 8: Frontend search UI

**Files:**
- Create: `web/index.html`, `web/vite.config.ts`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/WordDetail.tsx`, `web/src/api.ts`, `web/src/types.ts`, `web/src/styles.css`

**Interfaces:**
- Consumes: the API from Task 7 (`/api/search`, `/api/word/:normTerm`, `/api/status`)
- Produces: the complete Phase 1 UI

> **REQUIRED FIRST (user's global CLAUDE.md):** before writing any frontend code, read
> `/Users/nhattran/documents/projects/claude-skills/skills/frontend-design-complete/SKILL.md` and
> `/Users/nhattran/documents/projects/claude-skills/skills/design-styles/references/design-styles-comprehensive-reference.md`,
> and apply their guidelines. The component structure and behavior below are fixed; visual styling
> (colors, type, spacing) should be refined per those files. `web/src/styles.css` below is a
> functional baseline to replace/refine — not final design.

- [ ] **Step 1: Install frontend dependencies**

```bash
npm install react react-dom
npm install -D vite @vitejs/plugin-react @types/react @types/react-dom
```

- [ ] **Step 2: Create the Vite scaffold**

Create `web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3456' } },
});
```

Create `web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>語彙 — Vocab Lookup</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `web/src/main.tsx`:

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 3: Create shared types and API client**

Create `web/src/types.ts`:

```ts
export interface SearchResultWord {
  normTerm: string | null;
  term: string;
  reading: string | null;
  gloss: string | null;
  kind: string;
  occurrenceCount: number;
  lessonCount: number;
  sources: { sourceType: string; sourceRef: string }[];
  score: number;
}

export interface Entry {
  id: number;
  term: string | null;
  reading: string | null;
  gloss: string | null;
  raw: string;
  kind: string;
  source_type: string;
  source_ref: string;
  section: string | null;
  children?: Entry[];
}

export interface WordResponse {
  word: {
    norm_term: string;
    term: string;
    reading: string | null;
    gloss: string | null;
    occurrence_count: number;
    lesson_count: number;
    first_seen: string | null;
    last_seen: string | null;
  } | null;
  occurrences: Entry[];
  mentions: Entry[];
}
```

Create `web/src/api.ts`:

```ts
import type { SearchResultWord, WordResponse } from './types';

export async function searchApi(
  q: string,
  kind: string,
  signal: AbortSignal,
): Promise<SearchResultWord[]> {
  const res = await fetch(
    `/api/search?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(kind)}`,
    { signal },
  );
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return ((await res.json()) as { results: SearchResultWord[] }).results;
}

export async function wordApi(normTerm: string): Promise<WordResponse> {
  const res = await fetch(`/api/word/${encodeURIComponent(normTerm)}`);
  if (!res.ok) throw new Error(`word lookup failed: ${res.status}`);
  return (await res.json()) as WordResponse;
}
```

- [ ] **Step 4: Create the App component**

Create `web/src/App.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { searchApi } from './api';
import type { SearchResultWord } from './types';
import WordDetail from './WordDetail';

const KINDS = [
  { key: 'all', label: 'All' },
  { key: 'vocab', label: 'Vocab' },
  { key: 'grammar', label: 'Grammar' },
  { key: 'sentence', label: 'Sentences' },
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

export default function App() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [results, setResults] = useState<SearchResultWord[]>([]);
  const [sel, setSel] = useState(0);
  const [detail, setDetail] = useState<SearchResultWord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (!q.trim()) {
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
  }, [q, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter' && results[sel]) {
      setDetail(results[sel]);
    }
  };

  return (
    <div className="app">
      <header className="search-header">
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
      </header>

      {error && <p className="error">{error}</p>}

      {detail ? (
        <WordDetail result={detail} onBack={() => setDetail(null)} />
      ) : (
        <ul className="results">
          {results.map((r, i) => (
            <li
              key={`${r.normTerm ?? r.term}-${i}`}
              className={i === sel ? 'result selected' : 'result'}
              onClick={() => setDetail(r)}
              onMouseEnter={() => setSel(i)}
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
          {q.trim() && results.length === 0 && !error && (
            <li className="empty">No matches for “{q}”</li>
          )}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create the WordDetail component**

Create `web/src/WordDetail.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { wordApi } from './api';
import type { Entry, SearchResultWord, WordResponse } from './types';

function EntryLine({ e }: { e: Entry }) {
  return (
    <li className="entry-line">
      <span className="entry-raw">{e.raw}</span>
      {e.children && e.children.length > 0 && (
        <ul className="entry-children">
          {e.children.map((c) => (
            <li key={c.id} className="entry-raw child">
              {c.raw}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function WordDetail({
  result,
  onBack,
}: {
  result: SearchResultWord;
  onBack: () => void;
}) {
  const [data, setData] = useState<WordResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!result.normTerm) return;
    wordApi(result.normTerm).then(setData, () => setError('Could not load word details.'));
  }, [result.normTerm]);

  const textbook = data?.occurrences.filter((o) => o.source_type !== 'lesson') ?? [];
  const lessons = data?.occurrences.filter((o) => o.source_type === 'lesson') ?? [];

  return (
    <article className="word-detail">
      <button className="back" onClick={onBack}>
        ← results
      </button>
      <h1 className="detail-term">
        {result.term}
        {result.reading && result.reading !== result.term && (
          <span className="detail-reading">{result.reading}</span>
        )}
      </h1>
      {result.gloss && <p className="detail-gloss">{result.gloss}</p>}
      {error && <p className="error">{error}</p>}

      {textbook.length > 0 && (
        <section>
          <h2>Textbook</h2>
          <ul>
            {textbook.map((o) => (
              <li key={o.id} className="occurrence">
                <span className="badge">{o.source_ref}</span>
                {o.section && <span className="section">{o.section}</span>}
                <EntryLine e={o} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {lessons.length > 0 && (
        <section>
          <h2>Lessons ({lessons.length})</h2>
          <ul>
            {lessons.map((o) => (
              <li key={o.id} className="occurrence">
                <span className="badge date">{o.source_ref}</span>
                <EntryLine e={o} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.mentions.length > 0 && (
        <section>
          <h2>Mentions</h2>
          <ul>
            {data.mentions.map((m) => (
              <li key={m.id} className="occurrence mention">
                <span className="badge date">{m.source_ref}</span>
                <span className="entry-raw">{m.raw}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
```

- [ ] **Step 6: Create the baseline stylesheet**

Create `web/src/styles.css` (baseline — refine per the design skill files read at the start of this task):

```css
:root {
  --bg: #faf7f2;
  --ink: #1f1d1a;
  --muted: #6f6a61;
  --accent: #b4552d;
  --line: #e5dfd4;
  --selected: #f1e9db;
  font-size: 16px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #171512;
    --ink: #ece7de;
    --muted: #9a938a;
    --accent: #e0764a;
    --line: #2c2925;
    --selected: #26221d;
  }
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family:
    'Hiragino Sans', 'Noto Sans JP', -apple-system, 'Segoe UI', sans-serif;
}
.app {
  max-width: 760px;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
}
.search-header {
  position: sticky;
  top: 0;
  background: var(--bg);
  padding: 0.5rem 0 0.75rem;
  border-bottom: 1px solid var(--line);
}
.search-input {
  width: 100%;
  font-size: 1.4rem;
  padding: 0.6rem 0.8rem;
  border: 2px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
}
.search-input:focus {
  outline: none;
  border-color: var(--accent);
}
.filter-tabs {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.6rem;
}
.tab {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.85rem;
}
.tab.active {
  border-color: var(--accent);
  color: var(--accent);
}
.results {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
}
.result {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.55rem 0.6rem;
  border-radius: 8px;
  cursor: pointer;
}
.result.selected {
  background: var(--selected);
}
.term {
  font-size: 1.25rem;
  font-weight: 600;
  white-space: nowrap;
}
.reading {
  color: var(--accent);
  white-space: nowrap;
}
.gloss {
  color: var(--muted);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badges {
  display: flex;
  gap: 0.3rem;
  flex-shrink: 0;
}
.badge {
  font-size: 0.72rem;
  border: 1px solid var(--line);
  color: var(--muted);
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
  white-space: nowrap;
}
.empty,
.error {
  color: var(--muted);
  padding: 1rem 0.5rem;
  list-style: none;
}
.word-detail {
  padding-top: 1rem;
}
.back {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: 0.9rem;
}
.detail-term {
  font-size: 2rem;
  margin: 0.5rem 0 0;
}
.detail-reading {
  font-size: 1.1rem;
  color: var(--accent);
  margin-left: 0.75rem;
  font-weight: 400;
}
.detail-gloss {
  color: var(--muted);
  font-size: 1.05rem;
  margin-top: 0.25rem;
}
.word-detail h2 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin: 1.5rem 0 0.5rem;
  border-bottom: 1px solid var(--line);
  padding-bottom: 0.25rem;
}
.word-detail ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.occurrence {
  padding: 0.4rem 0;
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
}
.occurrence .badge.date {
  font-variant-numeric: tabular-nums;
}
.section {
  color: var(--muted);
  font-size: 0.8rem;
}
.entry-line {
  flex: 1;
}
.entry-raw {
  line-height: 1.6;
}
.entry-children {
  margin-top: 0.2rem;
  padding-left: 1rem !important;
  border-left: 2px solid var(--line);
}
.entry-raw.child {
  color: var(--muted);
  font-size: 0.95rem;
}
.mention .entry-raw {
  color: var(--muted);
}
```

- [ ] **Step 7: Verify build and typecheck**

Run: `npm run build && npm run typecheck`
Expected: Vite build succeeds producing `web/dist/index.html`; typecheck clean.

- [ ] **Step 8: Manual verification against the real vault**

Run: `npm run dev`, open `http://localhost:5173`, and verify each:

1. Type `refund` → 還付（かんぷ）appears near the top.
2. Type `かんぷ` → same word found via reading.
3. Type `還付` → same word, exact match first.
4. Arrow keys move the selection; Enter opens the detail view; it shows textbook and/or multiple lesson dates with your original example sentences; Escape returns.
5. Filter tabs restrict kinds (e.g. `倍` under Grammar).
6. Edit a lesson file in Obsidian (add a test bullet), wait ~2s, search finds it. **Then remove the test bullet.**

Expected: all six pass. Fix anything that doesn't before committing.

- [ ] **Step 9: Commit**

```bash
git add web/ package.json package-lock.json
git commit -m "feat: search-first frontend with word detail view"
```

---

### Task 9: Production wiring, README, real-vault verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything prior
- Produces: the finished Phase 1 deliverable

- [ ] **Step 1: Verify the production path end-to-end**

Run:

```bash
npm start &
sleep 8
curl -s http://localhost:3456/api/status
curl -s 'http://localhost:3456/api/search?q=refund' | head -c 400
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3456/
kill %1
```

Expected: status shows `entryCount` ≥ 15000; search returns 還付; root returns `200` (the built UI).

- [ ] **Step 2: Write the README**

Create `README.md`:

```markdown
# Japanese Vocab App

Instant lookup over 2+ years of italki lesson notes plus Genki/Quartet
vocabulary, indexed read-only from an Obsidian vault.

## Usage

    npm start          # build UI, index the vault, serve http://localhost:3456
    npm run dev        # dev mode: API on :3456, hot-reloading UI on :5173
    npm test           # parser + search + API tests
    npm run typecheck

The vault is watched — new lesson notes saved in Obsidian appear in search
within a couple of seconds. The SQLite file (`data/vocab.db`) is a disposable
cache, rebuilt from the vault on every start.

## Search

- Kanji (還付), kana (かんぷ / カンプ), or English (refund) — one box.
- `/` focuses search · ↑↓ select · Enter opens word detail · Esc goes back.
- Tabs filter All / Vocab / Grammar / Sentences.
- `/api/unparsed` lists vault lines the parser couldn't classify.

## Config (env vars)

| Var          | Default                                                        |
| ------------ | -------------------------------------------------------------- |
| `VAULT_PATH` | `/Users/nhattran/documents/obsidian-main/nhat-mind/efforts/japanese-learning` |
| `DB_PATH`    | `data/vocab.db`                                                |
| `PORT`       | `3456`                                                         |

## Phase 2/3 (planned)

Browse by month/chapter, stats, then SRS review. See
`docs/superpowers/specs/2026-07-05-japanese-vocab-app-design.md`.
```

- [ ] **Step 3: Full suite + commit**

Run: `npm test && npm run typecheck`
Expected: everything passes.

```bash
git add README.md
git commit -m "docs: add README with usage and config"
```

- [ ] **Step 4: Review the unparsed report**

Run:

```bash
tsx src/server.ts &
sleep 5
curl -s http://localhost:3456/api/unparsed | head -c 2000
kill %1
```

Expected: a small, explicable set (unknown callouts, wrapped lines). If a large class of real vocab lines shows up here, file it as follow-up work — do not silently expand the parser beyond the tested behaviors in this plan.

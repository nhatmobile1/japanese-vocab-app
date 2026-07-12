# Themes, Patterns & Motion Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six selectable palettes (light+dark each), six traditional SVG patterns, six haptic-feel motions, and a ⚙ settings panel — all persisted locally, zero backend changes.

**Architecture:** Palette/theme/pattern/stamp live as `data-*` attributes on `<html>`, set by an extended pre-paint script and mutated through a `settings.ts` module (localStorage + a `settingschange` window event that a `useSettingValue` hook subscribes to). CSS token blocks per palette×mode do all theming; patterns are shared SVG `<defs>` selected purely by CSS attribute selectors; motion is CSS-first with tiny React hooks for the tab indicator, cascade, stamp, and petal.

**Tech Stack:** Existing frontend stack only (Vite + React 18 + TS strict). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-11-themes-patterns-motion-design.md` (the exact palette hex tables live there — Task 1 copies them verbatim).

## Global Constraints

- Work on branch `feature/themes-settings` (branch from `main` before Task 1).
- **Frontend only**: nothing under `src/` (backend) changes; the backend suite (73 tests) must stay green untouched.
- Gates at every commit: `npx vitest run` (73/73), `npm run typecheck`, `npm run build`.
- Defaults: palette `ruri`, pattern `seigaiha`, stamp on, theme light. localStorage keys: `theme`, `palette`, `pattern`, `stamp` — all whitelist-validated on read.
- All motion: transform/opacity only; every motion disabled under `@media (prefers-reduced-motion: reduce)`.
- Preserve untouched: IME guards (`isComposing || keyCode === 229`) in both key handlers, loadMore guards, `/` shortcut, `aria-pressed` on tabs, `type="button"` on all buttons.
- Search placeholder becomes exactly: `上手・じょうず・skilled`
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

```
web/index.html               # MODIFY: pre-paint script (palette/pattern/stamp added)
web/src/settings.ts          # CREATE: registries, getters/setters, useSettingValue hook
web/src/ThemeToggle.tsx      # MODIFY: use settings.ts, spawn petal
web/src/PatternDefs.tsx      # CREATE: SVG defs + PatternBand
web/src/SettingsPanel.tsx    # CREATE: the ⚙ dialog
web/src/App.tsx              # MODIFY: PatternDefs/band, ⚙ + panel, Esc order, tab indicator, cascade, placeholder
web/src/WordDetail.tsx       # MODIFY: stamp class + detail pattern band
web/src/SentenceTimeline.tsx # MODIFY: month-header pattern band
web/src/styles.css           # MODIFY: 12 token blocks, pattern/panel/motion styles
README.md                    # MODIFY: settings documentation (Task 5)
```

---

### Task 1: Settings module, pre-paint, and the six-palette token system

**Files:**
- Create: `web/src/settings.ts`
- Modify: `web/index.html` (the existing `<script>` in `<head>`)
- Modify: `web/src/styles.css` (header comment; `:root` and `:root[data-theme='dark']` blocks at lines 1–47; `.result.selected` rules)
- Modify: `web/src/ThemeToggle.tsx` (delegate to settings.ts)

**Interfaces:**
- Produces (Tasks 2–4 rely on these exact exports from `web/src/settings.ts`):
  - `PALETTES: readonly {id, label, dots: [string, string, string]}[]`, `PATTERNS: readonly {id, label}[]`
  - `type PaletteId`, `type PatternId`
  - `getPalette(): PaletteId` / `setPalette(id)` — mirrored pairs also for `getTheme()/setTheme('light'|'dark')`, `getPattern()/setPattern(id)`, `getStamp(): boolean / setStamp(on: boolean)`
  - `useSettingValue<T>(get: () => T): T` — React hook re-rendering on any setting change
- CSS tokens every later task may use: `--bg --surface --ink --muted --line --accent --accent2 --sel --accent-ink` plus aliases `--line-strong --focus --selected-bg --selected-ink`.

- [ ] **Step 1: Create web/src/settings.ts**

```ts
import { useEffect, useState } from 'react';

// Keep the id lists in sync with the pre-paint whitelist in web/index.html.
export const PALETTES = [
  { id: 'ruri', label: '瑠璃と月', dots: ['#f1f4f9', '#3d5aa5', '#a08428'] },
  { id: 'wakakusa', label: '若草', dots: ['#f4f6ec', '#47795b', '#a8842a'] },
  { id: 'sakuranezu', label: '桜鼠', dots: ['#f9f3f3', '#c26879', '#6e8d64'] },
  { id: 'akanezora', label: '茜空', dots: ['#f7f2f5', '#b04452', '#6e68a8'] },
  { id: 'mizuhanada', label: '水縹', dots: ['#eef6f4', '#2f7d78', '#c9808e'] },
  { id: 'ponyo', label: 'ポニョ', dots: ['#faf1ea', '#dd5648', '#2e8388'] },
] as const;

export const PATTERNS = [
  { id: 'seigaiha', label: '青海波' },
  { id: 'shippo', label: '七宝' },
  { id: 'ichimatsu', label: '市松' },
  { id: 'uroko', label: '鱗' },
  { id: 'yabane', label: '矢羽根' },
  { id: 'kasumi', label: '霞' },
  { id: 'none', label: 'なし' },
] as const;

export type PaletteId = (typeof PALETTES)[number]['id'];
export type PatternId = (typeof PATTERNS)[number]['id'];

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode etc. — the setting still applies for this session */
  }
}

function emit(): void {
  window.dispatchEvent(new Event('settingschange'));
}

const root = () => document.documentElement.dataset;

export function getPalette(): PaletteId {
  const v = root().palette;
  return PALETTES.some((p) => p.id === v) ? (v as PaletteId) : 'ruri';
}
export function setPalette(id: PaletteId): void {
  root().palette = id;
  save('palette', id);
  emit();
}

export function getTheme(): 'light' | 'dark' {
  return root().theme === 'dark' ? 'dark' : 'light';
}
export function setTheme(t: 'light' | 'dark'): void {
  if (t === 'dark') root().theme = 'dark';
  else delete root().theme;
  save('theme', t);
  emit();
}

export function getPattern(): PatternId {
  const v = root().pattern;
  return PATTERNS.some((p) => p.id === v) ? (v as PatternId) : 'seigaiha';
}
export function setPattern(id: PatternId): void {
  root().pattern = id;
  save('pattern', id);
  emit();
}

export function getStamp(): boolean {
  return root().stamp !== 'off';
}
export function setStamp(on: boolean): void {
  if (on) delete root().stamp;
  else root().stamp = 'off';
  save('stamp', on ? 'on' : 'off');
  emit();
}

/** Subscribe a component to a settings getter; re-renders on every change. */
export function useSettingValue<T>(get: () => T): T {
  const [v, setV] = useState(get);
  useEffect(() => {
    const on = () => setV(get());
    window.addEventListener('settingschange', on);
    return () => window.removeEventListener('settingschange', on);
  }, [get]);
  return v;
}
```

- [ ] **Step 2: Extend the pre-paint script**

In `web/index.html`, replace the existing `<script>…</script>` block in `<head>` with:

```html
    <script>
      try {
        var d = document.documentElement.dataset;
        if (localStorage.getItem('theme') === 'dark') d.theme = 'dark';
        // Keep these whitelists in sync with web/src/settings.ts.
        var pal = localStorage.getItem('palette');
        d.palette =
          ['ruri', 'wakakusa', 'sakuranezu', 'akanezora', 'mizuhanada', 'ponyo'].indexOf(pal) >= 0
            ? pal
            : 'ruri';
        var pat = localStorage.getItem('pattern');
        d.pattern =
          ['seigaiha', 'shippo', 'ichimatsu', 'uroko', 'yabane', 'kasumi', 'none'].indexOf(pat) >= 0
            ? pat
            : 'seigaiha';
        if (localStorage.getItem('stamp') === 'off') d.stamp = 'off';
      } catch (e) {}
    </script>
```

- [ ] **Step 3: Replace the token blocks in styles.css**

Replace everything from the opening `/* … */` comment through the end of the `:root[data-theme='dark'] { … }` block (current lines 1–47) with the following. The bare `:root` carries ruri-light (so unstyled first paint is correct) plus fonts and the derived aliases; then one block per palette×mode with the spec's exact hex values:

```css
/*
  Design direction: Japanese paper & Ghibli skies. Six palettes (伝統色 +
  film-derived), selectable at runtime via data-palette on <html>; light is
  default, dark is data-theme='dark'. Selection is a subtle tinted wash
  (--sel), never an inverted block. --accent2 marks textbook badges.
  Structure stays the Phase-1 instrument: zero-radius, hairline rows,
  Noto Sans JP, tabular badges.
*/

:root {
  --bg: #f1f4f9;
  --surface: #fafbfe;
  --ink: #2b3149;
  --muted: #7b83a1;
  --line: #dbe1ee;
  --accent: #3d5aa5;
  --accent2: #a08428;
  --sel: #e3e9f6;
  --accent-ink: #f1f4f9;

  --line-strong: var(--ink);
  --focus: var(--accent);
  --selected-bg: var(--sel);
  --selected-ink: var(--ink);

  --font-ui: 'Noto Sans JP', 'Hiragino Sans', -apple-system, 'Segoe UI', sans-serif;
  --font-display: var(--font-ui);
  --font-mono: ui-monospace, 'SF Mono', 'Menlo', 'Cica', monospace;

  font-size: 16px;
}

:root[data-palette='ruri'][data-theme='dark'] {
  --bg: #131828; --surface: #191f33; --ink: #dde3f2; --muted: #8b93b4;
  --line: #2a3149; --accent: #93acea; --accent2: #d9b44a; --sel: #212a45;
  --accent-ink: #131828;
}

:root[data-palette='wakakusa'] {
  --bg: #f4f6ec; --surface: #fbfcf6; --ink: #2e3a2e; --muted: #75816e;
  --line: #dde3d0; --accent: #47795b; --accent2: #a8842a; --sel: #e7eed8;
  --accent-ink: #f4f6ec;
}
:root[data-palette='wakakusa'][data-theme='dark'] {
  --bg: #161c16; --surface: #1c231c; --ink: #e2e8da; --muted: #93a08c;
  --line: #2b342b; --accent: #82b995; --accent2: #d9b04a; --sel: #24301f;
  --accent-ink: #161c16;
}

:root[data-palette='sakuranezu'] {
  --bg: #f9f3f3; --surface: #fefafa; --ink: #45383e; --muted: #97838c;
  --line: #ecdcdf; --accent: #c26879; --accent2: #6e8d64; --sel: #f5e2e7;
  --accent-ink: #f9f3f3;
}
:root[data-palette='sakuranezu'][data-theme='dark'] {
  --bg: #201a1d; --surface: #271f23; --ink: #ecdfe3; --muted: #a68f99;
  --line: #3a2f34; --accent: #dc93a4; --accent2: #93b489; --sel: #33262c;
  --accent-ink: #201a1d;
}

:root[data-palette='akanezora'] {
  --bg: #f7f2f5; --surface: #fdfafb; --ink: #3b2f39; --muted: #92808d;
  --line: #e8dbe3; --accent: #b04452; --accent2: #6e68a8; --sel: #f2e2e9;
  --accent-ink: #f7f2f5;
}
:root[data-palette='akanezora'][data-theme='dark'] {
  --bg: #1e1720; --surface: #251c28; --ink: #ecdfe8; --muted: #a48fa1;
  --line: #372c3b; --accent: #dd8390; --accent2: #9d97d6; --sel: #342434;
  --accent-ink: #1e1720;
}

:root[data-palette='mizuhanada'] {
  --bg: #eef6f4; --surface: #f9fcfb; --ink: #23413e; --muted: #6b8a85;
  --line: #d7e6e2; --accent: #2f7d78; --accent2: #c9808e; --sel: #ddece8;
  --accent-ink: #eef6f4;
}
:root[data-palette='mizuhanada'][data-theme='dark'] {
  --bg: #101f1d; --surface: #162624; --ink: #dcebe7; --muted: #86a49e;
  --line: #24403c; --accent: #6fc4ba; --accent2: #e2a7b3; --sel: #1c3330;
  --accent-ink: #101f1d;
}

:root[data-palette='ponyo'] {
  --bg: #faf1ea; --surface: #fefaf6; --ink: #33424d; --muted: #94827c;
  --line: #f0ddd0; --accent: #dd5648; --accent2: #2e8388; --sel: #fae3da;
  --accent-ink: #faf1ea;
}
:root[data-palette='ponyo'][data-theme='dark'] {
  --bg: #14232a; --surface: #1a2c34; --ink: #ecdfd4; --muted: #93a4a2;
  --line: #2a4048; --accent: #f08a7a; --accent2: #6fc0bd; --sel: #263c42;
  --accent-ink: #14232a;
}
```

(Note there is deliberately no `:root[data-palette='ruri']` light block — bare `:root` IS ruri-light — but there IS a ruri dark block.)

- [ ] **Step 4: Selection becomes the wash; textbook badges get accent2**

Still in `web/src/styles.css`:

1. Replace the `.result.selected { … }` block (background/color/border) and DELETE the three follow-up override blocks (`.result.selected .reading`, `.result.selected .gloss`, `.result.selected .badge`) with:

```css
.result.selected {
  background: var(--sel);
  border-bottom-color: var(--sel);
}

.result.selected .term {
  color: var(--accent);
}
```

2. After the existing `.badge { … }` block, add:

```css
.badge.tb {
  color: var(--accent2);
  border-color: var(--accent2);
}
```

3. In `web/src/App.tsx`'s `WordRows`, mark textbook badges: `sourceBadges` currently returns strings — change it to return `{ text: string; tb: boolean }[]`:

```tsx
function sourceBadges(r: SearchResultWord): { text: string; tb: boolean }[] {
  const badges = r.sources
    .filter((s) => s.sourceType !== 'lesson')
    .map((s) => ({ text: s.sourceRef, tb: true }));
  if (r.lessonCount === 1) {
    const d = r.sources.find((s) => s.sourceType === 'lesson');
    if (d) badges.push({ text: d.sourceRef, tb: false });
  } else if (r.lessonCount > 1) {
    badges.push({ text: `×${r.lessonCount} lessons`, tb: false });
  }
  return badges;
}
```

and render them as:

```tsx
          <span className="badges">
            {sourceBadges(r).map((b) => (
              <span key={b.text} className={b.tb ? 'badge tb' : 'badge'}>
                {b.text}
              </span>
            ))}
          </span>
```

Also in `web/src/WordDetail.tsx`, the Textbook section's badge becomes `<span className="badge tb">{o.source_ref}</span>`.

- [ ] **Step 5: ThemeToggle delegates to settings.ts**

Replace the entire contents of `web/src/ThemeToggle.tsx` with (petal comes in Task 4 — this step only reroutes state):

```tsx
import { getTheme, setTheme, useSettingValue } from './settings';

export default function ThemeToggle() {
  const theme = useSettingValue(getTheme);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: 73/73, clean, clean.

Then `npm run dev`, open http://localhost:5173 and check: app renders in ruri light (bluish paper, lapis accent); in devtools, setting `document.documentElement.dataset.palette = 'ponyo'` retints everything instantly; adding `dataset.theme = 'dark'` gives ponyo-dark; the ☾ toggle still works and persists; selected rows show the tinted wash with an accent-colored term (no black block); Quartet/Genki badges render in the palette's secondary color.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat: six-palette token system with settings module and pre-paint"
```

---

### Task 2: Pattern defs, bands, and placements

**Files:**
- Create: `web/src/PatternDefs.tsx`
- Modify: `web/src/App.tsx` (mount defs; header band; placeholder text)
- Modify: `web/src/WordDetail.tsx` (detail band)
- Modify: `web/src/SentenceTimeline.tsx` (month bands)
- Modify: `web/src/styles.css` (pattern styles)

**Interfaces:**
- Consumes: nothing from Task 1 at runtime (selection is pure CSS on `data-pattern`).
- Produces: `PatternDefs` (mount once) and `PatternBand({ className? })` from `web/src/PatternDefs.tsx`; CSS classes `.pattern-band`, `.detail-band`, `.month-band`.

- [ ] **Step 1: Create web/src/PatternDefs.tsx**

```tsx
const PATTERN_IDS = ['seigaiha', 'shippo', 'ichimatsu', 'uroko', 'yabane', 'kasumi'] as const;

/** Shared SVG <pattern> definitions. Mount exactly once, near the app root. */
export default function PatternDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="p-seigaiha" width="40" height="20" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1.1">
            <path d="M2 20 a18 18 0 0 1 36 0" /><path d="M8 20 a12 12 0 0 1 24 0" /><path d="M14 20 a6 6 0 0 1 12 0" />
            <path d="M-18 10 a18 18 0 0 1 36 0" /><path d="M-12 10 a12 12 0 0 1 24 0" /><path d="M-6 10 a6 6 0 0 1 12 0" />
            <path d="M22 10 a18 18 0 0 1 36 0" /><path d="M28 10 a12 12 0 0 1 24 0" /><path d="M34 10 a6 6 0 0 1 12 0" />
          </g>
        </pattern>
        <pattern id="p-shippo" width="24" height="24" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <circle cx="0" cy="0" r="12" /><circle cx="24" cy="0" r="12" /><circle cx="0" cy="24" r="12" />
            <circle cx="24" cy="24" r="12" /><circle cx="12" cy="12" r="12" />
          </g>
        </pattern>
        <pattern id="p-ichimatsu" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="currentColor" opacity="0.55" />
          <rect x="12" y="12" width="12" height="12" fill="currentColor" opacity="0.55" />
        </pattern>
        <pattern id="p-uroko" width="28" height="28" patternUnits="userSpaceOnUse">
          <g fill="currentColor" opacity="0.5">
            <path d="M0 14 L7 0 L14 14 Z" /><path d="M14 14 L21 0 L28 14 Z" />
            <path d="M-7 28 L0 14 L7 28 Z" /><path d="M7 28 L14 14 L21 28 Z" /><path d="M21 28 L28 14 L35 28 Z" />
          </g>
        </pattern>
        <pattern id="p-yabane" width="20" height="20" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M0 3 L10 13 L20 3" /><path d="M0 13 L10 23 L20 13" /><path d="M0 -7 L10 3 L20 -7" />
          </g>
        </pattern>
        <pattern id="p-kasumi" width="88" height="30" patternUnits="userSpaceOnUse">
          <g fill="currentColor" opacity="0.5">
            <rect x="0" y="4" width="46" height="2.6" rx="1.3" />
            <rect x="30" y="14" width="52" height="2.6" rx="1.3" />
            <rect x="-26" y="24" width="44" height="2.6" rx="1.3" /><rect x="62" y="24" width="44" height="2.6" rx="1.3" />
          </g>
        </pattern>
      </defs>
    </svg>
  );
}

/** A band that shows the user's chosen pattern (CSS picks the visible rect). */
export function PatternBand({ className }: { className?: string }) {
  return (
    <div className={className ? `pattern-band ${className}` : 'pattern-band'} aria-hidden="true">
      <svg preserveAspectRatio="none">
        {PATTERN_IDS.map((id) => (
          <rect key={id} className={`pat-${id}`} width="100%" height="100%" fill={`url(#p-${id})`} />
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Mount and place**

In `web/src/App.tsx`:
1. Add `import PatternDefs, { PatternBand } from './PatternDefs';`
2. In the returned JSX, add `<PatternDefs />` as the first child of `<div className="app">`.
3. Add `<PatternBand />` as the LAST child of `<header className="search-header">` (after the sort-tabs conditional).
4. Change the input's placeholder to `placeholder="上手・じょうず・skilled"`.

In `web/src/WordDetail.tsx`: add the import `import { PatternBand } from './PatternDefs';` and insert `<PatternBand className="detail-band" />` directly after the closing `</h1>` of `.detail-term`.

In `web/src/SentenceTimeline.tsx`: add the same import and change the month header line to:

```tsx
          <h2 className="month-header">
            {g.month}
            <PatternBand className="month-band" />
          </h2>
```

- [ ] **Step 3: Pattern styles**

Append to `web/src/styles.css`:

```css
/* --- Traditional pattern bands ------------------------------------------ */

.pattern-band {
  height: 16px;
  margin-top: 0.75rem;
  color: color-mix(in srgb, var(--accent) 55%, var(--bg));
  opacity: 0.5;
}

.pattern-band svg {
  width: 100%;
  height: 100%;
  display: block;
}

.pattern-band rect {
  display: none;
}

:root[data-pattern='seigaiha'] .pat-seigaiha,
:root[data-pattern='shippo'] .pat-shippo,
:root[data-pattern='ichimatsu'] .pat-ichimatsu,
:root[data-pattern='uroko'] .pat-uroko,
:root[data-pattern='yabane'] .pat-yabane,
:root[data-pattern='kasumi'] .pat-kasumi {
  display: inline;
}

:root[data-pattern='none'] .pattern-band {
  display: none;
}

.detail-band {
  height: 14px;
  margin-top: 0.5rem;
  max-width: 420px;
}

.month-band {
  height: 10px;
  margin-top: 0.2rem;
  opacity: 0.35;
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all clean.

`npm run dev`: header shows a subtle seigaiha band tinted toward the accent; `document.documentElement.dataset.pattern = 'kasumi'` switches every band instantly; `'none'` removes them without leaving gaps; a word detail shows the band under the term; the Sentences tab shows small bands under month headers; placeholder reads 上手・じょうず・skilled.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat: traditional pattern bands with CSS-selected active pattern"
```

---

### Task 3: Settings panel

**Files:**
- Create: `web/src/SettingsPanel.tsx`
- Modify: `web/src/App.tsx` (⚙ button, open state, Esc ordering)
- Modify: `web/src/styles.css` (panel styles)

**Interfaces:**
- Consumes: everything exported by `web/src/settings.ts` (Task 1) and the `#p-*` pattern defs (Task 2, for chip previews).
- Produces: `SettingsPanel({ onClose: () => void })`; `.settings-toggle` button class.

- [ ] **Step 1: Create web/src/SettingsPanel.tsx**

```tsx
import { useEffect, useRef } from 'react';
import {
  PALETTES,
  PATTERNS,
  getPalette,
  getPattern,
  getStamp,
  getTheme,
  setPalette,
  setPattern,
  setStamp,
  setTheme,
  useSettingValue,
} from './settings';

export default function SettingsPanel({ onClose }: { onClose: () => void }) {
  const palette = useSettingValue(getPalette);
  const theme = useSettingValue(getTheme);
  const pattern = useSettingValue(getPattern);
  const stamp = useSettingValue(getStamp);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (t.closest('.settings-toggle')) return; // the ⚙ button toggles itself
      if (ref.current && !ref.current.contains(t)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  return (
    <div className="settings-panel" role="dialog" aria-label="Settings" tabIndex={-1} ref={ref}>
      <section>
        <h3>テーマ Theme</h3>
        <div className="chips">
          {PALETTES.map((p) => (
            <button
              type="button"
              key={p.id}
              className="chip"
              aria-pressed={palette === p.id}
              onClick={() => setPalette(p.id)}
            >
              <span className="dots">
                {p.dots.map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>外観 Appearance</h3>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
            ☀ Light
          </button>
          <button type="button" className="chip" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
            ☾ Dark
          </button>
        </div>
      </section>

      <section>
        <h3>文様 Pattern</h3>
        <div className="chips">
          {PATTERNS.map((p) => (
            <button
              type="button"
              key={p.id}
              className="chip"
              aria-pressed={pattern === p.id}
              onClick={() => setPattern(p.id)}
            >
              {p.id !== 'none' && (
                <svg className="chip-pattern" aria-hidden="true">
                  <rect width="100%" height="100%" fill={`url(#p-${p.id})`} />
                </svg>
              )}
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>動き Motion</h3>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={stamp} onClick={() => setStamp(!stamp)}>
            判子 stamp on word detail {stamp ? 'on' : 'off'}
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Wire into App**

In `web/src/App.tsx`:
1. `import SettingsPanel from './SettingsPanel';`
2. Add state and a close helper that returns focus to the ⚙ button (spec: focus moves back to ⚙ on close):

```tsx
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const closeSettings = () => {
    setSettingsOpen(false);
    settingsBtnRef.current?.focus();
  };
```

3. In the window `onKey` Escape handling, close the panel first — the Escape branch becomes:

```tsx
      if (e.key === 'Escape') {
        if (settingsOpen) closeSettings();
        else if (detail) setDetail(null);
        else {
          setQ('');
          inputRef.current?.focus();
        }
      }
```

and the effect's dependency array becomes `[detail, settingsOpen]`.

4. In `.header-row`, add the ⚙ button between the input and `<ThemeToggle />`:

```tsx
          <button
            ref={settingsBtnRef}
            type="button"
            className="theme-toggle settings-toggle"
            aria-label="Settings"
            aria-expanded={settingsOpen}
            title="Settings"
            onClick={() => setSettingsOpen((o) => !o)}
          >
            ⚙
          </button>
```

5. Render the panel inside `<header className="search-header">`, directly after the `.header-row` div: `{settingsOpen && <SettingsPanel onClose={closeSettings} />}`

- [ ] **Step 3: Panel styles**

Append to `web/src/styles.css`:

```css
/* --- Settings panel ------------------------------------------------------ */

.search-header {
  position: sticky;
}

.settings-panel {
  position: absolute;
  top: calc(100% + 2px);
  right: 0;
  z-index: 10;
  width: min(340px, calc(100vw - 2rem));
  background: var(--surface);
  border: 2px solid var(--line-strong);
  padding: 0.9rem 1rem 1.1rem;
  max-height: 70vh;
  overflow-y: auto;
}

.settings-panel:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.settings-panel h3 {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--muted);
  margin: 0.9rem 0 0.4rem;
}

.settings-panel section:first-child h3 {
  margin-top: 0;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-ui);
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}

.chip[aria-pressed='true'] {
  border-color: var(--accent);
  background: var(--sel);
}

.chip:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.dots {
  display: inline-flex;
  gap: 2px;
}

.dots i {
  width: 0.7rem;
  height: 0.7rem;
  border: 1px solid var(--line);
}

.chip-pattern {
  width: 34px;
  height: 16px;
  color: var(--accent);
  opacity: 0.7;
}
```

The `.search-header { position: sticky; }` line is a no-op reaffirmation (it is already sticky) — the panel anchors to it via `position: absolute`; verify the header rule still has `position: sticky` and add `/* anchors .settings-panel */` beside it instead if you prefer not to duplicate.

- [ ] **Step 4: Verify**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all clean.

`npm run dev`: ⚙ opens the panel; all six theme chips retint the app instantly and persist across reload; light/dark chips and the ☾ toggle stay in sync (click one, the other updates); pattern chips show mini previews and switch the bands; None removes them; the stamp chip flips (its effect lands in Task 4); Esc closes the panel first, then detail, then clears; clicking outside closes; clicking ⚙ again closes rather than reopening.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat: settings panel for theme, pattern, and motion preferences"
```

---

### Task 4: Motion

**Files:**
- Modify: `web/src/styles.css` (motion styles + reduced-motion block)
- Modify: `web/src/App.tsx` (tab indicator, cascade wave)
- Modify: `web/src/WordDetail.tsx` (stamp class)
- Modify: `web/src/ThemeToggle.tsx` (petal spawn)

**Interfaces:**
- Consumes: `data-stamp` attribute semantics from Task 1 (`'off'` disables).
- Produces: final motion behavior; no later task consumes code from this one.

- [ ] **Step 1: Ink-wash selection + press thock + stamp + petal + reduced-motion (CSS)**

In `web/src/styles.css`:

1. Replace the existing `@media (prefers-reduced-motion: no-preference) { … }` block (the one transitioning `.result, .tab, .search-input, .back`) with:

```css
@media (prefers-reduced-motion: no-preference) {
  .tab,
  .search-input,
  .back {
    transition:
      background-color 120ms ease,
      color 120ms ease,
      border-color 120ms ease;
  }

  .tab,
  .theme-toggle,
  .load-more,
  .back,
  .chip {
    transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .tab:active,
  .theme-toggle:active,
  .load-more:active:not(:disabled),
  .back:active,
  .chip:active {
    transform: scale(0.98) translateY(1px);
    transition-duration: 90ms;
    transition-timing-function: ease-out;
  }
}
```

2. Update the `.result` block to host the sweep (add the three positioning lines to the existing rule):

```css
.result {
  display: flex;
  align-items: baseline;
  gap: 0.9rem;
  padding: 0.65rem 0.5rem;
  border-radius: 0;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  position: relative;
  isolation: isolate;
}

.result::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--sel);
  transform: scaleX(0);
  transform-origin: left center;
}

@media (prefers-reduced-motion: no-preference) {
  .result::before {
    transition: transform 160ms cubic-bezier(0.25, 0.9, 0.4, 1);
  }
}

.result.selected::before {
  transform: scaleX(1);
}
```

and change the Task-1 `.result.selected` rule to no longer set a background (the ::before carries it now):

```css
.result.selected {
  border-bottom-color: var(--sel);
}
```

3. Append the stamp, cascade, petal, and reduced-motion styles:

```css
/* --- Motion -------------------------------------------------------------- */

.detail-term.stamp {
  animation: stamp 220ms cubic-bezier(0.2, 1.2, 0.4, 1) both;
}

:root[data-stamp='off'] .detail-term.stamp {
  animation: none;
}

@keyframes stamp {
  0% { opacity: 0; transform: scale(1.15) rotate(-1.5deg); }
  60% { opacity: 1; transform: scale(0.985) rotate(0.4deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}

.tab-indicator {
  position: absolute;
  bottom: 0;
  height: 2px;
  background: var(--accent);
  transition:
    left 200ms cubic-bezier(0.34, 1.4, 0.64, 1),
    width 200ms cubic-bezier(0.34, 1.4, 0.64, 1);
}

.filter-tabs {
  position: relative;
}

.filter-tabs .tab.active {
  border-bottom-color: transparent;
}

.cascade .result {
  animation: rise 180ms ease-out both;
  animation-delay: calc(var(--i, 0) * 22ms);
}

.cascade .result:nth-child(n + 13) {
  animation: none;
}

@keyframes rise {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: none; }
}

.petal {
  position: absolute;
  left: 50%;
  top: 10%;
  width: 10px;
  height: 8px;
  background: #dc93a4;
  border-radius: 80% 20% 80% 20%;
  pointer-events: none;
  animation: petalfall 900ms ease-in forwards;
}

@keyframes petalfall {
  0% { opacity: 0; transform: translate(-50%, 0) rotate(0deg); }
  15% { opacity: 1; }
  100% { opacity: 0; transform: translate(calc(-50% + 26px), 52px) rotate(140deg); }
}

.theme-toggle {
  position: relative;
}

@media (prefers-reduced-motion: reduce) {
  .result::before,
  .tab,
  .theme-toggle,
  .load-more,
  .back,
  .chip,
  .tab-indicator {
    transition: none !important;
  }
  .detail-term.stamp,
  .cascade .result,
  .petal {
    animation: none !important;
  }
}
```

- [ ] **Step 2: Sliding tab indicator + cascade wave (App.tsx)**

1. Add refs and the measuring effect inside `App()` (after the existing refs):

```tsx
  const tabsRef = useRef<HTMLElement>(null);
  const indRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const move = () => {
      const btn = tabsRef.current?.querySelector<HTMLButtonElement>('.tab.active');
      if (btn && indRef.current) {
        indRef.current.style.left = `${btn.offsetLeft}px`;
        indRef.current.style.width = `${btn.offsetWidth}px`;
      }
    };
    move();
    window.addEventListener('resize', move);
    return () => window.removeEventListener('resize', move);
  }, [kind]);
```

2. Give the kind-tab nav the ref and indicator element:

```tsx
        <nav className="filter-tabs" ref={tabsRef}>
          {KINDS.map((k) => ( /* …unchanged buttons… */ ))}
          <i className="tab-indicator" ref={indRef} aria-hidden="true" />
        </nav>
```

3. Cascade wave: add `const [wave, setWave] = useState(0);` and bump it when a FRESH set lands — in the search effect after `setResults(...)` add `setWave((w) => w + 1);`, and in the browse effect after the page-0 `setWords(...)`/`setSentences(...)` add the same `setWave((w) => w + 1);` (once, after the if/else). Do NOT touch `loadMore`.

4. Apply it to both results `<ul>`s (search branch and browse words branch): `className="results cascade"` and `key={wave}`, e.g.

```tsx
        <ul className="results cascade" key={wave}>
```

5. Pass the stagger index through `WordRows` — in the row `<li>`, add `style={{ '--i': Math.min(i, 12) } as React.CSSProperties}`.

- [ ] **Step 3: Stamp (WordDetail.tsx)**

Change the `<h1 className="detail-term">` to `<h1 className="detail-term stamp">`. (The CSS `:root[data-stamp='off']` gate and reduced-motion handle the rest; the animation replays naturally because opening a detail mounts a fresh `<h1>`.)

- [ ] **Step 4: Petal (ThemeToggle.tsx)**

Replace the file contents with:

```tsx
import { useRef } from 'react';
import { getTheme, setTheme, useSettingValue } from './settings';

export default function ThemeToggle() {
  const theme = useSettingValue(getTheme);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'dark' && btnRef.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const petal = document.createElement('i');
      petal.className = 'petal';
      btnRef.current.appendChild(petal);
      setTimeout(() => petal.remove(), 950);
    }
  };

  return (
    <button
      ref={btnRef}
      type="button"
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

- [ ] **Step 5: Verify**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all clean.

`npm run dev`: arrow-keying results sweeps the wash left-to-right; buttons compress on press and spring back; opening a word detail stamps the term (and doesn't when the settings chip turns 判子 off); the kind-tab underline glides between tabs (and tracks on window resize); a fresh search cascades rows in while Load more appends without animation; flipping to dark drops one petal; with macOS "Reduce motion" on, none of it animates.

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "feat: haptic-feel motion (ink wash, thock, stamp, indicator, cascade, petal)"
```

---

### Task 5: Contrast check, full verification, README

**Files:**
- Modify: `README.md`

**Interfaces:** consumes everything prior; produces the verified deliverable.

- [ ] **Step 1: Contrast spot-check**

Write this throwaway script to the SCRATCHPAD (not the repo) as `contrast.mjs` and run it with `node`. It checks `--muted` on `--bg` and `--accent` on `--bg` for all 12 palette/mode combinations against WCAG AA (4.5):

```js
const palettes = {
  'ruri/light': { bg: '#f1f4f9', muted: '#7b83a1', accent: '#3d5aa5' },
  'ruri/dark': { bg: '#131828', muted: '#8b93b4', accent: '#93acea' },
  'wakakusa/light': { bg: '#f4f6ec', muted: '#75816e', accent: '#47795b' },
  'wakakusa/dark': { bg: '#161c16', muted: '#93a08c', accent: '#82b995' },
  'sakuranezu/light': { bg: '#f9f3f3', muted: '#97838c', accent: '#c26879' },
  'sakuranezu/dark': { bg: '#201a1d', muted: '#a68f99', accent: '#dc93a4' },
  'akanezora/light': { bg: '#f7f2f5', muted: '#92808d', accent: '#b04452' },
  'akanezora/dark': { bg: '#1e1720', muted: '#a48fa1', accent: '#dd8390' },
  'mizuhanada/light': { bg: '#eef6f4', muted: '#6b8a85', accent: '#2f7d78' },
  'mizuhanada/dark': { bg: '#101f1d', muted: '#86a49e', accent: '#6fc4ba' },
  'ponyo/light': { bg: '#faf1ea', muted: '#94827c', accent: '#dd5648' },
  'ponyo/dark': { bg: '#14232a', muted: '#93a4a2', accent: '#f08a7a' },
};
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
for (const [name, p] of Object.entries(palettes)) {
  for (const role of ['muted', 'accent']) {
    const r = ratio(p.bg, p[role]);
    console.log(`${r < 4.5 ? 'FAIL' : ' ok '} ${name} ${role}: ${r.toFixed(2)}`);
  }
}
```

If any pair FAILs: darken (light mode) or lighten (dark mode) that single token by the smallest step that passes, keeping the hue — apply the adjusted hex in `web/src/styles.css` AND in the `dots` preview in `web/src/settings.ts` if it's an accent, and record old→new in your report. Re-run until all pass. (The `--muted` role is used for glosses — body-size text — so AA 4.5 is the right bar.)

- [ ] **Step 2: Full app verification against the real vault**

`npm start`, open http://localhost:3456, walk through: six themes × light/dark from the panel (spot-check three combos visually + the contrast script covers the math); pattern switching including None; persistence across reload (palette + theme + pattern + stamp survive); Esc order with panel open; search/browse/detail flows unchanged (IME Enter still safe — type かんぷ via Japanese IME if possible, else confirm the guards are still in the built code); reduced-motion via macOS setting or devtools emulation. Kill the server; port 3456 free.

- [ ] **Step 3: README**

In `README.md`, update the theme bullet in "Search & Browse" from the ☾-only description to:

```markdown
- ⚙ opens Settings: six color themes (瑠璃と月 · 若草 · 桜鼠 · 茜空 · 水縹 · ポニョ),
  light/dark, a traditional pattern for the header bands (青海波 · 七宝 · 市松 ·
  鱗 · 矢羽根 · 霞 · none), and motion preferences. ☾/☀ is the quick theme
  switch. Everything persists locally.
```

- [ ] **Step 4: Final gate + commit**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: all clean.

```bash
git add README.md web/
git commit -m "docs: settings documentation; contrast-verified palettes"
```

(If Step 1 adjusted no tokens, the `web/` part of the add is empty — that's fine.)

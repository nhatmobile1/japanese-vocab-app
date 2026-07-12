# UI Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four unique-hue themes (new 桔梗 purple), three patterns, a petal animation that actually renders, an always-on stamp, a real app header with live counts, and a search clear button.

**Architecture:** Registry prunes in `settings.ts` + matching pre-paint whitelists (removed ids fall back via existing validation). The petal becomes React-rendered state in `ThemeToggle`, triggered by observing theme transitions. A new `AppHeader` component (wordmark, `/api/status` subtitle, ⚙/☾, settings panel) sits above the sticky `.search-header`, which keeps search/tabs/band and gains the ✕ clear button.

**Tech Stack:** Existing frontend stack only (Vite + React 18 + TS strict). No new dependencies. Zero backend changes.

**Spec:** `docs/superpowers/specs/2026-07-12-ui-refinements-design.md`

## Global Constraints

- Work on branch `feature/ui-refinements` (branch from `main` before Task 1).
- **Frontend only** — nothing under `src/` (backend) changes; suite stays 74/74.
- Gates at every commit: `npx vitest run` (74/74), `npm run typecheck`, `npm run build` — all clean.
- Preserve untouched: IME guards (`isComposing || keyCode === 229`) in both key handlers, loadMore guards, `/` shortcut, Esc chain (settings panel → detail → clear), focus-return-to-⚙ on panel close, sticky `.search-header` with `z-index: 20`, placeholder `上手・じょうず・skilled`.
- Contrast rule for kikyō (both modes): muted-on-bg, accent-on-bg, accent2-on-bg, ink-on-sel all ≥ 4.5; adjust failing tokens minimally keeping hue; mirror accent/accent2 changes into `dots`.
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

```
web/src/settings.ts        # MODIFY: 4 palettes (+kikyo), 4 patterns, stamp API removed
web/index.html             # MODIFY: whitelists updated, stamp line removed
web/src/styles.css         # MODIFY: kikyo blocks in / 6 old blocks out; pattern selectors; stamp gate out; app-header + search-clear styles
web/src/PatternDefs.tsx    # MODIFY: 3 defs + 3 rects
web/src/SettingsPanel.tsx  # MODIFY: Motion section removed
web/src/ThemeToggle.tsx    # MODIFY: React-rendered petal on any light→dark
web/src/AppHeader.tsx      # CREATE: wordmark + status subtitle + buttons + panel
web/src/App.tsx            # MODIFY: mount AppHeader; search-header slims down; ✕ button
README.md                  # MODIFY (Task 5)
```

---

### Task 1: Four-theme registry + 桔梗 tokens + contrast

**Files:**
- Modify: `web/src/settings.ts` (PALETTES only)
- Modify: `web/index.html` (palette whitelist only)
- Modify: `web/src/styles.css` (palette token blocks)

**Interfaces:**
- Produces: `PaletteId = 'ruri' | 'wakakusa' | 'kikyo' | 'ponyo'`; CSS blocks `:root[data-palette='kikyo']` (light) and `:root[data-palette='kikyo'][data-theme='dark']`. Everything else about settings.ts is unchanged in this task.

- [ ] **Step 1: Prune PALETTES and add kikyō**

In `web/src/settings.ts`, replace the `PALETTES` array so it reads exactly (the ruri/wakakusa/ponyo lines are the CURRENT lines kept byte-identical — verify against the file, do not retype their dots):

```ts
export const PALETTES = [
  { id: 'ruri', label: '瑠璃と月', dots: ['#f1f4f9', '#3d5aa5', '#7a7128'] },
  { id: 'wakakusa', label: '若草', dots: ['#f4f6ec', '#47795b', '#80702a'] },
  { id: 'kikyo', label: '桔梗', dots: ['#f4f2f8', '#6257a8', '#776a26'] },
  { id: 'ponyo', label: 'ポニョ', dots: ['#faf1ea', '#ce3626', '#287a7c'] },
] as const;
```

- [ ] **Step 2: Update the palette whitelist**

In `web/index.html`, change the palette whitelist line to:

```js
          ['ruri', 'wakakusa', 'kikyo', 'ponyo'].indexOf(pal) >= 0
```

- [ ] **Step 3: Swap the token blocks**

In `web/src/styles.css`:
1. DELETE all six blocks for the removed palettes: `:root[data-palette='sakuranezu']`, `:root[data-palette='sakuranezu'][data-theme='dark']`, `:root[data-palette='akanezora']`, `:root[data-palette='akanezora'][data-theme='dark']`, `:root[data-palette='mizuhanada']`, `:root[data-palette='mizuhanada'][data-theme='dark']`.
2. INSERT, where the akanezora blocks were (after wakakusa dark, before ponyo light):

```css
:root[data-palette='kikyo'] {
  --bg: #f4f2f8; --surface: #fbfafd; --ink: #352f45; --muted: #6d6580;
  --line: #e2dded; --accent: #6257a8; --accent2: #776a26; --sel: #eae5f4;
  --accent-ink: #f4f2f8;
}
:root[data-palette='kikyo'][data-theme='dark'] {
  --bg: #171426; --surface: #1d1930; --ink: #e5e1f0; --muted: #9c95b4;
  --line: #302a49; --accent: #a99aec; --accent2: #d9b44a; --sel: #282243;
  --accent-ink: #171426;
}
```

- [ ] **Step 4: Contrast-verify kikyō**

Write to the scratchpad (`/private/tmp/claude-501/-Users-nhattran-Documents-projects-japanese-vocab-app/b231de80-f005-4a28-87c3-bd1f6c93cbb7/scratchpad/contrast-kikyo.mjs`) and run with `node`:

```js
const modes = {
  'kikyo/light': { bg: '#f4f2f8', muted: '#6d6580', accent: '#6257a8', accent2: '#776a26', sel: '#eae5f4', ink: '#352f45' },
  'kikyo/dark': { bg: '#171426', muted: '#9c95b4', accent: '#a99aec', accent2: '#d9b44a', sel: '#282243', ink: '#e5e1f0' },
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
for (const [name, m] of Object.entries(modes)) {
  for (const [label, fg, bgTok] of [
    ['muted-on-bg', m.muted, m.bg], ['accent-on-bg', m.accent, m.bg],
    ['accent2-on-bg', m.accent2, m.bg], ['ink-on-sel', m.ink, m.sel],
  ]) console.log(`${ratio(fg, bgTok) < 4.5 ? 'FAIL' : ' ok '} ${name} ${label}: ${ratio(fg, bgTok).toFixed(2)}`);
}
```

Expected: all 8 pass (the starting values were pre-tuned). If any FAILs, adjust that token minimally keeping hue (in styles.css AND, for accent/accent2, in the kikyo `dots`), update the script's copy, and re-run until 8/8. Document any change old→new in your report.

- [ ] **Step 5: Gates + fallback check**

Run: `npx vitest run && npm run typecheck && npm run build` — all clean.
Then `npm run dev`; in the browser console run `localStorage.setItem('palette','sakuranezu'); location.reload()` and confirm the app loads in ruri (fallback works), then pick 桔梗 in devtools (`document.documentElement.dataset.palette='kikyo'`) and confirm both modes render. Reset: `localStorage.removeItem('palette')`. Kill the dev server.

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "feat: four unique-hue themes with new kikyo purple"
```

---

### Task 2: Pattern prune + stamp always-on

**Files:**
- Modify: `web/src/settings.ts` (PATTERNS; delete stamp API)
- Modify: `web/index.html` (pattern whitelist; delete stamp line)
- Modify: `web/src/PatternDefs.tsx` (3 defs, 3 rects)
- Modify: `web/src/SettingsPanel.tsx` (remove Motion section)
- Modify: `web/src/styles.css` (pattern selectors; delete stamp gate)

**Interfaces:**
- Produces: `PatternId = 'seigaiha' | 'shippo' | 'yabane' | 'none'`; `getStamp`/`setStamp` NO LONGER EXIST (nothing else imports them after this task — verify with grep).

- [ ] **Step 1: Prune PATTERNS and delete the stamp API**

In `web/src/settings.ts`:
1. Replace the `PATTERNS` array with:

```ts
export const PATTERNS = [
  { id: 'seigaiha', label: '青海波' },
  { id: 'shippo', label: '七宝' },
  { id: 'yabane', label: '矢羽根' },
  { id: 'none', label: 'なし' },
] as const;
```

2. Delete the entire `getStamp` and `setStamp` functions (the block from `export function getStamp…` through the closing brace of `setStamp`).

- [ ] **Step 2: Pre-paint script**

In `web/index.html`: change the pattern whitelist line to

```js
          ['seigaiha', 'shippo', 'yabane', 'none'].indexOf(pat) >= 0
```

and DELETE the line `if (localStorage.getItem('stamp') === 'off') d.stamp = 'off';`.

- [ ] **Step 3: PatternDefs**

In `web/src/PatternDefs.tsx`:
1. `const PATTERN_IDS = ['seigaiha', 'shippo', 'yabane'] as const;`
2. Delete the `<pattern id="p-ichimatsu">…</pattern>`, `<pattern id="p-uroko">…</pattern>`, and `<pattern id="p-kasumi">…</pattern>` defs entirely. (The rects prune automatically via PATTERN_IDS.)

- [ ] **Step 4: SettingsPanel**

In `web/src/SettingsPanel.tsx`:
1. Remove `getStamp`, `setStamp` from the settings import list, and delete the `const stamp = useSettingValue(getStamp);` line.
2. Delete the entire `動き Motion` `<section>…</section>` block (the one containing the 判子 button).

- [ ] **Step 5: styles.css**

1. In the pattern-visibility selector list, remove the three lines for `ichimatsu`, `uroko`, `kasumi` so it reads:

```css
:root[data-pattern='seigaiha'] .pat-seigaiha,
:root[data-pattern='shippo'] .pat-shippo,
:root[data-pattern='yabane'] .pat-yabane {
  display: inline;
}
```

2. Delete the rule:

```css
:root[data-stamp='off'] .detail-term.stamp {
  animation: none;
}
```

- [ ] **Step 6: Verify**

Run: `grep -rn "getStamp\|setStamp\|data-stamp\|ichimatsu\|uroko\|kasumi" web/src web/index.html` — expect ZERO hits.
Run: `npx vitest run && npm run typecheck && npm run build` — all clean.
Dev-server spot check: pattern chips show 4 options; `localStorage.setItem('pattern','kasumi'); location.reload()` → seigaiha renders (fallback); word detail still stamps. Kill the server.

- [ ] **Step 7: Commit**

```bash
git add web/
git commit -m "feat: prune patterns to three; stamp always on"
```

---

### Task 3: Petal fix

**Files:**
- Modify: `web/src/ThemeToggle.tsx` (full replacement below)

**Interfaces:**
- Consumes: `getTheme`, `setTheme`, `useSettingValue` (unchanged).
- Produces: petal fires on ANY light→dark transition (☾ or panel chip). No API change — `<ThemeToggle />` still takes no props.

- [ ] **Step 1: Replace ThemeToggle.tsx**

The current implementation appends the petal imperatively inside the button; React's single-text-child fast path wipes it on the same tick's re-render, so it never renders. Replace the file's entire contents with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { getTheme, setTheme, useSettingValue } from './settings';

export default function ThemeToggle() {
  const theme = useSettingValue(getTheme);
  const prevTheme = useRef(theme);
  const [petalKey, setPetalKey] = useState(0);

  // One petal on any light→dark transition, whichever control caused it.
  useEffect(() => {
    if (
      prevTheme.current !== 'dark' &&
      theme === 'dark' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setPetalKey((k) => k + 1);
    }
    prevTheme.current = theme;
  }, [theme]);

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
      {petalKey > 0 && (
        <i
          key={petalKey}
          className="petal"
          aria-hidden="true"
          onAnimationEnd={() => setPetalKey(0)}
        />
      )}
    </button>
  );
}
```

(No CSS changes — `.petal`, `@keyframes petalfall`, and the reduced-motion kill are already in place.)

- [ ] **Step 2: Verify**

Run: `npx vitest run && npm run typecheck && npm run build` — clean.
Dev server: click ☾ → a rose petal drifts down from the button and fades (~0.9s); switch back to light → no petal; open ⚙ and use the Dark chip → petal also fires; reload directly into dark mode → NO petal on load. If Playwright MCP tools are available via ToolSearch, assert `document.querySelector('.petal')` is non-null immediately after the dark switch. Kill the server.

- [ ] **Step 3: Commit**

```bash
git add web/src/ThemeToggle.tsx
git commit -m "fix: render petal through React so it survives the theme re-render"
```

---

### Task 4: App header + search clear button

**Files:**
- Create: `web/src/AppHeader.tsx`
- Modify: `web/src/App.tsx` (header restructure; ✕ button; imports)
- Modify: `web/src/styles.css` (app-header, search-clear styles; thock list)

**Interfaces:**
- Consumes: `SettingsPanel({ onClose })`, `ThemeToggle`, existing `settingsOpen`/`closeSettings`/`settingsBtnRef` state in App.
- Produces: `AppHeader({ settingsOpen, onSettingsToggle, onSettingsClose, settingsBtnRef })`.

- [ ] **Step 1: Create web/src/AppHeader.tsx**

```tsx
import { useEffect, useState } from 'react';
import SettingsPanel from './SettingsPanel';
import ThemeToggle from './ThemeToggle';

interface Status {
  entryCount: number;
  wordCount: number;
}

export default function AppHeader({
  settingsOpen,
  onSettingsToggle,
  onSettingsClose,
  settingsBtnRef,
}: {
  settingsOpen: boolean;
  onSettingsToggle: () => void;
  onSettingsClose: () => void;
  settingsBtnRef: React.RefObject<HTMLButtonElement>;
}) {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/status', { signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : null))
      .then((s) => s && setStatus(s))
      .catch(() => {
        /* subtitle simply stays absent */
      });
    return () => ctrl.abort();
  }, []);

  return (
    <header className="app-header">
      <h1 className="wordmark">語彙</h1>
      {status && (
        <p className="app-subtitle">
          {status.wordCount.toLocaleString('en-US')} words ·{' '}
          {status.entryCount.toLocaleString('en-US')} entries
        </p>
      )}
      <div className="header-buttons">
        <button
          ref={settingsBtnRef}
          type="button"
          className="theme-toggle settings-toggle"
          aria-label="Settings"
          aria-expanded={settingsOpen}
          aria-controls="settings-panel"
          title="Settings"
          onClick={onSettingsToggle}
        >
          ⚙
        </button>
        <ThemeToggle />
      </div>
      {settingsOpen && <SettingsPanel onClose={onSettingsClose} />}
    </header>
  );
}
```

- [ ] **Step 2: Restructure App.tsx**

1. Imports: add `import AppHeader from './AppHeader';`; REMOVE the `SettingsPanel` and `ThemeToggle` imports (they now live in AppHeader).
2. In the JSX, insert `<AppHeader … />` directly after `<PatternDefs />` and slim the search header. The block from `<header className="search-header">` through the input's `.header-row` becomes:

```tsx
      <AppHeader
        settingsOpen={settingsOpen}
        onSettingsToggle={() => setSettingsOpen((o) => !o)}
        onSettingsClose={closeSettings}
        settingsBtnRef={settingsBtnRef}
      />
      <header className="search-header">
        <div className="header-row">
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="上手・じょうず・skilled"
            className="search-input"
            spellCheck={false}
          />
          {searching && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => {
                setQ('');
                inputRef.current?.focus();
              }}
            >
              ✕
            </button>
          )}
        </div>
```

3. DELETE from inside `.search-header`: the old ⚙ button, `<ThemeToggle />`, and the `{settingsOpen && <SettingsPanel onClose={closeSettings} />}` line (all moved into AppHeader). The `filter-tabs` nav, sort-tabs conditional, and `<PatternBand />` stay exactly where they are inside `.search-header`.
4. Everything else in App.tsx (state, effects, `closeSettings`, Esc chain, keyboard handlers) is UNCHANGED.

- [ ] **Step 3: Styles**

Append to `web/src/styles.css`:

```css
/* --- App header ---------------------------------------------------------- */

.app-header {
  position: relative; /* anchors .settings-panel */
  z-index: 30; /* panel must overlay the sticky search header (z 20) */
  display: flex;
  align-items: baseline;
  gap: 1rem;
  padding: 1.4rem 0 0.4rem;
}

.wordmark {
  font-size: 1.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  margin: 0;
  line-height: 1;
}

.app-subtitle {
  color: var(--muted);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  margin: 0;
  flex: 1;
}

.header-buttons {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
  align-self: center;
}

.search-clear {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 1rem;
  padding: 0 0.6rem;
  cursor: pointer;
  font-family: var(--font-ui);
}

.search-clear:hover {
  color: var(--accent);
}

.search-clear:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
```

Then add `.search-clear` to BOTH press-thock lists in the `@media (prefers-reduced-motion: no-preference)` block (the `transition: transform …` selector list and the `:active` selector list), and to the corresponding `transition: none` list in the `@media (prefers-reduced-motion: reduce)` block.

- [ ] **Step 4: Verify**

Run: `npx vitest run && npm run typecheck && npm run build` — clean.
`npm start` (real vault): header shows 語彙 + "9,442 words · 18,725 entries"-style subtitle (numbers will match /api/status); ⚙ and ☾ sit top-right; the panel opens below the header bar and overlays the search area; scrolling a browse list slides the title bar away while search + tabs stay pinned and rows stay under the header; typing shows ✕, clicking it clears and refocuses; `/`, Esc chain, and detail flows unchanged. Kill the server.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat: app header with live counts; search clear button"
```

---

### Task 5: README + full verification sweep

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

In `README.md`, replace the ⚙ settings bullet with:

```markdown
- ⚙ opens Settings: four color themes (瑠璃と月 · 若草 · 桔梗 · ポニョ),
  light/dark, and a traditional pattern for the header bands (青海波 · 七宝 ·
  矢羽根 · none). ☾/☀ is the quick theme switch. Everything persists locally.
```

- [ ] **Step 2: Full sweep against the real vault**

`npm start`; verify: four themes × both modes (kikyō distinctly purple, no near-twins); three patterns + none; stale-setting fallbacks (`palette=mizuhanada` → ruri, `pattern=uroko` → seigaiha; then remove the seeded keys); petal on ☾ and on panel chip, absent dark→light and on dark-mode reload; stamp fires on every detail open (no toggle anywhere); header/subtitle/✕ behaviors; reduced-motion emulation silences everything. Kill the server; port free.

- [ ] **Step 3: Final gate + commit**

Run: `npx vitest run && npm run typecheck && npm run build` — all clean.

```bash
git add README.md
git commit -m "docs: settings reflect four themes and three patterns"
```

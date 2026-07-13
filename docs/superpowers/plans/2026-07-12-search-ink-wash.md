# Search Ink Wash + Icon Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The S4 墨 ink-wash search bar (glass icon, hairline, focus wash, breathing room, lighter placeholder) and borderless `.icon-btn` header buttons with halo/glyph/star hovers.

**Architecture:** Pure CSS + small JSX edits. The `.header-row` becomes the S4 wrapper (hairline + `::before` wash on `:focus-within`); the input's own border moves to the wrapper. `.theme-toggle` styling is retired in favor of a shared `.icon-btn` class (gear keeps `.settings-toggle` for the panel's outside-click guard; theme button gains `.moon-btn`), with glyphs wrapped in `<span className="glyph">` for independent hover transforms.

**Tech Stack:** Existing stack. No new dependencies. Zero backend changes.

**Spec:** `docs/superpowers/specs/2026-07-12-search-bar-ink-wash-design.md`

## Global Constraints

- Work on branch `feature/search-ink-wash` (branch from `main` before Task 1).
- **Frontend only** — nothing under `src/` changes; suite stays 74/74.
- Gates at every commit: `npx vitest run` (74/74), `npm run typecheck`, `npm run build` — all clean.
- Preserve untouched: IME guards, `/` + Esc chain, sticky `.search-header` `z-index: 20`, tab indicator, pattern band, ✕ clear mechanics (absolute right, input `padding-right: 2.2rem`), petal, panel outside-click guard (`.settings-toggle` class must survive on the gear), `aria-*` attributes, placeholder text `上手・じょうず・skilled`.
- All new motion transform/opacity/color only; every new transition joins the `prefers-reduced-motion: reduce` kill list.
- After Task 2: `grep -rn "theme-toggle" web/` must return ZERO hits.
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

```
web/src/App.tsx         # Task 1: glass SVG inserted in .header-row
web/src/styles.css      # Task 1: S4 wrapper chrome; Task 2: icon-btn set
web/src/ThemeToggle.tsx # Task 2: icon-btn moon-btn + glyph/star spans
web/src/AppHeader.tsx   # Task 2: gear becomes icon-btn settings-toggle + glyph span
```

---

### Task 1: S4 ink-wash search bar

**Files:**
- Modify: `web/src/App.tsx` (~line 246, inside `.header-row`)
- Modify: `web/src/styles.css` (search-header/search-input/header-row region ~lines 121–162; the two motion media blocks)

**Interfaces:**
- Produces: `.search-glass` class; `.header-row` as the focus-within wash wrapper. Task 2 does not depend on this task.

- [ ] **Step 1: Add the glass to App.tsx**

In `web/src/App.tsx`, inside `<div className="header-row">`, insert directly BEFORE the `<input`:

```tsx
          <svg
            className="search-glass"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.8-4.8" />
          </svg>
```

(The input and the `{searching && …✕…}` button are unchanged.)

- [ ] **Step 2: Rework the search chrome in styles.css**

Anchored replacements (verify each anchor before editing):

1. `.search-header` — change `padding: 0 0 0.9rem;` to `padding: 1.75rem 0 0.9rem;` (the breathing room; everything else in the rule unchanged).

2. `.search-input` — DELETE the line `border-bottom: 2px solid var(--line);` (the wrapper carries the line now; `border: none;` stays).

3. `.search-input::placeholder` — change `color: var(--muted);` to `color: color-mix(in srgb, var(--muted) 55%, var(--bg));` (keep `font-style: italic;`).

4. `.search-input:focus` — the rule becomes ONLY:

```css
.search-input:focus {
  outline: none;
}
```

5. `.header-row` — replace the whole rule with:

```css
.header-row {
  position: relative;
  isolation: isolate;
  display: flex;
  gap: 0.6rem;
  align-items: center;
  border-bottom: 1px solid var(--line);
}
```

6. Directly after the `.header-row .search-input { … }` rule, add:

```css
.search-glass {
  flex-shrink: 0;
  width: 1.05rem;
  height: 1.05rem;
  color: var(--muted);
  margin-left: 0.1rem;
}

.header-row::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: var(--sel);
  transform: scaleX(0);
  transform-origin: left center;
}

.header-row:focus-within {
  border-bottom-color: var(--accent);
}

.header-row:focus-within::before {
  transform: scaleX(1);
}

.header-row:focus-within .search-glass {
  color: var(--accent);
}
```

7. In the `@media (prefers-reduced-motion: no-preference)` block: add `.header-row,` to the first selector list (the one with `.tab, .search-input, .back` transitioning colors/borders), and add this rule inside the same block:

```css
  .header-row::before {
    transition: transform 200ms cubic-bezier(0.25, 0.9, 0.4, 1);
  }
```

8. In the `@media (prefers-reduced-motion: reduce)` block's `transition: none !important` list, add `.header-row` and `.header-row::before`.

- [ ] **Step 3: Verify**

Run: `npx vitest run && npm run typecheck && npm run build` — all clean.
Live (`npm run dev`, Playwright via ToolSearch if available): clicking into search sweeps the wash left→right behind the text and turns the hairline + glass accent; blur retracts it; there is a clear gap between the app header and the search row; the placeholder is visibly lighter than result glosses; ✕ still appears/clears without width shift; typing works (IME untouched). Kill everything you start.

- [ ] **Step 4: Commit**

```bash
git add web/
git commit -m "feat: ink-wash search bar with glass, hairline, and breathing room"
```

---

### Task 2: Icon-button migration (halo + glyph + star)

**Files:**
- Modify: `web/src/ThemeToggle.tsx`, `web/src/AppHeader.tsx`, `web/src/styles.css`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `.icon-btn` (+ `.settings-toggle` on the gear, `.moon-btn` on the theme button), `.glyph`, `.star`. `theme-toggle` ceases to exist.

- [ ] **Step 1: ThemeToggle JSX**

In `web/src/ThemeToggle.tsx`, the button becomes (logic above it unchanged):

```tsx
    <button
      type="button"
      className="icon-btn moon-btn"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      <span className="glyph">{theme === 'dark' ? '☀' : '☾'}</span>
      <span className="star" aria-hidden="true">
        ✦
      </span>
      {petalKey > 0 && (
        <i
          key={petalKey}
          className="petal"
          aria-hidden="true"
          onAnimationEnd={() => setPetalKey(0)}
        />
      )}
    </button>
```

- [ ] **Step 2: AppHeader gear**

In `web/src/AppHeader.tsx`, change the gear button's className to `"icon-btn settings-toggle"` and wrap its glyph: the button's child `⚙` becomes `<span className="glyph">⚙</span>`. All attributes (ref, aria-*, title, onClick) unchanged.

- [ ] **Step 3: styles.css migration**

1. Replace the three `.theme-toggle` rules at ~lines 164–183 (base block, `:hover`, `:focus-visible`) with:

```css
.icon-btn {
  position: relative;
  isolation: isolate;
  width: 2.4rem;
  height: 2.4rem;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  font-size: 1.05rem;
  padding: 0;
  cursor: pointer;
  font-family: var(--font-ui);
}

.icon-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  z-index: -1;
  background: var(--sel);
  transform: scale(0.4);
  opacity: 0;
}

.icon-btn:hover {
  color: var(--ink);
}

.icon-btn:hover::before {
  transform: scale(1);
  opacity: 1;
}

.icon-btn:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.icon-btn .glyph {
  display: inline-block;
}

.settings-toggle:hover .glyph {
  transform: rotate(60deg);
}

.moon-btn:hover .glyph {
  transform: rotate(-14deg);
}

.moon-btn .star {
  position: absolute;
  top: 0.35rem;
  right: 0.45rem;
  font-size: 0.5rem;
  color: var(--accent2);
  opacity: 0;
  transform: scale(0.3);
}

.moon-btn:hover .star {
  opacity: 1;
  transform: scale(1);
}
```

2. DELETE the standalone rule near ~line 678:

```css
.theme-toggle {
  position: relative;
}
```

(`.icon-btn` carries `position: relative` now; the petal keeps working.)

3. In the `@media (prefers-reduced-motion: no-preference)` block: change `.theme-toggle,` to `.icon-btn,` in BOTH thock lists (the `transition: transform …` list and the `:active` list), and add inside the block:

```css
  .icon-btn::before {
    transition:
      transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity 140ms ease;
  }

  .icon-btn .glyph {
    transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .moon-btn .star {
    transition:
      opacity 160ms ease 60ms,
      transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1) 60ms;
  }
```

4. In the `@media (prefers-reduced-motion: reduce)` list: change `.theme-toggle,` to `.icon-btn,` and extend the same `transition: none !important` list with `.icon-btn::before`, `.icon-btn .glyph`, and `.moon-btn .star`.

- [ ] **Step 4: Zero-reference check + gates**

Run: `grep -rn "theme-toggle" web/` — expect ZERO hits (dist/ may hold stale builds; run `npm run build` first and only judge `web/src` + `web/index.html`, or delete web/dist and rebuild).
Run: `npx vitest run && npm run typecheck && npm run build` — all clean.

- [ ] **Step 5: Full live sweep**

`npm run dev` (Playwright via ToolSearch if available): gear hover → halo blooms + glyph turns 60°; theme hover → halo + glyph rocks −14° + gold star twinkles in; both buttons identical size; press-thock still compresses; focus rings intact; petal still fires on dark switch (both trigger paths); settings panel outside-click still ignores the gear (open panel, mousedown on gear closes-not-reopens correctly); all four palettes look right; reduced-motion emulation freezes wash/halo/glyph/star. Kill everything you start.

- [ ] **Step 6: Commit**

```bash
git add web/
git commit -m "feat: borderless icon buttons with halo, gear turn, and moon star"
```

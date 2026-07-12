# UI Refinements — Design

**Date:** 2026-07-12
**Status:** Approved by user (brainstorming session)
**Builds on:** themes/patterns/motion redesign (merged, commit 4311423). Pure frontend — zero API/database changes.

## Motivation (user feedback after real use)

Six themes proved too many — two pairs read nearly identical (桜鼠≈茜空, 若草≈水縹); the pattern library has three keepers; the petal animation never appears (a real bug); the stamp toggle is unwanted ceremony; the header should be a proper app header (per jisho.org / grammar-reference examples) with search below it; the search box needs a clear (✕) button.

## 1. Four themes (unique hue families)

`PALETTES` in `web/src/settings.ts` becomes exactly, in order:

| id | label | family | notes |
|---|---|---|---|
| `ruri` | 瑠璃と月 | blue | unchanged; default |
| `wakakusa` | 若草 | green | unchanged |
| `kikyo` | 桔梗 | purple | NEW — replaces 茜空/akanezora |
| `ponyo` | ポニョ | orange | unchanged |

`sakuranezu`, `akanezora`, `mizuhanada` are removed from the registry, the pre-paint whitelist, and `styles.css` (their token blocks deleted). Saved `palette` values naming removed ids fall back to `ruri` via the existing whitelist validation (both pre-paint and `getPalette`).

### 桔梗 Kikyō starting values (subject to the standard contrast pass)

- Light: `--bg #f4f2f8` · `--surface #fbfafd` · `--ink #352f45` · `--muted #877f99` · `--line #e2dded` · `--accent #6257a8` · `--accent2 #80702a` (old gold) · `--sel #eae5f4` · `--accent-ink #f4f2f8`
- Dark: `--bg #171426` · `--surface #1d1930` · `--ink #e5e1f0` · `--muted #9c95b4` · `--line #302a49` · `--accent #a99aec` · `--accent2 #d9b44a` · `--sel #282243` · `--accent-ink #171426`

Contrast rule (same as the redesign): muted-on-bg, accent-on-bg, accent2-on-bg, ink-on-sel ≥ 4.5 in both modes; adjust failing tokens minimally keeping hue; mirror accent/accent2 changes into `dots`.

## 2. Three patterns

`PATTERNS` becomes exactly: `seigaiha` 青海波 (default) · `shippo` 七宝 · `yabane` 矢羽根 · `none` なし. The `ichimatsu`/`uroko`/`kasumi` entries, their SVG defs in `PatternDefs.tsx`, their `.pat-*` rect elements and CSS selectors, and their pre-paint whitelist entries are removed. Saved values naming removed patterns fall back to `seigaiha`.

## 3. Petal fix (real bug)

**Root cause:** the petal is created with `appendChild` inside the toggle `<button>`, whose only React child is a single text node; the theme switch immediately re-renders the button and React's single-text-child fast path (`textContent` update) destroys unmanaged DOM children — the petal dies the frame it is born.

**Fix:** render the petal through React. `ThemeToggle` tracks the previous theme in a ref; when the theme value transitions light→dark (from ANY source — the ☾ button or the settings panel chip, both observed via `useSettingValue(getTheme)`), and `prefers-reduced-motion: reduce` is not set, it sets a `petalKey` state; the button renders `<i className="petal" key={petalKey} onAnimationEnd={clear} aria-hidden="true" />`. The ref guard means no petal on initial mount into dark mode. CSS (`.petal`, `@keyframes petalfall`, reduced-motion kill) is unchanged.

## 4. Stamp always on

Removed entirely: the `stamp` localStorage key handling in the pre-paint script, `getStamp`/`setStamp` in `settings.ts`, the `data-stamp` attribute, the `:root[data-stamp='off']` CSS gate, and the 動き section of the settings panel (panel keeps テーマ / 外観 / 文様). The `.detail-term.stamp` animation itself is unchanged and now unconditional (still disabled under reduced-motion). A leftover `stamp` key in localStorage is simply ignored.

## 5. App header

New structure (top to bottom):

1. **`.app-header`** (NOT sticky — scrolls away): left, the wordmark `語彙` with a subtitle showing live counts from one `GET /api/status` fetch on mount, format exactly `` `${wordCount.toLocaleString('en-US')} words · ${entryCount.toLocaleString('en-US')} entries` ``. While loading or on fetch failure the subtitle is simply absent (no error UI). Right side: the ⚙ settings button, then the ☾ theme toggle (existing components, moved here).
2. **`.search-header`** (sticky, `top: 0`, `z-index: 20` — unchanged semantics): the search input row (with the new clear button), the kind tabs + indicator, sort tabs when browsing, and the pattern band.

The settings panel moves with its button: it anchors to `.app-header` (which gains `position: relative` and a `z-index` above the sticky search header) and drops down from the header bar, overlaying the search area. Esc ordering, outside-click, and focus return are unchanged.

Keyboard behavior (`/`, Esc chain, IME guards) and the placeholder are untouched.

## 6. Search clear button

Inside `.header-row` (now inside `.search-header`), after the input: an ✕ button (`className="search-clear"`, `type="button"`, `aria-label="Clear search"`), rendered only when `q.trim().length > 0`. Click: `setQ('')` and refocus the input. Styled like a quiet inline control (muted, accent on hover, focus-visible ring, thock press like other buttons).

## Error handling

- Status fetch failure → no subtitle, no error banner.
- All removed-setting fallbacks handled by existing whitelist validation.

## Testing & verification

- Gates: `npx vitest run` (74/74 untouched backend), `npm run typecheck`, `npm run build`.
- Contrast script (scratchpad) covering kikyō both modes with the standard pairs.
- Live sweep: four themes × light/dark; three patterns + none; removed-value fallback (seed localStorage with `palette=sakuranezu`, `pattern=kasumi` → app loads ruri/seigaiha); petal visible on ☾ AND on panel chip light→dark, absent dark→light and under reduced-motion; stamp always fires on detail open; header layout matches design with counts subtitle; ✕ appears only with text, clears and refocuses; sticky search works with the title bar scrolled away; Esc chain (panel → detail → clear) and IME guards intact.

## Out of scope

Stats view, unparsed-report page, SRS, backend backlog, deferred minors from previous reviews.

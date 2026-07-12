# Themes, Patterns & Motion Settings — Design

**Date:** 2026-07-11
**Status:** Approved by user (brainstorming session with visual previews: https://claude.ai/code/artifact/11214589-7c7d-4386-a8ec-5f08f93161e8)
**Builds on:** Phase 1 + browse views (both merged). Pure frontend — zero API/database changes.

## Motivation (user feedback)

The current Swiss/vermillion design is hard to read (especially the solid dark selection block); the user wants Japanese paper/art-inspired, fantastical, subtle, charming palettes (traditional 伝統色 + Studio Ghibli references), real traditional patterns, tactile "haptic-feel" motion, and a settings panel to switch all of it to taste.

## Scope

Frontend only: `web/` (styles, components, index.html). The backend, API, tests, and search behavior are untouched. The search placeholder changes to `上手・じょうず・skilled`.

## 1. Theme system

Two independent axes, both as attributes on `<html>` set before first paint:

- `data-palette` — one of `ruri` (default), `wakakusa`, `sakuranezu`, `akanezora`, `mizuhanada`, `ponyo`
- `data-theme` — absent (light, default) or `'dark'`

Tokens are defined per palette × mode in `styles.css` as `:root[data-palette='X']` and `:root[data-palette='X'][data-theme='dark']` blocks. A bare `:root` block duplicates ruri-light so the app is styled even before the pre-paint script runs.

### Token set (replaces the current set)

`--bg, --surface, --ink, --muted, --line, --accent, --accent2, --sel, --accent-ink`
plus derived aliases kept for existing CSS: `--line-strong: var(--ink)`, `--focus: var(--accent)`, `--selected-bg: var(--sel)`, `--selected-ink: var(--ink)`.

New semantics: **`--accent2` colors textbook badges** (`.badge.tb` class added to Genki/Quartet badges); **`--sel` is a subtle tinted wash** — selected rows get `background: var(--sel)` and the term text turns `var(--accent)`; there is no inverted block anywhere. `--surface` is the input/panel ground.

### Palette values (exact, from the approved previews)

| Palette | Mode | bg | surface | ink | muted | line | accent | accent2 | sel |
|---|---|---|---|---|---|---|---|---|---|
| ruri | light | #f1f4f9 | #fafbfe | #2b3149 | #7b83a1 | #dbe1ee | #3d5aa5 | #a08428 | #e3e9f6 |
| ruri | dark | #131828 | #191f33 | #dde3f2 | #8b93b4 | #2a3149 | #93acea | #d9b44a | #212a45 |
| wakakusa | light | #f4f6ec | #fbfcf6 | #2e3a2e | #75816e | #dde3d0 | #47795b | #a8842a | #e7eed8 |
| wakakusa | dark | #161c16 | #1c231c | #e2e8da | #93a08c | #2b342b | #82b995 | #d9b04a | #24301f |
| sakuranezu | light | #f9f3f3 | #fefafa | #45383e | #97838c | #ecdcdf | #c26879 | #6e8d64 | #f5e2e7 |
| sakuranezu | dark | #201a1d | #271f23 | #ecdfe3 | #a68f99 | #3a2f34 | #dc93a4 | #93b489 | #33262c |
| akanezora | light | #f7f2f5 | #fdfafb | #3b2f39 | #92808d | #e8dbe3 | #b04452 | #6e68a8 | #f2e2e9 |
| akanezora | dark | #1e1720 | #251c28 | #ecdfe8 | #a48fa1 | #372c3b | #dd8390 | #9d97d6 | #342434 |
| mizuhanada | light | #eef6f4 | #f9fcfb | #23413e | #6b8a85 | #d7e6e2 | #2f7d78 | #c9808e | #ddece8 |
| mizuhanada | dark | #101f1d | #162624 | #dcebe7 | #86a49e | #24403c | #6fc4ba | #e2a7b3 | #1c3330 |
| ponyo | light | #faf1ea | #fefaf6 | #33424d | #94827c | #f0ddd0 | #dd5648 | #2e8388 | #fae3da |
| ponyo | dark | #14232a | #1a2c34 | #ecdfd4 | #93a4a2 | #2a4048 | #f08a7a | #6fc0bd | #263c42 |

`--accent-ink` (text on accent, used rarely): the palette's light bg in light mode, dark bg in dark mode. Display names in the settings panel: 瑠璃と月 / 若草 / 桜鼠 / 茜空 / 水縹 / ポニョ.

## 2. Patterns

Six traditional patterns as inline SVG `<pattern>` defs rendered once by a `PatternDefs` component: `seigaiha` 青海波, `shippo` 七宝, `ichimatsu` 市松, `uroko` 鱗, `yabane` 矢羽根, `kasumi` 霞 — the exact geometry from the preview page. Plus `none`.

- Selected via `data-pattern` on `<html>` (default `seigaiha`).
- Placements (all use the active pattern): a thin band (~16px) under the header tabs; the backdrop strip of the word-detail heading; sentence-timeline month headers (behind the month label).
- Tinted via `currentColor` set to a low-contrast mix of the accent (`color-mix(in srgb, var(--accent) 55%, var(--bg))` at the SVG container, with the band itself at reduced opacity as in the previews).
- `data-pattern='none'` collapses the band elements entirely (no reserved space).

## 3. Motion ("haptic feel")

Exact behaviors and timings from the approved Motion Lab. All motion is `transform`/`opacity` only, and a global `@media (prefers-reduced-motion: reduce)` block disables every one of them unconditionally.

1. **Ink-wash selection** — result/browse row highlight sweeps in from the left via a `::before` pseudo-element `scaleX(0→1)`, `160ms cubic-bezier(0.25, 0.9, 0.4, 1)`; applies to `.result.selected` and hover.
2. **Press "thock"** — interactive buttons (tabs, sort tabs, load-more, theme toggle, settings controls) compress on `:active`: `scale(0.98) translateY(1px)` at 90ms ease-out down, `180ms cubic-bezier(0.34, 1.56, 0.64, 1)` release.
3. **Hanko stamp** — the word-detail term block animates on mount: `scale(1.15) rotate(-1.5deg) → 1` with 60% keyframe overshoot, `220ms cubic-bezier(0.2, 1.2, 0.4, 1)`. **Toggleable in settings (`stamp`), on by default.**
4. **Sliding tab indicator** — the kind-tab active underline becomes a single absolutely-positioned element that glides (`left`/`width`, `200ms cubic-bezier(0.34, 1.4, 0.64, 1)`) between tabs, measured from the active button (recomputed on tab click and window resize).
5. **Results cascade** — rows of a *fresh* result set (new search response or browse page 0) rise in: `180ms ease-out`, 5px translateY + fade, 22ms stagger, capped at the first 12 rows (later rows appear instantly). Never applied to Load-more appends.
6. **Petal on dark** — switching the theme toggle to dark spawns one petal element (`--accent2`-tinted in sakuranezu; the default rose #dc93a4 elsewhere) that drifts down-right with rotation over 900ms and removes itself. One-shot; light-switch has no petal.

## 4. Settings panel

A ⚙ button in `.header-row` (left of the ☾ toggle) opens a settings panel as a small overlay card anchored under the header (`role="dialog"`, `aria-label="Settings"`, closed by Esc, the ⚙ button, or clicking outside; focus moves into the panel on open and back to ⚙ on close).

Contents (all apply instantly, no save button):
- **テーマ Theme** — six swatch-chips (three-dot preview: bg/accent/accent2) with Japanese names; `aria-pressed` semantics.
- **外観 Appearance** — Light / Dark segmented pair (kept in sync with the ☾ toggle; both write the same state).
- **文様 Pattern** — seven chips (six mini pattern previews + None).
- **動き Motion** — one toggle: 判子 stamp on word detail (on/off).

The ☾ quick toggle stays in the header. The existing two-stage Escape behavior gains one stage: if the settings panel is open, Esc closes it first (then detail, then clears search).

## 5. Persistence & pre-paint

localStorage keys (all optional; missing/invalid values fall back to defaults):
- `theme` = `'dark'` (existing key, unchanged semantics)
- `palette` = one of the six ids (default `ruri`)
- `pattern` = one of the six ids or `'none'` (default `seigaiha`)
- `stamp` = `'off'` to disable (default on)

The `index.html` pre-paint script extends to set `data-palette`, `data-theme`, and `data-pattern` from localStorage (with a whitelist check so a stale/garbage value can't select a non-existent palette) before the bundle loads — no flash of default theme. React state (a small `useSettings` hook/module) initializes from the DOM attributes, so script and app never disagree.

## 6. Structure

- `web/src/settings.ts` — palette/pattern/motion registry (ids, display names, defaults), read/write helpers around localStorage + `<html>` attributes. Single source of truth; the pre-paint script duplicates only the whitelist (kept in sync by a comment cross-reference).
- `web/src/SettingsPanel.tsx` — the dialog.
- `web/src/PatternDefs.tsx` — SVG defs + the `PatternBand` element used by header/detail/timeline.
- `web/src/ThemeToggle.tsx` — gains the petal spawn.
- `App.tsx` — ⚙ button, panel open state, Esc ordering, cascade class on fresh result sets, sliding tab indicator.
- `WordDetail.tsx` — stamp class on the term heading.
- `styles.css` — token blocks ×12, pattern band styles, motion styles, settings panel styles; the old Swiss-specific styles (inverted selection, vermillion constants) are removed.

## 7. Error handling

- localStorage unavailable → in-memory settings for the session, defaults on reload; never crashes.
- Whitelist validation on every read; unknown stored ids → default.
- Panel is purely presentational; no network calls.

## 8. Testing & verification

- Backend suite untouched and must stay green; `npm run typecheck` + `npm run build` gates.
- Live verification (dev server, headless where possible): all six palettes × both modes render with legible contrast; pattern switch updates all placements; None removes bands; stamp toggle honored; Esc ordering (panel → detail → clear); persistence across reload; reduced-motion disables all six motions; IME guards unaffected.
- Contrast spot-check: `--muted` on `--bg` and `--accent` on `--bg` ≥ WCAG AA for body-size text in all 12 combinations (adjust a token minimally if a pair fails, keeping hue).

## Out of scope

Stats view, unparsed-report page, SRS (Phase 3), backend backlog items, asanoha/kikkō/sayagata patterns (future additions to the registry).

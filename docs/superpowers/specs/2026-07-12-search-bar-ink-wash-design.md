# Search Bar Ink Wash + Icon Buttons — Design

**Date:** 2026-07-12
**Status:** Approved by user (chose 案 S4 墨 Ink Wash + the icon-button hover lab as shown, from https://claude.ai/code/artifact/65cdd82b-1c9a-43a9-b1da-8dec13e72b25)
**Builds on:** UI refinements (merged, b855a95). Pure frontend — zero API/database changes.

## 1. Search bar (S4 墨 Ink Wash)

The `.header-row` in the sticky `.search-header` becomes the S4 composite:

- **Structure:** magnifying-glass SVG + input + existing ✕ clear button inside one wrapper (`.header-row` itself). Glass: inline SVG (`viewBox="0 0 24 24"`, circle cx11 cy11 r7 + handle `M21 21l-4.8-4.8`, `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"`), 1.05rem square, `aria-hidden="true"`, color `var(--muted)`.
- **Field chrome:** the input loses its own bottom border; the wrapper carries a 1px bottom hairline `var(--line)` and `position: relative; isolation: isolate;`. The wrapper's `::before` is the ink wash: `inset: 0; z-index: -1; background: var(--sel); transform: scaleX(0); transform-origin: left center; transition: transform 200ms cubic-bezier(0.25, 0.9, 0.4, 1);`.
- **Focus (`:focus-within` on the wrapper):** wash sweeps to `scaleX(1)`; hairline color → `var(--accent)`; glass color → `var(--accent)`. The input keeps `outline: none` (the wash + line are the focus indication); `:focus-visible` ring unnecessary here since the wash change is a strong visible indicator.
- **Breathing room:** the search row sits **1.75rem** below the app header bar (adjust `.search-header` top padding; the flush look was the complaint).
- **Placeholder:** `color: color-mix(in srgb, var(--muted) 55%, var(--bg))`, italic (as today).
- **✕ button:** stays absolutely positioned at the wrapper's right (unchanged mechanics; input keeps its `padding-right`). It renders above the wash (wash is `z-index: -1`).
- Untouched: input font size (1.55rem), sticky behavior, `z-index: 20`, IME guards, `/` and Esc behavior, tab indicator, pattern band.
- Reduced motion: the wash transition joins the global `prefers-reduced-motion: reduce` kill list (state still switches instantly).

## 2. Icon buttons (⚙ and ☾/☀)

A new shared `.icon-btn` class replaces the `.theme-toggle` styling for both header buttons (this also retires the deferred ".theme-toggle class shared by two buttons" naming footgun):

- **Base:** no border, transparent background, `width/height: 2.4rem`, `display: grid; place-items: center;`, `border-radius: 50%`, `color: var(--muted)`, `font-size: 1.05rem` (both glyphs identical size), `position: relative; isolation: isolate; cursor: pointer;`.
- **Halo hover:** `::before` circle (`inset: 0; border-radius: 50%; z-index: -1; background: var(--sel)`), rest state `transform: scale(0.4); opacity: 0;`, hover `scale(1); opacity: 1;` with `transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 140ms ease`. Hover also sets glyph color to `var(--ink)`.
- **Glyph animations:** each button's glyph is wrapped in `<span className="glyph">` with `transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)`. Gear (`.settings-toggle`): hover rotates the glyph 60°. Theme button: hover rocks the glyph −14° AND reveals `<span className="star">✦</span>` (absolute, top-right of the button, `color: var(--accent2)`, `font-size: 0.5rem`), fading/springing in with a 60ms delay.
- **Kept:** press-thock on `:active` (selector lists updated from `.theme-toggle` to `.icon-btn`), `:focus-visible` ring, `aria-label`/`title`/`aria-expanded`/`aria-controls`, the `.settings-toggle` class on the gear (the settings panel's outside-click guard targets it), and the petal (a sibling of the glyph spans; unaffected by the halo, which is `z-index: -1`).
- **Class migration:** every `.theme-toggle` CSS selector (base style, thock lists, reduced-motion list, `position: relative` for the petal) becomes `.icon-btn`; JSX classNames update in `ThemeToggle.tsx` (`icon-btn`) and `AppHeader.tsx` (`icon-btn settings-toggle`). Grep must show zero remaining `.theme-toggle` references.
- Reduced motion: halo, glyph, and star transitions join the kill list.

## Error handling

None new — pure presentation.

## Testing & verification

- Gates: `npx vitest run` (74/74), `npm run typecheck`, `npm run build`.
- Live: focus sweeps the wash in and the glass/line turn accent, in all four palettes × both modes; blur retracts; ✕ still clears/refocuses without input width shift; 1.75rem gap visible below header; gear turns and moon rocks + star on hover with halo; petal still fires on dark switch; outside-click on the panel still guards the gear; reduced-motion silences wash/halo/glyph/star; IME typing unaffected.

## Out of scope

Everything else (stats, SRS, backend backlog).

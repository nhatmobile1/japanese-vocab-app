# Transient Hover vs. Keyboard Cursor — Design

**Date:** 2026-07-13 · **Status:** Approved by user · Frontend only.

**Behavior:** Word-row highlight separates into two states. `hover` (transient): set by mouse-enter on a row, cleared when the pointer leaves the list. `sel` (keyboard cursor): moved by ↑/↓, persists. The visible wash sits on `hover ?? sel`; Enter opens `rows[hover ?? sel]`; arrow keys continue from the currently highlighted row (adopting the hover position) and clear `hover`. Fresh result sets (new search / browse page 0) reset both (`sel` 0, `hover` null). Applies to both the search results list and the browse words list (shared `WordRows`); the sentences timeline stays non-interactive.

**Mechanism:** `hover: number | null` state in App; `WordRows` props become `{ rows, highlight, onHover, onOpen }` (row class on `i === highlight`, `onMouseEnter` → `onHover(i)`); both `<ul className="results">` elements get `onMouseLeave` → `onHover(null)`. Keyboard handler: ArrowDown `setSel(Math.min((hover ?? sel) + 1, rows.length - 1))`, ArrowUp `Math.max((hover ?? sel) - 1, 0)`, both then `setHover(null)`; Enter uses `hover ?? sel`.

**Unchanged:** IME guards, Esc chain, `/`, click-to-open, cascade animation, all CSS (`.result.selected` styling is reused for the unified highlight).

**Verification:** gates (74/74, typecheck, build) + live: hover washes a row, leaving the list returns the wash to the keyboard cursor (row 0 on fresh search); arrows continue from a hovered row; Enter opens the visibly washed row in both mouse and keyboard flows; browse list matches search list behavior.

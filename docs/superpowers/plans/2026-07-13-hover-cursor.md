# Transient Hover Cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hover highlight clears when the pointer leaves the list, falling back to the persistent keyboard cursor; Enter always opens the visibly highlighted row.
**Spec:** `docs/superpowers/specs/2026-07-13-hover-cursor-design.md`

## Global Constraints

- Branch `feature/hover-cursor` (from `main`). Frontend only — only `web/src/App.tsx` changes. Gates: `npx vitest run` (74/74), `npm run typecheck`, `npm run build`.
- Preserve: IME guards in both handlers, Esc chain, `/`, cascade `key={wave}` mechanics, all CSS untouched.
- Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Separate hover from the keyboard cursor (web/src/App.tsx only)

- [ ] **Step 1:** Change `WordRows` to highlight-based props. Its signature and row become:

```tsx
function WordRows({
  rows,
  highlight,
  onHover,
  onOpen,
}: {
  rows: SearchResultWord[];
  highlight: number;
  onHover: (i: number | null) => void;
  onOpen: (r: SearchResultWord) => void;
}) {
  return (
    <>
      {rows.map((r, i) => (
        <li
          key={`${r.normTerm ?? r.term}-${i}`}
          className={i === highlight ? 'result selected' : 'result'}
          style={{ '--i': Math.min(i, 12) } as React.CSSProperties}
          onClick={() => onOpen(r)}
          onMouseEnter={() => onHover(i)}
        >
```

(badges/spans inside the row unchanged.)

- [ ] **Step 2:** In `App()`: add `const [hover, setHover] = useState<number | null>(null);` after the `sel` state. Add `const highlight = hover ?? sel;` right after the `navRows` line.

- [ ] **Step 3:** Reset hover with fresh sets: in the search effect where `setSel(0)` runs, add `setHover(null);` — same in the browse page-0 effect next to its `setSel(0)`.

- [ ] **Step 4:** Keyboard handler (`onInputKey`) — arrows continue from the highlight and clear hover; Enter opens the highlight:

```tsx
  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel(Math.min(highlight + 1, navRows.length - 1));
      setHover(null);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel(Math.max(highlight - 1, 0));
      setHover(null);
    } else if (e.key === 'Enter' && navRows[highlight]) {
      setDetail(navRows[highlight]);
    }
  };
```

- [ ] **Step 5:** Both results `<ul>`s (search branch and browse words branch) gain `onMouseLeave={() => setHover(null)}` and pass the new props:

```tsx
        <ul className="results cascade" key={wave} onMouseLeave={() => setHover(null)}>
          <WordRows rows={results} highlight={highlight} onHover={setHover} onOpen={setDetail} />
```

(browse branch identical with `rows={words}`.)

- [ ] **Step 6:** Gates; live check (`npm run dev`, Playwright via ToolSearch if available): hover row 3 → wash on row 3; move pointer off the list → wash returns to row 0; press ↓ after hovering row 3 → wash moves to row 4 (continues from hover); Enter opens the washed row in both flows; browse list behaves identically; clicking rows still opens detail. Kill everything started.

- [ ] **Step 7:** Commit: `feat: hover highlight is transient; keyboard cursor persists`

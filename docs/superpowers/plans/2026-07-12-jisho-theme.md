# 辞書 Jisho Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 辞書 (Dictionary Editorial) palette as a fifth selectable theme.
**Architecture:** Purely additive: one registry line, one whitelist id, two CSS token blocks, contrast-verified.
**Tech Stack:** Existing. Zero backend changes.
**Spec:** `docs/superpowers/specs/2026-07-12-jisho-theme-design.md` (token table lives there — copy values exactly).

## Global Constraints

- Branch `feature/jisho-theme` (from `main`). Frontend only. Gates: `npx vitest run` (74/74), `npm run typecheck`, `npm run build`.
- Existing four palettes byte-untouched. README settings bullet gains 辞書 in the theme list.
- Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: Add the jisho palette

**Files:** Modify `web/src/settings.ts`, `web/index.html`, `web/src/styles.css`, `README.md`.

- [ ] **Step 1:** In `web/src/settings.ts` PALETTES, append after the ponyo line:

```ts
  { id: 'jisho', label: '辞書', dots: ['#ffffff', '#c73e3a', '#3d5a80'] },
```

- [ ] **Step 2:** In `web/index.html`, the palette whitelist becomes `['ruri', 'wakakusa', 'kikyo', 'ponyo', 'jisho']`.

- [ ] **Step 3:** In `web/src/styles.css`, after the ponyo dark block, insert:

```css
:root[data-palette='jisho'] {
  --bg: #ffffff; --surface: #f4f5f6; --ink: #1a1d21; --muted: #5f656b;
  --line: #d9dcdf; --accent: #c73e3a; --accent2: #3d5a80; --sel: #f8e7e6;
  --accent-ink: #ffffff;
}
:root[data-palette='jisho'][data-theme='dark'] {
  --bg: #16181b; --surface: #1d2024; --ink: #e8eaec; --muted: #9aa0a6;
  --line: #33373c; --accent: #e06d66; --accent2: #7e9cc4; --sel: #35272a;
  --accent-ink: #16181b;
}
```

- [ ] **Step 4:** README settings bullet: theme list becomes `(瑠璃と月 · 若草 · 桔梗 · ポニョ · 辞書)`.

- [ ] **Step 5:** Contrast script (scratchpad, same shape as previous palettes: muted/accent/accent2-on-bg + ink-on-sel, both modes, 8 checks) — all ≥ 4.5; adjust minimally keeping hue if any fail (mirror accent/accent2 into dots), document old→new.

- [ ] **Step 6:** Gates; live check (`npm run dev`): pick 辞書 in ⚙ — white dictionary paper + vermillion in light, ink-night in dark; persists across reload; other four palettes unchanged. Kill everything started.

- [ ] **Step 7:** Commit: `feat: jisho dictionary-editorial theme from the grammar app palette`

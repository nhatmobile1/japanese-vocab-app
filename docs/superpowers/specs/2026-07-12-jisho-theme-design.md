# 辞書 Jisho Theme — Design

**Date:** 2026-07-12 · **Status:** Approved by user · Purely additive fifth palette; zero other changes.

Source: the sibling grammar app's "Dictionary Editorial" palette (`/Users/nhattran/documents/projects/japanese-grammar-app/index.html` `:root` block) — ink on white paper, vermillion accent, indigo secondary. Dark mode is a derivation (the source app is light-only).

Registry entry (position 5, after ponyo): `{ id: 'jisho', label: '辞書', dots: ['#ffffff', '#c73e3a', '#3d5a80'] }`. Pre-paint palette whitelist gains `'jisho'`.

| token | light | dark |
|---|---|---|
| --bg | #ffffff | #16181b |
| --surface | #f4f5f6 | #1d2024 |
| --ink | #1a1d21 | #e8eaec |
| --muted | #5f656b | #9aa0a6 |
| --line | #d9dcdf | #33373c |
| --accent | #c73e3a | #e06d66 |
| --accent2 | #3d5a80 | #7e9cc4 |
| --sel | #f8e7e6 | #35272a |
| --accent-ink | #ffffff | #16181b |

(Muted deliberately uses the source's `--text-tertiary` #5f656b, not `--ink-faint` #878d93, which fails AA for gloss text.)

Contrast rule (standard): muted/accent/accent2-on-bg and ink-on-sel ≥ 4.5 in both modes; adjust minimally keeping hue if the script disagrees with the pre-computed values; mirror accent/accent2 changes into `dots`.

Verification: gates (74/74, typecheck, build) + contrast script + live check that 辞書 renders in both modes and persists.

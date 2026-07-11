# Japanese Vocab App

Instant lookup over 2+ years of italki lesson notes plus Genki/Quartet
vocabulary, indexed read-only from an Obsidian vault.

## Usage

    npm start          # build UI, index the vault, serve http://localhost:3456
    npm run dev        # dev mode: API on :3456, hot-reloading UI on :5173
    npm test           # parser + search + API tests
    npm run typecheck

The vault is watched — new lesson notes saved in Obsidian appear in search
within a couple of seconds. The SQLite file (`data/vocab.db`) is a disposable
cache, rebuilt from the vault on every start.

## Search

- Kanji (還付), kana (かんぷ / カンプ), or English (refund) — one box.
- `/` focuses search · ↑↓ select · Enter opens word detail · Esc goes back.
- Tabs filter All / Vocab / Grammar / Sentences.
- `/api/unparsed` lists vault lines the parser couldn't classify.

## Config (env vars)

| Var          | Default                                                        |
| ------------ | -------------------------------------------------------------- |
| `VAULT_PATH` | `/Users/nhattran/documents/obsidian-main/nhat-mind/efforts/japanese-learning` |
| `DB_PATH`    | `data/vocab.db`                                                |
| `PORT`       | `3456`                                                         |

## Phase 2/3 (planned)

Browse by month/chapter, stats, then SRS review. See
`docs/superpowers/specs/2026-07-05-japanese-vocab-app-design.md`.

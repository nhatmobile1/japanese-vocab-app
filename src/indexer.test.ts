import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type Database from 'better-sqlite3';
import { openDb } from './db.js';
import { indexVault, reindexFile, removeFile } from './indexer.js';
import { makeFixtureVault } from '../tests/fixture.js';

let vault: string;
let db: Database.Database;

beforeAll(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-fixture-'));
  makeFixtureVault(vault);
  db = openDb(':memory:');
  indexVault(db, vault);
});

afterAll(() => {
  db.close();
  fs.rmSync(vault, { recursive: true, force: true });
});

describe('indexVault', () => {
  test('indexes lesson, textbook, and grammar entries; skips _files and index files', () => {
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    // 6 top-level lesson entries (4 vocab incl duplicate 還付, 1 sentence, 1 grammar) + 1 child
    expect(count(`SELECT COUNT(*) AS n FROM entries WHERE source_type = 'lesson'`)).toBe(7);
    expect(count(`SELECT COUNT(*) AS n FROM entries WHERE source_type = 'quartet'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM entries WHERE source_type = 'genki'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM entries WHERE source_type = 'grammar-note'`)).toBe(1);
  });

  test('children carry parent_id', () => {
    const child = db
      .prepare(`SELECT * FROM entries WHERE gloss = 'tax refund'`)
      .get() as { parent_id: number | null };
    expect(child.parent_id).not.toBe(null);
  });

  test('unknown-callout bullets land in unparsed', () => {
    const rows = db.prepare(`SELECT * FROM unparsed`).all() as { reason: string }[];
    expect(rows.some((r) => r.reason === 'bullet in unknown callout')).toBe(true);
  });

  test('words groups across sources: 流れる has lesson + quartet occurrences', () => {
    const w = db
      .prepare(`SELECT * FROM words WHERE term = '流れる'`)
      .get() as { occurrence_count: number; sources: string; lesson_count: number };
    expect(w.occurrence_count).toBe(2);
    expect(w.lesson_count).toBe(1);
    const sources = JSON.parse(w.sources) as { sourceType: string; sourceRef: string }[];
    expect(sources.map((s) => s.sourceType).sort()).toEqual(['lesson', 'quartet']);
  });

  test('words tracks first/last seen lesson dates for repeated word', () => {
    const w = db
      .prepare(`SELECT * FROM words WHERE term = '還付'`)
      .get() as { occurrence_count: number; first_seen: string; last_seen: string };
    expect(w.occurrence_count).toBe(2);
    expect(w.first_seen).toBe('2025-06-01');
    expect(w.last_seen).toBe('2025-06-02');
  });
});

describe('reindexFile / removeFile', () => {
  test('reindexing a changed file replaces its rows', () => {
    const rel = 'Vocabulary/Genki/Genki-L08.md';
    const p = path.join(vault, rel);
    fs.writeFileSync(
      p,
      fs.readFileSync(p, 'utf8') + '> -   曇り（くもり） - cloudy weather *n.*\n',
    );
    reindexFile(db, vault, rel);
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM entries WHERE source_type = 'genki'`).get() as { n: number }).n;
    expect(n).toBe(2);
  });

  test('removeFile deletes rows and rebuilds words', () => {
    removeFile(db, 'Vocabulary/Quartet-1/Quartet-L05.md');
    const w = db.prepare(`SELECT * FROM words WHERE term = '流れる'`).get() as { occurrence_count: number };
    expect(w.occurrence_count).toBe(1);
  });
});

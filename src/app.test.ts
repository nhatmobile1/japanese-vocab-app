import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type Database from 'better-sqlite3';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { indexVault } from './indexer.js';
import { makeFixtureVault } from '../tests/fixture.js';

let vault: string;
let db: Database.Database;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), 'vocab-app-'));
  makeFixtureVault(vault);
  db = openDb(':memory:');
  indexVault(db, vault);
  app = createApp(db);
});

afterAll(() => {
  db.close();
  fs.rmSync(vault, { recursive: true, force: true });
});

describe('GET /api/search', () => {
  test('returns ranked results', async () => {
    const res = await app.request('/api/search?q=refund');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { term: string }[] };
    expect(body.results[0].term).toBe('還付');
  });

  test('empty query returns empty results, not an error', async () => {
    const res = await app.request('/api/search?q=');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { results: unknown[] }).results).toHaveLength(0);
  });
});

describe('GET /api/word/:normTerm', () => {
  test('returns occurrences with children and mentions', async () => {
    const res = await app.request(`/api/word/${encodeURIComponent('還付')}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      word: { term: string; occurrence_count: number };
      occurrences: { source_ref: string; children: unknown[] }[];
      mentions: { raw: string }[];
    };
    expect(body.word.term).toBe('還付');
    expect(body.occurrences).toHaveLength(2);
    // the sentence 還付（かんぷ）をもらいました and the child 税金の還付 mention it
    expect(body.mentions.length).toBeGreaterThanOrEqual(1);
  });

  test('unknown word returns 404', async () => {
    const res = await app.request('/api/word/zzzzzz');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/status and /api/unparsed', () => {
  test('status reports counts', async () => {
    const body = (await (await app.request('/api/status')).json()) as {
      entryCount: number;
      wordCount: number;
      unparsedCount: number;
    };
    expect(body.entryCount).toBeGreaterThan(5);
    expect(body.wordCount).toBeGreaterThan(3);
    expect(body.unparsedCount).toBeGreaterThanOrEqual(1);
  });

  test('unparsed lists flagged lines', async () => {
    const body = (await (await app.request('/api/unparsed')).json()) as {
      rows: { reason: string }[];
    };
    expect(body.rows.some((r) => r.reason === 'bullet in unknown callout')).toBe(true);
  });
});

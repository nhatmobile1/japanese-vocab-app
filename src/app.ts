import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { search } from './search.js';

export function createApp(db: Database.Database): Hono {
  const app = new Hono();

  app.get('/api/search', (c) => {
    const q = c.req.query('q')?.trim() ?? '';
    const kind = c.req.query('kind') ?? 'all';
    if (!q) return c.json({ query: q, results: [] });
    return c.json({ query: q, results: search(db, q, kind) });
  });

  app.get('/api/word/:normTerm', (c) => {
    const normTerm = decodeURIComponent(c.req.param('normTerm'));
    const word = db.prepare('SELECT * FROM words WHERE norm_term = ?').get(normTerm);
    const parents = db
      .prepare(
        `SELECT * FROM entries WHERE norm_term = ? AND parent_id IS NULL
         ORDER BY source_type, source_ref DESC`,
      )
      .all(normTerm) as { id: number }[];
    if (!word && parents.length === 0) return c.json({ error: 'not found' }, 404);

    const childStmt = db.prepare('SELECT * FROM entries WHERE parent_id = ? ORDER BY line');
    const occurrences = parents.map((p) => ({ ...p, children: childStmt.all(p.id) }));
    const mentions = db
      .prepare(
        `SELECT * FROM entries
         WHERE raw_f LIKE ? ESCAPE '\\' AND (norm_term IS NULL OR norm_term != ?)
         ORDER BY source_ref DESC LIMIT 100`,
      )
      .all(`%${normTerm.replace(/[\\%_]/g, (ch) => '\\' + ch)}%`, normTerm);

    return c.json({ word: word ?? null, occurrences, mentions });
  });

  app.get('/api/status', (c) => {
    const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    return c.json({
      entryCount: n('SELECT COUNT(*) AS n FROM entries'),
      wordCount: n('SELECT COUNT(*) AS n FROM words'),
      unparsedCount: n('SELECT COUNT(*) AS n FROM unparsed'),
      fileCount: n('SELECT COUNT(DISTINCT file) AS n FROM entries'),
    });
  });

  app.get('/api/unparsed', (c) => {
    return c.json({ rows: db.prepare('SELECT * FROM unparsed ORDER BY file, line').all() });
  });

  return app;
}

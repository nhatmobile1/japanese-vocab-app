import Database from 'better-sqlite3';

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createSchema(db);
  return db;
}

export function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term TEXT,
      reading TEXT,
      gloss TEXT,
      raw TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('vocab','grammar','sentence')),
      source_type TEXT NOT NULL CHECK (source_type IN ('lesson','genki','quartet','grammar-note')),
      source_ref TEXT NOT NULL,
      section TEXT,
      file TEXT NOT NULL,
      line INTEGER NOT NULL,
      parent_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,
      norm_term TEXT,
      term_f TEXT,
      reading_f TEXT,
      gloss_f TEXT,
      raw_f TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entries_file ON entries(file);
    CREATE INDEX IF NOT EXISTS idx_entries_norm ON entries(norm_term);
    CREATE INDEX IF NOT EXISTS idx_entries_parent ON entries(parent_id);

    CREATE TABLE IF NOT EXISTS words (
      norm_term TEXT PRIMARY KEY,
      term TEXT NOT NULL,
      reading TEXT,
      gloss TEXT,
      occurrence_count INTEGER NOT NULL,
      lesson_count INTEGER NOT NULL,
      sources TEXT NOT NULL,
      first_seen TEXT,
      last_seen TEXT
    );

    CREATE TABLE IF NOT EXISTS unparsed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file TEXT NOT NULL,
      line INTEGER NOT NULL,
      text TEXT NOT NULL,
      reason TEXT NOT NULL
    );
  `);
}

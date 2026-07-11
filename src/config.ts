export const config = {
  vaultPath:
    process.env.VAULT_PATH ??
    '/Users/nhattran/documents/obsidian-main/nhat-mind/efforts/japanese-learning',
  dbPath: process.env.DB_PATH ?? 'data/vocab.db',
  port: Number(process.env.PORT ?? 3456),
};

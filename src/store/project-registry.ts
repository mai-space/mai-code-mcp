import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import type { ProjectRecord } from './store.js';

function getRegistryPath(): string {
  const dir = join(homedir(), '.mai-code');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, 'registry.db');
}

export class ProjectRegistry {
  private db: Database.Database;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath ?? getRegistryPath());
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        name TEXT PRIMARY KEY,
        rootPath TEXT NOT NULL,
        model TEXT NOT NULL,
        dimensions INTEGER NOT NULL,
        store TEXT NOT NULL,
        chunkCount INTEGER NOT NULL DEFAULT 0,
        fileCount INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '{}',
        createdAt TEXT NOT NULL,
        lastIndexedAt TEXT NOT NULL
      )
    `);
  }

  upsert(record: ProjectRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO projects (name, rootPath, model, dimensions, store, chunkCount, fileCount, tags, createdAt, lastIndexedAt)
      VALUES (@name, @rootPath, @model, @dimensions, @store, @chunkCount, @fileCount, @tags, @createdAt, @lastIndexedAt)
      ON CONFLICT(name) DO UPDATE SET
        rootPath = excluded.rootPath,
        model = excluded.model,
        dimensions = excluded.dimensions,
        store = excluded.store,
        chunkCount = excluded.chunkCount,
        fileCount = excluded.fileCount,
        tags = excluded.tags,
        lastIndexedAt = excluded.lastIndexedAt
    `);
    stmt.run({
      ...record,
      tags: JSON.stringify(record.tags),
    });
  }

  get(name: string): ProjectRecord | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE name = ?');
    const row = stmt.get(name) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToRecord(row);
  }

  list(): ProjectRecord[] {
    const stmt = this.db.prepare('SELECT * FROM projects ORDER BY name');
    const rows = stmt.all() as Record<string, unknown>[];
    return rows.map((r) => this.rowToRecord(r));
  }

  delete(name: string): void {
    const stmt = this.db.prepare('DELETE FROM projects WHERE name = ?');
    stmt.run(name);
  }

  deleteAll(): void {
    this.db.exec('DELETE FROM projects');
  }

  private rowToRecord(row: Record<string, unknown>): ProjectRecord {
    return {
      name: row.name as string,
      rootPath: row.rootPath as string,
      model: row.model as string,
      dimensions: row.dimensions as number,
      store: row.store as string,
      chunkCount: row.chunkCount as number,
      fileCount: row.fileCount as number,
      tags: JSON.parse(row.tags as string) as Record<string, string>,
      createdAt: row.createdAt as string,
      lastIndexedAt: row.lastIndexedAt as string,
    };
  }

  close(): void {
    this.db.close();
  }
}

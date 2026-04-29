import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './user/index.js'
import { getConfig } from '../config/index.js'

let _db: ReturnType<typeof drizzle> | null = null
let _sqlite: Database.Database | null = null

function getSqlite(): Database.Database {
  if (_sqlite) return _sqlite
  const config = getConfig()
  _sqlite = new Database(config.DATABASE_URL)
  _sqlite.pragma('journal_mode = WAL')
  _sqlite.pragma('foreign_keys = ON')
  return _sqlite
}

export function getDb() {
  if (_db) return _db
  const sqlite = getSqlite()
  _db = drizzle(sqlite, { schema })
  return _db
}

export function closeDb() {
  _sqlite?.close()
  _sqlite = null
  _db = null
}

export function initDb() {
  const sqlite = getSqlite()
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)
}

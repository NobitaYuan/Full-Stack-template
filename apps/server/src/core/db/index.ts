import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as userSchema from './user/index.js'
import * as agentSchema from './agent/index.js'
import { getConfig } from '../config/index.js'

const schema = { ...userSchema, ...agentSchema }

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
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '新对话',
      agent_session_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      subtype TEXT,
      session_id_sdk TEXT,
      parent_tool_use_id TEXT,
      raw TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)
}

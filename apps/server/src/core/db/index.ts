import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'
import { getConfig } from '../config/index.js'

type Database = ReturnType<typeof drizzle<typeof schema>>

let _sql: ReturnType<typeof postgres> | null = null
let _db: Database | null = null

function getSql() {
  if (_sql) return _sql
  const config = getConfig()
  _sql = postgres(config.DATABASE_URL)
  return _sql
}

export function getDb(): Database {
  if (_db) return _db
  const sql = getSql()
  _db = drizzle(sql, { schema })
  return _db
}

export async function closeDb() {
  if (_sql) {
    await _sql.end()
    _sql = null
    _db = null
  }
}

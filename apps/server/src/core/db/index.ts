import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as userSchema from './user/index.js'
import * as agentSchema from './agent/index.js'
import { getConfig } from '../config/index.js'

const schema = { ...userSchema, ...agentSchema }

let _sql: ReturnType<typeof postgres> | null = null
let _db: ReturnType<typeof drizzle> | null = null

function getSql() {
  if (_sql) return _sql
  const config = getConfig()
  _sql = postgres(config.DATABASE_URL)
  return _sql
}

export function getDb() {
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

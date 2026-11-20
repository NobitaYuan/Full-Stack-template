import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll } from 'vitest'

const rawTestUrl = process.env.TEST_DATABASE_URL
const testUrl = rawTestUrl && URL.canParse(rawTestUrl) ? new URL(rawTestUrl) : null
if (!testUrl || !['postgresql:', 'postgres:'].includes(testUrl.protocol) || !testUrl.hostname || !/^\/[a-zA-Z0-9_-]+_test$/.test(testUrl.pathname)) {
  throw new Error('TEST_DATABASE_URL must point to a dedicated PostgreSQL database with a name ending in _test.')
}

const databaseName = testUrl.pathname.slice(1)
const schemaName = `template_test_${randomUUID().replaceAll('-', '')}`
testUrl.searchParams.delete('options')
testUrl.searchParams.set('search_path', schemaName)

// Vitest awaits this setup module before importing any application module in a test.
process.env.DATABASE_URL = testUrl.href
process.env.JWT_SECRET = 'test-secret-key-for-testing'
process.env.JWT_EXPIRES_IN = '7d'
process.env.ADMIN_USER_IDS = 'admin-fixture'
process.env.LOG_LEVEL = 'fatal'
process.env.NODE_ENV = 'test'
process.env.PORT = '0'
process.env.CORS_ORIGINS = 'http://localhost:5173'
process.env.RATE_LIMIT_MAX = '1000'
process.env.RATE_LIMIT_WINDOW = '60'

const sql = postgres(testUrl.href, { max: 1, connect_timeout: 5 })
let schemaCreated = false

async function cleanupSchema() {
  try {
    if (schemaCreated) {
      await sql`drop schema ${sql(schemaName)} cascade`
    }
  } finally {
    await sql.end()
  }
}

try {
  const [database] = await sql<{ name: string }[]>`select current_database() as name`
  if (database?.name !== databaseName) {
    throw new Error('The PostgreSQL connection did not select the expected test database.')
  }

  await sql`create schema ${sql(schemaName)}`
  schemaCreated = true
  const [schema] = await sql<{ name: string | null }[]>`select current_schema() as name`
  if (schema?.name !== schemaName) {
    throw new Error('The PostgreSQL connection did not select the isolated test schema.')
  }

  await migrate(drizzle(sql), {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    migrationsSchema: schemaName,
  })
} catch (error) {
  await cleanupSchema()
  throw error
}

afterAll(async () => {
  try {
    const { closeDb } = await import('../src/core/db/index.js')
    await closeDb()
  } finally {
    await cleanupSchema()
  }
})

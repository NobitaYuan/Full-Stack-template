import { sql, type SQL } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { getDb } from './index.js'

interface PaginatedQueryParams {
  table: PgTable
  where?: SQL
  page: number
  size: number
  orderBy?: SQL
}

export async function paginatedQuery<T>(params: PaginatedQueryParams): Promise<{ items: T[]; total: number }> {
  const db = getDb()
  const { table, where, page, size, orderBy } = params
  const offset = (page - 1) * size

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(t)
    .where(where ?? undefined)

  const total = countResult[0].count as number

  const items = await db
    .select()
    .from(t)
    .where(where ?? undefined)
    .limit(size)
    .offset(offset)
    .orderBy(orderBy ?? sql`1`)

  return { items: items as T[], total }
}

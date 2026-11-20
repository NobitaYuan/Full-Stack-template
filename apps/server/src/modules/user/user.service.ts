import { DrizzleQueryError, eq } from 'drizzle-orm'
import postgres from 'postgres'
import { getDb } from '../../core/db/index.js'
import { paginatedQuery } from '../../core/db/helpers.js'
import { users } from '../../core/db/user/db.js'
import { NotFoundError, ConflictError } from '../../core/errors/index.js'
import { getLogger } from '../../lib/logger.js'
import { paginateResult } from '../../lib/pagination.js'
import type { UpdateUserInput } from './user.schema.js'
import { isAdminUser } from '../auth/auth.service.js'

function formatUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
    isAdmin: isAdminUser(user.id),
  }
}

export async function getUser(id: string) {
  const db = getDb()
  const result = await db.select().from(users).where(eq(users.id, id))
  const user = result[0]
  if (!user) throw new NotFoundError('用户不存在')
  return formatUser(user)
}

type UserRow = typeof users.$inferSelect

export async function listUsers(page: number, size: number) {
  const { items, total } = await paginatedQuery<UserRow>({ table: users, page, size })
  return paginateResult(items.map(formatUser), total, page, size)
}

export async function updateUser(id: string, data: UpdateUserInput) {
  const db = getDb()
  const logger = getLogger()

  try {
    const [updated] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning()

    if (!updated) throw new NotFoundError('用户不存在')
    logger.info({ userId: id }, 'User updated')
    return formatUser(updated)
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : error
    if (cause instanceof postgres.PostgresError && cause.code === '23505') {
      throw new ConflictError('用户名已被占用')
    }
    throw error
  }
}

export async function deleteUser(id: string) {
  const [user] = await getDb().delete(users).where(eq(users.id, id)).returning({ id: users.id })
  if (!user) throw new NotFoundError('用户不存在')

  getLogger().info({ userId: id }, 'User deleted')
}

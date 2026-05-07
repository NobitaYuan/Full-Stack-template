import { eq, like, and, sql } from 'drizzle-orm'
import { getDb } from '../../core/db/index.js'
import { paginatedQuery } from '../../core/db/helpers.js'
import { users } from '../../core/db/user/db.js'
import { NotFoundError, ConflictError } from '../../core/errors/index.js'
import { getLogger } from '../../lib/logger.js'
import { generateId } from '../../lib/utils.js'
import { hashPassword } from '../../lib/password.js'
import { paginateResult } from '../../lib/pagination.js'
import type { UpdateUserInput } from './user.schema.js'

function formatUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt.toISOString(),
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

export async function listUsers(page: number, size: number, keyword?: string) {
  const where = keyword ? like(users.username, `%${keyword}%`) : undefined
  const { items, total } = await paginatedQuery<UserRow>({ table: users, where, page, size })
  return paginateResult(items.map(formatUser), total, page, size)
}

export async function updateUser(id: string, data: UpdateUserInput) {
  const db = getDb()
  const logger = getLogger()

  const result = await db.select().from(users).where(eq(users.id, id))
  const user = result[0]
  if (!user) throw new NotFoundError('用户不存在')

  if (data.username) {
    const existing = await db.select().from(users).where(eq(users.username, data.username))
    if (existing.length > 0 && existing[0].id !== id) {
      throw new ConflictError('用户名已被占用')
    }
  }

  await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))

  logger.info({ userId: id }, 'User updated')
  return getUser(id)
}

export async function deleteUser(id: string) {
  const db = getDb()
  const logger = getLogger()

  const result = await db.select().from(users).where(eq(users.id, id))
  const user = result[0]
  if (!user) throw new NotFoundError('用户不存在')

  await db.delete(users).where(eq(users.id, id))
  logger.info({ userId: id }, 'User deleted')
}

export async function createUser(username: string, password: string) {
  const db = getDb()
  const logger = getLogger()

  const existing = await db.select().from(users).where(eq(users.username, username))
  if (existing.length > 0) throw new ConflictError('用户名已被占用')

  const id = generateId()
  const passwordHash = await hashPassword(password)

  await db.insert(users).values({ id, username, passwordHash })

  logger.info({ userId: id }, 'User created by agent')
  return getUser(id)
}

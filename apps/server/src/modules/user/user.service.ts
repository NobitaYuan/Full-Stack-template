import { eq, like, and } from 'drizzle-orm'
import { getDb } from '../../core/db/index.js'
import { users } from '../../core/db/user/db.js'
import { NotFoundError, ConflictError } from '../../core/errors/index.js'
import { getLogger } from '../../lib/logger.js'
import { generateId } from '../../lib/utils.js'
import { hashPassword } from '../../lib/password.js'
import type { UpdateUserInput } from './user.schema.js'

function formatUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    createdAt: new Date(user.createdAt).toISOString(),
  }
}

export async function getUser(id: string) {
  const db = getDb()
  const user = db.select().from(users).where(eq(users.id, id)).get()
  if (!user) throw new NotFoundError('用户不存在')
  return formatUser(user)
}

export async function listUsers(page: number, size: number, keyword?: string) {
  const db = getDb()
  const offset = (page - 1) * size

  const conditions = keyword ? [like(users.username, `%${keyword}%`)] : []
  const allUsers = db
    .select()
    .from(users)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .all()

  const total = allUsers.length
  const items = allUsers.slice(offset, offset + size).map(formatUser)

  return { items, total, page, size }
}

export async function updateUser(id: string, data: UpdateUserInput) {
  const db = getDb()
  const logger = getLogger()

  const user = db.select().from(users).where(eq(users.id, id)).get()
  if (!user) throw new NotFoundError('用户不存在')

  if (data.username) {
    const existing = db.select().from(users).where(eq(users.username, data.username)).get()
    if (existing && existing.id !== id) {
      throw new ConflictError('用户名已被占用')
    }
  }

  db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .run()

  logger.info({ userId: id }, 'User updated')
  return getUser(id)
}

export async function deleteUser(id: string) {
  const db = getDb()
  const logger = getLogger()

  const user = db.select().from(users).where(eq(users.id, id)).get()
  if (!user) throw new NotFoundError('用户不存在')

  db.delete(users).where(eq(users.id, id)).run()
  logger.info({ userId: id }, 'User deleted')
}

export async function createUser(username: string, password: string) {
  const db = getDb()
  const logger = getLogger()

  const existing = db.select().from(users).where(eq(users.username, username)).get()
  if (existing) throw new ConflictError('用户名已被占用')

  const id = generateId()
  const passwordHash = await hashPassword(password)

  db.insert(users).values({ id, username, passwordHash }).run()

  logger.info({ userId: id }, 'User created by agent')
  return getUser(id)
}

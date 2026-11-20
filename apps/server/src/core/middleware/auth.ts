import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { isAdminUser, verifyToken } from '../../modules/auth/auth.service.js'
import { getDb } from '../db/index.js'
import { users } from '../db/user/db.js'
import { ForbiddenError, UnauthorizedError } from '../errors/index.js'

export type AuthEnv = { Variables: { userId: string } }

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('缺少或无效的 Authorization 请求头')
  }

  const token = header.slice(7)
  const { userId } = await verifyToken(token)
  const [user] = await getDb().select({ id: users.id }).from(users).where(eq(users.id, userId))
  if (!user) throw new UnauthorizedError('账号已不存在')

  c.set('userId', userId)
  await next()
})

export function requireAdmin(userId: string) {
  if (!isAdminUser(userId)) throw new ForbiddenError('需要用户管理权限')
}

export function requireSelfOrAdmin(userId: string, targetId: string) {
  if (userId !== targetId) requireAdmin(userId)
}

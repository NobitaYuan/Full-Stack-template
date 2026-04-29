import type { Context, Next } from 'hono'
import { verifyToken } from '../../modules/auth/auth.service.js'
import { UnauthorizedError } from '../errors/index.js'

export async function authMiddleware(c: Context, next: Next) {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('缺少或无效的 Authorization 请求头')
  }

  const token = header.slice(7)
  const payload = await verifyToken(token)
  c.set('userId', payload.userId)
  await next()
}

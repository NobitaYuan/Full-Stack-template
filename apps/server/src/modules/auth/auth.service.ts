import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import * as jose from 'jose'
import { getDb } from '../../core/db/index.js'
import { users } from '../../core/db/user/db.js'
import { getConfig } from '../../core/config/index.js'
import { ConflictError, UnauthorizedError } from '../../core/errors/index.js'
import { getLogger } from '../../lib/logger.js'
import { generateId } from '../../lib/utils.js'
import type { RegisterInput, LoginInput } from './auth.schema.js'

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

async function signToken(payload: { userId: string }, expiresIn: string): Promise<string> {
  const config = getConfig()
  const secret = new TextEncoder().encode(config.JWT_SECRET)
  return new jose.SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(expiresIn).sign(secret)
}

async function verifyToken(token: string) {
  const config = getConfig()
  const secret = new TextEncoder().encode(config.JWT_SECRET)
  try {
    const { payload } = await jose.jwtVerify(token, secret)
    return payload as { userId: string }
  } catch {
    throw new UnauthorizedError('无效或过期的令牌')
  }
}

export async function register(data: RegisterInput) {
  const db = getDb()
  const logger = getLogger()

  const existing = db.select().from(users).where(eq(users.username, data.username)).get()
  if (existing) {
    throw new ConflictError('用户名已被占用')
  }

  const passwordHash = await hashPassword(data.password)
  const id = generateId()

  db.insert(users)
    .values({
      id,
      username: data.username,
      passwordHash,
    })
    .run()

  logger.info({ userId: id }, '用户注册成功')

  const config = getConfig()
  const accessToken = await signToken({ userId: id }, config.JWT_EXPIRES_IN)

  return {
    user: { id, username: data.username },
    accessToken,
  }
}

export async function login(data: LoginInput) {
  const db = getDb()

  const user = db.select().from(users).where(eq(users.username, data.username)).get()
  if (!user) {
    throw new UnauthorizedError('用户名或密码错误')
  }

  const valid = await verifyPassword(data.password, user.passwordHash)
  if (!valid) {
    throw new UnauthorizedError('用户名或密码错误')
  }

  const config = getConfig()
  const accessToken = await signToken({ userId: user.id }, config.JWT_EXPIRES_IN)

  return {
    user: { id: user.id, username: user.username },
    accessToken,
  }
}

export { verifyToken }

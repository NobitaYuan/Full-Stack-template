import type { MiddlewareHandler } from 'hono'
import { fail } from '../../lib/response.js'
import { getConfig } from '../config/index.js'

interface WindowEntry {
  timestamps: number[]
}

const store = new Map<string, WindowEntry>()

function cleanupExpired(ip: string, now: number, windowMs: number) {
  const entry = store.get(ip)
  if (!entry) return
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs)
  if (entry.timestamps.length === 0) {
    store.delete(ip)
  }
}

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const config = getConfig()
  const max = config.RATE_LIMIT_MAX
  const windowMs = config.RATE_LIMIT_WINDOW * 1000

  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? c.req.header('x-real-ip') ?? 'unknown'
  const now = Date.now()

  cleanupExpired(ip, now, windowMs)

  const entry = store.get(ip) ?? { timestamps: [] }
  const remaining = max - entry.timestamps.length

  c.header('X-RateLimit-Limit', String(max))
  c.header('X-RateLimit-Remaining', String(Math.max(0, remaining - 1)))
  c.header('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)))

  if (entry.timestamps.length >= max) {
    c.header('Retry-After', String(config.RATE_LIMIT_WINDOW))
    return fail(c, '请求过于频繁', 429)
  }

  entry.timestamps.push(now)
  store.set(ip, entry)

  await next()
}

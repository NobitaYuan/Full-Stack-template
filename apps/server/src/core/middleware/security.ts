import type { MiddlewareHandler } from 'hono'
import { getConfig } from '../config/index.js'

export const securityMiddleware: MiddlewareHandler = async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '0')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Cache-Control', 'no-store')

  const config = getConfig()
  if (config.NODE_ENV === 'production') {
    c.header('Content-Security-Policy', "default-src 'self'")
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }

  await next()
}

import type { MiddlewareHandler } from 'hono'
import { getLogger } from '../../lib/logger.js'

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const logger = getLogger()
  const start = Date.now()
  const { method } = c.req
  const path = c.req.path

  await next()

  const duration = Date.now() - start
  logger.info(`${method} ${path} [${c.res.status}] - ${duration}ms`)
}

import type { MiddlewareHandler } from 'hono'
import { getLogger } from '../../lib/logger.js'
import { generateId } from '../../lib/utils.js'

export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const id = generateId()
  c.set('requestId', id)
  c.header('X-Request-ID', id)

  const logger = getLogger().child({ requestId: id })
  c.set('logger', logger)

  await next()
}

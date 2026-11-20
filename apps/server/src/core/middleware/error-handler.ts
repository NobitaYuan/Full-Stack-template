import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { AppError } from '../errors/index.js'
import { getLogger } from '../../lib/logger.js'
import { fail } from '../../lib/response.js'

export const errorHandler: ErrorHandler = async (err, c) => {
  const logger = c.get('logger') ?? getLogger()

  if (err instanceof AppError) {
    logger.warn({ err }, err.message)
    return fail(c, err.message, err.statusCode)
  }

  if (err instanceof HTTPException && err.status === 400) {
    logger.warn('Invalid request format')
    return fail(c, '请求格式不正确', 400)
  }

  logger.error({ err }, 'Unhandled error')
  return fail(c, '服务器内部错误', 500)
}

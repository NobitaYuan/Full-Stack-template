import type { ErrorHandler } from 'hono'
import { AppError } from '../errors/index.js'
import { getLogger } from '../../lib/logger.js'

export const errorHandler: ErrorHandler = async (err, c) => {
  const logger = getLogger()

  if (err instanceof AppError) {
    logger.warn({ err }, err.message)
    return c.json({ code: err.statusCode, message: err.message, data: null }, 200)
  }

  logger.error({ err }, 'Unhandled error')
  return c.json({ code: 500, message: '服务器内部错误', data: null }, 200)
}

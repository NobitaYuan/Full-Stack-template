import { serve } from '@hono/node-server'
import { getConfig } from './core/config/index.js'
import { initDb } from './core/db/index.js'
import { getLogger } from './lib/logger.js'
import { getLocalIps } from './lib/utils.js'
import { app } from './app.js'

const config = getConfig()
const logger = getLogger()

initDb()
logger.info('数据库初始化完成')

const ip = getLocalIps()[0] ?? 'localhost'

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  logger.info('===================================================')
  logger.info('服务已启动：')
  logger.info(`    本地：http://localhost:${info.port}`)
  logger.info(`    内网：http://${ip}:${info.port}`)
  logger.info(`    文档：http://${ip}:${info.port}/api/v1/doc`)
  logger.info('===================================================')
})

process.on('SIGINT', () => {
  server.close()
  process.exit(0)
})

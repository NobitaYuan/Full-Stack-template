import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { Scalar } from '@scalar/hono-api-reference'
import { errorHandler } from './core/middleware/error-handler.js'
import { requestLogger } from './core/middleware/request-logger.js'
import { requestIdMiddleware } from './core/middleware/request-id.js'
import { securityMiddleware } from './core/middleware/security.js'
import { rateLimitMiddleware } from './core/middleware/rate-limit.js'
import { authMiddleware } from './core/middleware/auth.js'
import { authApp } from './modules/auth/index.js'
import { userApp } from './modules/user/index.js'
import { agentApp } from './modules/agent/index.js'
import { getConfig } from './core/config/index.js'

const API_PREFIX = '/api/v1'
const config = getConfig()

const app = new OpenAPIHono()

// ==================== 全局中间件 ====================
app.use('*', requestIdMiddleware)
app.use('*', securityMiddleware)
app.use(
  '*',
  cors({
    origin: config.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  }),
)
app.use('*', rateLimitMiddleware)
app.use('*', requestLogger)
app.onError(errorHandler)

// ==================== 路由注册 ====================
app.get('/health', (c) => c.json({ code: 200, message: '服务正常~', data: null }))

const api = new OpenAPIHono()
api.route('/auth', authApp)
api.route('/users', userApp)
api.route('/agent', agentApp)

// 认证中间件（NOTE: 需要认证的模块在此声明）
app.use(`${API_PREFIX}/users/*`, authMiddleware)
app.use(`${API_PREFIX}/agent/*`, authMiddleware)

app.route(API_PREFIX, api)

// ==================== OpenAPI 文档 ====================
app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
})

app.doc(`${API_PREFIX}/openapi.json`, {
  openapi: '3.1.0',
  info: { title: 'Server Template API', version: '1.0.0' },
  security: [{ BearerAuth: [] }],
})

app.get(
  `${API_PREFIX}/doc`,
  Scalar({
    url: `${API_PREFIX}/openapi.json`,
    pageTitle: 'API Documentation',
  }),
)

export { app }

import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { Scalar } from '@scalar/hono-api-reference'
import { errorHandler } from './core/middleware/error-handler.js'
import { requestLogger } from './core/middleware/request-logger.js'
import { authMiddleware } from './core/middleware/auth.js'
import { authApp } from './modules/auth/index.js'
import { userApp } from './modules/user/index.js'

const API_PREFIX = '/api/v1'

const app = new OpenAPIHono()

// ==================== 全局中间件 ====================
app.use('*', cors())
app.use('*', requestLogger)
app.onError(errorHandler)

// ==================== 路由注册 ====================
app.get('/health', (c) => c.json({ status: 'ok' }))

const api = new OpenAPIHono()
api.route('/auth', authApp)
api.route('/users', userApp)

// 认证中间件（NOTE: 需要认证的模块在此声明）
app.use(`${API_PREFIX}/users/*`, authMiddleware)

app.route(API_PREFIX, api)

// ==================== OpenAPI 文档 ====================
// 注册 BearerAuth 安全方案（用于 OpenAPI 文档）
app.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
})

// OpenAPI 规范
app.doc(`${API_PREFIX}/openapi.json`, {
  openapi: '3.1.0',
  info: { title: 'Server Template API', version: '1.0.0' },
  security: [{ BearerAuth: [] }],
})

// Scalar API 文档界面
app.get(
  `${API_PREFIX}/doc`,
  Scalar({
    url: `${API_PREFIX}/openapi.json`,
    pageTitle: 'API Documentation',
  }),
)

export { app }

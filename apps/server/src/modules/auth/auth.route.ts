import { createRoute } from '@hono/zod-openapi'
import { RegisterSchema, LoginSchema, AuthResponseSchema } from './auth.schema.js'
import { apiSchema, success, createRouteApp } from '../../lib/response.js'
import * as authService from './auth.service.js'

const authApp = createRouteApp()

const registerRoute = createRoute({
  method: 'post',
  path: '/register',
  request: {
    body: {
      content: {
        'application/json': { schema: RegisterSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: apiSchema(AuthResponseSchema) },
      },
      description: '用户注册成功',
    },
  },
})

const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  request: {
    body: {
      content: {
        'application/json': { schema: LoginSchema },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: apiSchema(AuthResponseSchema) },
      },
      description: '登录成功',
    },
  },
})

authApp.openapi(registerRoute, async (c) => {
  const data = c.req.valid('json')
  const result = await authService.register(data)
  return success(c, result)
})

authApp.openapi(loginRoute, async (c) => {
  const data = c.req.valid('json')
  const result = await authService.login(data)
  return success(c, result)
})

export { authApp }

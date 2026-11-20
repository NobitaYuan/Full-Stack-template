import { createRoute } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { UserSchema, UpdateUserSchema, UserListQuerySchema, UserListResponseSchema } from './user.schema.js'
import { requireAdmin, requireSelfOrAdmin, type AuthEnv } from '../../core/middleware/auth.js'
import { apiSchema, success, createRouteApp, errorResponses } from '../../lib/response.js'
import * as userService from './user.service.js'

const userApp = createRouteApp<AuthEnv>()
const security = [{ BearerAuth: [] }]
const accessErrors = {
  401: errorResponses[401],
  403: errorResponses[403],
  429: errorResponses[429],
  500: errorResponses[500],
}

const listRoute = createRoute({
  method: 'get',
  path: '/',
  security,
  request: {
    query: UserListQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(UserListResponseSchema) } },
      description: '用户列表',
    },
    ...accessErrors,
    422: errorResponses[422],
  },
})

const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  security,
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(UserSchema) } },
      description: '用户详情',
    },
    ...accessErrors,
    404: errorResponses[404],
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  security,
  request: {
    params: z.object({ id: z.string() }),
    body: {
      required: true,
      content: { 'application/json': { schema: UpdateUserSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(UserSchema) } },
      description: '用户已更新',
    },
    ...accessErrors,
    400: errorResponses[400],
    404: errorResponses[404],
    409: errorResponses[409],
    422: errorResponses[422],
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  security,
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: apiSchema(z.literal(null)) },
      },
      description: '用户已删除',
    },
    ...accessErrors,
    404: errorResponses[404],
  },
})

userApp.openapi(listRoute, async (c) => {
  requireAdmin(c.var.userId)
  const { page, size } = c.req.valid('query')
  const result = await userService.listUsers(page, size)
  return success(c, result)
})

userApp.openapi(getRoute, async (c) => {
  const { id } = c.req.valid('param')
  requireSelfOrAdmin(c.var.userId, id)
  const user = await userService.getUser(id)
  return success(c, user)
})

userApp.openapi(updateRoute, async (c) => {
  const { id } = c.req.valid('param')
  requireSelfOrAdmin(c.var.userId, id)
  const data = c.req.valid('json')
  const user = await userService.updateUser(id, data)
  return success(c, user)
})

userApp.openapi(deleteRoute, async (c) => {
  const { id } = c.req.valid('param')
  requireSelfOrAdmin(c.var.userId, id)
  await userService.deleteUser(id)
  return success(c, null)
})

export { userApp }

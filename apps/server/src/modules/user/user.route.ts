import { createRoute } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { UserSchema, UpdateUserSchema, UserListQuerySchema, UserListResponseSchema } from './user.schema.js'
import { apiSchema, success, createRouteApp } from '../../lib/response.js'
import * as userService from './user.service.js'
const userApp = createRouteApp()

const listRoute = createRoute({
  method: 'get',
  path: '/',
  request: {
    query: UserListQuerySchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(UserListResponseSchema) } },
      description: '用户列表',
    },
  },
})

const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(UserSchema) } },
      description: '用户详情',
    },
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: { 'application/json': { schema: UpdateUserSchema } },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(UserSchema) } },
      description: '用户已更新',
    },
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
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
  },
})

userApp.openapi(listRoute, async (c) => {
  const { page, size } = c.req.valid('query')
  const result = await userService.listUsers(page, size)
  return success(c, result)
})

userApp.openapi(getRoute, async (c) => {
  const { id } = c.req.valid('param')
  const user = await userService.getUser(id)
  return success(c, user)
})

userApp.openapi(updateRoute, async (c) => {
  const { id } = c.req.valid('param')
  const data = c.req.valid('json')
  const user = await userService.updateUser(id, data)
  return success(c, user)
})

userApp.openapi(deleteRoute, async (c) => {
  const { id } = c.req.valid('param')
  await userService.deleteUser(id)
  return success(c, null)
})

export { userApp }

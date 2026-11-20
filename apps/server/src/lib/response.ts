import type { Context, Env, TypedResponse } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { JSONParsed } from 'hono/utils/types'
import { OpenAPIHono } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import type { ErrorStatusCode } from '../core/errors/index.js'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

type JsonResponse<T, Status extends ContentfulStatusCode> = Response & TypedResponse<JSONParsed<ApiResponse<T>>, Status, 'json'>

export function apiSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    code: z.number(),
    message: z.string(),
    data: dataSchema,
  })
}

export function success<T>(c: Context, data: T, message = 'success'): JsonResponse<T, 200> {
  return c.json<ApiResponse<T>, 200>({ code: 200, message, data }, 200)
}

export function fail<Status extends ErrorStatusCode, T = null>(c: Context, message: string, code: Status, data?: T): JsonResponse<T | null, Status> {
  return c.json<ApiResponse<T | null>, Status>({ code, message, data: data ?? null }, code)
}

const apiErrorSchema = apiSchema(z.null()).describe('接口错误响应').openapi('ApiError')
const validationErrorSchema = apiSchema(
  z.array(
    z.object({
      path: z.string().describe('字段路径'),
      message: z.string().describe('字段错误说明'),
    }),
  ),
)
  .describe('参数验证错误响应')
  .openapi('ApiValidationError')

function errorResponse(description: string) {
  return { description, content: { 'application/json': { schema: apiErrorSchema } } }
}

export const errorResponses = {
  400: errorResponse('请求格式不正确'),
  401: errorResponse('未认证'),
  403: errorResponse('没有操作权限'),
  404: errorResponse('资源不存在'),
  409: errorResponse('资源冲突'),
  422: {
    description: '参数验证失败',
    content: { 'application/json': { schema: validationErrorSchema } },
  },
  429: errorResponse('请求过于频繁'),
  500: errorResponse('服务器内部错误'),
}

export function createRouteApp<E extends Env = Env>() {
  return new OpenAPIHono<E>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const errors = result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        }))
        return fail(c, '参数验证失败', 422, errors)
      }
    },
  })
}

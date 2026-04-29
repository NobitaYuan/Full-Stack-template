import type { Context } from 'hono'
import { OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}

export function apiSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    code: z.number(),
    message: z.string(),
    data: dataSchema,
  })
}

export function success<T>(c: Context, data: T, message = 'success') {
  return c.json({ code: 200, message, data } satisfies ApiResponse<T>, 200)
}

export function fail<T = null>(c: Context, message: string, code = 400, data?: T | null) {
  return c.json({ code, message, data: data ?? null }, 200)
}

export function createRouteApp() {
  return new OpenAPIHono({
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

import { z } from '@hono/zod-openapi'
import { UserResponseSchema } from '../../core/db/user/index.js'
import { PaginationQuerySchema } from '../../lib/pagination.js'

export { UserResponseSchema as UserSchema }
export type { UserResponse as User } from '../../core/db/user/index.js'

export const UpdateUserSchema = z
  .object({
    username: z.string().min(2).max(50).optional().describe('新用户名'),
  })
  .describe('更新用户输入')
  .openapi('UpdateUserInput')

export const UserListQuerySchema = PaginationQuerySchema

export const UserListResponseSchema = z
  .object({
    items: z.array(UserResponseSchema).describe('用户列表'),
    total: z.number().describe('总数'),
    page: z.number().describe('当前页码'),
    size: z.number().describe('每页数量'),
    totalPages: z.number().describe('总页数'),
  })
  .describe('用户列表响应')
  .openapi('UserListResponse')

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>

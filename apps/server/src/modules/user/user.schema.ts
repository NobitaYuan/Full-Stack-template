import { z } from 'zod'
import { UserResponseSchema } from '../../core/db/schema/types.js'

// 从 Drizzle 表自动生成的用户响应 schema
export { UserResponseSchema as UserSchema }
export type { UserResponse as User } from '../../core/db/schema/types.js'

export const UpdateUserSchema = z
  .object({
    username: z.string().min(2).max(50).optional().describe('新用户名'),
  })
  .describe('更新用户输入')

export const UserListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).describe('页码'),
  size: z.coerce.number().int().min(1).max(100).default(20).describe('每页数量'),
})

export const UserListResponseSchema = z
  .object({
    items: z.array(UserResponseSchema).describe('用户列表'),
    total: z.number().describe('总数'),
    page: z.number().describe('当前页码'),
    size: z.number().describe('每页数量'),
  })
  .describe('用户列表响应')

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>

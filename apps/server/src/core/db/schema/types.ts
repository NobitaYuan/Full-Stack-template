import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { users } from './user.js'

// 从 Drizzle 表定义自动生成 Zod schema（单一数据源）
const userSelectSchema = createSelectSchema(users)

// API 响应 schema：排除敏感字段，转换日期为字符串
export const UserResponseSchema = userSelectSchema
  .omit({ passwordHash: true, updatedAt: true })
  .extend({
    createdAt: z.string().describe('注册时间（ISO 8601）'),
  })
  .describe('用户信息')

// 认证响应中使用的用户子集
export const AuthUserSchema = UserResponseSchema.pick({ id: true, username: true }).describe('认证用户')

export type UserResponse = z.infer<typeof UserResponseSchema>
export type AuthUser = z.infer<typeof AuthUserSchema>

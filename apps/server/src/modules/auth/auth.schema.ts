import { z } from 'zod'
import { AuthUserSchema } from '../../core/db/schema/types.js'

export const RegisterSchema = z
  .object({
    username: z.string().min(2).max(50).describe('用户名（2-50 字符）'),
    password: z.string().min(6).max(100).describe('密码（6-100 字符）'),
    confirmPassword: z.string().describe('确认密码'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: '两次密码不一致',
    path: ['confirmPassword'],
  })

export const LoginSchema = z.object({
  username: z.string().describe('用户名'),
  password: z.string().describe('密码'),
})

export const AuthResponseSchema = z
  .object({
    user: AuthUserSchema.describe('用户信息'),
    accessToken: z.string().describe('JWT 访问令牌'),
  })
  .describe('认证响应')

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>

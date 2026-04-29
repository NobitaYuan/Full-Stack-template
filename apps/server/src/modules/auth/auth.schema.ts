import { z } from '@hono/zod-openapi'
import { AuthUserSchema } from '../../core/db/user/index.js'

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
  .openapi('RegisterInput')

export const LoginSchema = z
  .object({
    username: z.string().describe('用户名'),
    password: z.string().describe('密码'),
  })
  .openapi('LoginInput')

export const AuthResponseSchema = z
  .object({
    user: AuthUserSchema.describe('用户信息'),
    accessToken: z.string().describe('JWT 访问令牌'),
  })
  .describe('认证响应')
  .openapi('AuthResponse')

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>

export interface paths {
  '/api/v1/auth/register': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: {
      parameters: {
        query?: never
        header?: never
        path?: never
        cookie?: never
      }
      requestBody?: {
        content: {
          'application/json': components['schemas']['RegisterInput']
        }
      }
      responses: {
        /** @description 用户注册成功 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              data: components['schemas']['AuthResponse']
            }
          }
        }
      }
    }
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/auth/login': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get?: never
    put?: never
    post: {
      parameters: {
        query?: never
        header?: never
        path?: never
        cookie?: never
      }
      requestBody?: {
        content: {
          'application/json': components['schemas']['LoginInput']
        }
      }
      responses: {
        /** @description 登录成功 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              data: components['schemas']['AuthResponse']
            }
          }
        }
      }
    }
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
}
export type webhooks = Record<string, never>
export interface components {
  schemas: {
    /** @description 认证响应 */
    AuthResponse: {
      user: components['schemas']['AuthUser']
      /** @description JWT 访问令牌 */
      accessToken: string
    }
    /** @description 用户信息 */
    AuthUser: {
      id: string
      username: string
    }
    RegisterInput: {
      /** @description 用户名（2-50 字符） */
      username: string
      /** @description 密码（6-100 字符） */
      password: string
      /** @description 确认密码 */
      confirmPassword: string
    }
    LoginInput: {
      /** @description 用户名 */
      username: string
      /** @description 密码 */
      password: string
    }
    /** @description 用户列表响应 */
    UserListResponse: {
      /** @description 用户列表 */
      items: components['schemas']['User'][]
      /** @description 总数 */
      total: number
      /** @description 当前页码 */
      page: number
      /** @description 每页数量 */
      size: number
    }
    /** @description 用户信息 */
    User: {
      id: string
      username: string
      /** @description 注册时间（ISO 8601） */
      createdAt: string
    }
    /** @description 更新用户输入 */
    UpdateUserInput: {
      /** @description 新用户名 */
      username?: string
    }
  }
  responses: never
  parameters: never
  requestBodies: never
  headers: never
  pathItems: never
}
export type $defs = Record<string, never>
export type operations = Record<string, never>

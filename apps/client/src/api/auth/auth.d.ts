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

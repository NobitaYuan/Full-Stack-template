export interface paths {
  '/api/v1/users': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: {
      parameters: {
        query?: {
          /** @description 页码 */
          page?: number
          /** @description 每页数量 */
          size?: number
        }
        header?: never
        path?: never
        cookie?: never
      }
      requestBody?: never
      responses: {
        /** @description 用户列表 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              data: components['schemas']['UserListResponse']
            }
          }
        }
      }
    }
    put?: never
    post?: never
    delete?: never
    options?: never
    head?: never
    patch?: never
    trace?: never
  }
  '/api/v1/users/{id}': {
    parameters: {
      query?: never
      header?: never
      path?: never
      cookie?: never
    }
    get: {
      parameters: {
        query?: never
        header?: never
        path: {
          id: string
        }
        cookie?: never
      }
      requestBody?: never
      responses: {
        /** @description 用户详情 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              data: components['schemas']['User']
            }
          }
        }
      }
    }
    put?: never
    post?: never
    delete: {
      parameters: {
        query?: never
        header?: never
        path: {
          id: string
        }
        cookie?: never
      }
      requestBody?: never
      responses: {
        /** @description 用户已删除 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              /** @enum {object|null} */
              data: null
            }
          }
        }
      }
    }
    options?: never
    head?: never
    patch: {
      parameters: {
        query?: never
        header?: never
        path: {
          id: string
        }
        cookie?: never
      }
      requestBody?: {
        content: {
          'application/json': components['schemas']['UpdateUserInput']
        }
      }
      responses: {
        /** @description 用户已更新 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              data: components['schemas']['User']
            }
          }
        }
      }
    }
    trace?: never
  }
}
export type webhooks = Record<string, never>

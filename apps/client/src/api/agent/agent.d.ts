export interface paths {
  '/api/v1/agent/permission': {
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
          'application/json': components['schemas']['PermissionRequest']
        }
      }
      responses: {
        /** @description 权限决策已处理 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              data: components['schemas']['PermissionResponse']
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
  '/api/v1/agent/sessions': {
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
        path?: never
        cookie?: never
      }
      requestBody?: never
      responses: {
        /** @description 会话列表 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              data: components['schemas']['AgentSessionListResponse']
            }
          }
        }
      }
    }
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
          'application/json': components['schemas']['CreateAgentSession']
        }
      }
      responses: {
        /** @description 已创建 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              data: components['schemas']['AgentSession']
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
  '/api/v1/agent/sessions/{id}': {
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
          /** @description 会话 ID */
          id: string
        }
        cookie?: never
      }
      requestBody?: never
      responses: {
        /** @description 会话详情 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              data: components['schemas']['AgentSessionDetailResponse']
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
          /** @description 会话 ID */
          id: string
        }
        cookie?: never
      }
      requestBody?: never
      responses: {
        /** @description 已删除 */
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
          /** @description 会话 ID */
          id: string
        }
        cookie?: never
      }
      requestBody?: {
        content: {
          'application/json': components['schemas']['UpdateAgentSession']
        }
      }
      responses: {
        /** @description 已更新 */
        200: {
          headers: {
            [name: string]: unknown
          }
          content: {
            'application/json': {
              code: number
              message: string
              data: components['schemas']['AgentSession']
            }
          }
        }
      }
    }
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
    /** @description 权限响应 */
    PermissionResponse: {
      /** @description 操作成功 */
      ok: boolean
    }
    /** @description 权限决策请求 */
    PermissionRequest: {
      /** @description 权限请求 ID */
      requestId: string
      /** @description 是否允许工具执行 */
      allow: boolean
      /** @description 修改后的工具输入（AskUserQuestion 时传回 { questions, answers }） */
      updatedInput?: {
        [key: string]: unknown
      }
      /** @description 拒绝原因（allow=false 时） */
      message?: string
    }
    /** @description 会话列表响应 */
    AgentSessionListResponse: {
      /** @description 会话列表 */
      items: components['schemas']['AgentSession'][]
    }
    /** @description AI 会话 */
    AgentSession: {
      id: string
      userId: string
      title: string
      agentSessionId: string | null
      /** @description 创建时间（ISO 8601） */
      createdAt: string
      /** @description 更新时间（ISO 8601） */
      updatedAt: string
    }
    /** @description 会话详情响应 */
    AgentSessionDetailResponse: {
      session: components['schemas']['AgentSession'] & unknown
      /** @description 消息列表 */
      messages: components['schemas']['AgentMessage'][]
    }
    /** @description AI 消息 */
    AgentMessage: {
      id: string
      sessionId: string
      type: string
      subtype: string | null
      sessionIdSdk: string | null
      parentToolUseId: string | null
      raw: string
      /** @description 写入时间（ISO 8601） */
      createdAt: string
    }
    /** @description 创建会话输入 */
    CreateAgentSession: {
      /** @description 会话标题 */
      title?: string
    }
    /** @description 更新会话输入 */
    UpdateAgentSession: {
      /** @description 新标题 */
      title: string
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

import { createRoute } from '@hono/zod-openapi'
import { z } from '@hono/zod-openapi'
import { apiSchema } from '../../lib/response.js'
import { SessionResponseSchema, MessageResponseSchema } from '../../core/db/agent/index.js'

// =================== Session Schema ===================

export const SessionIdParam = z.object({ id: z.string().describe('会话 ID') })

export const CreateSessionSchema = z
  .object({ title: z.string().max(100).optional().describe('会话标题') })
  .describe('创建会话输入')
  .openapi('CreateAgentSession')

export const UpdateSessionSchema = z
  .object({ title: z.string().min(1).max(100).describe('新标题') })
  .describe('更新会话输入')
  .openapi('UpdateAgentSession')

// =================== Response Schema ===================

export const SessionListResponseSchema = z
  .object({ items: z.array(SessionResponseSchema).describe('会话列表') })
  .describe('会话列表响应')
  .openapi('AgentSessionListResponse')

export const SessionDetailResponseSchema = z
  .object({
    session: SessionResponseSchema.describe('会话信息'),
    messages: z.array(MessageResponseSchema).describe('消息列表'),
  })
  .describe('会话详情响应')
  .openapi('AgentSessionDetailResponse')

// =================== Chat Schema ===================

export const ChatRequestSchema = z.object({
  sessionId: z.string().optional().describe('会话 ID（为空则创建新会话）'),
  message: z.string().min(1).describe('用户消息'),
})

// =================== Routes ===================

export const listRoute = createRoute({
  method: 'get',
  path: '/sessions',
  responses: {
    200: { content: { 'application/json': { schema: apiSchema(SessionListResponseSchema) } }, description: '会话列表' },
  },
})

export const getRoute = createRoute({
  method: 'get',
  path: '/sessions/{id}',
  request: { params: SessionIdParam },
  responses: {
    200: { content: { 'application/json': { schema: apiSchema(SessionDetailResponseSchema) } }, description: '会话详情' },
  },
})

export const createRoute_ = createRoute({
  method: 'post',
  path: '/sessions',
  request: { body: { content: { 'application/json': { schema: CreateSessionSchema } } } },
  responses: {
    200: { content: { 'application/json': { schema: apiSchema(SessionResponseSchema) } }, description: '已创建' },
  },
})

export const updateRoute = createRoute({
  method: 'patch',
  path: '/sessions/{id}',
  request: {
    params: SessionIdParam,
    body: { content: { 'application/json': { schema: UpdateSessionSchema } } },
  },
  responses: {
    200: { content: { 'application/json': { schema: apiSchema(SessionResponseSchema) } }, description: '已更新' },
  },
})

export const deleteRoute = createRoute({
  method: 'delete',
  path: '/sessions/{id}',
  request: { params: SessionIdParam },
  responses: {
    200: { content: { 'application/json': { schema: apiSchema(z.literal(null)) } }, description: '已删除' },
  },
})

// =================== Permission Schema ===================

export const PermissionRequestSchema = z
  .object({
    requestId: z.string().describe('权限请求 ID'),
    allow: z.boolean().describe('是否允许工具执行'),
    updatedInput: z.object({}).passthrough().optional().describe('修改后的工具输入（AskUserQuestion 时传回 { questions, answers }）'),
    message: z.string().optional().describe('拒绝原因（allow=false 时）'),
  })
  .describe('权限决策请求')
  .openapi('PermissionRequest')

export const PermissionResponseSchema = z
  .object({ ok: z.boolean().describe('操作成功') })
  .describe('权限响应')
  .openapi('PermissionResponse')

export const permissionRoute = createRoute({
  method: 'post',
  path: '/permission',
  request: { body: { content: { 'application/json': { schema: PermissionRequestSchema } } } },
  responses: {
    200: { content: { 'application/json': { schema: apiSchema(PermissionResponseSchema) } }, description: '权限决策已处理' },
  },
})

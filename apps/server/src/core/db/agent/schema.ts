import { createSelectSchema } from 'drizzle-zod'
import { z } from '@hono/zod-openapi'
import { aiSessions, aiMessages } from './db.js'

const sessionSelectSchema = createSelectSchema(aiSessions)
const messageSelectSchema = createSelectSchema(aiMessages)

export const SessionResponseSchema = sessionSelectSchema
  .extend({
    createdAt: z.string().describe('创建时间（ISO 8601）'),
    updatedAt: z.string().describe('更新时间（ISO 8601）'),
  })
  .describe('AI 会话')
  .openapi('AgentSession')

export const MessageResponseSchema = messageSelectSchema
  .extend({
    createdAt: z.string().describe('写入时间（ISO 8601）'),
  })
  .describe('AI 消息')
  .openapi('AgentMessage')

export type SessionResponse = z.infer<typeof SessionResponseSchema>
export type MessageResponse = z.infer<typeof MessageResponseSchema>

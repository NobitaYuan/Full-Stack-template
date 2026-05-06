import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createRouteApp, success } from '../../lib/response.js'
import { ChatRequestSchema, listRoute, getRoute, createRoute_, updateRoute, deleteRoute } from './agent.schema.js'
import { streamAgentChat, listSessions, getSession, createSession, deleteSession, updateSessionTitle, getSessionMessages } from './agent.service.js'

type AuthedContext = Context<{ Variables: { userId: string } }>
function getUserId(c: AuthedContext): string {
  return c.get('userId')
}

const agentApp = createRouteApp()

// =================== SSE Chat Endpoint ===================

agentApp.post('/chat', async (c) => {
  const body = ChatRequestSchema.parse(await c.req.json())
  const userId = getUserId(c as AuthedContext)

  return streamSSE(c, async (stream) => {
    for await (const event of streamAgentChat(body.message, body.sessionId, userId)) {
      await stream.writeSSE({ data: JSON.stringify(event) })
    }
  })
})

// =================== Session CRUD ===================

agentApp.openapi(listRoute, async (c) => {
  const userId = getUserId(c as AuthedContext)
  const items = listSessions(userId)
  return success(c, { items })
})

agentApp.openapi(getRoute, async (c) => {
  const userId = getUserId(c as AuthedContext)
  const { id } = c.req.valid('param')
  const session = getSession(id, userId)
  const messages = getSessionMessages(id)
  return success(c, { session, messages })
})

agentApp.openapi(createRoute_, async (c) => {
  const userId = getUserId(c as AuthedContext)
  const data = c.req.valid('json')
  const session = createSession(userId, data.title)
  return success(c, session)
})

agentApp.openapi(updateRoute, async (c) => {
  const userId = getUserId(c as AuthedContext)
  const { id } = c.req.valid('param')
  const data = c.req.valid('json')
  const session = updateSessionTitle(id, userId, data.title)
  return success(c, session)
})

agentApp.openapi(deleteRoute, async (c) => {
  const userId = getUserId(c as AuthedContext)
  const { id } = c.req.valid('param')
  deleteSession(id, userId)
  return success(c, null)
})

export { agentApp }

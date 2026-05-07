import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createRouteApp, success } from '../../lib/response.js'
import { ChatRequestSchema, listRoute, getRoute, createRoute_, updateRoute, deleteRoute, permissionRoute } from './agent.schema.js'
import {
  streamAgentChat,
  pendingPermissions,
  listSessions,
  getSession,
  createSession,
  deleteSession,
  updateSessionTitle,
  getSessionMessages,
} from './agent.service.js'
import { NotFoundError } from '../../core/errors/index.js'

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

// =================== Permission Endpoint ===================

agentApp.openapi(permissionRoute, async (c) => {
  const body = c.req.valid('json')
  const pending = pendingPermissions.get(body.requestId)
  if (!pending) throw new NotFoundError('权限请求已过期')

  pendingPermissions.delete(body.requestId)

  if (body.allow) {
    pending.resolve({
      behavior: 'allow',
      updatedInput: body.updatedInput ?? pending.originalInput,
    })
  } else {
    pending.resolve({
      behavior: 'deny',
      message: body.message ?? '用户拒绝',
    })
  }
  return success(c, { ok: true })
})

// =================== Session CRUD ===================

agentApp.openapi(listRoute, async (c) => {
  const userId = getUserId(c as AuthedContext)
  const items = await listSessions(userId)
  return success(c, { items })
})

agentApp.openapi(getRoute, async (c) => {
  const userId = getUserId(c as AuthedContext)
  const { id } = c.req.valid('param')
  const session = await getSession(id, userId)
  const messages = await getSessionMessages(id)
  return success(c, { session, messages })
})

agentApp.openapi(createRoute_, async (c) => {
  const userId = getUserId(c as AuthedContext)
  const data = c.req.valid('json')
  const session = await createSession(userId, data.title)
  return success(c, session)
})

agentApp.openapi(updateRoute, async (c) => {
  const userId = getUserId(c as AuthedContext)
  const { id } = c.req.valid('param')
  const data = c.req.valid('json')
  const session = await updateSessionTitle(id, userId, data.title)
  return success(c, session)
})

agentApp.openapi(deleteRoute, async (c) => {
  const userId = getUserId(c as AuthedContext)
  const { id } = c.req.valid('param')
  await deleteSession(id, userId)
  return success(c, null)
})

export { agentApp }

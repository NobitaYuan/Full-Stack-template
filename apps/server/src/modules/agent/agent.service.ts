import { eq, desc, asc } from 'drizzle-orm'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import { getConfig } from '../../core/config/index.js'
import { getDb } from '../../core/db/index.js'
import { aiSessions, aiMessages } from '../../core/db/agent/db.js'
import { NotFoundError } from '../../core/errors/index.js'
import { getLogger } from '../../lib/logger.js'
import { generateId } from '../../lib/utils.js'
import { mcpServer } from './tools/index.js'
import type { AgentSSEEvent } from './types.js'

// =================== 系统提示 ===================

const SYSTEM_PROMPT = `你是一个管理后台的 AI 助手。你可以通过工具帮助管理员操作业务数据。

当前能力：
- 查询用户列表（支持搜索和分页）
- 创建新用户
- 更新用户信息
- 删除用户

规则：
- 使用中文回复
- 当你需要用户提供信息、做选择、或确认操作时，使用 AskUserQuestion 工具询问用户
- 危险操作（如删除）执行前必须用 AskUserQuestion 确认
- 操作完成后给出简洁的结果摘要
- 不要编造数据，只展示工具返回的真实数据
- 用户信息中不包含密码等敏感字段`

// =================== 异步队列 ===================

function createAsyncQueue<T>() {
  const items: T[] = []
  let closed = false
  const resolvers: Array<(value: T | null) => void> = []

  return {
    push(item: T) {
      if (closed) return
      if (resolvers.length > 0) {
        resolvers.shift()!(item)
      } else {
        items.push(item)
      }
    },
    async next(): Promise<T | null> {
      if (items.length > 0) return items.shift()!
      if (closed) return null
      return new Promise<T | null>((resolve) => resolvers.push(resolve))
    },
    close() {
      closed = true
      while (resolvers.length > 0) resolvers.shift()!(null)
    },
  }
}

interface PendingPermission {
  originalInput: Record<string, unknown>
  resolve: (result: PermissionResult) => void
}

export const pendingPermissions = new Map<string, PendingPermission>()

// =================== Session 管理 ===================

function formatSession(session: typeof aiSessions.$inferSelect) {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  }
}

export async function createSession(userId: string, title?: string) {
  const db = getDb()
  const id = generateId()
  await db.insert(aiSessions).values({ id, userId, title: title ?? '新对话' })
  return getSession(id, userId)
}

export async function getSession(id: string, userId: string) {
  const db = getDb()
  const result = await db.select().from(aiSessions).where(eq(aiSessions.id, id))
  const session = result[0]
  if (!session || session.userId !== userId) throw new NotFoundError('会话不存在')
  return formatSession(session)
}

export async function listSessions(userId: string) {
  const db = getDb()
  const list = await db.select().from(aiSessions).where(eq(aiSessions.userId, userId)).orderBy(desc(aiSessions.updatedAt))
  return list.map(formatSession)
}

export async function deleteSession(id: string, userId: string) {
  const db = getDb()
  const result = await db.select().from(aiSessions).where(eq(aiSessions.id, id))
  const session = result[0]
  if (!session || session.userId !== userId) throw new NotFoundError('会话不存在')
  await db.delete(aiMessages).where(eq(aiMessages.sessionId, id))
  await db.delete(aiSessions).where(eq(aiSessions.id, id))
}

export async function updateSessionTitle(id: string, userId: string, title: string) {
  const db = getDb()
  const result = await db.select().from(aiSessions).where(eq(aiSessions.id, id))
  const session = result[0]
  if (!session || session.userId !== userId) throw new NotFoundError('会话不存在')
  await db.update(aiSessions).set({ title, updatedAt: new Date() }).where(eq(aiSessions.id, id))
  return getSession(id, userId)
}

export async function saveMessage(sessionId: string, msg: Record<string, unknown>) {
  const db = getDb()
  const id = generateId()
  await db.insert(aiMessages).values({
    id,
    sessionId,
    type: String(msg.type ?? ''),
    subtype: msg.subtype ? String(msg.subtype) : null,
    sessionIdSdk: msg.session_id ? String(msg.session_id) : null,
    parentToolUseId: msg.parent_tool_use_id ? String(msg.parent_tool_use_id) : null,
    raw: JSON.stringify(msg),
  })
}

export async function updateSessionAgentId(id: string, agentSessionId: string) {
  const db = getDb()
  await db.update(aiSessions).set({ agentSessionId, updatedAt: new Date() }).where(eq(aiSessions.id, id))
}

export async function getSessionMessages(sessionId: string) {
  const db = getDb()
  return db.select().from(aiMessages).where(eq(aiMessages.sessionId, sessionId)).orderBy(asc(aiMessages.createdAt))
}

// =================== Agent Chat ===================

/** MCP 工具名称列表，这些工具自动放行不询问用户 */
const MCP_TOOL_NAMES = ['query_users', 'create_user', 'update_user', 'delete_user']

export async function* streamAgentChat(prompt: string, sessionId?: string, userId?: string): AsyncGenerator<AgentSSEEvent> {
  const config = getConfig()
  const logger = getLogger()
  const queue = createAsyncQueue<AgentSSEEvent>()

  let dbSessionId = sessionId

  // 如果提供了 userId 但没有 sessionId，创建新会话
  if (!dbSessionId && userId) {
    const session = await createSession(userId, prompt.slice(0, 50))
    dbSessionId = session.id
    queue.push({ type: 'sdk_message', raw: { type: 'session_created', sessionId: dbSessionId } })
  }

  // 恢复已有会话
  let resumeSessionId: string | undefined
  if (dbSessionId) {
    const db = getDb()
    const result = await db.select().from(aiSessions).where(eq(aiSessions.id, dbSessionId))
    const session = result[0]
    if (session?.agentSessionId) {
      resumeSessionId = session.agentSessionId
    }
  }

  const env: Record<string, string | undefined> = {
    ...(process.env as Record<string, string | undefined>),
    ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY,
  }
  if (config.ANTHROPIC_BASE_URL) {
    env.ANTHROPIC_BASE_URL = config.ANTHROPIC_BASE_URL
  }

  const canUseTool: CanUseTool = async (toolName, input) => {
    // MCP 工具自动放行
    if (MCP_TOOL_NAMES.includes(toolName)) {
      return { behavior: 'allow', updatedInput: input }
    }

    // AskUserQuestion 和其他内置工具 → 推给前端让用户处理
    const requestId = generateId()
    queue.push({
      type: 'tool_permission_request',
      requestId,
      toolName,
      input,
    })

    // 等待前端回传用户决策
    return new Promise<PermissionResult>((resolve) => {
      pendingPermissions.set(requestId, { originalInput: input, resolve })
    })
  }

  // 后台执行 query
  ;(async () => {
    try {
      const messageStream = query({
        prompt,
        options: {
          model: 'claude-sonnet-4-6',
          mcpServers: { business: mcpServer },
          tools: ['AskUserQuestion'],
          systemPrompt: SYSTEM_PROMPT,
          maxTurns: 20,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          canUseTool,
          env,
          cwd: process.cwd(),
          resume: resumeSessionId,
          includePartialMessages: true,
        },
      })

      // 持久化用户消息
      if (dbSessionId) {
        await saveMessage(dbSessionId, { type: 'user', content: prompt })
      }

      for await (const msg of messageStream) {
        const msgType = (msg as Record<string, unknown>).type as string
        logger.debug({ msgType }, 'SDK message')
        queue.push({ type: 'sdk_message', raw: msg })

        // 持久化所有 SDK 消息（stream_event 增量文本除外，已包含在 assistant 中）
        if (dbSessionId && msgType !== 'stream_event') {
          await saveMessage(dbSessionId, msg as Record<string, unknown>)

          // 从 result 消息中提取 SDK session_id 用于 resume
          if (msgType === 'result') {
            const sdkSessionId = (msg as Record<string, unknown>).session_id as string | undefined
            if (sdkSessionId) {
              await updateSessionAgentId(dbSessionId, sdkSessionId)
            }
          }
        }
      }

      queue.push({ type: 'done' })
    } catch (err) {
      logger.error({ err }, 'Agent chat error')
      queue.push({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      queue.close()
      for (const [, pending] of pendingPermissions) {
        pending.resolve({ behavior: 'deny', message: '会话已关闭' })
      }
      pendingPermissions.clear()
    }
  })()

  while (true) {
    const event = await queue.next()
    if (event === null) break
    yield event
    if (event.type === 'done' || event.type === 'error') break
  }
}

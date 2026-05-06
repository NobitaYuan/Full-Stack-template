import { eq, desc, asc } from 'drizzle-orm'
import { query } from '@anthropic-ai/claude-agent-sdk'
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
- 删除操作前需要确认
- 操作完成后给出简洁的结果摘要
- 不要编造数据，只展示工具返回的真实数据
- 用户信息中不包含密码等敏感字段`

// =================== Session 管理 ===================

function formatSession(session: typeof aiSessions.$inferSelect) {
  return {
    ...session,
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: new Date(session.updatedAt).toISOString(),
  }
}

export function createSession(userId: string, title?: string) {
  const db = getDb()
  const id = generateId()
  db.insert(aiSessions)
    .values({ id, userId, title: title ?? '新对话' })
    .run()
  return getSession(id, userId)
}

export function getSession(id: string, userId: string) {
  const db = getDb()
  const session = db.select().from(aiSessions).where(eq(aiSessions.id, id)).get()
  if (!session || session.userId !== userId) throw new NotFoundError('会话不存在')
  return formatSession(session)
}

export function listSessions(userId: string) {
  const db = getDb()
  const list = db.select().from(aiSessions).where(eq(aiSessions.userId, userId)).orderBy(desc(aiSessions.updatedAt)).all()
  return list.map(formatSession)
}

export function deleteSession(id: string, userId: string) {
  const db = getDb()
  const session = db.select().from(aiSessions).where(eq(aiSessions.id, id)).get()
  if (!session || session.userId !== userId) throw new NotFoundError('会话不存在')
  db.delete(aiMessages).where(eq(aiMessages.sessionId, id)).run()
  db.delete(aiSessions).where(eq(aiSessions.id, id)).run()
}

export function updateSessionTitle(id: string, userId: string, title: string) {
  const db = getDb()
  const session = db.select().from(aiSessions).where(eq(aiSessions.id, id)).get()
  if (!session || session.userId !== userId) throw new NotFoundError('会话不存在')
  db.update(aiSessions).set({ title, updatedAt: new Date() }).where(eq(aiSessions.id, id)).run()
  return getSession(id, userId)
}

export function saveMessage(sessionId: string, msg: Record<string, unknown>) {
  const db = getDb()
  const id = generateId()
  db.insert(aiMessages)
    .values({
      id,
      sessionId,
      type: String(msg.type ?? ''),
      subtype: msg.subtype ? String(msg.subtype) : null,
      sessionIdSdk: msg.session_id ? String(msg.session_id) : null,
      parentToolUseId: msg.parent_tool_use_id ? String(msg.parent_tool_use_id) : null,
      raw: JSON.stringify(msg),
    })
    .run()
}

export function updateSessionAgentId(id: string, agentSessionId: string) {
  const db = getDb()
  db.update(aiSessions).set({ agentSessionId, updatedAt: new Date() }).where(eq(aiSessions.id, id)).run()
}

export function getSessionMessages(sessionId: string) {
  const db = getDb()
  return db.select().from(aiMessages).where(eq(aiMessages.sessionId, sessionId)).orderBy(asc(aiMessages.createdAt)).all()
}

// =================== Agent Chat ===================

export async function* streamAgentChat(prompt: string, sessionId?: string, userId?: string): AsyncGenerator<AgentSSEEvent> {
  const config = getConfig()
  const logger = getLogger()

  let dbSessionId = sessionId

  // 如果提供了 userId 但没有 sessionId，创建新会话
  if (!dbSessionId && userId) {
    const session = createSession(userId, prompt.slice(0, 50))
    dbSessionId = session.id
    yield { type: 'sdk_message', raw: { type: 'session_created', sessionId: dbSessionId } } as AgentSSEEvent
  }

  // 恢复已有会话
  let resumeSessionId: string | undefined
  if (dbSessionId) {
    const db = getDb()
    const session = db.select().from(aiSessions).where(eq(aiSessions.id, dbSessionId)).get()
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

  try {
    const messageStream = query({
      prompt,
      options: {
        model: 'claude-sonnet-4-6',
        mcpServers: { business: mcpServer },
        tools: [],
        systemPrompt: SYSTEM_PROMPT,
        maxTurns: 20,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        env,
        cwd: process.cwd(),
        resume: resumeSessionId,
        includePartialMessages: true,
      },
    })

    // 持久化用户消息
    if (dbSessionId) {
      saveMessage(dbSessionId, { type: 'user', content: prompt })
    }

    for await (const msg of messageStream) {
      const msgType = (msg as Record<string, unknown>).type as string
      logger.debug({ msgType }, 'SDK message')
      yield { type: 'sdk_message', raw: msg }

      // 持久化关键消息
      if (dbSessionId && (msgType === 'assistant' || msgType === 'result')) {
        saveMessage(dbSessionId, msg as Record<string, unknown>)

        // 从 result 消息中提取 SDK session_id 用于 resume
        if (msgType === 'result') {
          const sdkSessionId = (msg as Record<string, unknown>).session_id as string | undefined
          if (sdkSessionId) {
            updateSessionAgentId(dbSessionId, sdkSessionId)
          }
        }
      }
    }

    yield { type: 'done' }
  } catch (err) {
    logger.error({ err }, 'Agent chat error')
    yield { type: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Agent 聊天 composable
 * 负责消息状态管理和 SSE 连接生命周期
 */

import { fetchEventSource } from '@microsoft/fetch-event-source'
import { getToken } from '@/utils/localStorage/token'
import { useAgentStore } from '@/stores/useAgentStore'
import { getSession, respondPermission } from '@/api/agent'
import type { UIMessage } from 'ai'
import { extractTextDelta, extractOrderedContent } from './sse-parser'
import type { OrderedContentBlock } from './sse-parser'
import { convertDbMessagesToUIMessages, buildSystemErrorText } from './message-converter'

/** SSE 推送的权限/问答请求（手动类型，SSE 不走 OpenAPI） */
export interface ToolPermissionRequest {
  requestId: string
  toolName: string
  input: Record<string, unknown>
}

type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

/** 流式会话中的可变状态 */
interface StreamContext {
  assistantId: string
  accumulatedText: string
  turnCount: number
  finalized: boolean
}

export function useAgentChat() {
  const agentStore = useAgentStore()
  const messages = ref<UIMessage[]>([])
  const status = ref<ChatStatus>('ready')
  const error = ref<string | null>(null)
  const pendingRequests = ref<ToolPermissionRequest[]>([])

  let abortCtrl: AbortController | null = null

  function clearMessages() {
    messages.value = []
  }

  // =================== 发送消息 ===================

  async function sendMessage(text: string) {
    const sessionId = agentStore.currentSessionId

    pushUserMessage(text)

    const ctx: StreamContext = {
      assistantId: pushAssistantPlaceholder(),
      accumulatedText: '',
      turnCount: 0,
      finalized: false,
    }

    status.value = 'submitted'
    error.value = null

    abortCtrl = new AbortController()
    const baseUrl = import.meta.env.VITE_APP_BASE_API_URL || '/api/v1'
    const token = getToken()

    try {
      await fetchEventSource(`${baseUrl}/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, sessionId: sessionId ?? undefined }),
        signal: abortCtrl.signal,

        async onopen(response) {
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          status.value = 'streaming'
        },

        onmessage(event) {
          if (!event.data) return
          let parsed: Record<string, unknown>
          try {
            parsed = JSON.parse(event.data)
          } catch {
            return
          }

          const type = parsed.type as string

          if (type === 'sdk_message') {
            handleSDKMessage(parsed, ctx)
          } else if (type === 'tool_permission_request') {
            pendingRequests.value.push({
              requestId: parsed.requestId as string,
              toolName: parsed.toolName as string,
              input: (parsed.input as Record<string, unknown>) ?? {},
            })
          } else if (type === 'done') {
            status.value = 'ready'
            setPartsState(ctx.assistantId, 'done')
            agentStore.fetchSessions()
          } else if (type === 'error') {
            status.value = 'error'
            error.value = (parsed.message as string) || 'Unknown error'
            setParts(ctx.assistantId, [{ type: 'text', text: error.value, state: 'done' }])
          }
        },

        onerror(err) {
          status.value = 'error'
          error.value = err instanceof Error ? err.message : String(err)
          setParts(ctx.assistantId, [{ type: 'text', text: error.value || '连接中断', state: 'done' }])
          throw err
        },

        openWhenHidden: true,
      })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        status.value = 'error'
        error.value = err instanceof Error ? err.message : String(err)
      }
      setParts(ctx.assistantId, [{ type: 'text', text: error.value || '无响应', state: 'done' }])
    }
  }

  /** 若当前消息已被 assistant 事件关闭，创建新消息用于后续内容 */
  function ensureOpenMessage(ctx: StreamContext) {
    if (!ctx.finalized) return
    setPartsState(ctx.assistantId, 'done')
    ctx.assistantId = pushAssistantPlaceholder()
    ctx.accumulatedText = ''
    ctx.finalized = false
  }

  /** 处理 SDK 消息事件，通过可变 ctx 管理多轮次状态 */
  function handleSDKMessage(parsed: Record<string, unknown>, ctx: StreamContext) {
    const raw = parsed.raw as Record<string, unknown>
    const msgType = raw.type as string

    if (msgType === 'stream_event') {
      const delta = extractTextDelta(raw)
      if (delta) {
        ensureOpenMessage(ctx)
        ctx.accumulatedText += delta
        setParts(ctx.assistantId, [{ type: 'text', text: ctx.accumulatedText, state: 'streaming' }])
      }
    } else if (msgType === 'assistant') {
      ensureOpenMessage(ctx)
      const blocks = extractOrderedContent(raw)
      if (blocks.length > 0) {
        setParts(ctx.assistantId, buildPartsFromBlocks(blocks, 'streaming'))
        ctx.accumulatedText = blocks
          .filter((b): b is OrderedContentBlock & { type: 'text' } => b.type === 'text')
          .map((b) => b.text)
          .join('')
      }
      ctx.turnCount++
      ctx.finalized = true
    } else if (msgType === 'session_created') {
      const newSessionId = raw.sessionId as string
      if (newSessionId) agentStore.selectSession(newSessionId)
    } else if (msgType === 'system') {
      pushSystemMessage(raw)
    }
  }

  // =================== 消息操作 ===================

  function pushUserMessage(text: string) {
    messages.value = [
      ...messages.value,
      {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      },
    ]
  }

  function pushAssistantPlaceholder(): string {
    const id = crypto.randomUUID()
    messages.value = [
      ...messages.value,
      {
        id,
        role: 'assistant',
        parts: [{ type: 'text' as const, text: '', state: 'streaming' as const }],
      },
    ]
    return id
  }

  function pushSystemMessage(raw: Record<string, unknown>) {
    const text = buildSystemErrorText(raw)
    if (!text) return
    status.value = 'error'
    error.value = text
    messages.value = [
      ...messages.value,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [{ type: 'text' as const, text, state: 'done' as const }],
      },
    ]
  }

  /** 将有序内容块转为 UIMessage parts */
  function buildPartsFromBlocks(blocks: OrderedContentBlock[], textState: 'streaming' | 'done'): UIMessage['parts'] {
    return blocks.map((block) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text, state: textState }
      }
      return {
        type: 'dynamic-tool' as const,
        toolName: block.toolName,
        toolCallId: block.toolCallId,
        state: 'output-available' as const,
        input: block.args,
        output: undefined,
      }
    })
  }

  /** 替换指定 assistant 消息的全部 parts */
  function setParts(assistantId: string, parts: UIMessage['parts']) {
    const idx = messages.value.findIndex((m) => m.id === assistantId)
    if (idx === -1) return
    messages.value = [...messages.value.slice(0, idx), { ...messages.value[idx], parts }, ...messages.value.slice(idx + 1)]
  }

  /** 将指定 assistant 消息中的文本 parts 状态更新为 done */
  function setPartsState(assistantId: string, textState: 'streaming' | 'done') {
    const idx = messages.value.findIndex((m) => m.id === assistantId)
    if (idx === -1) return
    const msg = messages.value[idx]
    const parts = msg.parts.map((p) => (p.type === 'text' ? { ...p, state: textState } : p))
    messages.value = [...messages.value.slice(0, idx), { ...msg, parts }, ...messages.value.slice(idx + 1)]
  }

  // =================== 加载历史会话 ===================

  async function loadSession(id: string) {
    const { data, error: err } = await getSession(id)
    if (err || !data) return

    const detail = data.data
    if (!detail) return
    messages.value = convertDbMessagesToUIMessages(detail.messages)
  }

  // =================== 权限处理 ===================

  /** 允许工具调用 */
  async function approvePermission(requestId: string, updatedInput?: Record<string, unknown>) {
    const { error } = await respondPermission({ requestId, allow: true, updatedInput })
    if (!error) pendingRequests.value = pendingRequests.value.filter((r) => r.requestId !== requestId)
  }

  /** 拒绝工具调用 */
  async function denyPermission(requestId: string, message?: string) {
    const { error } = await respondPermission({ requestId, allow: false, message })
    if (!error) pendingRequests.value = pendingRequests.value.filter((r) => r.requestId !== requestId)
  }

  // =================== 停止 ===================

  function stop() {
    abortCtrl?.abort()
    abortCtrl = null
    status.value = 'ready'
  }

  return {
    messages: readonly(messages),
    status: readonly(status),
    error: readonly(error),
    pendingRequests: readonly(pendingRequests),
    sendMessage,
    stop,
    loadSession,
    clearMessages,
    approvePermission,
    denyPermission,
  }
}

/**
 * Agent 聊天 Composable
 * 负责模块组合和 SSE 连接生命周期
 */

import { fetchEventSource } from '@microsoft/fetch-event-source'
import { getToken } from '@/utils/localStorage/token'
import { useAgentStore } from '@/stores/useAgentStore'
import { getSession, respondPermission } from '@/api/agent'
import { useMessageQueue } from './useMessageQueue'
import { usePermissionQueue } from './usePermissionQueue'
import { isSSEEvent } from './sse/types'
import { handleSSEEvent, createStreamContext } from './sse/handlers'
import type { ChatStatus } from './sse/handlers'
import { convertDbMessagesToUIMessages } from './message-converter'

export type { ToolPermissionRequest } from './sse/types'
export type { ChatStatus }

export function useAgentChat() {
  const agentStore = useAgentStore()
  const messageQueue = useMessageQueue()
  const permissionQueue = usePermissionQueue()

  const status = ref<ChatStatus>('ready')
  const error = ref<string | null>(null)
  let abortCtrl: AbortController | null = null

  function setStatus(s: ChatStatus) {
    status.value = s
  }

  function setError(e: string) {
    error.value = e
  }

  // =================== 发送消息 ===================

  async function sendMessage(text: string) {
    const sessionId = agentStore.currentSessionId

    messageQueue.addUser(text)

    const assistantId = messageQueue.addAssistant()
    const ctx = createStreamContext(assistantId)

    status.value = 'submitted'
    error.value = null

    abortCtrl = new AbortController()
    const baseUrl = import.meta.env.VITE_APP_BASE_API_URL || '/api/v1'
    const token = getToken()

    const streamDeps = {
      messageQueue,
      permissionQueue,
      agentStore,
      onStatusChange: setStatus,
      onError: setError,
    }

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
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          status.value = 'streaming'
        },

        onmessage(event) {
          if (!event.data) return
          let parsed: unknown
          try {
            parsed = JSON.parse(event.data)
          } catch {
            return
          }
          if (!isSSEEvent(parsed)) return
          handleSSEEvent(parsed, ctx, streamDeps)
        },

        onerror(err) {
          const msg = err instanceof Error ? err.message : String(err)
          setStatus('error')
          setError(msg)
          messageQueue.updateParts(ctx.assistantId, [{ type: 'text', text: msg || '连接中断', state: 'done' }])
          throw err
        },

        openWhenHidden: true,
      })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : String(err)
        setStatus('error')
        setError(msg)
        messageQueue.updateParts(ctx.assistantId, [{ type: 'text', text: msg || '无响应', state: 'done' }])
      }
    }
  }

  // =================== 加载历史会话 ===================

  async function loadSession(id: string) {
    const { data, error: err } = await getSession(id)
    if (err || !data) return
    const detail = data.data
    if (!detail) return
    messageQueue.setMessages(convertDbMessagesToUIMessages(detail.messages))
  }

  // =================== 权限处理 ===================

  async function approvePermission(requestId: string, updatedInput?: Record<string, unknown>) {
    const { error } = await respondPermission({ requestId, allow: true, updatedInput })
    if (!error) permissionQueue.remove(requestId)
  }

  async function denyPermission(requestId: string, message?: string) {
    const { error } = await respondPermission({ requestId, allow: false, message })
    if (!error) permissionQueue.remove(requestId)
  }

  // =================== 停止 ===================

  function stop() {
    abortCtrl?.abort()
    abortCtrl = null
    status.value = 'ready'
  }

  return {
    messages: messageQueue.messages,
    status: readonly(status),
    error: readonly(error),
    pendingRequests: permissionQueue.pending,
    sendMessage,
    stop,
    loadSession,
    clearMessages: messageQueue.clear,
    approvePermission,
    denyPermission,
  }
}

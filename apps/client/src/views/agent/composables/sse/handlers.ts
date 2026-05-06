/**
 * SSE 事件处理器
 * 将 SSE 事件转换为对 MessageQueue / PermissionQueue / AgentStore 的操作
 */

import type { UIMessage } from 'ai'
import type { MessageQueue } from '../useMessageQueue'
import type { PermissionQueue } from '../usePermissionQueue'
import type { SSEEvent, SDKMessage } from './types'
import { extractTextDelta, extractOrderedContent } from '../sse-parser'
import type { OrderedContentBlock } from '../sse-parser'
import { buildSystemErrorText } from '../message-converter'
import type { useAgentStore } from '@/stores/useAgentStore'

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'

export interface StreamDependencies {
  messageQueue: MessageQueue
  permissionQueue: PermissionQueue
  agentStore: ReturnType<typeof useAgentStore>
  onStatusChange: (status: ChatStatus) => void
  onError: (error: string) => void
}

export interface StreamContext {
  assistantId: string
  accumulatedText: string
  turnCount: number
  finalized: boolean
}

export function createStreamContext(assistantId: string): StreamContext {
  return {
    assistantId,
    accumulatedText: '',
    turnCount: 0,
    finalized: false,
  }
}

/** 若当前消息已被 assistant 事件关闭，创建新消息用于后续内容 */
function ensureOpenMessage(ctx: StreamContext, messageQueue: MessageQueue) {
  if (!ctx.finalized) return
  messageQueue.updateTextState(ctx.assistantId, 'done')
  ctx.assistantId = messageQueue.addAssistant()
  ctx.accumulatedText = ''
  ctx.finalized = false
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

function handleSDKMessage(raw: SDKMessage, ctx: StreamContext, deps: StreamDependencies) {
  if (raw.type === 'stream_event') {
    const delta = extractTextDelta(raw)
    if (delta) {
      ensureOpenMessage(ctx, deps.messageQueue)
      ctx.accumulatedText += delta
      deps.messageQueue.updateParts(ctx.assistantId, [{ type: 'text', text: ctx.accumulatedText, state: 'streaming' }])
    }
    return
  }

  if (raw.type === 'assistant') {
    ensureOpenMessage(ctx, deps.messageQueue)
    const blocks = extractOrderedContent(raw)
    if (blocks.length > 0) {
      deps.messageQueue.updateParts(ctx.assistantId, buildPartsFromBlocks(blocks, 'streaming'))
      ctx.accumulatedText = blocks
        .filter((b): b is OrderedContentBlock & { type: 'text' } => b.type === 'text')
        .map((b) => b.text)
        .join('')
    }
    ctx.turnCount++
    ctx.finalized = true
    return
  }

  if (raw.type === 'session_created') {
    if (raw.sessionId) deps.agentStore.selectSession(raw.sessionId)
    return
  }

  if (raw.type === 'system') {
    const text = buildSystemErrorText(raw)
    if (text) {
      deps.onStatusChange('error')
      deps.onError(text)
      deps.messageQueue.addSystemError(text)
    }
    return
  }
}

export function handleSSEEvent(event: SSEEvent, ctx: StreamContext, deps: StreamDependencies) {
  switch (event.type) {
    case 'sdk_message': {
      handleSDKMessage(event.raw, ctx, deps)
      break
    }
    case 'tool_permission_request': {
      deps.permissionQueue.push({
        requestId: event.requestId,
        toolName: event.toolName,
        input: event.input,
      })
      break
    }
    case 'done': {
      deps.onStatusChange('ready')
      deps.messageQueue.updateTextState(ctx.assistantId, 'done')
      deps.agentStore.fetchSessions()
      break
    }
    case 'error': {
      deps.onStatusChange('error')
      deps.onError(event.message)
      deps.messageQueue.updateParts(ctx.assistantId, [{ type: 'text', text: event.message, state: 'done' }])
      break
    }
  }
}

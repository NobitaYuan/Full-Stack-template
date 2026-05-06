/**
 * 将数据库存储的消息转换为 UIMessage 格式
 * 用于加载历史会话时恢复消息列表
 */

import type { UIMessage } from 'ai'
import { extractOrderedContent } from './sse-parser'
import type { components } from '@/api/api-types'

type AgentMessage = components['schemas']['AgentMessage']

/**
 * 将数据库中的 AgentMessage[] 转换为 UIMessage[]
 *
 * @example
 * // 输入 — 数据库中的 AgentMessage[]（raw 字段是 JSON 字符串）
 * [
 *   { id: 'msg_1', type: 'user',    raw: '{"content":"查询所有用户"}' },
 *   { id: 'msg_2', type: 'assistant', raw: '{"message":{"content":[{"type":"text","text":"好的，让我查询"},{"type":"tool_use","name":"query_users","id":"toolu_01","input":{}}]}}' },
 *   { id: 'msg_3', type: 'assistant', raw: '{"message":{"content":[{"type":"text","text":"共3个用户"}]}}' },
 * ]
 * // 输出 — 前端渲染用的 UIMessage[]（保持 text/tool 原始交错顺序）
 * [
 *   { id: 'msg_1', role: 'user', parts: [{ type: 'text', text: '查询所有用户' }] },
 *   { id: 'msg_2', role: 'assistant', parts: [
 *     { type: 'text', text: '好的，让我查询', state: 'done' },
 *     { type: 'dynamic-tool', toolName: 'query_users', toolCallId: 'toolu_01', state: 'output-available', input: {} },
 *   ] },
 *   { id: 'msg_3', role: 'assistant', parts: [
 *     { type: 'text', text: '共3个用户', state: 'done' },
 *   ] },
 * ]
 */
export function convertDbMessagesToUIMessages(dbMessages: AgentMessage[]): UIMessage[] {
  const result: UIMessage[] = []

  for (const dbMsg of dbMessages) {
    if (dbMsg.type === 'user') {
      const converted = convertUserMessage(dbMsg)
      if (converted) result.push(converted)
    } else if (dbMsg.type === 'assistant') {
      const converted = convertAssistantMessage(dbMsg)
      if (converted) result.push(converted)
    }
  }

  return result
}

function convertUserMessage(dbMsg: AgentMessage): UIMessage | null {
  let text = ''
  try {
    const raw = JSON.parse(dbMsg.raw)
    text = typeof raw.content === 'string' ? raw.content : String(raw.content ?? '')
  } catch {
    text = dbMsg.raw
  }
  if (!text) return null
  return { id: dbMsg.id, role: 'user', parts: [{ type: 'text', text }] }
}

function convertAssistantMessage(dbMsg: AgentMessage): UIMessage | null {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(dbMsg.raw)
  } catch {
    return null
  }

  const blocks = extractOrderedContent(raw)
  if (blocks.length === 0) return null

  const parts: UIMessage['parts'] = blocks.map((block) => {
    if (block.type === 'text') {
      return { type: 'text' as const, text: block.text, state: 'done' as const }
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

  return { id: dbMsg.id, role: 'assistant', parts }
}

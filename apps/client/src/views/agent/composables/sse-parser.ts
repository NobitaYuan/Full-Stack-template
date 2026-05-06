/**
 * 解析 SSE 事件中的 SDK 原始消息
 * 将 Claude Agent SDK 的消息格式转换为前端可用的结构
 */

/** 有序内容块 — 保持 SDK 消息中 text/tool_use 的原始交错顺序 */
export type OrderedContentBlock = { type: 'text'; text: string } | { type: 'tool_use'; toolName: string; toolCallId: string; args: Record<string, unknown> }

/**
 * 从 SDK stream_event 中提取增量文本
 *
 * @example
 * // 输入 — SDK stream_event 原始数据（通过 SSE sdk_message 事件的 raw 字段传入）
 * { event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '你好' } } }
 * // 输出
 * '你好'
 */
export function extractTextDelta(raw: Record<string, unknown>): string | null {
  const event = raw.event as Record<string, unknown> | undefined
  if (!event || event.type !== 'content_block_delta') return null
  const delta = event.delta as Record<string, unknown> | undefined
  if (delta?.type === 'text_delta' && typeof delta.text === 'string') return delta.text
  return null
}

/**
 * 从 SDK assistant 消息中提取有序内容块，保持原始交错顺序
 *
 * @example
 * // 输入 — SDK assistant 消息原始数据（raw.type === 'assistant'）
 * {
 *   message: {
 *     content: [
 *       { type: 'text', text: '查询结果如下：' },
 *       { type: 'tool_use', name: 'query_users', id: 'toolu_01ABC', input: { page: 1, pageSize: 10 } },
 *       { type: 'text', text: '请稍等...' },
 *     ],
 *   },
 * }
 * // 输出 — 保持原始交错顺序
 * [
 *   { type: 'text', text: '查询结果如下：' },
 *   { type: 'tool_use', toolName: 'query_users', toolCallId: 'toolu_01ABC', args: { page: 1, pageSize: 10 } },
 *   { type: 'text', text: '请稍等...' },
 * ]
 */
export function extractOrderedContent(raw: Record<string, unknown>): OrderedContentBlock[] {
  const message = raw.message as Record<string, unknown> | undefined
  if (!message) return []

  const content = message.content as Array<Record<string, unknown>> | undefined
  if (!content) return []

  const blocks: OrderedContentBlock[] = []

  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      blocks.push({ type: 'text', text: block.text })
    } else if (block.type === 'tool_use') {
      blocks.push({
        type: 'tool_use',
        toolName: (block.name as string) || '',
        toolCallId: (block.id as string) || crypto.randomUUID(),
        args: (block.input as Record<string, unknown>) || {},
      })
    }
  }

  return blocks
}

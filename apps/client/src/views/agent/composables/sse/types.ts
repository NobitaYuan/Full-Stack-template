/**
 * SSE 推送事件类型定义 + 类型守卫
 * 取代 useAgentChat 中的 Record<string, unknown> 运行时断言
 */

export interface ToolPermissionRequest {
  requestId: string
  toolName: string
  input: Record<string, unknown>
}

export type SSEEvent =
  | { type: 'sdk_message'; raw: SDKMessage }
  | { type: 'tool_permission_request'; requestId: string; toolName: string; input: Record<string, unknown> }
  | { type: 'done' }
  | { type: 'error'; message: string }

export type SDKMessage =
  | { type: 'stream_event'; event: unknown }
  | { type: 'assistant'; message: unknown }
  | { type: 'session_created'; sessionId: string }
  | { type: 'system'; [key: string]: unknown }

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

export function isSSEEvent(val: unknown): val is SSEEvent {
  if (!isObject(val)) return false
  const type = val.type
  if (typeof type !== 'string') return false

  switch (type) {
    case 'sdk_message':
      return isObject(val.raw)
    case 'tool_permission_request':
      return typeof val.requestId === 'string' && typeof val.toolName === 'string' && isObject(val.input)
    case 'done':
      return true
    case 'error':
      return typeof val.message === 'string'
    default:
      return false
  }
}

export function isSDKMessage(val: unknown): val is SDKMessage {
  if (!isObject(val)) return false
  const type = val.type
  if (typeof type !== 'string') return false

  switch (type) {
    case 'stream_event':
    case 'assistant':
      return true
    case 'session_created':
      return typeof val.sessionId === 'string'
    case 'system':
      return true
    default:
      return false
  }
}

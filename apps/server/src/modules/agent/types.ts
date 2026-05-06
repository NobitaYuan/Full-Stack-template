/** SSE 事件类型：SDK 消息透传 */
export type SDKSSEEvent = {
  type: 'sdk_message'
  raw: unknown
}

/** SSE 事件类型：工具权限请求（需用户决策） */
export type ToolPermissionRequestSSEEvent = {
  type: 'tool_permission_request'
  requestId: string
  toolName: string
  input: Record<string, unknown>
}

/** SSE 事件类型：流结束 */
export type DoneSSEEvent = {
  type: 'done'
}

/** SSE 事件类型：错误 */
export type ErrorSSEEvent = {
  type: 'error'
  message: string
}

export type AgentSSEEvent = SDKSSEEvent | ToolPermissionRequestSSEEvent | DoneSSEEvent | ErrorSSEEvent

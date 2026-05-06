/**
 * 权限请求队列 Composable
 * 管理工具权限请求（tool_permission_request）的增删
 */

import type { ToolPermissionRequest } from './sse/types'

export interface PermissionQueue {
  readonly pending: Ref<readonly ToolPermissionRequest[]>
  push(req: ToolPermissionRequest): void
  remove(requestId: string): void
  clear(): void
}

export function usePermissionQueue(): PermissionQueue {
  const pending = ref<ToolPermissionRequest[]>([])

  function push(req: ToolPermissionRequest) {
    pending.value = [...pending.value, req]
  }

  function remove(requestId: string) {
    pending.value = pending.value.filter((r) => r.requestId !== requestId)
  }

  function clear() {
    pending.value = []
  }

  return {
    pending: readonly(pending),
    push,
    remove,
    clear,
  }
}

# useAgentChat Composable 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `useAgentChat.ts` 拆分为职责单一的模块，消除类型不安全、错误处理分散、函数过大等问题，保持外部接口不变。

**Architecture:** 提取 `useMessageQueue`（消息状态）、`usePermissionQueue`（权限队列）、`sse/types.ts`（类型守卫）、`sse/handlers.ts`（事件处理）四个模块；主 `useAgentChat.ts` 仅负责 SSE 连接建立和模块组合。

**Tech Stack:** Vue 3 Composition API, TypeScript, `@microsoft/fetch-event-source`, `ai` (UIMessage)

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `composables/useMessageQueue.ts` | 新建 | 消息列表的增删改查原子操作 |
| `composables/usePermissionQueue.ts` | 新建 | 权限请求队列管理 |
| `composables/sse/types.ts` | 新建 | SSE 推送事件类型定义 + 类型守卫 |
| `composables/sse/handlers.ts` | 新建 | SSE 事件分发与处理逻辑 |
| `composables/useAgentChat.ts` | 大幅修改 | 连接管理 + 模块组合，瘦身至 ~120 行 |

---

### Task 1: SSE 事件类型定义与守卫

**Files:**
- Create: `apps/client/src/views/agent/composables/sse/types.ts`

**上下文：** 当前 `useAgentChat.ts` 中所有 SSE 事件使用 `Record<string, unknown>`，运行时靠断言取值。本任务为每个 SSE 事件定义具体类型和类型守卫，消除 `as string` 强制转换。

- [ ] **Step 1: 编写类型定义与守卫**

```typescript
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
      return (
        typeof val.requestId === 'string' &&
        typeof val.toolName === 'string' &&
        isObject(val.input)
      )
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
    case 'session_created':
      return typeof val.sessionId === 'string'
    case 'system':
      return true
    default:
      return false
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/client/src/views/agent/composables/sse/types.ts
git commit -m "$(cat <<'EOF'
feat(agent): SSE 事件类型定义与守卫

为 SSE 推送消息添加具体类型和类型守卫函数，
取代 useAgentChat 中的 Record<string, unknown> 运行时断言。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 消息队列 Composable

**Files:**
- Create: `apps/client/src/views/agent/composables/useMessageQueue.ts`

**上下文：** 当前 `useAgentChat.ts` 中内联了 `pushUserMessage`、`pushAssistantPlaceholder`、`pushSystemMessage`、`setParts`、`setPartsState` 等函数，与 SSE 处理逻辑耦合。本任务将这些操作提取为独立的 `useMessageQueue` composable。

- [ ] **Step 1: 编写 useMessageQueue**

```typescript
/**
 * 消息队列 Composable
 * 负责 UIMessage[] 的增删改查原子操作
 */

import type { UIMessage } from 'ai'

export interface MessageQueue {
  readonly messages: Ref<readonly UIMessage[]>
  addUser(text: string): void
  addAssistant(): string
  addSystemError(text: string): void
  updateParts(id: string, parts: UIMessage['parts']): void
  updateTextState(id: string, state: 'streaming' | 'done'): void
  setMessages(msgs: UIMessage[]): void
  clear(): void
}

export function useMessageQueue(): MessageQueue {
  const messages = ref<UIMessage[]>([])

  function addUser(text: string) {
    messages.value = [
      ...messages.value,
      {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      },
    ]
  }

  function addAssistant(): string {
    const id = crypto.randomUUID()
    messages.value = [
      ...messages.value,
      {
        id,
        role: 'assistant',
        parts: [{ type: 'text', text: '', state: 'streaming' }],
      },
    ]
    return id
  }

  function addSystemError(text: string) {
    messages.value = [
      ...messages.value,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        parts: [{ type: 'text', text, state: 'done' }],
      },
    ]
  }

  function updateParts(id: string, parts: UIMessage['parts']) {
    const idx = messages.value.findIndex((m) => m.id === id)
    if (idx === -1) return
    messages.value = [
      ...messages.value.slice(0, idx),
      { ...messages.value[idx], parts },
      ...messages.value.slice(idx + 1),
    ]
  }

  function updateTextState(id: string, state: 'streaming' | 'done') {
    const idx = messages.value.findIndex((m) => m.id === id)
    if (idx === -1) return
    const msg = messages.value[idx]
    const parts = msg.parts.map((p) => (p.type === 'text' ? { ...p, state } : p))
    messages.value = [
      ...messages.value.slice(0, idx),
      { ...msg, parts },
      ...messages.value.slice(idx + 1),
    ]
  }

  function setMessages(msgs: UIMessage[]) {
    messages.value = msgs
  }

  function clear() {
    messages.value = []
  }

  return {
    messages: readonly(messages),
    addUser,
    addAssistant,
    addSystemError,
    updateParts,
    updateTextState,
    setMessages,
    clear,
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/client/src/views/agent/composables/useMessageQueue.ts
git commit -m "$(cat <<'EOF'
feat(agent): 提取消息队列为独立 composable

将消息列表的增删改查操作从 useAgentChat 中提取为 useMessageQueue，
职责单一，便于独立测试和维护。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 权限队列 Composable

**Files:**
- Create: `apps/client/src/views/agent/composables/usePermissionQueue.ts`

**上下文：** 当前 `useAgentChat.ts` 中 `pendingRequests` 和 `approvePermission`/`denyPermission` 与消息状态混在同一文件中。本任务将其提取。

- [ ] **Step 1: 编写 usePermissionQueue**

```typescript
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
```

- [ ] **Step 2: 提交**

```bash
git add apps/client/src/views/agent/composables/usePermissionQueue.ts
git commit -m "$(cat <<'EOF'
feat(agent): 提取权限队列为独立 composable

将 pendingRequests 和 approve/deny 操作提取为 usePermissionQueue。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: SSE 事件处理器

**Files:**
- Create: `apps/client/src/views/agent/composables/sse/handlers.ts`
- Modify: `apps/client/src/views/agent/composables/useAgentChat.ts`（删除将被提取的逻辑，暂不修改，留到 Task 5）

**上下文：** 当前 `handleSDKMessage`、`ensureOpenMessage`、`buildPartsFromBlocks` 内联在 `useAgentChat.ts` 中，依赖闭包变量 `messages`。本任务将其提取为显式依赖注入的纯函数处理器。

- [ ] **Step 1: 编写 handlers.ts**

```typescript
/**
 * SSE 事件处理器
 * 将 SSE 事件转换为对 MessageQueue / PermissionQueue / AgentStore 的操作
 */

import type { UIMessage } from 'ai'
import type { MessageQueue } from '../useMessageQueue'
import type { PermissionQueue } from '../usePermissionQueue'
import type { SSEEvent, SDKMessage } from './types'
import { extractTextDelta, extractOrderedContent } from './sse-parser'
import type { OrderedContentBlock } from './sse-parser'
import { buildSystemErrorText } from './message-converter'
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
function buildPartsFromBlocks(
  blocks: OrderedContentBlock[],
  textState: 'streaming' | 'done',
): UIMessage['parts'] {
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
      deps.messageQueue.updateParts(ctx.assistantId, [
        { type: 'text', text: ctx.accumulatedText, state: 'streaming' },
      ])
    }
    return
  }

  if (raw.type === 'assistant') {
    ensureOpenMessage(ctx, deps.messageQueue)
    const blocks = extractOrderedContent(raw)
    if (blocks.length > 0) {
      deps.messageQueue.updateParts(
        ctx.assistantId,
        buildPartsFromBlocks(blocks, 'streaming'),
      )
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

export function handleSSEEvent(
  event: SSEEvent,
  ctx: StreamContext,
  deps: StreamDependencies,
) {
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
      deps.messageQueue.updateParts(ctx.assistantId, [
        { type: 'text', text: event.message, state: 'done' },
      ])
      break
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add apps/client/src/views/agent/composables/sse/handlers.ts
git commit -m "$(cat <<'EOF'
feat(agent): 提取 SSE 事件处理器

将 handleSDKMessage、ensureOpenMessage、buildPartsFromBlocks 提取为 sse/handlers.ts，
通过显式依赖注入（StreamDependencies）取代闭包耦合。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 重构主 Composable

**Files:**
- Modify: `apps/client/src/views/agent/composables/useAgentChat.ts`

**上下文：** 将主 composable 精简为仅负责：模块初始化、SSE 连接配置、错误处理收敛、对外暴露接口。

- [ ] **Step 1: 重写 useAgentChat.ts**

```typescript
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
import type { SSEEvent } from './sse/types'
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
          messageQueue.updateParts(ctx.assistantId, [
            { type: 'text', text: msg || '连接中断', state: 'done' },
          ])
          throw err
        },

        openWhenHidden: true,
      })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : String(err)
        setStatus('error')
        setError(msg)
        messageQueue.updateParts(ctx.assistantId, [
          { type: 'text', text: msg || '无响应', state: 'done' },
        ])
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
```

- [ ] **Step 2: 提交**

```bash
git add apps/client/src/views/agent/composables/useAgentChat.ts
git commit -m "$(cat <<'EOF'
refactor(agent): 精简 useAgentChat 为主 composable

移除内联的消息操作和 SSE 处理逻辑，改用 useMessageQueue、
usePermissionQueue、sse/handlers 模块，主 composable 仅负责连接和编排。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 类型检查与验证

**Files:**
- 验证范围：`apps/client/src/views/agent/composables/` 下所有文件

- [ ] **Step 1: 运行类型检查**

```bash
pnpm --filter @repo/client vue-tsc --noEmit
```

Expected: 无类型错误。若出现 `cannot find module` 错误，检查导入路径是否正确。

- [ ] **Step 2: 运行 lint**

```bash
pnpm --filter @repo/client lint
```

Expected: 无 lint 错误。

- [ ] **Step 3: 格式化**

```bash
pnpm format
```

- [ ] **Step 4: 提交修复（如有）**

```bash
git add -A
git commit -m "$(cat <<'EOF'
style(agent): 格式化重构后的 composable 代码

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

### Spec 覆盖检查

| 设计文档章节 | 对应任务 |
|-------------|---------|
| 4.1 useMessageQueue | Task 2 |
| 4.2 usePermissionQueue | Task 3 |
| 4.3 SSE Types | Task 1 |
| 4.4 SSE Handlers | Task 4 |
| 4.5 useAgentChat（主 composable） | Task 5 |
| 6. 错误处理策略 | Task 5（错误收敛到 setStatus/setError） |
| 7. 迁移影响 | 全部任务完成后验证（Task 6） |

**无遗漏。**

### Placeholder 扫描

- 无 TBD/TODO
- 无 "add appropriate error handling" 等模糊描述
- 每个任务包含完整可运行代码
- 类型、方法名在全部任务中保持一致

### 类型一致性检查

- `ToolPermissionRequest` 定义在 `sse/types.ts`，被 `usePermissionQueue.ts` 和 `useAgentChat.ts` 复用
- `ChatStatus` 定义在 `sse/handlers.ts`，被 `useAgentChat.ts` 复用
- `MessageQueue` / `PermissionQueue` 接口名在所有任务中一致
- `StreamContext` / `StreamDependencies` 只在 `handlers.ts` 中定义和使用

**全部一致。**

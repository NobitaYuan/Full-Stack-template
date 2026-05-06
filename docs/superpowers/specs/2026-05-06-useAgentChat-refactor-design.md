# useAgentChat Composable 重构设计

## 1. 背景

当前 `apps/client/src/views/agent/composables/useAgentChat.ts` 承担过多职责：
- 消息列表的增删改查（pushUser/pushAssistant/setParts/setPartsState）
- SSE 连接生命周期管理（fetchEventSource 配置、回调、AbortController）
- SSE 事件解析与状态转换（handleSDKMessage、ensureOpenMessage）
- 权限请求队列管理（pendingRequests、approve/deny）
- 历史会话加载（loadSession）

单文件 290 行，函数混杂、状态操作散落、错误处理分散，导致可读性和可维护性差。

## 2. 目标

- **职责单一**：每个模块只负责一件事
- **类型安全**：SSE 事件从 `Record<string, unknown>` 升级为带守卫的具体类型
- **错误统一**：所有错误归约为统一模式，处理逻辑集中
- **主 composable 变薄**：只负责模块组合和 SSE 连接初始化
- **零行为变更**：重构不修改外部接口和 UI 行为

## 3. 架构设计

```
useAgentChat.ts          ← 主 composable：连接管理 + 模块组合
├── useMessageQueue.ts   ← 消息列表状态 + 操作方法
├── usePermissionQueue.ts ← 权限请求队列 + 响应操作
└── sse/
    ├── types.ts         ← SSE 事件类型定义 + 类型守卫
    └── handlers.ts      ← SSE 事件处理器（纯函数，依赖 MessageQueue 接口）
```

## 4. 模块详细设计

### 4.1 useMessageQueue

**职责**：管理 `UIMessage[]` 的增删改查，提供原子操作。

```typescript
export interface MessageQueue {
  readonly messages: Ref<readonly UIMessage[]>
  addUser(text: string): void
  addAssistant(): string          // 返回 assistant message id
  addSystemError(text: string): void
  updateParts(id: string, parts: UIMessage['parts']): void
  updateTextState(id: string, state: 'streaming' | 'done'): void
  setMessages(msgs: UIMessage[]): void
  clear(): void
}

export function useMessageQueue(): MessageQueue
```

**设计要点**：
- 所有消息操作通过 `crypto.randomUUID()` 生成 id
- `updateParts` / `updateTextState` 通过 id 查找并不可变更新
- `addSystemError` 将系统错误渲染为 assistant 角色的文本消息（与现有行为一致）
- 返回 `readonly` 引用防止外部直接修改

### 4.2 usePermissionQueue

**职责**：管理工具权限请求队列的增删。

```typescript
export interface PermissionQueue {
  readonly pending: Ref<readonly ToolPermissionRequest[]>
  push(req: ToolPermissionRequest): void
  remove(requestId: string): void
  clear(): void
}

export function usePermissionQueue(): PermissionQueue
```

### 4.3 SSE Types

**职责**：定义 SSE 推送的具体类型和类型守卫，取代 `Record<string, unknown>`。

```typescript
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

export function isSSEEvent(val: unknown): val is SSEEvent
export function isSDKMessage(val: unknown): val is SDKMessage
```

### 4.4 SSE Handlers

**职责**：将 SSE 事件转换为对 MessageQueue / PermissionQueue / AgentStore 的操作。

```typescript
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

export function createStreamContext(assistantId: string): StreamContext

export function handleSSEEvent(
  event: SSEEvent,
  ctx: StreamContext,
  deps: StreamDependencies,
): void
```

**设计要点**：
- `StreamContext` 仍为可变对象（因为流式处理天然是过程式的），但不再通过闭包副作用传递，而是显式传入传出
- `handleSSEEvent` 为纯函数：给定 event + context + dependencies，产生副作用（调用 queue 方法）
- `ensureOpenMessage` 逻辑内嵌在 handler 中，不暴露为独立函数
- 文本增量通过 `sse-parser.ts` 的 `extractTextDelta` 提取
- assistant 消息通过 `sse-parser.ts` 的 `extractOrderedContent` 提取

### 4.5 useAgentChat（主 composable）

**职责**：初始化各模块、建立 SSE 连接、对外暴露统一接口。

```typescript
export function useAgentChat() {
  const agentStore = useAgentStore()
  const messageQueue = useMessageQueue()
  const permissionQueue = usePermissionQueue()

  const status = ref<ChatStatus>('ready')
  const error = ref<string | null>(null)
  let abortCtrl: AbortController | null = null

  // SSE 连接配置与生命周期
  async function sendMessage(text: string) { ... }
  function stop() { ... }

  // 历史加载
  async function loadSession(id: string) { ... }

  // 权限响应（透传 permissionQueue 操作）
  async function approvePermission(requestId: string, updatedInput?: Record<string, unknown>) { ... }
  async function denyPermission(requestId: string, message?: string) { ... }

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

**瘦身后的结构**：
- `sendMessage` 只负责：push 用户消息 → 创建 assistant placeholder → 构建请求 → 配置 fetchEventSource → 在回调中调用 `handleSSEEvent`
- 错误处理统一：所有运行时错误归约为 `error.value` + `status.value = 'error'`，并在 assistant 消息中显示错误文本

## 5. 数据流

```
用户输入
  → useAgentChat.sendMessage()
    → messageQueue.addUser(text)
    → messageQueue.addAssistant() → ctx.assistantId
    → fetchEventSource()
      → onmessage(event.data)
        → isSSEEvent() 类型守卫
        → handleSSEEvent(event, ctx, deps)
          → type === 'sdk_message' → handleSDKMessage()
            → stream_event → messageQueue.updateParts() / updateTextState()
            → assistant → messageQueue.updateParts() + ctx.finalized = true
            → session_created → agentStore.selectSession()
            → system → messageQueue.addSystemError()
          → type === 'tool_permission_request' → permissionQueue.push()
          → type === 'done' → status = 'ready' + messageQueue.updateTextState() + agentStore.fetchSessions()
          → type === 'error' → onError() + messageQueue.updateParts()
      → onerror(err) → onError()
    → catch(err) → onError()
```

## 6. 错误处理策略

统一为三层：
1. **协议层错误**（HTTP 非 2xx）：`onopen` 抛出，被 catch 捕获
2. **SSE 事件层错误**（`type: 'error'`）：在 `handleSSEEvent` 中通过 `onError` 回调处理
3. **连接层错误**（网络中断等）：`onerror` 中通过 `onError` 回调处理

所有错误最终收敛到：
- `status.value = 'error'`
- `error.value = '具体错误信息'`
- 在 assistant 消息中追加/更新错误文本（保证用户可见）
- `AbortError` 特殊处理：只重置状态，不显示错误

## 7. 迁移影响

- **外部接口不变**：`useAgentChat()` 的返回值和类型签名保持完全一致
- **组件无感知**：`index.vue`、`PermissionCard.vue`、`SessionList.vue` 无需修改
- **新增文件**：
  - `composables/useMessageQueue.ts`
  - `composables/usePermissionQueue.ts`
  - `composables/sse/types.ts`
  - `composables/sse/handlers.ts`
- **修改文件**：
  - `composables/useAgentChat.ts`（大幅精简）
- **删除内容**：`useAgentChat.ts` 中内联的消息操作函数和 SSE 处理函数

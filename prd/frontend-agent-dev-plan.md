# 前端 AI Agent 开发计划

> 配套 PRD：[`prd/ai-agent.md`](ai-agent.md)
>
> 前置条件（开发者手动完成）：
> - shadcn-vue 已初始化（`npx shadcn-vue@latest init`）
> - ai-elements-vue 组件已安装到项目（`npx ai-elements-vue@latest add conversation message prompt-input tool reasoning code-block`）
> - 后端 Phase 1 已完成（SSE chat endpoint 可用）
>
> 开发规范参考：
> - `apps/client/CLAUDE.md` — 前端开发规范
> - `/hono` skill — 后端 SSE endpoint 实现参考

---

## Phase 1：基础聊天页面

**目标：** 跑通 "用户输入 → SSE 流式返回 → 消息实时渲染" 链路。无会话管理，刷新即丢失。

### Step 1：安装依赖

```bash
cd apps/client
pnpm add ai lucide-vue-next vue-stream-markdown
```

| 包 | 用途 |
|---|------|
| `ai` | AI SDK 类型定义（`UIMessage`、`ChatStatus`），ai-elements-vue 组件内部依赖 |
| `lucide-vue-next` | 图标库，ai-elements-vue 组件使用 |
| `vue-stream-markdown` | Markdown 流式渲染，Message 组件依赖 |

### Step 2：创建 SSE 客户端 + 消息状态 composable

**文件：`src/views/agent/composables/useAgentChat.ts`**

核心职责：
1. 发送消息（POST `fetch` + Bearer token）
2. 解析 SSE 流（`ReadableStream` + `TextDecoder`）
3. 将 SDK 消息转换为 `UIMessage` 格式
4. 管理流式状态（`submitted` → `streaming` → `ready` / `error`）

#### 导出接口

```typescript
import type { UIMessage, ChatStatus } from 'ai'

interface UseAgentChatReturn {
  messages: Ref<UIMessage[]>
  status: Ref<ChatStatus>         // 'submitted' | 'streaming' | 'ready' | 'error'
  sendMessage: (text: string) => Promise<void>
  stop: () => void                // 中断 SSE 流
  setMessages: (msgs: UIMessage[]) => void  // Phase 2 加载历史用
}
```

#### SSE 解析器

使用原生 `fetch` + `ReadableStream`（`EventSource` 只支持 GET，不适用于 POST SSE）。

```typescript
async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<AgentSSEEvent> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const event of events) {
      const dataLine = event
        .split('\n')
        .find((line) => line.startsWith('data: '))

      if (!dataLine) continue

      const json = dataLine.slice(6) // 去掉 'data: ' 前缀
      try {
        yield JSON.parse(json) as AgentSSEEvent
      } catch {
        // 跳过无效 JSON
      }
    }
  }
}
```

#### UIMessage 转换规则

`useAgentChat` 内部维护一个"正在构建的 assistant 消息"（`currentAssistantMsg`），每收到一个 SSE 事件就更新它。

| SSE 事件 | SDK `raw.type` | 处理 |
|----------|---------------|------|
| `sdk_message` | `stream_event`（text delta） | 追加文本到 `currentAssistantMsg` 的 text part |
| `sdk_message` | `stream_event`（tool_use delta） | 创建/更新 tool-invocation part（state: `partial-call`） |
| `sdk_message` | `assistant`（text content） | 定稿 text part |
| `sdk_message` | `assistant`（tool_use content） | 定稿 tool-invocation part（state: `call`） |
| `sdk_message` | `result` | 提取 usage，标记本轮结束 |
| `done` | — | status = `ready` |
| `error` | — | status = `error`，展示错误信息 |

> **注意：** 上述转换规则基于 Agent SDK 文档。实际实现时需要观察 `query()` 的真实输出，调整字段映射。第一轮建议先 `console.log` 所有 SSE 事件，确认结构后再写转换逻辑。

#### `sendMessage` 伪代码

```typescript
async function sendMessage(text: string) {
  // 1. 添加 user message
  messages.value = [
    ...messages.value,
    { id: generateId(), role: 'user', content: text, parts: [{ type: 'text', text }], createdAt: new Date() }
  ]

  // 2. 准备 assistant message 占位
  const assistantId = generateId()
  const assistantMsg: UIMessage = {
    id: assistantId,
    role: 'assistant',
    content: '',
    parts: [],
    createdAt: new Date(),
  }
  messages.value = [...messages.value, assistantMsg]
  status.value = 'submitted'

  // 3. 发送 SSE 请求
  const token = getToken()
  abortController = new AbortController()

  const response = await fetch('/api/v1/agent/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message: text }),
    signal: abortController.signal,
  })

  status.value = 'streaming'

  // 4. 解析 SSE 流并更新 assistantMsg
  const reader = response.body!.getReader()
  try {
    for await (const event of parseSSEStream(reader)) {
      if (event.type === 'sdk_message') {
        // 根据 raw.type 更新 assistantMsg 的 parts
        updateAssistantMessage(assistantMsg, event.raw)
      } else if (event.type === 'done') {
        status.value = 'ready'
      } else if (event.type === 'error') {
        status.value = 'error'
        // TODO: 展示错误
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      status.value = 'error'
    }
  }
}
```

### Step 3：创建聊天页面

**文件：`src/views/agent/index.vue`**

页面布局：全高填充，底部固定输入框，中间消息列表滚动。

```vue
<script setup lang="ts">
import { useAgentChat } from './composables/useAgentChat'

const { messages, status, sendMessage, stop } = useAgentChat()
</script>

<template>
  <div class="agent-page">
    <!-- 消息列表区域 -->
    <div class="agent-conversation">
      <!-- 使用 ai-elements-vue Conversation + Message 组件 -->
      <!-- 遍历 messages，按 parts 类型渲染 text / tool-invocation / reasoning -->
    </div>

    <!-- 输入区域 -->
    <div class="agent-input">
      <!-- 使用 ai-elements-vue PromptInput 组件 -->
      <!-- Enter 发送，Shift+Enter 换行 -->
      <!-- streaming 状态下显示停止按钮 -->
    </div>
  </div>
</template>

<style lang="scss" scoped>
.agent-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.agent-conversation {
  flex: 1;
  overflow-y: auto;
}
.agent-input {
  flex-shrink: 0;
  border-top: 1px solid var(--td-border-level-1-color);
  padding: 12px;
}
</style>
```

> **组件使用细节：** ai-elements-vue 组件以源码形式安装在项目中（shadcn 风格）。安装后查看 `src/components/ai-elements/` 下各组件的 props 和 slots，按实际 API 对接。上方模板仅供参考结构。

> **样式注意：** 聊天页面需要占据父容器的全部高度。现有 layout 的 `.bd` 区域是 `flex: 1; overflow: auto`。聊天页面需要 `height: 100%` 并自行管理滚动（仅消息区域滚动），不能让外层 `.bd` 滚动。

### Step 4：注册路由 + 导航

**改 `src/router/index.ts`：**

```typescript
{
  path: '/agent',
  name: 'agent',
  meta: { title: 'AI 助手' },
  component: () => import('@/views/agent/index.vue'),
},
```

**改 `src/layout/nav.vue`：**

在 `navList` 数组中添加：

```typescript
{ name: 'AI 助手', path: '/agent', icon: 'chat' },
```

> 图标名使用 TDesign 内置图标，确认 `chat` 是否可用，不可用则选 `root-list` 或其他。

### Step 5：验证

1. `pnpm dev` 启动前后端
2. 登录后导航到 `/agent`
3. 输入 "查询所有用户" → 验证：
   - 消息流式显示（逐字出现）
   - 工具调用展示（折叠面板显示 query_users 参数和结果）
   - 最终 assistant 总结文本
   - `done` 后输入框恢复可用
4. 输入无效内容 → 验证错误处理

**调试技巧：** Phase 1 的第一步建议在 `parseSSEStream` 中对每个 yield 的事件 `console.log`，观察后端实际发送的 SSE 数据结构，再据此完善 UIMessage 转换逻辑。

---

## Phase 2：会话管理

**目标：** 会话列表侧边栏 + 历史消息加载 + 会话切换 + 持久化。

### Step 1：生成 API 类型

后端 Phase 2 完成后运行：

```bash
pnpm generate:api
```

确认 `src/api/agent/agent.d.ts` 正确生成（包含 `AgentSession`、`AgentMessage` 等类型）。

### Step 2：创建 Agent API 模块

**文件：`src/api/agent/index.ts`**

```typescript
import { request } from '../request'

/** 会话列表 */
export function getSessionList() {
  return request.GET('/api/v1/agent/sessions')
}

/** 创建会话 */
export function createSession(body?: { title?: string }) {
  return request.POST('/api/v1/agent/sessions', { body })
}

/** 获取会话详情（含消息历史） */
export function getSession(id: string) {
  return request.GET('/api/v1/agent/sessions/{id}', { params: { path: { id } } })
}

/** 删除会话 */
export function deleteSession(id: string) {
  return request.DELETE('/api/v1/agent/sessions/{id}', { params: { path: { id } } })
}

/** 更新会话标题 */
export function updateSessionTitle(id: string, body: { title: string }) {
  return request.PATCH('/api/v1/agent/sessions/{id}', { params: { path: { id } }, body })
}
```

### Step 3：创建 Pinia Store

**文件：`src/stores/useAgentStore/index.ts`**

```typescript
// Setup 风格
export const useAgentStore = defineStore('agent', () => {
  const sessions = ref<SessionItem[]>([])
  const currentSessionId = ref<string | null>(null)
  const loading = ref(false)

  /** 获取会话列表 */
  async function fetchSessions() { /* ... */ }

  /** 创建新会话 */
  async function createSession(title?: string) { /* ... */ }

  /** 选择会话 */
  function selectSession(id: string) {
    currentSessionId.value = id
  }

  /** 删除会话 */
  async function deleteSession(id: string) { /* ... */ }

  /** 更新标题 */
  async function updateTitle(id: string, title: string) { /* ... */ }

  return { sessions, currentSessionId, loading, fetchSessions, createSession, selectSession, deleteSession, updateTitle }
})
```

> SessionItem 类型从自动生成的 `agent.d.ts` 中导入。

### Step 4：创建会话列表侧边栏

**文件：`src/views/agent/components/SessionList.vue`**

使用 **TDesign** 组件（侧边栏不属于 AI 聊天核心区域，保持项目一致性）：

- 顶部：`<t-button>` 新建会话
- 列表：`<t-list>` + `<t-list-item>`，显示会话标题 + 时间
- 选中高亮：当前 `currentSessionId` 对应的项
- 操作：删除（`<t-popconfirm>` 确认）、双击重命名

```vue
<script setup lang="ts">
import { useAgentStore } from '@/stores/useAgentStore'

const agentStore = useAgentStore()
const { sessions, currentSessionId } = storeToRefs(agentStore)

onMounted(() => agentStore.fetchSessions())
</script>
```

### Step 5：改造 useAgentChat composable

扩展支持会话：

1. **`sendMessage` 增加 `sessionId` 参数：**

   ```typescript
   body: JSON.stringify({
     sessionId: currentSessionId.value || undefined,
     message: text,
   })
   ```

2. **新增 `loadSession(id)` 方法：**

   - 调用 `getSession(id)` API 获取会话详情（含 `messages` 数组）
   - 遍历 `messages`，将每条 `raw`（JSON 字符串）反序列化为 SDK 消息
   - 按创建时间排序后，转换为 `UIMessage[]`
   - 调用 `setMessages()` 更新

3. **新增 `currentSessionId` ref：**

   - composable 内部维护，与 store 同步
   - 发送消息后从 `done` 事件或首次响应中获取 `sessionId`

### Step 6：改造聊天页面

布局改为左右分栏：

```
┌──────────────────────────────────────┐
│  Header (nav bar)                    │
├──────────┬───────────────────────────┤
│ Session  │  Chat Area                │
│ List     │                           │
│ (280px)  │  ┌─────────────────────┐  │
│          │  │ Conversation        │  │
│          │  │ (scrollable)        │  │
│          │  └─────────────────────┘  │
│          │  ┌─────────────────────┐  │
│          │  │ PromptInput         │  │
│          │  └─────────────────────┘  │
└──────────┴───────────────────────────┘
```

**`index.vue` 改动：**

```vue
<template>
  <div class="agent-page">
    <SessionList class="agent-sidebar" />
    <div class="agent-main">
      <!-- 空状态 / 聊天区域 -->
      <div v-if="!currentSessionId" class="agent-empty">
        选择或新建一个会话开始对话
      </div>
      <template v-else>
        <div class="agent-conversation">...</div>
        <div class="agent-input">...</div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.agent-page {
  height: 100%;
  display: flex;
}
.agent-sidebar {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--td-border-level-1-color);
}
.agent-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
</style>
```

### Step 7：验证

完整流程测试：

1. `GET /agent` → 空状态
2. 点击新建 → 创建会话，侧边栏出现新项
3. 输入 "查询用户" → SSE 流式返回 + 工具调用展示
4. 刷新页面 → 会话列表恢复，点击会话加载历史消息
5. 继续发送消息 → 验证 session resume（上下文延续）
6. 切换到另一个会话 → 消息切换正确
7. 删除会话 → 确认弹窗 → 删除成功，切换到空状态

---

## 文件清单

### 修改现有文件

| 文件 | Phase | 改动 |
|------|-------|------|
| `src/router/index.ts` | 1 | 添加 `/agent` 路由 |
| `src/layout/nav.vue` | 1 | 添加 AI 助手导航项 |
| `package.json` | 1 | 添加 `ai`、`lucide-vue-next`、`vue-stream-markdown` 依赖 |

### 新建文件

| Phase | 文件 | 说明 |
|-------|------|------|
| 1 | `views/agent/index.vue` | 聊天主页面（布局 + 组件组合） |
| 1 | `views/agent/composables/useAgentChat.ts` | SSE 客户端 + UIMessage 状态管理 |
| 2 | `api/agent/index.ts` | Session CRUD API 封装 |
| 2 | `api/agent/agent.d.ts` | 自动生成的类型（`pnpm generate:api`） |
| 2 | `stores/useAgentStore/index.ts` | 会话列表状态管理 |
| 2 | `views/agent/components/SessionList.vue` | 会话列表侧边栏 |

> 所有路径相对于 `apps/client/src/`。

---

## 关键设计决策

| # | 决策 | 理由 |
|---|------|------|
| 1 | 自建 `useAgentChat`，不用 `useChat()` | 后端是自定义 SSE 协议，AI SDK 的 `useChat()` 期望特定流格式，无法直接对接 |
| 2 | 数据转换在 composable 层完成 | 后端保持简单的 `sdk_message` 透传，前端在状态管理层做 SDK 消息 → `UIMessage` 转换 |
| 3 | SSE 客户端用 `fetch` + `ReadableStream` | `EventSource` 只支持 GET，后端 chat endpoint 是 POST |
| 4 | 会话侧边栏用 TDesign | 侧边栏是标准 UI 组件，不属于 AI 聊天核心区域，保持项目 TDesign 一致性 |
| 5 | 聊天区域用 ai-elements-vue | PRD 约定，AI 交互组件使用专用库获得最佳体验 |
| 6 | Store 管理会话列表，composable 管理当前聊天 | 职责分离：会话列表跨组件共享，聊天状态跟随当前页面 |
| 7 | 历史消息从 `raw` 字段反序列化 | `raw` 存储完整 SDK 消息 JSON，可精确还原为 `UIMessage` |

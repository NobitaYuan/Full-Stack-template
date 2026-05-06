# 02-ask-user-question — AskUserQuestion 人机交互

## 开发前置

开始实现前，先阅读以下文档了解项目规范：
- 后端规范：`apps/server/CLAUDE.md`（z 导入源、路由模式、响应格式、端到端安全的开发模式等）
  - 注意查看skills里的add-module内容，了解后端模块开发规范
- 前端规范：`apps/client/CLAUDE.md`（API 封装、组件使用、状态管理等）
- 项目总览：根目录 `CLAUDE.md`（monorepo 结构、命令、类型安全流程）

实现完成后：
- 运行 `pnpm generate:api`（涉及 API 变更时）
- 确认 TypeScript 编译无错误
- 验证现有功能不受影响

> **状态：** 待开发
>
> **核心原理：** SDK 内置 `AskUserQuestion` 工具 → `canUseTool` 回调拦截 → SSE 推给前端 → 用户回答 → `updatedInput` 回传答案 → 模型继续生成
>
> **参考实现：** `D:\coding\claudecodeWebServer\claude-sdk.js` 第 547-625 行（canUseTool 统一处理所有工具调用的真实项目代码）
>
> **参考资料：**
> - 掘金：https://juejin.cn/post/7607589189266751526
> - Claude Code Hooks 文档：https://code.claude.com/docs/en/hooks
> - TypeScript SDK 类型：`PermissionResult = { behavior: 'allow', updatedInput?: Record<string, unknown> } | { behavior: 'deny', message: string }`

## 数据流

```
模型调用 AskUserQuestion { questions: [...] }
  → canUseTool 触发，toolName === 'AskUserQuestion'
  → 推 tool_permission_request 到 SSE 队列（包含 requestId、toolName、input）
  → SSE 流推到前端
  → 前端根据 toolName === 'AskUserQuestion' 渲染选项 UI
  → 用户选择/输入
  → 前端 POST /agent/permission { requestId, allow: true, updatedInput: { questions, answers } }
  → 后端 resolve Promise
  → canUseTool 返回 { behavior: 'allow', updatedInput: { questions, answers } }
  → 模型收到答案，继续生成
```

## 验收标准

- [ ] 用户说"帮我规划旅游" → 模型调用 AskUserQuestion → 前端显示选项 UI → 用户选择 → 模型继续
- [ ] 用户说"删除用户张三" → 模型调用 AskUserQuestion 确认 → 用户确认/取消 → 模型执行或放弃
- [ ] 用户说"查询所有用户" → 模型直接调用 MCP query_users（自动放行），不询问
- [ ] TypeScript 编译无错误
- [ ] 现有功能不受影响

---

## 后端

### BE-ASK-1 恢复异步队列 + canUseTool 类型

**文件：** `apps/server/src/modules/agent/agent.service.ts`

从 `@anthropic-ai/claude-agent-sdk` 导入 `CanUseTool` 和 `PermissionResult` 类型。

新增：
- `createAsyncQueue<T>()` 工厂函数（之前删除的，恢复）
- `PendingPermission` 接口：`{ originalInput: Record<string, unknown>, resolve: (result: PermissionResult) => void }`
- `pendingPermissions` Map（`requestId → PendingPermission`）

**验收：**
- [ ] 类型定义正确，编译通过

---

### BE-ASK-2 实现 canUseTool 回调

**文件：** `apps/server/src/modules/agent/agent.service.ts`

在 `streamAgentChat` 内部定义 `canUseTool` 回调，参照 claude-sdk.js 第 547-625 行的模式：

```typescript
const canUseTool: CanUseTool = async (toolName, input, context) => {
  // MCP 工具自动放行（query_users、create_user 等）
  const MCP_TOOL_NAMES = ['query_users', 'create_user', 'update_user', 'delete_user']
  if (MCP_TOOL_NAMES.includes(toolName)) {
    return { behavior: 'allow', updatedInput: input }
  }

  // AskUserQuestion 和其他内置工具 → 推给前端让用户处理
  const requestId = generateId()
  queue.push({
    type: 'tool_permission_request',
    requestId,
    toolName,
    input,
  })

  // 等待前端回传用户决策
  return new Promise<PermissionResult>((resolve) => {
    pendingPermissions.set(requestId, { originalInput: input, resolve })
  })
}
```

**验收：**
- [ ] MCP 工具调用时直接放行，不推 SSE 事件
- [ ] AskUserQuestion 调用时推 `tool_permission_request` 事件并等待 Promise
- [ ] Promise resolve 时返回 `{ behavior: 'allow', updatedInput: { ...originalInput, answers } }`

---

### BE-ASK-3 改造 streamAgentChat

**文件：** `apps/server/src/modules/agent/agent.service.ts`

改回后台执行 + 队列推送模式：

1. SDK 的 `query()` 在后台 `async IIFE` 中执行
2. SDK 消息 push 到 `queue`
3. `streamAgentChat` 从 `queue` yield 给 SSE 流
4. `finally` 块清理未处理的 `pendingPermissions`

`query()` options 变更：
- `tools: ['AskUserQuestion']`（启用内置 AskUserQuestion）
- 新增 `canUseTool` 回调
- 其他 options 不变

```typescript
export async function* streamAgentChat(
  prompt: string, sessionId?: string, userId?: string,
): AsyncGenerator<AgentSSEEvent> {
  const config = getConfig()
  const logger = getLogger()
  const queue = createAsyncQueue<AgentSSEEvent>()

  // ... 创建/恢复会话逻辑（同现有） ...

  const canUseTool = /* BE-2 的实现 */

  // 后台执行 query
  ;(async () => {
    try {
      const messageStream = query({
        prompt,
        options: {
          model: 'claude-sonnet-4-6',
          mcpServers: { business: mcpServer },
          tools: ['AskUserQuestion'],
          systemPrompt: SYSTEM_PROMPT,
          maxTurns: 20,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          canUseTool,
          env,
          cwd: process.cwd(),
          resume: resumeSessionId,
          includePartialMessages: true,
        },
      })

      if (dbSessionId) saveMessage(dbSessionId, { type: 'user', content: prompt })

      for await (const msg of messageStream) {
        const msgType = (msg as Record<string, unknown>).type as string
        queue.push({ type: 'sdk_message', raw: msg })
        // ... 持久化逻辑（同现有） ...
      }
      queue.push({ type: 'done' })
    } catch (err) {
      queue.push({ type: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      queue.close()
      for (const [, pending] of pendingPermissions) {
        pending.resolve({ behavior: 'deny', message: '会话已关闭' })
      }
      pendingPermissions.clear()
    }
  })()

  while (true) {
    const event = await queue.next()
    if (event === null) break
    yield event
    if (event.type === 'done' || event.type === 'error') break
  }
}
```

**验收：**
- [ ] SSE 流正常推送 sdk_message 事件
- [ ] AskUserQuestion 调用时推送 `tool_permission_request` 事件
- [ ] 流结束时清理 pendingPermissions

---

### BE-ASK-4 更新 SSE 事件类型

**文件：** `apps/server/src/modules/agent/types.ts`

新增 `ToolPermissionRequestSSEEvent`：

```typescript
export type ToolPermissionRequestSSEEvent = {
  type: 'tool_permission_request'
  requestId: string
  toolName: string
  input: Record<string, unknown>
}

export type AgentSSEEvent =
  | SDKSSEEvent
  | ToolPermissionRequestSSEEvent
  | DoneSSEEvent
  | ErrorSSEEvent
```

**验收：**
- [ ] 类型完整，编译通过

---

### BE-ASK-5 定义 Permission Schema + Route

**文件：** `apps/server/src/modules/agent/agent.schema.ts`

新增 Schema，遵循项目规范（`z` 从 `@hono/zod-openapi` 导入，`.openapi('Name')` 注册命名组件，`.describe()` 中文描述）：

```typescript
export const PermissionRequestSchema = z
  .object({
    requestId: z.string().describe('权限请求 ID'),
    allow: z.boolean().describe('是否允许工具执行'),
    updatedInput: z.record(z.unknown()).optional()
      .describe('修改后的工具输入（AskUserQuestion 时传回 { questions, answers }）'),
    message: z.string().optional().describe('拒绝原因（allow=false 时）'),
  })
  .describe('权限决策请求')
  .openapi('PermissionRequest')

export const PermissionResponseSchema = z
  .object({ ok: z.literal(true).describe('操作成功') })
  .describe('权限响应')
  .openapi('PermissionResponse')

export const permissionRoute = createRoute({
  method: 'post',
  path: '/permission',
  request: { body: { content: { 'application/json': { schema: PermissionRequestSchema } } } },
  responses: {
    200: { content: { 'application/json': { schema: apiSchema(PermissionResponseSchema) } }, description: '权限决策已处理' },
  },
})
```

**文件：** `apps/server/src/modules/agent/agent.route.ts`

使用 `createRoute` 标准模式：

```typescript
import { ChatRequestSchema, permissionRoute, listRoute, /* ... */ } from './agent.schema.js'
import { streamAgentChat, pendingPermissions, /* ... */ } from './agent.service.js'

agentApp.openapi(permissionRoute, async (c) => {
  const body = c.req.valid('json')
  const pending = pendingPermissions.get(body.requestId)
  if (!pending) throw new NotFoundError('权限请求已过期')

  pendingPermissions.delete(body.requestId)

  if (body.allow) {
    pending.resolve({
      behavior: 'allow',
      updatedInput: body.updatedInput ?? pending.originalInput,
    })
  } else {
    pending.resolve({
      behavior: 'deny',
      message: body.message ?? '用户拒绝',
    })
  }
  return success(c, { ok: true })
})
```

**验收：**
- [ ] `z` 从 `@hono/zod-openapi` 导入
- [ ] Schema 有 `.openapi('PermissionRequest')` / `.openapi('PermissionResponse')`
- [ ] 路由使用 `createRoute` 标准模式，不是 `app.post()`
- [ ] `pnpm generate:api` 成功生成前端类型

---

### BE-ASK-6 更新系统提示

**文件：** `apps/server/src/modules/agent/agent.service.ts`

SYSTEM_PROMPT 增加对 `AskUserQuestion` 的使用指引：

```
规则：
- 使用中文回复
- 当你需要用户提供信息、做选择、或确认操作时，使用 AskUserQuestion 工具询问用户
- 危险操作（如删除）执行前必须用 AskUserQuestion 确认
- 操作完成后给出简洁的结果摘要
- 不要编造数据，只展示工具返回的真实数据
- 用户信息中不包含密码等敏感字段
```

---

## 前端

### FE-ASK-1 运行 generate:api + 新增 API 封装

后端 BE-ASK-5 完成后，运行 `pnpm generate:api` 生成前端类型。

**文件：** `apps/client/src/api/agent/index.ts`

使用 `openapi-fetch` + 生成的类型（符合项目规范）：

```typescript
/** 响应工具权限请求（包括 AskUserQuestion） */
export function respondPermission(body: {
  requestId: string
  allow: boolean
  updatedInput?: Record<string, unknown>
  message?: string
}) {
  return request.POST('/api/v1/agent/permission', { body })
}
```

**验收：**
- [ ] `pnpm generate:api` 成功
- [ ] 使用 `openapi-fetch`（`request.POST`），不是 raw `fetch`
- [ ] 请求/响应有类型提示

---

### FE-ASK-2 扩展 useAgentChat

**文件：** `apps/client/src/views/agent/composables/useAgentChat.ts`

SSE 事件类型无 OpenAPI spec（SSE 是非标准 REST），需手动定义。但 API 调用使用 `openapi-fetch` 生成的类型：

```typescript
import { respondPermission } from '@/api/agent'

/** SSE 推送的权限/问答请求（手动类型，SSE 不走 OpenAPI） */
export interface ToolPermissionRequest {
  requestId: string
  toolName: string
  input: Record<string, unknown>
}

export function useAgentChat() {
  // ... 现有 ...
  const pendingRequests = ref<ToolPermissionRequest[]>([])

  // SSE onmessage 新增：
  // } else if (type === 'tool_permission_request') {
  //   pendingRequests.value.push({
  //     requestId: parsed.requestId as string,
  //     toolName: parsed.toolName as string,
  //     input: (parsed.input as Record<string, unknown>) ?? {},
  //   })
  // }

  /** 允许工具调用（openapi-fetch，类型安全） */
  async function approvePermission(requestId: string, updatedInput?: Record<string, unknown>) {
    const { error } = await respondPermission({ requestId, allow: true, updatedInput })
    if (!error) pendingRequests.value = pendingRequests.value.filter(r => r.requestId !== requestId)
  }

  /** 拒绝工具调用 */
  async function denyPermission(requestId: string, message?: string) {
    const { error } = await respondPermission({ requestId, allow: false, message })
    if (!error) pendingRequests.value = pendingRequests.value.filter(r => r.requestId !== requestId)
  }

  return {
    // ... 现有 ...
    pendingRequests: readonly(pendingRequests),
    approvePermission,
    denyPermission,
  }
}
```

**验收：**
- [ ] 导出 `pendingRequests`、`approvePermission`、`denyPermission`
- [ ] SSE `tool_permission_request` 事件正确推入 `pendingRequests`
- [ ] API 调用遵循 CLAUDE.md 组件 API 接入规范

---

### FE-ASK-3 新建 PermissionCard 组件

**文件：** 新建 `apps/client/src/views/agent/components/PermissionCard.vue`

使用 TDesign 组件。根据 `toolName` 条件渲染：

**AskUserQuestion（`toolName === 'AskUserQuestion'`）：**
- 多个问题时用 `t-tabs` 按 `header`（或"问题 N"）切换
- 每个问题渲染预设选项按钮 + 最后一个 `t-input` 供用户自定义回答
- 所有问题都有答案后确认按钮才可点击
- 提交时构造 `updatedInput: { ...request.input, answers: { "问题文本": "答案" } }`

**其他工具：**
- 简单的 approve/deny 按钮

```vue
<script setup lang="ts">
import type { ToolPermissionRequest } from '../composables/useAgentChat'

const props = defineProps<{ request: ToolPermissionRequest }>()
const emit = defineEmits<{
  approve: [requestId: string, updatedInput?: Record<string, unknown>]
  deny: [requestId: string]
}>()

const answers = reactive<Record<string, string>>({})
const activeTab = ref('0')

function isAskUser() {
  return props.request.toolName === 'AskUserQuestion'
}

interface QuestionItem {
  question: string
  header?: string
  options?: Array<{ label: string; description?: string }>
}

function getQuestions(): QuestionItem[] {
  if (!isAskUser()) return []
  return (props.request.input.questions as QuestionItem[]) ?? []
}

const questions = computed(() => getQuestions())

const allAnswered = computed(() => {
  if (questions.value.length === 0) return false
  return questions.value.every(q => answers[q.question]?.trim())
})

function selectOption(question: string, label: string) {
  answers[question] = label
}

function handleAnswer() {
  const updatedInput = {
    ...props.request.input,
    answers,
  }
  emit('approve', props.request.requestId, updatedInput)
}
</script>

<template>
  <!-- AskUserQuestion：选项 UI -->
  <t-card v-if="isAskUser()" class="permission-card">
    <!-- 多个问题时用 Tab 切换 -->
    <t-tabs v-if="questions.length > 1" v-model="activeTab">
      <t-tab-panel
        v-for="(q, idx) in questions"
        :key="idx"
        :value="String(idx)"
        :label="q.header || `问题 ${idx + 1}`"
      >
        <div class="question-item">
          <p class="question-text">{{ q.question }}</p>
          <div class="options">
            <t-button
              v-for="opt in q.options"
              :key="opt.label"
              :variant="answers[q.question] === opt.label ? 'base' : 'outline'"
              @click="selectOption(q.question, opt.label)"
            >
              {{ opt.label }}
              <span v-if="opt.description" class="opt-desc">{{ opt.description }}</span>
            </t-button>
          </div>
          <t-input
            v-model="answers[q.question]"
            placeholder="或输入自定义回答..."
            class="custom-input"
          />
        </div>
      </t-tab-panel>
    </t-tabs>

    <!-- 单个问题时不用 Tab -->
    <div v-else-if="questions.length === 1" class="question-item">
      <p class="question-text">{{ questions[0].question }}</p>
      <div class="options">
        <t-button
          v-for="opt in questions[0].options"
          :key="opt.label"
          :variant="answers[questions[0].question] === opt.label ? 'base' : 'outline'"
          @click="selectOption(questions[0].question, opt.label)"
        >
          {{ opt.label }}
        </t-button>
      </div>
      <t-input
        v-model="answers[questions[0].question]"
        placeholder="或输入自定义回答..."
        class="custom-input"
      />
    </div>

    <t-button
      theme="primary"
      :disabled="!allAnswered"
      @click="handleAnswer"
    >
      确认
    </t-button>
  </t-card>

  <!-- 其他工具：approve/deny -->
  <t-card v-else class="permission-card">
    <p>工具 {{ request.toolName }} 请求执行权限</p>
    <t-button theme="primary" @click="emit('approve', request.requestId)">允许</t-button>
    <t-button theme="danger" @click="emit('deny', request.requestId)">拒绝</t-button>
  </t-card>
</template>

<style lang="scss" scoped>
.permission-card {
  margin: 12px 0;
}
.question-item {
  padding: 12px 0;
}
.question-text {
  font-weight: 500;
  margin-bottom: 8px;
}
.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.opt-desc {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-left: 4px;
}
.custom-input {
  margin-top: 8px;
}
</style>
```

**验收：**
- [ ] 多问题 Tab 切换正常
- [ ] 每个问题有选项按钮 + 自定义输入框
- [ ] 全部回答后才可提交
- [ ] TDesign 组件，`t-` 前缀自动导入

---

### FE-ASK-4 集成到聊天页面

**文件：** `apps/client/src/views/agent/index.vue`

在消息列表区域渲染 `PermissionCard`：

```vue
<PermissionCard
  v-for="req in pendingRequests"
  :key="req.requestId"
  :request="req"
  @approve="approvePermission"
  @deny="denyPermission"
/>
```

**验收：**
- [ ] AskUserQuestion 调用时页面显示问题卡片
- [ ] 用户回答后卡片消失，模型继续生成
- [ ] 不影响现有聊天功能

---

## 开发顺序

后端 BE-ASK-1 → BE-ASK-6（顺序执行） → `pnpm generate:api` → 前端 FE-ASK-1 → FE-ASK-4

## 需要验证的点

1. **`tools: ['AskUserQuestion']`** — 类型是 `string[]`，编译没问题。运行时需确认 SDK 识别此工具名。如果不识别，模型将无法调用 AskUserQuestion
2. **`updatedInput` 格式** — 参照参考实现，AskUserQuestion 的 `updatedInput` 应为 `{ ...originalInput, answers: { "问题文本": "答案" } }`。需实测确认
3. **`permissionMode: 'bypassPermissions'` + `canUseTool`** — 需确认 bypass 模式下 `canUseTool` 是否仍被调用（参考实现 `claude-sdk.js` 表明是的）

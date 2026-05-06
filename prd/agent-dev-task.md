# AI Agent 模块 — 项目看板

> 单 Agent 顺序执行：先后端，再前端。后端开发中积累的 SSE 协议、SDK API 等心智直接复用到前端。
>
> 配套文档：
> - PRD：[`prd/ai-agent.md`](ai-agent.md)
> - 后端开发计划：[`prd/backend-agent-dev-plan.md`](backend-agent-dev-plan.md)
> - 前端开发计划：[`prd/frontend-agent-dev-plan.md`](frontend-agent-dev-plan.md)
> - 后端规范：`apps/server/CLAUDE.md`
> - 前端规范：`apps/client/CLAUDE.md`

---

## 当前进度

**阶段：** 前置条件待完成

| 步骤 | 状态 |
|------|------|
| 前置条件 | ⬜ |
| 后端 Phase 1：最小可用 | ⬜ |
| 后端 Phase 2：完整 CRUD + 会话 | ⬜ |
| 前端 Phase 1：基础聊天页面 | ⬜ |
| 前端 Phase 2：会话管理 | ⬜ |

---

## 前置条件

> 开发者手动完成，AI 助手无法自动执行。

- [x] 配置 `apps/server/.env`：加 `ANTHROPIC_API_KEY=sk-ant-xxx`、`ANTHROPIC_BASE_URL=`（可选，默认 Anthropic 官方，填其他厂商 URL 即可切换）
- [x] 安装后端依赖：`cd apps/server && pnpm add @anthropic-ai/claude-agent-sdk`
- [x] 安装前端依赖：`cd apps/client && npx shadcn-vue@latest add https://registry.ai-elements-vue.com/all.json`
---

## 后端 Phase 1：最小可用版本

> 跑通 "用户发消息 → Agent SDK 处理 → SSE 流式返回" 链路。

### BE-1.1 配置环境变量

改 `apps/server/src/core/config/index.ts`，envSchema 加：

```typescript
ANTHROPIC_API_KEY: z.string().min(1),
ANTHROPIC_BASE_URL: z.string().optional(),  // 可选，用于接入其他兼容厂商
```

`query()` 调用时，如果 `ANTHROPIC_BASE_URL` 有值则传入对应的 base URL 配置。

**验收：**
- [ ] 缺少 `ANTHROPIC_API_KEY` 启动报错
- [ ] `ANTHROPIC_BASE_URL` 可选，不填走默认
- [ ] `query()` 中正确使用 base URL（如有）

---

### BE-1.2 创建模块骨架

新建 `apps/server/src/modules/agent/`，完整文件：

```
modules/agent/
├── index.ts            # 导出 agentApp（createRouteApp() 创建）
├── agent.route.ts      # SSE chat endpoint
├── agent.schema.ts     # 占位
├── agent.service.ts    # 占位
├── tools/
│   ├── index.ts        # MCP server 注册
│   └── user.tools.ts   # query_users 工具
└── types.ts            # 类型定义
```

**验收：** 目录完整，`pnpm --filter @repo/server build` 编译通过

---

### BE-1.3 定义 MCP 工具（query_users）

- `tools/user.tools.ts`：`tool()` 定义 query_users，handler 调用 `userService.listUsers()`
- `tools/index.ts`：`createSdkMcpServer()` 注册，name `"business"`

**注意：** Agent SDK 的 `tool()` / `createSdkMcpServer()` 导入路径以实际安装的 SDK 版本为准，先 `console.log` 确认导出再写。

**验收：**
- 工具参数：keyword (optional), page (default 1), pageSize (default 10, max 100)
- 返回 `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- annotations: `{ readOnlyHint: true }`

---

### BE-1.4 实现 SSE Chat Endpoint

在 `agent.route.ts` 实现 `POST /chat`：

- `app.post('/chat', handler)` 注册（不走 createRoute）
- 请求体 Zod 手动 parse：`{ message: string }`
- `streamSSE()` from `hono/streaming` 流式输出
- SSE 协议：`sdk_message` → `done` → `error`（见 PRD 第 7 节）
- 认证：`c.get('userId')`

**参考：** Hono streaming 文档 https://hono.dev/docs/helpers/streaming

**验收：**
- SSE 流包含 `data: {"type":"sdk_message","raw":...}` 格式事件
- 最终发送 `data: {"type":"done"}`
- 错误场景发送 `data: {"type":"error","message":"..."}`
- 无 token 返回 401

---

### BE-1.5 注册路由

改 `apps/server/src/app.ts`：

```typescript
import { agentApp } from './modules/agent/index.js'
api.route('/agent', agentApp)
app.use(`${API_PREFIX}/agent/*`, authMiddleware)
```

**验收：** `/api/v1/agent/chat` 可访问，其他路由不受影响

---

### BE-1.6 Phase 1 验证

```bash
pnpm dev
# 注册用户获取 token 后：
curl -N -X POST http://localhost:3000/api/v1/agent/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "查询所有用户"}'
```

**验收：**
- [ ] SSE 流包含 sdk_message 事件（文本 + query_users 调用 + 结果）
- [ ] 最终有 done 事件
- [ ] TypeScript 编译无错误
- [ ] 现有功能不受影响

---

## 后端 Phase 2：完整 CRUD + 会话持久化

> Phase 1 验证通过后开始。

### BE-2.1 新增数据库表

新建 `apps/server/src/core/db/agent/`（db.ts + schema.ts + index.ts）

- `ai_sessions` 和 `ai_messages` 表定义对齐 PRD 第 5 节数据模型
- 改 `core/db/index.ts`：import agent schema + initDb 建表
- 改 `drizzle.config.ts`：schema 改为多入口数组

**验收：**
- [ ] `pnpm dev` 自动建表
- [ ] Zod schema `.openapi()` 注册命名组件
- [ ] 现有表不受影响

---

### BE-2.2 实现 Agent Service

实现 `agent.service.ts` 全部方法：createSession, getSession, listSessions, deleteSession, updateSessionTitle, saveMessage, getSessionMessages

**验收：**
- [ ] getSession/deleteSession/updateSessionTitle 校验 userId 所有权
- [ ] saveMessage 正确序列化 raw 字段
- [ ] 复用 NotFoundError / ConflictError

---

### BE-2.3 补全 CRUD 工具

新增 `create_user`, `update_user`, `delete_user` + 在 `user.service.ts` 新增 `createUser()`

**验收：**
- [ ] createUser 包含密码哈希 + 用户名唯一性检查
- [ ] delete_user 标记 `destructiveHint: true`

---

### BE-2.4 Session Resume + 消息持久化

改造 chat endpoint：
- 请求体支持 `{ sessionId?: string, message: string }`
- 无 sessionId 创建新会话，有 sessionId 恢复上下文
- `assistant` 消息自动保存，`result` 后更新 agentSessionId

**验收：**
- [ ] 新会话 → 自动创建 ai_session
- [ ] 继续对话 → resume 上下文
- [ ] 消息完整存入 ai_messages

---

### BE-2.5 会话管理 API

新建 `agent.schema.ts` + 在 route 中新增 5 个 CRUD endpoint（createRoute 标准模式）

**验收：**
- [ ] GET/POST sessions, GET/PATCH/DELETE sessions/:id
- [ ] GET /sessions/:id 返回消息历史
- [ ] `pnpm generate:api` 类型正确导出

---

### BE-2.6 Phase 2 验证

**验收：**
- [ ] 完整 CRUD 对话流程通过
- [ ] 数据库数据正确
- [ ] `pnpm generate:api` 成功
- [ ] 现有 auth/user 测试通过
- [ ] TypeScript 编译无错误

---

## 前端 Phase 1：基础聊天页面

> 依赖后端 Phase 1 完成。利用后端开发中积累的 SSE 协议心智。

### FE-1.1 创建 useAgentChat composable

新建 `apps/client/src/views/agent/composables/useAgentChat.ts`

**核心：** SSE 客户端 + UIMessage 状态管理（替代 `useChat()`）

**关键实现：**
1. `parseSSEStream()` — AsyncGenerator 解析 SSE
2. UIMessage 转换 — 根据后端实际 SSE 事件结构转换（**凭你后端开发的经验来写，不是凭计划猜测**）
3. `sendMessage()` / `stop()` / `setMessages()`

**验收：**
- [ ] 导出完整：messages, status, sendMessage, stop, setMessages
- [ ] streaming 状态下 stop() 能中断
- [ ] 错误状态正确设置

---

### FE-1.2 创建聊天页面

新建 `apps/client/src/views/agent/index.vue`

- 全高 `height: 100%`，底部输入框固定，中间消息区滚动
- 使用 ai-elements-vue 的 Conversation / Message / PromptInput

**验收：**
- [ ] 布局正确，不影响外层 layout 滚动
- [ ] streaming 时显示停止按钮

---

### FE-1.3 注册路由 + 导航

改 `src/router/index.ts` 加 `/agent` 路由，改 `src/layout/nav.vue` 加导航项

**验收：** `/agent` 可访问，导航正常

---

### FE-1.4 Phase 1 验证

- [ ] 输入"查询所有用户" → 流式显示 + 工具调用展示
- [ ] done 后输入框恢复
- [ ] 错误场景有提示

---

## 前端 Phase 2：会话管理

> 依赖后端 Phase 2 完成。

### FE-2.1 API 类型 + 模块

`pnpm generate:api` + 新建 `src/api/agent/index.ts`

### FE-2.2 Pinia Store

新建 `src/stores/useAgentStore/index.ts`（Setup 风格）

### FE-2.3 会话列表侧边栏

新建 `src/views/agent/components/SessionList.vue`（TDesign 组件）

### FE-2.4 改造 composable + 页面

useAgentChat 增加 sessionId/loadSession + 页面改为左右分栏

### FE-2.5 Phase 2 验证

- [ ] 新建/切换/删除会话正常
- [ ] 刷新后历史恢复
- [ ] TypeScript 编译无错误

---

## 质量门禁

### 全局标准

- [ ] 无 `any` 类型
- [ ] TypeScript 编译无错误
- [ ] 现有功能不受影响
- [ ] 代码遵循 `CLAUDE.md` 和相关 skill 规范

---

## Issue 日志

> PO 发现的问题和修改要求，按时间倒序。开发者完成后标注 `[已解决]`。

### Issue #0 — 后端：`agent.service.ts` 使用了错误的 z 导入源

**严重程度：** 高（规范违反 + 潜在兼容性问题）

**问题：** `agent.service.ts` 中 MCP 工具参数 schema 使用 `import { z } from 'zod/v4'`，违反后端 CLAUDE.md 约定。

后端规范明确要求：**`z` 导入源 — 所有 schema 文件中的 `z` 必须从 `'@hono/zod-openapi'` 导入**，只有 `core/config/index.ts`（环境变量校验）例外。

此外 `zod/v4` 是 Zod 4（mini），与 `@hono/zod-openapi` 内置的 Zod 3 是不同版本，混用可能导致 schema 不兼容。

**文件：** `apps/server/src/modules/agent/agent.service.ts`（第 1 行）

**要求：** 改为 `import { z } from '@hono/zod-openapi'`。如果 Agent SDK 的 `tool()` 不兼容 `@hono/zod-openapi` 的 z，需要在注释中说明原因。

---

### Issue #1 — 后端：工具定义应拆到独立目录

**严重程度：** 中（架构规范）

**问题：** 开发计划要求 MCP 工具放在 `modules/agent/tools/` 目录（`user.tools.ts` + `index.ts`），但实际实现把所有工具定义和 MCP server 注册都内联在 `agent.service.ts` 中。这导致 service 文件职责过重（~300 行），违反单一职责原则。

**文件：** `apps/server/src/modules/agent/agent.service.ts`（第 14-122 行）

**要求：**
1. 新建 `modules/agent/tools/user.tools.ts`，把 4 个 tool 定义（queryUsersTool, createUserTool, updateUserTool, deleteUserTool）和 `formatUser` 移入
2. 新建 `modules/agent/tools/index.ts`，把 `createSdkMcpServer()` 注册逻辑和 mcpServer 导出移入
3. `agent.service.ts` 改为 `import { mcpServer } from './tools/index.js'`

---

### Issue #2 — 后端：`agent.schema.ts` 是空文件

**严重程度：** 低（代码整洁）

**问题：** `modules/agent/agent.schema.ts` 是空文件，所有 schema 直接写在了 `agent.route.ts` 里。既然文件存在就应该用起来，或者删掉空文件。

**文件：** `apps/server/src/modules/agent/agent.schema.ts`、`apps/server/src/modules/agent/agent.route.ts`

**要求（二选一）：**
- 方案 A：把 `agent.route.ts` 中的 schema 定义（ChatRequestSchema, SessionListResponseSchema, CreateSessionSchema, UpdateSessionSchema, SessionIdParam, SessionDetailResponseSchema）移到 `agent.schema.ts`，route 文件 import 使用
- 方案 B：删除空的 `agent.schema.ts`

---

### Issue #3 — 后端：keyword 搜索是内存过滤，不是数据库查询

**严重程度：** 中（功能缺陷）

**问题：** `queryUsersTool` 的 keyword 过滤是在拿到全部分页结果后用 `items.filter()` 做的，这意味着只过滤当前页的数据，不是全局搜索。如果第 1 页没有匹配项但第 2 页有，搜索结果会是空的。

**文件：** `apps/server/src/modules/agent/agent.service.ts`（第 35-37 行）

```typescript
// 当前实现（有问题）
const result = await userService.listUsers(args.page, args.pageSize)
let items = result.items
if (args.keyword) {
  items = items.filter((u) => u.username.includes(args.keyword!))
}
```

**要求：** keyword 搜索应该下推到数据库层。在 `user.service.ts` 的 `listUsers()` 增加 keyword 参数，用 Drizzle 的 `like()` 做 SQL LIKE 查询。工具 handler 直接传入 keyword。

---

### Issue #4 — 后端：`permissionMode` 使用了 `bypassPermissions`

**严重程度：** 高（安全）

**问题：** `query()` 调用中 `permissionMode: 'bypassPermissions'` + `allowDangerouslySkipPermissions: true`，这完全绕过了所有权限检查。PRD 要求使用 `acceptEdits`，虽然当前只有自定义业务工具（没有危险内置工具），但这是一个不良的安全实践。

**文件：** `apps/server/src/modules/agent/agent.service.ts`（第 260-261 行）

**要求：** 确认 Agent SDK 是否支持 `permissionMode: 'acceptEdits'`。如果支持，改为 `acceptEdits` 并移除 `allowDangerouslySkipPermissions`。如果 SDK V1 要求 bypassPermissions 才能工作，在代码注释中说明原因。

---

### Issue #5 — 前端：useAgentStore 缺少 persist 配置

**严重程度：** 中（用户体验）

**问题：** `useAgentStore` 没有配置 Pinia persist。用户刷新页面后，当前选中的会话 ID 会丢失。虽然会话列表会从 API 重新加载，但用户会丢失当前浏览位置。

**文件：** `apps/client/src/stores/useAgentStore/index.ts`

**要求：** 参照 `useUserStore` 的 persist 配置，至少持久化 `currentSessionId`：

```typescript
export const useAgentStore = defineStore('agentStore', () => {
  // ...
}, {
  persist: {
    pick: ['currentSessionId'],
  },
})
```

---

### Issue #6 — 前端：useAgentChat SSE 请求路径可能不正确

**严重程度：** 高（功能）

**问题：** `sendMessage()` 中 SSE 请求路径是 `${baseUrl}/agent/chat`，其中 `baseUrl` 取自 `import.meta.env.VITE_APP_BASE_API_URL`。根据 `vite.config.ts` 的代理配置，`VITE_APP_BASE_API_URL` 是代理前缀（如 `/api/v1`），所以实际请求会发到 `/api/v1/agent/chat`。但如果 `VITE_APP_BASE_API_URL` 为空（比如生产环境配置不同），路径会变成 `/agent/chat`，缺少 `/api/v1` 前缀。

**文件：** `apps/client/src/views/agent/composables/useAgentChat.ts`（第 47-51 行）

**要求：** 确认 `VITE_APP_BASE_API_URL` 在所有环境下的值。如果可能为空，应做兜底处理：

```typescript
const baseUrl = import.meta.env.VITE_APP_BASE_API_URL || '/api/v1'
```

---

### Issue #7 — 前端：loadSession 中的类型断言不够安全

**严重程度：** 中（类型安全）

**问题：** `loadSession()` 中用了 `(data as { data: { session: unknown; messages: AgentMessage[] } }).data` 这种深层类型断言。后端 API 的响应格式是 `{ code, message, data: { session, messages } }`，经过 openapi-fetch 解包后，`data` 应该直接就是 `{ session, messages }`。需要确认 openapi-fetch 的实际返回结构。

**文件：** `apps/client/src/views/agent/composables/useAgentChat.ts`（第 192-196 行）

**要求：** 用后端的 OpenAPI spec（或运行时 console.log）确认 openapi-fetch 返回的实际数据结构，消除不安全的类型断言。正确写法应该类似：

```typescript
const { data, error: err } = await getSession(id)
if (err || !data) return
// data 已经是 { session, messages } 格式（openapi-fetch 已解包）
```

---

### Issue #8 — 前端：handleSubmitClick 按钮逻辑反了

**严重程度：** 低（UX）

**问题：** `handleSubmitClick` 函数在 status 为 streaming/submitted 时调用 `stop()`，但它绑定在 PromptInputSubmit 的 `@click` 上。这意味着用户点击"提交"按钮时，如果正在流式输出，会停止而不是提交。虽然这可能是有意设计（同一个按钮切换提交/停止），但函数名 `handleSubmitClick` 容易误导。

**文件：** `apps/client/src/views/agent/index.vue`（第 32-36 行）

**要求：** 重命名为 `handleToggleSubmit` 或 `handleSubmitOrStop`，让意图更清晰。

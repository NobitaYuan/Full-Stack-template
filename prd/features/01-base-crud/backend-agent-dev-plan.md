# 后端 AI Agent 开发计划

> 配套 PRD：[`prd/ai-agent.md`](ai-agent.md)
>
> 开发规范参考：
> - `/add-module` skill — 标准 6 步模块创建流程
> - `/hono` skill — Hono + OpenAPIHono 开发约定
> - `apps/server/CLAUDE.md` — 后端开发规范

---

## Phase 1：最小可用版本

**目标：** 跑通 "用户发消息 → Agent SDK 处理 → SSE 流式返回" 链路。只有一个 `query_users` 工具，无会话持久化。

### Step 1：环境与依赖

**1.1 配置环境变量**

改 `apps/server/src/core/config/index.ts`，envSchema 加：

```typescript
ANTHROPIC_API_KEY: z.string().min(1),
```

改 `apps/server/.env`，加：

```
ANTHROPIC_API_KEY=sk-ant-xxx
```

**1.2 安装 Agent SDK**

```bash
cd apps/server
pnpm add @anthropic-ai/claude-agent-sdk
```

> 安装后检查 SDK 版本，确认是 V1（非 preview）。如果 API 与 PRD 描述不一致，以实际 SDK 导出为准。

### Step 2：创建模块骨架

新建 `apps/server/src/modules/agent/` 目录：

```
modules/agent/
├── index.ts            # 导出 agentApp
├── agent.route.ts      # 路由（Phase 1 只有 SSE chat endpoint）
├── agent.schema.ts     # 请求/响应 schema（Phase 2 用，Phase 1 暂空）
├── agent.service.ts    # 业务逻辑（Phase 1 暂空）
├── tools/
│   ├── index.ts        # MCP server 注册
│   └── user.tools.ts   # query_users 工具
└── types.ts            # 类型定义
```

> 遵循 `/add-module` skill 的"模块四文件"约定：schema / service / route / index。
> SSE endpoint 是特殊路由，不走 `createRoute()` 模式，直接用 `app.post()` 注册。

### Step 3：定义 MCP 工具（仅 query_users）

**文件：`tools/user.tools.ts`**

- 使用 Agent SDK 的 `tool()` API（具体导入路径以 SDK 实际导出为准）
- 参数：
  - `keyword`：`z.string().optional()` — 搜索关键词（Phase 1 暂不实现搜索，仅预留参数）
  - `page`：`z.number().int().min(1).default(1)` — 页码
  - `pageSize`：`z.number().int().min(1).max(100).default(10)` — 每页数量
- handler 内调用现有 `userService.listUsers(page, size)`
  - 参考 `src/modules/user/user.service.ts` 的 `listUsers()` 方法
  - 注意：现有 service 不支持 keyword 搜索，Phase 1 先只传 page/size
- 返回格式：`{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- annotations：`{ readOnlyHint: true }`

**文件：`tools/index.ts`**

- 用 `createSdkMcpServer()` 注册工具（具体 API 以 SDK 实际导出为准）
- server name: `"business"`, version: `"1.0.0"`
- 导出 mcpServer 实例

### Step 4：实现 SSE Chat Endpoint

**文件：`agent.route.ts`**

> SSE 流式响应是本项目首次使用。实现前先用 webReader 抓取 Hono streaming 文档：
> - `https://hono.dev/docs/helpers/streaming` — `streamSSE()` API
> - 或直接读 `https://hono.dev/llms-full.txt` 搜索 streamSSE

关键设计：

- **使用 `createRouteApp()`** 创建 OpenAPIHono 实例（混合注册方案）
- SSE endpoint 用 `app.post('/chat', handler)` 注册（不走 `createRoute()`，流式响应无 JSON response schema）
- `POST /chat`：请求体用 Zod 在 handler 内手动 parse
- 使用 `streamSSE()` from `hono/streaming`
- 遍历 `query()` 的输出，按 PRD 的两分类协议发送 SSE 事件：
  - SDK 消息 → `data: { type: "sdk_message", raw: <SDKMessage> }`
  - 结束 → `data: { type: "done" }`
  - 错误 → `data: { type: "error", message: string }`
- 认证由 `app.ts` 中间件统一处理，handler 通过 `c.get('userId')` 获取用户

**handler 伪代码：**

```typescript
agentApp.post('/chat', async (c) => {
  const userId = c.get('userId')
  const body = ChatRequestSchema.parse(await c.req.json())
  const { message } = body

  return streamSSE(c, async (stream) => {
    try {
      const messageStream = query({
        prompt: message,
        options: {
          model: 'claude-sonnet-4-6',
          includePartialMessages: true,
          tools: [],
          mcpServers: { business: agentServer },
          allowedTools: ['mcp__business__*'],
          systemPrompt: { append: SYSTEM_PROMPT },
          permissionMode: 'acceptEdits',
        },
      })

      for await (const msg of messageStream) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'sdk_message', raw: msg }),
        })

        // Phase 2 会在这里加入消息持久化
      }

      await stream.writeSSE({ data: JSON.stringify({ type: 'done' }) })
    } catch (err) {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', message: String(err) }),
      })
    }
  })
})
```

> **注意：** `query()` 的参数、`streamSSE()` 的用法以实际 SDK / Hono 文档为准。上方伪代码仅供参考结构。

### Step 5：注册路由

改 `apps/server/src/app.ts`：

```typescript
import { agentApp } from './modules/agent/index.js'
// ...
api.route('/agent', agentApp)
app.use(`${API_PREFIX}/agent/*`, authMiddleware)
```

### Step 6：验证

1. `pnpm dev` 启动后端
2. 先通过 `/api/v1/auth/register` 注册用户获取 token
3. curl 测试 SSE endpoint：

```bash
curl -N -X POST http://localhost:3000/api/v1/agent/chat \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"message": "查询所有用户"}'
```

**预期：** SSE 流式返回包含：
- `sdk_message` 事件（stream_event 类型的文本增量）
- `sdk_message` 事件（assistant 类型，包含 query_users 工具调用）
- `sdk_message` 事件（assistant 类型，工具返回后的总结文本）
- `sdk_message` 事件（result 类型）
- `done` 事件

---

## Phase 2：完整 CRUD + 会话持久化

**目标：** 补全所有用户 CRUD 工具，新增 ai_session / ai_message 表，实现会话保存和恢复。

### Step 1：新增数据库表

> 对齐 `/add-module` skill 的第 1-2 步（建 Drizzle 表 + 生成 Zod schema）。

**新建 `apps/server/src/core/db/agent/` 目录：**

`db.ts` — Drizzle 表定义（参考现有 `core/db/user/db.ts`）：

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const aiSessions = sqliteTable('ai_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('新对话'),
  agentSessionId: text('agent_session_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
})

export const aiMessages = sqliteTable('ai_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  type: text('type').notNull(),
  subtype: text('subtype'),
  sessionId_sdk: text('session_id_sdk'),
  parentToolUseId: text('parent_tool_use_id'),
  raw: text('raw').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})
```

`schema.ts` — Zod schema（参考 `core/db/user/schema.ts`）：

```typescript
import { createSelectSchema } from 'drizzle-zod'
import { z } from '@hono/zod-openapi'
import { aiSessions, aiMessages } from './db.js'

const sessionSelectSchema = createSelectSchema(aiSessions)
const messageSelectSchema = createSelectSchema(aiMessages)

export const SessionResponseSchema = sessionSelectSchema
  .extend({
    createdAt: z.string().describe('创建时间（ISO 8601）'),
    updatedAt: z.string().describe('更新时间（ISO 8601）'),
  })
  .describe('AI 会话')
  .openapi('AgentSession')

export const MessageResponseSchema = messageSelectSchema
  .extend({
    createdAt: z.string().describe('写入时间（ISO 8601）'),
  })
  .describe('AI 消息')
  .openapi('AgentMessage')
```

`index.ts`：

```typescript
export * from './db.js'
export * from './schema.js'
```

**改 `src/core/db/index.ts`：**

- `import * as agentSchema from './agent/index.js'`
- `drizzle(sqlite, { schema: { ...schema, ...agentSchema } })`
- `initDb()` 加 `CREATE TABLE IF NOT EXISTS ai_sessions (...)` / `ai_messages (...)`

**改 `drizzle.config.ts`：**

- schema 改为多入口数组

### Step 2：实现 Agent Service

**文件：`agent.service.ts`**

遵循现有 `user.service.ts` 模式：`getDb()` 获取数据库实例，throw 自定义错误。

方法：

| 方法 | 说明 |
|------|------|
| `createSession(userId, title?)` | 创建 ai_session 记录，返回 session 对象 |
| `getSession(id, userId)` | 获取会话，校验 userId 所有权，不存在则 throw NotFoundError |
| `listSessions(userId)` | 获取用户会话列表（按 updatedAt 降序） |
| `deleteSession(id, userId)` | 删除会话及其全部消息 |
| `updateSessionTitle(id, userId, title)` | 更新会话标题 |
| `saveMessage(sessionId, msg)` | 存储一条 SDK 消息（将 msg JSON.stringify 后存入 raw 字段，提取 type/subtype 等公共字段） |
| `getSessionMessages(sessionId)` | 获取会话全部消息（按 createdAt 升序） |

### Step 3：补全 CRUD 工具

**改 `tools/user.tools.ts`：**

新增三个工具：

| 工具名 | 参数 | 对应调用 | annotations |
|--------|------|----------|-------------|
| `create_user` | username (string), password (string) | `userService.createUser(username, password)` | — |
| `update_user` | id (string), username? (string) | `userService.updateUser(id, data)` | — |
| `delete_user` | id (string) | `userService.deleteUser(id)` | `{ destructiveHint: true }` |

**需要新增 `userService.createUser()` 方法：**

现有注册流程在 auth 模块中包含 token 签发，不适合管理端直接创建。需要在 `src/modules/user/user.service.ts` 新增：

```typescript
export async function createUser(username: string, password: string) {
  const db = getDb()
  const logger = getLogger()

  const existing = db.select().from(users).where(eq(users.username, username)).get()
  if (existing) throw new ConflictError('用户名已被占用')

  const id = generateId()
  const passwordHash = await hashPassword(password)

  db.insert(users).values({ id, username, passwordHash }).run()

  logger.info({ userId: id }, 'User created by agent')
  return getUser(id)
}
```

> `hashPassword` 需要从 `auth.service.ts` 导出，或提取到公共工具层。根据实际代码结构决定。

**改 `tools/index.ts`：** 注册新工具到 mcpServer 的 tools 数组。

### Step 4：实现 Session Resume + 消息持久化

**改 `agent.route.ts` 的 chat endpoint：**

1. 请求体改为 `{ sessionId?: string, message: string }`
2. 会话管理逻辑：
   - 有 `sessionId` → 从 DB 加载会话，获取 `agentSessionId` 用于 resume
   - 无 `sessionId` → 调用 `agentService.createSession(userId)` 创建新会话
3. `query()` 调用时：
   - `resume: agentSessionId`（如果恢复已有会话）
   - `includePartialMessages: true`（流式输出）
4. 遍历输出时：
   - `assistant` 类型消息 → `agentService.saveMessage(sessionId, msg)`
   - `result` 类型消息 → 保存 usage 信息到 session 或单独记录
   - 所有消息 → 转发为 `sdk_message` SSE 事件
5. 最终发送 `done` 事件（含 usage 统计）
6. 从 `result` 消息中提取 SDK 的 `session_id`，更新 `ai_sessions.agentSessionId`

### Step 5：会话管理 API

> 对齐 `/add-module` skill 的第 3-4 步（建模块四文件 + 注册路由）。

**新建 `agent.schema.ts`：**

```typescript
import { z } from '@hono/zod-openapi'
import { SessionResponseSchema } from '../../core/db/agent/index.js'

// 请求 schemas
export const CreateSessionSchema = z.object({
  title: z.string().max(100).optional().describe('会话标题'),
}).describe('创建会话输入').openapi('CreateAgentSession')

export const UpdateSessionSchema = z.object({
  title: z.string().min(1).max(100).describe('新标题'),
}).describe('更新会话输入').openapi('UpdateAgentSession')

export const SessionIdParam = z.object({
  id: z.string().describe('会话 ID'),
})

// 响应 schemas
export const SessionListResponseSchema = z.object({
  items: z.array(SessionResponseSchema).describe('会话列表'),
}).describe('会话列表响应').openapi('AgentSessionListResponse')
```

**改 `agent.route.ts` — 新增 CRUD 路由：**

用 `createRoute()` 定义，走 `app.openapi(route, handler)` 标准模式：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/sessions` | 获取当前用户的会话列表 |
| GET | `/sessions/:id` | 获取会话详情及消息历史 |
| POST | `/sessions` | 创建新会话 |
| DELETE | `/sessions/:id` | 删除会话 |
| PATCH | `/sessions/:id` | 更新会话标题 |

这些 CRUD 路由和 SSE endpoint 在同一个 `createRouteApp()` 实例上：
- CRUD 路由走 `app.openapi(route, handler)` 标准模式
- SSE endpoint 走 `app.post('/chat', handler)` 普通路由

### Step 6：验证

**手动验证完整流程：**

1. `POST /api/v1/agent/sessions` — 创建会话 → 记录 sessionId
2. `POST /api/v1/agent/chat` with `{ sessionId, message: "查询用户" }` → 确认工具调用和 SSE 流
3. `POST /api/v1/agent/chat` with `{ sessionId, message: "创建用户 test_agent 密码123456" }` → 确认创建成功
4. `POST /api/v1/agent/chat` with `{ sessionId, message: "删除用户 test_agent" }` → 确认删除
5. `GET /api/v1/agent/sessions` → 确认会话在列表中
6. `GET /api/v1/agent/sessions/:id` → 确认消息历史完整，raw 字段包含完整 SDK 消息

**数据库检查：**

```bash
sqlite3 data.db "SELECT id, type, subtype FROM ai_messages WHERE session_id = 'xxx'"
```

**API 类型导出：**

```bash
pnpm generate:api
```

确认会话 CRUD 的类型正确生成到前端。

---

## 文件清单

### 修改现有文件

| 文件 | Phase | 改动 |
|------|-------|------|
| `apps/server/src/core/config/index.ts` | 1 | envSchema 加 `ANTHROPIC_API_KEY` |
| `apps/server/.env` | 1 | 加 `ANTHROPIC_API_KEY` |
| `apps/server/src/app.ts` | 1 | 注册 agent 路由 + auth 中间件 |
| `apps/server/src/core/db/index.ts` | 2 | initDb 加新表，import agent schema |
| `apps/server/drizzle.config.ts` | 2 | schema 改为多入口数组 |
| `apps/server/src/modules/user/user.service.ts` | 2 | 新增 `createUser()` 方法 |

### 新建文件

| Phase | 文件 | 说明 |
|-------|------|------|
| 1 | `modules/agent/index.ts` | 模块入口，导出 agentApp |
| 1 | `modules/agent/agent.route.ts` | SSE chat endpoint + CRUD 路由 |
| 1 | `modules/agent/agent.schema.ts` | 请求/响应 schema |
| 1 | `modules/agent/agent.service.ts` | 业务逻辑 |
| 1 | `modules/agent/types.ts` | 类型定义 |
| 1 | `modules/agent/tools/user.tools.ts` | query_users 工具 |
| 1 | `modules/agent/tools/index.ts` | MCP server 注册 |
| 2 | `core/db/agent/db.ts` | ai_sessions + ai_messages 表定义 |
| 2 | `core/db/agent/schema.ts` | Zod schema |
| 2 | `core/db/agent/index.ts` | 导出 |

> 所有路径相对于 `apps/server/src/`。

---

## 关键设计决策

| # | 决策 | 理由 |
|---|------|------|
| 1 | SSE endpoint 用 `app.post()` 注册，不走 OpenAPI | `streamSSE` 无法定义 JSON response schema |
| 2 | Session CRUD 走 OpenAPI 标准模式 | 标准 JSON API，复用 `createRoute()` + `apiSchema()` |
| 3 | 混合路由注册：一个 `createRouteApp()` 实例承载两种路由 | OpenAPIHono 支持同时注册 openapi() 和 post() 路由 |
| 4 | MCP 工具复用现有 service 层 | 不绕过 service，保持一致性 |
| 5 | 认证由 `app.ts` 中间件统一处理 | SSE handler 通过 `c.get('userId')` 获取用户 |
| 6 | 数据库表遵循 `/add-module` 模式 | `core/db/agent/` 下 db.ts + schema.ts + index.ts |
| 7 | SSE endpoint 不参与 `pnpm generate:api` | 流式响应无法导出 OpenAPI spec，会话 CRUD 可以正常导出 |

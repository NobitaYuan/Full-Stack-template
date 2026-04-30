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

- [ ] 配置 `apps/server/.env`：加 `ANTHROPIC_API_KEY=sk-ant-xxx`、`ANTHROPIC_BASE_URL=`（可选，默认 Anthropic 官方，填其他厂商 URL 即可切换）
- [ ] 安装后端依赖：`cd apps/server && pnpm add @anthropic-ai/claude-agent-sdk`
- [ ] 安装前端依赖：`cd apps/client && pnpm add ai lucide-vue-next vue-stream-markdown`
- [ ] 初始化 shadcn-vue：`cd apps/client && npx shadcn-vue@latest init`
- [ ] 安装 ai-elements-vue 组件：`npx ai-elements-vue@latest add conversation message prompt-input tool reasoning code-block`

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

（暂无 Issue）

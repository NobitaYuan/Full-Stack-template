# PRD: 后端智能体（AI Agent）模块

## 1. 背景与目标

在现有 Full-Stack Template 管理后台中集成 AI 智能体功能，允许管理员通过自然语言对话操作业务数据（如用户增删改查）。使用 Claude Agent SDK 在后端运行智能体，前端提供实时流式对话界面。

**核心目标：**
- 管理员通过聊天方式执行业务操作（如 "帮我查一下最近注册的用户"）
- 完整的会话持久化与恢复机制
- 学习和验证智能体开发模式，为后续扩展打基础

## 2. 技术选型

| 层面 | 选择 | 说明 |
|------|------|------|
| 后端 Agent 引擎 | `@anthropic-ai/claude-agent-sdk`（V1 `query()` 接口） | V2 仍为 preview，功能不全；V1 支持自定义 MCP tools、hooks、session resume |
| Agent 内置工具 | 自定义 MCP 工具为主 + 部分安全内置工具 | 禁用 Bash/Write/Edit 等危险工具；可选启用 WebSearch |
| 自定义工具定义 | `tool()` + `createSdkMcpServer()`（in-process MCP） | Zod schema 声明参数，async handler 执行逻辑 |
| 前端 AI 组件 | `ai-elements-vue` + `shadcn-vue`（共存方案） | 仅 AI 聊天页面使用 shadcn-vue，其余页面保持 TDesign |
| 实时通信 | SSE（Server-Sent Events） | Hono 原生支持 `streamSSE()`，适合单向流式输出 |
| 消息存储 | SQLite（Drizzle ORM） | 新增 `ai_session` 和 `ai_message` 表，复用现有数据库 |

## 3. 架构概览

```
┌─────────────┐     SSE      ┌──────────────────────────────────────┐
│   Frontend   │ ◄────────── │            Hono Server                │
│  (Vue 3 +    │             │                                      │
│  ai-elements)│ ──POST────► │  /api/v1/agent/chat (SSE endpoint)   │
│              │             │          │                           │
│  - 对话界面   │             │    Agent Controller                  │
│  - 消息流渲染 │             │          │                           │
│  - 工具调用展示│             │    Claude Agent SDK                  │
│  - 会话列表   │             │     ├── query({ resume, ... })      │
│              │             │     ├── Custom MCP Tools             │
│              │             │     │   ├── query_users              │
│              │             │     │   ├── create_user              │
│              │             │     │   ├── update_user              │
│              │             │     │   └── delete_user              │
│              │             │     └── Session Manager              │
│              │             │                                      │
│              │             │    SQLite (Drizzle ORM)              │
│              │             │     ├── ai_session 表                │
│              │             │     └── ai_message 表                │
└─────────────┘             └──────────────────────────────────────┘
```

## 4. 后端设计

### 4.1 模块结构

在 `apps/server/src/modules/` 下新增 `agent/` 模块：

```
modules/agent/
├── agent.route.ts        # API 路由（SSE endpoint + 会话管理）
├── agent.service.ts      # 业务逻辑：会话管理、消息存储
├── agent.session.ts      # Agent SDK 会话管理器
├── tools/                # 自定义 MCP 工具
│   ├── index.ts          # 工具注册入口
│   └── user.tools.ts     # 用户相关工具（CRUD）
└── types.ts              # 类型定义
```

### 4.2 自定义 MCP 工具

使用 Agent SDK 的 `tool()` + `createSdkMcpServer()` 定义 in-process MCP 工具。

**MVP 阶段工具列表：**

| 工具名 | 说明 | 对应 Service 方法 | 权限注解 |
|--------|------|-------------------|----------|
| `query_users` | 查询用户列表（支持分页、搜索） | `userService.list()` | readOnlyHint: true |
| `create_user` | 创建新用户 | `userService.create()` | — |
| `update_user` | 更新用户信息 | `userService.update()` | — |
| `delete_user` | 删除用户 | `userService.remove()` | destructiveHint: true |

工具定义示例（TypeScript）：
```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const queryUsers = tool(
  "query_users",
  "查询用户列表。支持按用户名搜索和分页。",
  {
    keyword: z.string().optional().describe("搜索关键词（用户名模糊匹配）"),
    page: z.number().int().min(1).default(1).describe("页码"),
    pageSize: z.number().int().min(1).max(100).default(10).describe("每页数量"),
  },
  async (args) => {
    const users = await userService.list(args);
    return {
      content: [{ type: "text", text: JSON.stringify(users) }],
    };
  },
  { annotations: { readOnlyHint: true } }
);
```

工具 Server 注册：
```typescript
const agentServer = createSdkMcpServer({
  name: "business",
  version: "1.0.0",
  tools: [queryUsers, createUser, updateUser, deleteUser],
});
```

### 4.3 Agent SDK 调用方式

采用"短生命周期 query + session resume"模式：

```typescript
// 每条用户消息触发一次 query() 调用
const messageStream = query({
  prompt: userMessage,
  options: {
    model: "claude-sonnet-4-6",       // 成本与能力的平衡点
    resume: existingSessionId,         // 恢复已有会话上下文
    includePartialMessages: true,      // 启用流式输出
    tools: [],                         // 禁用所有内置工具
    mcpServers: { business: agentServer },
    allowedTools: ["mcp__business__*"],
    systemPrompt: {
      append: `你是一个管理后台 AI 助手...`,  // 追加系统提示
    },
    permissionMode: "acceptEdits",     // 自动批准工具调用
  },
});
```

### 4.4 SSE 端点设计

```typescript
// POST /api/v1/agent/chat
// Request: { sessionId?: string, message: string }
// Response: SSE stream
app.post("/api/v1/agent/chat", authMiddleware, async (c) => {
  return streamSSE(c, async (stream) => {
    for await (const msg of messageStream) {
      if (msg.type === "stream_event") {
        // 推送文本增量
        await stream.writeSSE({ data: JSON.stringify(serializeEvent(msg)) });
      }
      if (msg.type === "assistant") {
        // 完整消息，存储到数据库
        await saveMessage(sessionId, msg);
      }
      if (msg.type === "result") {
        // 最终结果
        await stream.writeSSE({ data: "[DONE]" });
      }
    }
  });
});
```

### 4.5 会话管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/agent/sessions` | 获取当前用户的会话列表 |
| GET | `/api/v1/agent/sessions/:id` | 获取会话详情及消息历史 |
| POST | `/api/v1/agent/sessions` | 创建新会话 |
| DELETE | `/api/v1/agent/sessions/:id` | 删除会话 |
| PATCH | `/api/v1/agent/sessions/:id` | 更新会话标题 |
| POST | `/api/v1/agent/chat` | 发送消息（SSE 流式响应） |

## 5. 数据模型

### 5.1 ai_session 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text (PK) | UUID |
| userId | text (FK) | 关联 user 表 |
| title | text | 会话标题（取首条消息前 50 字或由 AI 生成） |
| agentSessionId | text | Agent SDK 的 session ID，用于 resume |
| createdAt | timestamp | 创建时间 |
| updatedAt | timestamp | 更新时间 |

### 5.2 ai_message 表

**设计原则：完全对齐 SDK 消息类型，不做自定义封装。** 表结构直接映射 `SDKMessage` 联合类型的公共字段，消息体以 JSON 原样存入。

SDK `query()` yield 的所有消息类型（`SDKMessage` 联合类型）：

| SDK 类型 | `type` 字段值 | 产出时机 |
|----------|--------------|----------|
| `SDKAssistantMessage` | `"assistant"` | Claude 回复完成时（含 text / tool_use blocks） |
| `SDKResultMessage` | `"result"` | 每轮 agent 循环结束时（`subtype`: success / error / cancelled） |
| `SDKSystemMessage` | `"system"` | 会话初始化、上下文压缩等系统事件（`subtype`: init / compact_boundary / ...） |
| `SDKPartialAssistantMessage` | `"stream_event"` | 启用 `includePartialMessages` 后的流式增量事件 |
| `SDKUserMessage` | `"user"` | 流式输入模式下的用户消息 |

表结构（公共字段提列 + 原始 JSON）：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | text (PK) | 消息唯一 ID |
| sessionId | text (FK) | 关联 ai_session |
| type | text | 对齐 SDK `type` 字段：`"assistant"` / `"result"` / `"system"` / `"stream_event"` / `"user"` |
| subtype | text (nullable) | 对齐 SDK `subtype` 字段：`"success"` / `"error"` / `"cancelled"` / `"init"` / `"compact_boundary"` 等 |
| sessionId_sdk | text (nullable) | SDK 自身的 `session_id` 字段（非我们业务 sessionId） |
| parentToolUseId | text (nullable) | SDK 的 `parent_tool_use_id`（子 agent 消息溯源用） |
| raw | text | SDK 消息的完整 JSON（`JSON.stringify(msg)` 直接存入） |
| createdAt | timestamp | 写入时间 |

**存储策略：**
- `stream_event` 类型的消息是否持久化可配置（量大但调试价值高）
- `user` 消息由后端自行构造为 SDK 格式后存入
- `raw` 字段保证完整，公共字段仅用于查询/索引，不用于替代 `raw`

## 6. 前端设计

### 6.1 依赖安装

```bash
# 1. 初始化 shadcn-vue（共存模式，不影响 TDesign）
npx shadcn-vue@latest init

# 2. 安装 ai-elements-vue 组件
npx ai-elements-vue@latest add conversation message prompt-input tool reasoning code-block
```

### 6.2 页面结构

新增路由和页面 `apps/client/src/views/agent/`：

```
views/agent/
├── AgentChat.vue          # 主页面：左侧会话列表 + 右侧对话区
├── components/
│   └── SessionList.vue    # 【自定义】会话列表侧边栏
├── composables/
│   └── useAgentChat.ts    # 【自定义】SSE 连接、消息状态管理
```

**ai-elements-vue 提供的现成组件（无需自建）：**

| 组件 | 对应原 PRD 设计 | 说明 |
|------|----------------|------|
| `Conversation` | ChatPanel.vue | 对话面板容器，管理消息列表 |
| `Message` | MessageItem.vue | 单条消息渲染（含角色标识） |
| `PromptInput` | — | 输入框（Enter 发送，Shift+Enter 换行） |
| `Tool` | — | 工具调用展示（折叠/展开参数与结果） |
| `Reasoning` | — | 思维过程展示 |
| `CodeBlock` | — | 代码块渲染（语法高亮） |

流式文本渲染也由 `Message` 组件内置支持，不需要单独的 StreamingText 组件。

### 6.3 SSE 客户端

使用原生 `EventSource` 或 `fetch` + `ReadableStream` 消费 SSE：

```typescript
// composables/useAgentChat.ts
async function sendMessage(message: string) {
  const response = await fetch("/api/v1/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sessionId: currentSessionId.value, message }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    // 解析 SSE 事件，增量更新 assistant 消息
    parseSSE(chunk, (event) => {
      if (event.type === "text_delta") {
        appendToAssistantMessage(event.text);
      }
      if (event.type === "tool_use") {
        addToolCallDisplay(event.toolName, event.input);
      }
    });
  }
}
```

### 6.4 关键 UI 交互

- **消息输入**：prompt-input 组件，Enter 发送，Shift+Enter 换行
- **流式渲染**：助手回复逐字显示，带闪烁光标效果
- **工具调用展示**：折叠面板显示工具名、输入参数、执行结果
- **会话切换**：左侧列表点击切换，自动加载历史消息
- **新建会话**：顶部按钮创建新对话

## 7. SSE 事件协议

SSE 事件分两类：SDK 消息透传 + 系统控制事件。

```typescript
// SDK 消息透传：后端直接序列化 query() yield 的消息，不做二次封装
type SDKSSEEvent = {
  type: "sdk_message";
  raw: SDKMessage;   // SDK 原生类型：assistant / result / system / stream_event / user
};

// 系统控制事件：SDK 不覆盖的流控制信息
type SystemSSEEvent =
  | { type: "error"; message: string }
  | { type: "done"; usage?: { tokensIn: number; tokensOut: number } };

type AgentSSEEvent = SDKSSEEvent | SystemSSEEvent;
```

**设计原则：**
- 后端遍历 `query()` 输出，直接包装为 `sdk_message` 发送，零转换
- 前端按 `raw.type` 分发渲染，灵活对接 ai-elements 组件
- `error` 和 `done` 是系统事件，不一定有对应 SDK 消息

## 8. 系统提示词（System Prompt）

Agent 的角色和行为由 system prompt 控制：

```
你是一个管理后台的 AI 助手。你可以通过工具帮助管理员操作业务数据。

当前能力：
- 查询用户列表（支持搜索和分页）
- 创建新用户
- 更新用户信息
- 删除用户

规则：
- 使用中文回复
- 删除操作前需要确认（通过 AskUserQuestion 工具）
- 操作完成后给出简洁的结果摘要
- 不要编造数据，只展示工具返回的真实数据
```

## 9. 安全考虑

| 风险 | 措施 |
|------|------|
| Agent 执行危险操作 | 禁用 Bash/Write/Edit 内置工具，仅暴露业务 MCP 工具 |
| 删除操作误操作 | 在 tool handler 中对 delete 操作加入确认机制（通过 Agent SDK 的 AskUserQuestion） |
| 越权访问 | SSE endpoint 挂载 auth middleware，每个用户只能访问自己的 session |
| API Key 泄露 | ANTHROPIC_API_KEY 仅存于服务端环境变量 |
| Token 消耗失控 | 设置 maxTurns 限制（如 20 轮），监控 tokensIn/tokensOut |
| 敏感数据暴露 | 工具返回结果前脱敏处理（如密码字段不返回） |

## 10. MVP 范围与里程碑

### Phase 1：最小可用版本

**目标：** 跑通 "用户发消息 → 后端 Agent 处理 → 流式返回结果" 的完整链路。

- [ ] 后端：安装 Agent SDK，定义用户查询工具（`query_users`）
- [ ] 后端：实现 SSE chat endpoint（单工具、无 session 持久化）
- [ ] 前端：安装 shadcn-vue + ai-elements-vue
- [ ] 前端：基础聊天页面（发送消息 + 流式显示回复）
- [ ] 验证：能通过对话查询用户列表

### Phase 2：完整 CRUD + 会话持久化

**目标：** 补全所有用户 CRUD 工具，实现会话保存和恢复。

- [ ] 后端：补全 create/update/delete 工具
- [ ] 后端：新增 ai_session / ai_message 数据表
- [ ] 后端：实现 session resume 机制
- [ ] 后端：会话管理 CRUD API
- [ ] 前端：会话列表侧边栏
- [ ] 前端：历史消息加载
- [ ] 前端：工具调用结果展示
- [ ] 验证：完整的 CRUD 对话 + 会话保存恢复

### Phase 3：体验优化（后续）

- 工具调用可视化优化（折叠/展开、加载动画）
- 会话标题自动生成
- Token 使用量统计展示
- 更多业务工具（订单、商品等）
- Agent 消息的 Markdown 渲染
- 错误处理与重试机制优化

## 11. 关键技术决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| Agent SDK 版本 | V1 vs V2 | V1 | V2 为 unstable preview，缺少部分功能 |
| Agent 模型 | Opus / Sonnet / Haiku | Sonnet | 成本与能力的平衡点，适合业务操作场景 |
| Agent 生命周期 | 长驻进程 vs 短生命周期 query | 短生命周期 + resume | 实现简单，无需管理长驻进程，适合管理后台场景 |
| UI 组件库 | 共存 vs 自建 vs 迁移 | 共存 | 最小改动量，AI 页面用 ai-elements-vue，其余保持 TDesign |
| 通信协议 | SSE vs WebSocket | SSE | 实现简单，Hono 原生支持，适合单向流式场景 |
| 消息存储 | DB vs 文件 | SQLite DB | 需要按用户查询会话列表，DB 更适合 |

## 12. 验证方案

1. **单元测试**（Vitest）：自定义 MCP 工具的 handler 测试（mock service 层）
2. **集成测试**：SSE endpoint 端到端测试（用 Vitest + 测试数据库）
3. **手动验证**：
   - 启动前后端 `pnpm dev`
   - 进入 AI 聊天页面
   - 发送 "查询所有用户" → 验证返回用户列表
   - 发送 "创建一个用户 xxx" → 验证用户被创建
   - 刷新页面 → 验证会话恢复，消息历史显示正常

---

**待讨论/未决事项：**
- 模型选择：Sonnet 够用还是需要 Opus？
- 是否需要 WebSearch 内置工具？
- 删除确认机制的具体交互方式
- Token 限额和成本控制策略

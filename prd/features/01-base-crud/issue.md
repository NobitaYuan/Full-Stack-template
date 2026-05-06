# base-crud — Issue 日志

> 开发完成后 QC 发现的问题和修改要求。开发者完成后标注 `[已解决]`。

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

**问题：** 开发计划要求 MCP 工具放在 `modules/agent/tools/` 目录（`user.tools.ts` + `index.ts`），但实际实现把所有工具定义和 MCP server 注册都内联在 `agent.service.ts` 中。

**文件：** `apps/server/src/modules/agent/agent.service.ts`（第 14-122 行）

**要求：**
1. 新建 `modules/agent/tools/user.tools.ts`，把 4 个 tool 定义和 `formatUser` 移入
2. 新建 `modules/agent/tools/index.ts`，把 `createSdkMcpServer()` 注册逻辑移入
3. `agent.service.ts` 改为 `import { mcpServer } from './tools/index.js'`

---

### Issue #2 — 后端：`agent.schema.ts` 是空文件

**严重程度：** 低（代码整洁）

**问题：** `modules/agent/agent.schema.ts` 是空文件，所有 schema 直接写在了 `agent.route.ts` 里。

**要求（二选一）：**
- 方案 A：把 route 中的 schema 定义移到 `agent.schema.ts`，route import 使用
- 方案 B：删除空的 `agent.schema.ts`

---

### Issue #3 — 后端：keyword 搜索是内存过滤，不是数据库查询

**严重程度：** 中（功能缺陷）

**问题：** `queryUsersTool` 的 keyword 过滤是在拿到全部分页结果后用 `items.filter()` 做的，只过滤当前页。

**要求：** keyword 搜索下推到数据库层。在 `user.service.ts` 的 `listUsers()` 增加 keyword 参数，用 Drizzle 的 `like()` 做 SQL LIKE 查询。

---

### Issue #4 — 后端：`permissionMode` 使用了 `bypassPermissions`

**严重程度：** 高（安全）

**问题：** `query()` 调用中 `permissionMode: 'bypassPermissions'` + `allowDangerouslySkipPermissions: true`，完全绕过了权限检查。

**要求：** 确认 Agent SDK 是否支持 `permissionMode: 'acceptEdits'`。如果支持，改为 `acceptEdits` 并移除 `allowDangerouslySkipPermissions`。如果不支持，在注释中说明原因。

---

### Issue #5 — 前端：useAgentStore 缺少 persist 配置

**严重程度：** 中（用户体验）

**要求：** 参照 `useUserStore` 的 persist 配置，至少持久化 `currentSessionId`：

```typescript
}, {
  persist: { pick: ['currentSessionId'] },
})
```

---

### Issue #6 — 前端：useAgentChat SSE 请求路径可能不正确

**严重程度：** 高（功能）

**问题：** `baseUrl` 取自 `VITE_APP_BASE_API_URL`，如果为空路径会缺少 `/api/v1` 前缀。

**要求：** 做兜底处理：`const baseUrl = import.meta.env.VITE_APP_BASE_API_URL || '/api/v1'`

---

### Issue #7 — 前端：loadSession 中的类型断言不够安全

**严重程度：** 中（类型安全）

**问题：** 用了 `(data as { data: { session: unknown; messages: AgentMessage[] } }).data` 深层类型断言。

**要求：** 确认 openapi-fetch 的实际返回结构，消除不安全的类型断言。

---

### Issue #8 — 前端：handleSubmitClick 按钮逻辑反了

**严重程度：** 低（UX）

**问题：** 函数名 `handleSubmitClick` 容易误导（实际在 streaming 时调用 `stop()`）。

**要求：** 重命名为 `handleToggleSubmit` 或 `handleSubmitOrStop`。

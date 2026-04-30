---
name: add-module
description: 添加新的 API 模块（从建表到前端类型生成的完整流程）
---

# 添加新模块

以 `$ARGUMENTS` 为模块名（如 `post`），按以下 6 步完成。所有后端路径相对于 `apps/server/`。


## 第 1 步：建 Drizzle 表

在 `src/core/db/<name>/` 下创建 `db.ts`，参考现有 `user/db.ts` 的写法。

关键模式：
- 主键用 `text('id').primaryKey()`，ID 由 `generateId()` 生成
- 时间戳用 `integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())`

Drizzle ORM 用法参考：https://orm.drizzle.org.cn/docs/guides

## 第 2 步：生成响应 schema

在 `src/core/db/<name>/schema.ts` 中用 `createSelectSchema()` 从表自动生成 Zod schema：

```typescript
import { createSelectSchema } from 'drizzle-zod'
import { z } from '@hono/zod-openapi'
import { posts } from './db.js'

const postSelectSchema = createSelectSchema(posts)
export const PostResponseSchema = postSelectSchema
  .omit({ /* 敏感字段 */ })
  .extend({ createdAt: z.string().describe('创建时间（ISO 8601）') })
  .describe('帖子信息')
  .openapi('Post')
```

关键：
- `z` 从 `@hono/zod-openapi` 导入（不是 `zod`），这样 schema 支持 `.openapi()` 方法
- **`.openapi('TypeName')`** 将 schema 注册为 OpenAPI 命名组件，前端通过 `components['schemas']['TypeName']` 使用
- **所有 schema 和关键字段加 `.describe('中文描述')`**，注释会沿链路传递到前端类型
- 用 `.omit()` 排除敏感字段，保持单一数据源

编写 Zod schema 时遵循 `/zod` skill 的最佳实践。

然后在同目录创建 `index.ts` re-export：

```typescript
export * from './db.js'
export * from './schema.js'
```

## 第 3 步：建模块四文件

在 `src/modules/<name>/` 下创建，参考现有 `auth/` 或 `user/` 模块实现：

| 文件 | 职责 |
|------|------|
| `<name>.schema.ts` | 请求/响应 schema。从 `db/<name>/index.js` 导入响应 schema，定义 Create/Update/List 等 schema |
| `<name>.service.ts` | 业务逻辑。用 Drizzle 同步 API（`.get()`/`.run()`/`.all()`），抛 `NotFoundError`/`ConflictError` |
| `<name>.route.ts` | 路由定义。`createRouteApp()` 创建实例，`createRoute()` 定义路由，handler 调用 service + `success()` |
| `index.ts` | 导出 route app |

关键模式：
- `createRouteApp()` 工厂自动处理 Zod 验证错误（返回 code 422）
- `apiSchema()` 包装响应 schema 为标准格式
- `success(c, data)` 返回统一响应
- 需要认证的路由通过 `c.get('userId')` 获取用户 ID

## 第 4 步：在 `src/app.ts` 注册

两件事：
1. **导入并挂载路由** — `api.route('/posts', postApp)`
2. **认证中间件**（如需）— `app.use('/api/v1/posts/*', authMiddleware)`

注意：无需手动调用 `app.openAPIRegistry.register()`，响应 schema 已通过 `.openapi()` 自动注册。

## 第 5 步：导出 spec + 生成类型

根目录一键执行：

```bash
pnpm generate:api
```

这会按模块生成前端类型：
- `apps/client/src/api/{module}/{module}.d.ts` — 每个模块独立的类型文件
- `apps/client/src/api/api-types.d.ts` — 合并所有模块的 paths + components 类型

## 第 6 步：写测试

在 `tests/modules/` 下添加测试文件，参考现有测试模式（独立数据库，`afterEach` 清空）。

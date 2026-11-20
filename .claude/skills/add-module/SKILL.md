---
name: add-module
description: 添加新的 API 模块（从建表到前端类型生成的完整流程）
---

# 添加新模块

以 `$ARGUMENTS` 为模块名（如 `post`），按以下 6 步完成。

## 第 1 步：建 Drizzle 表

在 `src/core/db/<name>/` 下创建 `db.ts`，参考现有 `user/db.ts` 的写法。

关键模式：

- 从 `drizzle-orm/pg-core` 导入类型（`pgTable`、`varchar`、`text`、`timestamp` 等）
- 主键用 `varchar('id', { length: 36 }).primaryKey()`，ID 由 `generateId()` 生成
- 时间戳用 `timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date())`

Drizzle ORM 用法参考：https://orm.drizzle.org.cn/docs/guides

## 第 2 步：生成响应 schema

在 `src/core/db/<name>/schema.ts` 中用 `createSelectSchema()` 从表自动生成 Zod schema：

```typescript
import { createSelectSchema } from 'drizzle-zod'
import { z } from '@hono/zod-openapi'
import { posts } from './db.js'

const postSelectSchema = createSelectSchema(posts)
export const PostResponseSchema = postSelectSchema
  .omit({
    /* 敏感字段 */
  })
  .extend({ createdAt: z.string().describe('创建时间（ISO 8601）') })
  .describe('帖子信息')
  .openapi('Post')
```

关键：

- `z` 从 `@hono/zod-openapi` 导入（不是 `zod`），这样 schema 支持 `.openapi()` 方法
- **`.openapi('TypeName')`** 将 schema 注册为 OpenAPI 命名组件，前端从 `@/api/api-types` 导入 `components` 后使用 `components['schemas']['TypeName']`
- **所有 schema 和关键字段加 `.describe('中文描述')`**，注释会沿链路传递到前端类型
- 用 `.omit()` 排除敏感字段，保持单一数据源

然后在同目录创建 `index.ts` re-export：

```typescript
export * from './db.js'
export * from './schema.js'
```

## 第 3 步：建模块四文件

在 `src/modules/<name>/` 下创建，参考现有 `auth/` 或 `user/` 模块实现：

| 文件                | 职责                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| `<name>.schema.ts`  | 请求/响应 schema。从 `db/<name>/index.js` 导入响应 schema，定义 Create/Update/List 等 schema                    |
| `<name>.service.ts` | 业务逻辑。用 Drizzle 异步 API（`await`），查询返回数组用 `result[0]` 取首条，抛 `NotFoundError`/`ConflictError` |
| `<name>.route.ts`   | 路由定义。`createRouteApp()` 创建实例，`createRoute()` 定义路由，handler 调用 service + `success()`             |
| `index.ts`          | 导出 route app                                                                                                  |

关键模式：

- `createRouteApp()` 工厂自动处理 Zod 验证错误（HTTP 422），路由使用 `errorResponses` 声明可能返回的错误
- `apiSchema()` 包装响应 schema 为标准格式
- `success(c, data)` 返回成功响应，`fail(c, message, code)` 返回错误响应
- 需要认证的路由通过 `c.get('userId')` 获取用户 ID，并按资源所有权或角色检查操作权限
- **列表接口**：query schema 用 `PaginationQuerySchema`（从 `lib/pagination.ts` 导入），service 用 `paginatedQuery<T>()` 查询 + `paginateResult()` 包装响应
- **错误响应**：统一用 `fail()`，不要手写 `{ code, message, data: null }`

## 第 4 步：生成并执行迁移

```bash
pnpm db:generate
pnpm db:migrate
```

## 第 5 步：在 `src/app.ts` 注册

两件事：

1. **导入并挂载路由** — `api.route('/posts', postApp)`
2. **认证中间件**（如需）— `app.use('/api/v1/posts/*', authMiddleware)`

注意：无需手动调用 `app.openAPIRegistry.register()`，响应 schema 已通过 `.openapi()` 自动注册。

## 第 6 步：同步类型并验证

在 `tests/modules/` 下添加测试文件，参考现有测试模式：

- 每个用例创建自己的测试数据。测试套件通过 `TEST_DATABASE_URL` 连接独立数据库，在每个文件自己的临时 schema 执行迁移和清理。
- 从仓库根目录运行 `pnpm generate:api` 和 `pnpm typecheck`。提交迁移与生成的 API 声明，一起运行 `pnpm test`。

---
name: add-module
description: 添加新的 API 模块（从建表到前端类型生成的完整流程）
---

# 添加新模块

以 `$ARGUMENTS` 为模块名（如 `post`），按以下 6 步完成。所有后端路径相对于 `apps/server/`。


## 第 1 步：建 Drizzle 表

在 `src/core/db/schema/` 新建 `<name>.ts`，参考现有 `user.ts` 的写法。

关键模式：
- 主键用 `text('id').primaryKey()`，ID 由 `generateId()` 生成
- 时间戳用 `integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())`
- 然后在 `schema/index.ts` 中 re-export

Drizzle ORM 用法参考：https://orm.drizzle.org.cn/docs/guides

## 第 2 步：生成响应 schema

在 `src/core/db/schema/types.ts` 中用 `createSelectSchema()` 从表自动生成 Zod schema：

```typescript
const postSelectSchema = createSelectSchema(posts)
export const PostResponseSchema = postSelectSchema
  .omit({ /* 敏感字段 */ })
  .extend({ createdAt: z.string().describe('创建时间（ISO 8601）') })
  .describe('帖子信息')
```

关键：
- **所有 schema 和关键字段加 `.describe('中文描述')`**，注释会沿链路传递到前端类型
- 用 `.omit()` 排除敏感字段，保持单一数据源

编写 Zod schema 时遵循 `/zod` skill 的最佳实践。

## 第 3 步：建模块四文件

在 `src/modules/<name>/` 下创建，参考现有 `auth/` 或 `user/` 模块实现：

| 文件 | 职责 |
|------|------|
| `<name>.schema.ts` | 请求/响应 schema。从 `types.ts` 导入响应 schema，定义 Create/Update/List 等 schema |
| `<name>.service.ts` | 业务逻辑。用 Drizzle 同步 API（`.get()`/`.run()`/`.all()`），抛 `NotFoundError`/`ConflictError` |
| `<name>.route.ts` | 路由定义。`createRouteApp()` 创建实例，`createRoute()` 定义路由，handler 调用 service + `success()` |
| `index.ts` | 导出 route app |

关键模式：
- `createRouteApp()` 工厂自动处理 Zod 验证错误（返回 code 422）
- `apiSchema()` 包装响应 schema 为标准格式
- `success(c, data)` 返回统一响应
- 需要认证的路由通过 `c.get('userId')` 获取用户 ID

## 第 4 步：在 `src/app.ts` 注册

三件事：
1. **导入** — import route app 和 schema
2. **注册命名 schema** — `app.openAPIRegistry.register('Post', PostResponseSchema)` （名称 = 前端 `components.schemas` 的 key）
3. **挂载路由** — `api.route('/posts', postApp)`
4. **认证中间件**（如需）— `app.use('/api/v1/posts/*', authMiddleware)`

## 第 5 步：导出 spec + 生成类型

```bash
pnpm generate:api
```

自动完成 OpenAPI spec 导出 + 前端 TypeScript 类型生成。

## 第 6 步：写测试

在 `tests/modules/` 下添加测试文件，参考现有测试模式（独立数据库，`afterEach` 清空）。

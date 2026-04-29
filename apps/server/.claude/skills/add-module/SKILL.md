---
name: add-module
description: 添加新的 API 模块（从建表到前端类型生成的完整流程）
---

# 添加新模块

以 `$ARGUMENTS` 为模块名（如 `post`），按以下 6 步完成：

## 第 1 步：建 Drizzle 表

在 `src/core/db/schema/` 中新建 `<name>.ts`，参考现有 `user.ts` 的写法：

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  authorId: text('author_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
```

然后在 `src/core/db/schema/index.ts` 中 re-export：

```typescript
export * from './post.js'
```

## 第 2 步：生成响应 schema

在 `src/core/db/schema/types.ts` 中，用 `createSelectSchema()` 从表自动生成 Zod schema：

```typescript
import { posts } from './post.js'

const postSelectSchema = createSelectSchema(posts)

export const PostResponseSchema = postSelectSchema
  .omit({ /* 敏感字段 */ })
  .extend({
    createdAt: z.string().describe('创建时间（ISO 8601）'),
  })
  .describe('帖子信息')

export type PostResponse = z.infer<typeof PostResponseSchema>
```

> 所有 schema 和关键字段都应加 `.describe('中文描述')`，注释会沿链路传递到前端类型文件。

## 第 3 步：建模块四文件

在 `src/modules/<name>/` 下创建：

### `<name>.schema.ts`

```typescript
import { z } from 'zod'
import { PostResponseSchema } from '../../core/db/schema/types.js'

// 从 types.ts 导入响应 schema（单一数据源）
export { PostResponseSchema }
export type { PostResponse }

export const CreatePostSchema = z
  .object({
    title: z.string().min(1).max(200).describe('标题（1-200 字符）'),
    content: z.string().min(1).describe('内容'),
  })
  .describe('创建帖子输入')

export const UpdatePostSchema = z
  .object({
    title: z.string().min(1).max(200).optional().describe('新标题'),
    content: z.string().min(1).optional().describe('新内容'),
  })
  .describe('更新帖子输入')

export const PostListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).describe('页码'),
  size: z.coerce.number().int().min(1).max(100).default(20).describe('每页数量'),
})

export const PostListResponseSchema = z
  .object({
    items: z.array(PostResponseSchema).describe('帖子列表'),
    total: z.number().describe('总数'),
    page: z.number().describe('当前页码'),
    size: z.number().describe('每页数量'),
  })
  .describe('帖子列表响应')

export type CreatePostInput = z.infer<typeof CreatePostSchema>
export type UpdatePostInput = z.infer<typeof UpdatePostSchema>
```

### `<name>.service.ts`

```typescript
import { eq } from 'drizzle-orm'
import { getDb } from '../../core/db/index.js'
import { posts } from '../../core/db/schema/post.js'
import { NotFoundError } from '../../core/errors/index.js'
import { generateId } from '../../lib/utils.js'
import type { CreatePostInput, UpdatePostInput } from './post.schema.js'

export function createPost(data: CreatePostInput, authorId: string) {
  const db = getDb()
  const id = generateId()
  db.insert(posts).values({ id, ...data, authorId }).run()
  return getPost(id)
}

export function getPost(id: string) {
  const db = getDb()
  const post = db.select().from(posts).where(eq(posts.id, id)).get()
  if (!post) throw new NotFoundError('帖子不存在')
  return { id: post.id, title: post.title, content: post.content, createdAt: post.createdAt.toISOString() }
}

export function listPosts(page: number, size: number) {
  const db = getDb()
  const offset = (page - 1) * size
  const all = db.select().from(posts).all()
  const total = all.length
  const items = all.slice(offset, offset + size).map((p) => ({
    id: p.id, title: p.title, createdAt: p.createdAt.toISOString(),
  }))
  return { items, total, page, size }
}

export function updatePost(id: string, data: UpdatePostInput) {
  const db = getDb()
  const post = db.select().from(posts).where(eq(posts.id, id)).get()
  if (!post) throw new NotFoundError('帖子不存在')
  db.update(posts).set(data).where(eq(posts.id, id)).run()
  return getPost(id)
}

export function deletePost(id: string) {
  const db = getDb()
  const post = db.select().from(posts).where(eq(posts.id, id)).get()
  if (!post) throw new NotFoundError('帖子不存在')
  db.delete(posts).where(eq(posts.id, id)).run()
}
```

### `<name>.route.ts`

```typescript
import { createRoute } from '@hono/zod-openapi'
import { z } from 'zod'
import {
  PostResponseSchema, CreatePostSchema, UpdatePostSchema,
  PostListQuerySchema, PostListResponseSchema,
} from './post.schema.js'
import { apiSchema, success, createRouteApp } from '../../lib/response.js'
import * as postService from './post.service.js'

const postApp = createRouteApp()

// POST — 带 body
const createRouteDef = createRoute({
  method: 'post',
  path: '/',
  request: {
    body: { content: { 'application/json': { schema: CreatePostSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(PostResponseSchema) } },
      description: '创建成功',
    },
  },
})

// GET / — 带 query params
const listRoute = createRoute({
  method: 'get',
  path: '/',
  request: { query: PostListQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(PostListResponseSchema) } },
      description: '帖子列表',
    },
  },
})

// GET /:id — 带 path params
const getRoute = createRoute({
  method: 'get',
  path: '/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(PostResponseSchema) } },
      description: '帖子详情',
    },
  },
})

// PATCH /:id — 带 path params + body
const updateRoute = createRoute({
  method: 'patch',
  path: '/{id}',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: UpdatePostSchema } } },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(PostResponseSchema) } },
      description: '更新成功',
    },
  },
})

// DELETE /:id — 带 path params，响应 data 为 null
const deleteRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { 'application/json': { schema: apiSchema(z.literal(null)) } },
      description: '删除成功',
    },
  },
})

postApp.openapi(createRouteDef, async (c) => {
  const data = c.req.valid('json')
  const userId = c.get('userId') as string
  const result = await postService.createPost(data, userId)
  return success(c, result)
})

postApp.openapi(listRoute, async (c) => {
  const { page, size } = c.req.valid('query')
  return success(c, await postService.listPosts(page, size))
})

postApp.openapi(getRoute, async (c) => {
  const { id } = c.req.valid('param')
  return success(c, await postService.getPost(id))
})

postApp.openapi(updateRoute, async (c) => {
  const { id } = c.req.valid('param')
  const data = c.req.valid('json')
  return success(c, await postService.updatePost(id, data))
})

postApp.openapi(deleteRoute, async (c) => {
  const { id } = c.req.valid('param')
  await postService.deletePost(id)
  return success(c, null)
})

export { postApp }
```

### `index.ts`

```typescript
export { postApp } from './post.route.js'
```

## 第 4 步：在 app.ts 注册

```typescript
// 导入
import { PostResponseSchema } from './core/db/schema/types.js'
import { PostListResponseSchema, CreatePostSchema, UpdatePostSchema } from './modules/post/post.schema.js'
import { postApp } from './modules/post/index.js'

// 注册命名 schema（注册名 = api-types.d.ts 中 components.schemas 的 key）
app.openAPIRegistry.register('Post', PostResponseSchema)
app.openAPIRegistry.register('PostListResponse', PostListResponseSchema)
app.openAPIRegistry.register('CreatePostInput', CreatePostSchema)
app.openAPIRegistry.register('UpdatePostInput', UpdatePostSchema)

// 挂载路由
api.route('/posts', postApp)

// 需要认证时加一行
app.use('/api/v1/posts/*', authMiddleware)
```

## 第 5 步：导出 spec + 生成类型

```bash
pnpm export-spec && pnpm generate:types
```

## 第 6 步：写测试

在 `tests/modules/` 下添加测试文件，参考现有测试模式。

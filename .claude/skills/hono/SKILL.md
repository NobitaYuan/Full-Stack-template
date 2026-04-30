---
name: hono
description: Hono web framework development guide. Trigger when working with Hono routes, middleware, Context, request validation, error handling, testing, or any @hono/zod-openapi patterns in apps/server.
---

# Hono Development Guide

本项目的后端使用 Hono 框架开发。本 skill 不搬运文档内容，而是提供**项目约定速查**和**官方文档导航**，按需查阅。

## 项目约定速查

本项目使用 `OpenAPIHono`（来自 `@hono/zod-openapi`），不是普通 `Hono`。详细约定见 `apps/server/CLAUDE.md`。

关键差异：

- 路由用 `createRoute()` 定义，不是 `app.get()`/`app.post()`
- schema 用 `.openapi('Name')` 注册为 OpenAPI 命名组件
- `z` 从 `@hono/zod-openapi` 导入（不是 `zod`）
- 工厂函数 `createRouteApp()` 自动处理 Zod 验证错误
- `apiSchema()` 包装响应为标准 `{ code, message, data }` 格式
- `success(c, data)` / `fail(c, message, code)` 返回统一响应
- HTTP 状态码始终 200，业务状态码在 body.code 中

参考已有模块实现：`apps/server/src/modules/auth/`、`apps/server/src/modules/user/`

## 官方文档导航

实现功能时，先根据下表找到对应页面，用 webReader 抓取内容。

### 核心 API

| 场景 | 页面 | URL |
|------|------|-----|
| 路由定义、路径参数、分组、优先级 | Routing | https://hono.dev/docs/api/routing |
| Context（req/res/status/header/set/get/json/text） | Context | https://hono.dev/docs/api/context |
| 请求对象（query/param/json/header/formData） | HonoRequest | https://hono.dev/docs/api/request |
| App 实例（route/use/onError/notFound/fire） | App | https://hono.dev/docs/api/hono |
| HTTPException、错误处理 | Exception | https://hono.dev/docs/api/exception |

### 指南

| 场景 | 页面 | URL |
|------|------|-----|
| 中间件写法、执行顺序、自定义中间件 | Middleware 指南 | https://hono.dev/docs/guides/middleware |
| 请求校验（Zod 等 validator） | Validation | https://hono.dev/docs/guides/validation |
| 测试（app.request、Vitest） | Testing | https://hono.dev/docs/guides/testing |
| RPC 模式（hc 类型安全客户端） | RPC | https://hono.dev/docs/guides/rpc |
| 最佳实践 | Best Practices | https://hono.dev/docs/guides/best-practices |

### 概念

| 场景 | 页面 | URL |
|------|------|-----|
| 中间件洋葱模型 | Middleware 概念 | https://hono.dev/docs/concepts/middleware |
| 路由器类型（RegExp/Linear/Pattern） | Routers | https://hono.dev/docs/concepts/routers |
| Web Standard 兼容性 | Web Standard | https://hono.dev/docs/concepts/web-standard |

### 内置中间件（常用）

CORS、JWT、Logger、Bearer Auth、Basic Auth、Compress、ETag、Cache、Secure Headers 等。完整列表见侧边栏：
https://hono.dev/docs/middleware/builtin/cors

每个中间件有独立页面，URL 格式：`https://hono.dev/docs/middleware/builtin/{name}`
例如：`https://hono.dev/docs/middleware/builtin/jwt`

### LLM 友好文档

Hono 提供纯文本格式的完整文档，适合一次性获取大量内容：
- 完整文档：https://hono.dev/llms-full.txt
- 精简文档：https://hono.dev/llms-small.txt
- 文档列表：https://hono.dev/llms.txt

## 工作流

1. 先查项目已有模块（`apps/server/src/modules/`）的实现模式
2. 再查 `apps/server/CLAUDE.md` 中的项目约定
3. 需要补充 Hono API 细节时，从上方导航表找到对应页面，用 webReader 抓取
4. 如需大量文档参考，直接抓取 `https://hono.dev/llms-full.txt`

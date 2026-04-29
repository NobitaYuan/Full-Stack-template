# @repo/server — 后端开发规范

## 技术栈

- **Hono** + **@hono/zod-openapi** — Web 框架 + 类型安全的路由 + 自动 OpenAPI 文档
- **TypeScript** — strict 模式
- **Drizzle ORM** + **better-sqlite3** — 数据库（SQLite，可扩展 PostgreSQL）
- **drizzle-zod** — 从 Drizzle 表自动生成 Zod schema（单一数据源）
- **Zod**（通过 `@hono/zod-openapi` 导入 `z`）— 参数校验 + Schema 定义 + 类型推导 + OpenAPI 命名注册
- **JWT (jose)** — 单 Token 认证（HS256，默认 7 天过期）
- **Pino** — 日志
- **Vitest** — 测试
- **oxfmt** — 代码格式化
- **Scalar** — API 文档 UI（访问 `/api/v1/doc`）

## 项目结构

```
src/
├── app.ts                  # Hono 实例 + 路由挂载 + OpenAPI 配置
├── index.ts                # 入口（启动服务器）
├── core/                   # 核心基础设施（不依赖业务模块）
│   ├── config/index.ts     # Zod 校验环境变量，单例
│   ├── db/index.ts         # 数据库连接（better-sqlite3 + Drizzle）
│   ├── db/{domain}/        # 按领域组织：db.ts（表定义）+ schema.ts（Zod 派生）+ index.ts
│   ├── errors/index.ts     # 自定义错误类（AppError 体系）
│   └── middleware/          # 全局中间件（auth、error-handler、request-logger）
├── lib/                    # 通用工具
│   ├── logger.ts           # Pino 日志单例
│   ├── response.ts         # 响应格式化 + createRouteApp() 工厂
│   └── utils.ts            # 工具函数（generateId、getLocalIps）
└── modules/                # 功能模块（按业务领域划分）
    ├── auth/               # 认证：注册、登录
    └── user/               # 用户管理：CRUD
tests/
├── setup.ts                # 测试环境变量
└── modules/                # 按模块对应的测试
```

## 响应规范

**所有接口 HTTP 状态码始终返回 200，业务状态码在 body.code 中。**

```typescript
// 成功
{ "code": 200, "message": "success", "data": { ... } }

// 参数验证失败（Zod 校验不通过）
{ "code": 422, "message": "参数验证失败", "data": [{ "path": "username", "message": "..." }] }

// 业务错误（service 层 throw 的自定义错误）
{ "code": 401, "message": "未授权", "data": null }
{ "code": 404, "message": "未找到", "data": null }
{ "code": 409, "message": "用户名已被占用", "data": null }
```

### 错误码分类

| code | 含义           | 来源                                |
| ---- | -------------- | ----------------------------------- |
| 200  | 成功           | handler 调用 `success()`            |
| 401  | 未认证         | `UnauthorizedError`                 |
| 404  | 未找到         | `NotFoundError`                     |
| 409  | 冲突           | `ConflictError`                     |
| 422  | 参数验证失败   | `createRouteApp()` 的 `defaultHook` |
| 500  | 服务器内部错误 | error handler 兜底                  |

### 相关文件

- `src/lib/response.ts` — `success()`、`fail()`、`createRouteApp()`（统一 Zod 验证错误的响应格式）
- `src/core/errors/index.ts` — 自定义错误类（`AppError`、`UnauthorizedError`、`NotFoundError` 等）
- `src/core/middleware/error-handler.ts` — 全局错误处理，捕获 `AppError` 并返回统一格式

## 请求处理流程

请求 → 全局中间件(cors/middleware/requestLogger) → 模块中间件(auth) → Zod 验证 → handler → service

- **验证失败**：Zod 校验不通过 → `createRouteApp()` defaultHook → 返回 code 422 + 字段错误详情
- **业务成功**：service 返回数据 → handler 调用 `success(c, data)` → 返回 code 200
- **业务异常**：service `throw` 自定义错误 → 全局 error handler 捕获 → 返回对应 code（401/404/409 等）

## 如何添加新模块

使用 `/add-module <模块名>` 获取完整指南和代码模板。

## 关键约定

- **导入路径** — 使用 `.js` 后缀（TypeScript ESM 约定）
- **数据库** — 使用 Drizzle ORM，同步 API（`.get()` / `.run()` / `.all()`），无需 async
- **ID 生成** — 使用 `generateId()`（来自 `src/lib/utils.ts`），不要在各模块重复定义
- **密码** — 使用 bcryptjs（`hashPassword` / `verifyPassword`）
- **Token** — 单 JWT Token，`signToken` / `verifyToken` 在 `auth.service.ts` 中
- **认证中间件** — `src/core/middleware/auth.ts`，在 `app.ts` 中用 `app.use('/api/v1/xxx/*', authMiddleware)` 统一管理，新增需要认证的模块在 `app.ts` 加一行即可
- **响应 Schema** — 使用 `drizzle-zod` 的 `createSelectSchema()` 从 Drizzle 表自动生成，定义在各域目录的 `schema.ts` 中（如 `user/schema.ts`），模块 schema 文件从域目录的 `index.js` 导入
- **`z` 导入源** — 所有 schema 文件中的 `z` 必须从 `'@hono/zod-openapi'` 导入（不直接用 `'zod'`），这样可以使用 `.openapi('Name')` 注册命名 schema 到 OpenAPI `components.schemas`。只有 `core/config/index.ts`（环境变量校验）例外，直接用 `'zod'`
- **`.openapi('Name')`** — 每个导出的 schema 都应链式调用 `.openapi('SchemaName')` 注册为命名组件，避免 OpenAPI spec 中 schema 重复内联
- **`.describe()` 注释** — 所有 schema 和关键字段都应加 `.describe('中文描述')`，注释会传递到 OpenAPI spec 和前端类型文件。链路：`Zod .describe()` → OpenAPI `description` → `api-types.d.ts` 的 `/** @description */` 注释
- **前端类型** — 运行 `pnpm export-spec && pnpm generate:types` 生成 `api-types.d.ts`，前端通过 `components['schemas']` 使用
- **日志** — 使用 `getLogger()`（Pino），不要用 `console.log`
- **测试** — Vitest，每个测试文件独立数据库，`afterEach` 清空数据

## API 路由

| 方法   | 路径                    | 认证 | 说明     |
| ------ | ----------------------- | ---- | -------- |
| POST   | `/api/v1/auth/register` | 否   | 注册     |
| POST   | `/api/v1/auth/login`    | 否   | 登录     |
| GET    | `/api/v1/users`         | 是   | 用户列表 |
| GET    | `/api/v1/users/:id`     | 是   | 用户详情 |
| PATCH  | `/api/v1/users/:id`     | 是   | 更新用户 |
| DELETE | `/api/v1/users/:id`     | 是   | 删除用户 |
| GET    | `/health`               | 否   | 健康检查 |

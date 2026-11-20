# Server Template

基于 Hono 框架的 Node.js 后端模板项目，内置 PostgreSQL、安全中间件、标准化分页，可支撑 ~100 个接口规模的业务开发。

## 技术栈

- **Hono** — 轻量 Web 框架
- **TypeScript** — strict 模式
- **Drizzle ORM** + **postgres.js** — PostgreSQL（自带连接池）
- **Zod + @hono/zod-openapi** — 参数校验 + 自动 API 文档
- **JWT (jose)** — 单 Token 认证
- **Pino** — 日志（支持请求级子 logger）
- **Vitest** — 测试
- **oxfmt** — 代码格式化
- **Husky + lint-staged** — 提交时自动格式化

## 快速开始

```bash
# 安装依赖
pnpm install

# 复制环境变量
cp .env.example .env

# 确保 PostgreSQL 已启动，创建数据库
createdb server_template
# 将 .env 的 DATABASE_URL 改为该数据库的连接串

# 初始化数据库表
pnpm db:migrate

# 启动开发服务器
pnpm dev
```

服务器启动后访问：

- API 文档：http://localhost:3000/api/v1/doc
- OpenAPI Spec：http://localhost:3000/api/v1/openapi.json
- 健康检查：http://localhost:3000/health

初始迁移保存在 `drizzle/`。如果此前曾自行创建或迁移用户表，请先核对现有表结构和迁移记录，再执行当前仓库的迁移。

## 项目结构

```
src/
├── modules/          # 功能模块（按业务领域划分）
│   ├── auth/         # 认证：注册、登录
│   └── user/         # 用户管理：CRUD
├── core/             # 核心基础设施
│   ├── config/       # 环境变量解析与校验
│   ├── db/           # 数据库连接、统一表结构入口 schema.ts、领域表和分页 helper
│   ├── errors/       # 自定义错误类
│   └── middleware/    # 全局中间件（认证、安全、限流、请求ID、日志、错误处理）
├── lib/              # 通用工具（logger、分页、响应格式化、消毒、网络工具）
├── app.ts            # Hono 实例 + 中间件注册 + 路由挂载
└── index.ts          # 入口
```

## 可用脚本

| 命令               | 说明                     |
| ------------------ | ------------------------ |
| `pnpm dev`         | 启动开发服务器（热重载） |
| `pnpm build`       | TypeScript 编译          |
| `pnpm start`       | 运行编译后的代码         |
| `pnpm test`        | 运行测试                 |
| `pnpm test:watch`  | 监听模式测试             |
| `pnpm db:generate` | 生成数据库迁移文件       |
| `pnpm db:migrate`  | 执行迁移                 |
| `pnpm db:studio`   | 打开 Drizzle Studio      |
| `pnpm format`      | 全局格式化（oxfmt）      |

## 环境变量

参见 `.env.example`：

| 变量                | 说明                    | 默认值                                      |
| ------------------- | ----------------------- | ------------------------------------------- |
| `PORT`              | 服务端口                | 3000                                        |
| `NODE_ENV`          | 环境                    | development                                 |
| `DATABASE_URL`      | PostgreSQL 连接串       | postgresql://localhost:5432/server_template |
| `JWT_SECRET`        | JWT 密钥，生产环境必须提供独立的至少 32 字节密钥 | 仅开发和测试有默认值 |
| `JWT_EXPIRES_IN`    | Token 过期时间          | 7d                                          |
| `ADMIN_USER_IDS`    | 管理员用户 ID，逗号分隔  | 空                                          |
| `LOG_LEVEL`         | 日志级别                | info                                        |
| `CORS_ORIGINS`      | CORS 白名单（逗号分隔） | http://localhost:5173                       |
| `RATE_LIMIT_MAX`    | 每窗口最大请求数        | 100                                         |
| `RATE_LIMIT_WINDOW` | 限流窗口（秒）          | 60                                          |

## 内置功能

### 安全

- **CORS 白名单** — 通过 `CORS_ORIGINS` 配置允许的来源
- **Rate Limiting** — IP 滑动窗口限流，防止接口滥用
- **安全响应头** — X-Content-Type-Options、X-Frame-Options、HSTS（生产环境）等
- **输入消毒** — `sanitizeInput()` HTML 实体转义工具
- **JWT 认证** — Bearer Token，HS256 签名

### 管理员配置

通过注册接口创建账号后，从注册或登录响应中取得该账号的 `data.user.id`。在服务端环境变量 `ADMIN_USER_IDS` 中配置该 ID，然后重启服务并重新登录。用户列表需要管理员权限，读取、修改和删除单个账号允许账号本人或管理员操作。

### 集成测试

在 PostgreSQL 创建单独的测试数据库，名称以 `_test` 结尾，测试账号需要在该库创建 schema 的权限。从工作区根目录执行：

```bash
createdb server_template_test
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/server_template_test pnpm test
```

PowerShell 可先设置 `$env:TEST_DATABASE_URL = 'postgresql://user:password@localhost:5432/server_template_test'`，再执行 `pnpm test`。测试为每个测试文件新建独立 schema，应用已提交的迁移，并在测试结束时只删除本次生成的 schema。

### 性能

- **PostgreSQL + 连接池** — postgres.js 自带连接池管理
- **标准化分页** — `PaginationQuerySchema` + `paginatedQuery<T>()` + `paginateResult()`，列表接口一行搞定
- **请求 ID 追踪** — 每个请求自动生成 UUID，响应头 `X-Request-ID`，日志自动关联

### 开发体验

- **自动 API 文档** — Scalar UI，代码即文档
- **类型安全** — Drizzle → Zod → OpenAPI → 前端类型，全链路类型推导
- **统一响应格式** — 所有接口 `{ code, message, data }`，HTTP 状态码与响应体 `code` 对应

## 如何添加新模块

使用 `/add-module <模块名>` 获取完整指南和代码模板，或手动创建：

1. 在 `src/modules/` 下创建新目录，如 `src/modules/post/`
2. 创建四个文件：
   - `post.schema.ts` — Zod schema 定义
   - `post.service.ts` — 业务逻辑
   - `post.route.ts` — OpenAPI 路由
   - `index.ts` — 导出路由
3. 在 `src/core/db/{domain}/db.ts` 中定义 Drizzle 表，并在 [统一表结构入口](src/core/db/schema.ts)显式导出，例如 `export { posts } from './post/db.js'`。Drizzle Kit 和应用运行时共用这个入口。Zod 请求和响应 schema 留在所在模块。
4. 在仓库根目录运行 `pnpm --filter @repo/server db:generate`，检查生成的 SQL 包含新增表，再将 `DATABASE_URL` 指向空白验证库，运行 `pnpm --filter @repo/server db:migrate` 验证从初始迁移到最新迁移。
5. 在 `src/app.ts` 中挂载新路由：
   ```ts
   import { postApp } from './modules/post/index.js'
   api.route('/posts', postApp)
   // 如果需要认证，加一行：
   app.use('/api/v1/posts/*', authMiddleware)
   ```
6. 在 `tests/modules/` 下添加路由或读写测试。回到仓库根目录运行 `pnpm generate:api` 和 `pnpm typecheck`，再用独立的 `TEST_DATABASE_URL` 运行 `pnpm test`。

## API 概览

### 认证

- `POST /api/v1/auth/register` — 注册
- `POST /api/v1/auth/login` — 登录

### 用户

- `GET /api/v1/users` — 用户列表（管理员）
- `GET /api/v1/users/:id` — 用户详情（本人或管理员）
- `PATCH /api/v1/users/:id` — 更新用户（本人或管理员）
- `DELETE /api/v1/users/:id` — 删除用户（本人或管理员）

## License

MIT

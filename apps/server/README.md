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

# 执行数据库迁移
pnpm db:migrate

# 启动开发服务器
pnpm dev
```

服务器启动后访问：

- API 文档：http://localhost:3000/api/v1/doc
- OpenAPI Spec：http://localhost:3000/api/v1/openapi.json
- 健康检查：http://localhost:3000/health

## 项目结构

```
src/
├── modules/          # 功能模块（按业务领域划分）
│   ├── auth/         # 认证：注册、登录
│   └── user/         # 用户管理：CRUD
├── core/             # 核心基础设施
│   ├── config/       # 环境变量解析与校验
│   ├── db/           # 数据库连接 + Schema + 分页 helper
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
| `JWT_SECRET`        | JWT 密钥                | —                                           |
| `JWT_EXPIRES_IN`    | Token 过期时间          | 7d                                          |
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

### 性能

- **PostgreSQL + 连接池** — postgres.js 自带连接池管理
- **标准化分页** — `PaginationQuerySchema` + `paginatedQuery<T>()` + `paginateResult()`，列表接口一行搞定
- **请求 ID 追踪** — 每个请求自动生成 UUID，响应头 `X-Request-ID`，日志自动关联

### 开发体验

- **自动 API 文档** — Scalar UI，代码即文档
- **类型安全** — Drizzle → Zod → OpenAPI → 前端类型，全链路类型推导
- **统一响应格式** — 所有接口 `{ code, message, data }`，通过 `success()` / `fail()` 返回

## 如何添加新模块

使用 `/add-module <模块名>` 获取完整指南和代码模板，或手动创建：

1. 在 `src/modules/` 下创建新目录，如 `src/modules/post/`
2. 创建四个文件：
   - `post.schema.ts` — Zod schema 定义
   - `post.service.ts` — 业务逻辑
   - `post.route.ts` — OpenAPI 路由
   - `index.ts` — 导出路由
3. 在 `src/core/db/{domain}/db.ts` 中添加 Drizzle 表定义
4. 运行 `pnpm db:generate` 生成迁移，`pnpm db:migrate` 执行
5. 在 `src/app.ts` 中挂载新路由：
   ```ts
   import { postApp } from './modules/post/index.js'
   api.route('/posts', postApp)
   // 如果需要认证，加一行：
   app.use('/api/v1/posts/*', authMiddleware)
   ```
6. 在 `tests/modules/` 下添加测试

## API 概览

### 认证

- `POST /api/v1/auth/register` — 注册
- `POST /api/v1/auth/login` — 登录

### 用户

- `GET /api/v1/users` — 用户列表（需认证）
- `GET /api/v1/users/:id` — 用户详情（需认证）
- `PATCH /api/v1/users/:id` — 更新用户（需认证）
- `DELETE /api/v1/users/:id` — 删除用户（需认证）

## License

MIT

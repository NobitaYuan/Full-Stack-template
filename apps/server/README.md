# Server Template

基于 Hono 框架的 Node.js 后端模板项目。

## 技术栈

- **Hono** — 轻量 Web 框架
- **TypeScript** — strict 模式
- **Drizzle ORM** — SQLite（可扩展 PostgreSQL）
- **Zod + @hono/zod-openapi** — 参数校验 + 自动 API 文档
- **JWT (jose)** — 单 Token 认证
- **Pino** — 日志
- **Vitest** — 测试
- **oxfmt** — 代码格式化
- **Husky + lint-staged** — 提交时自动格式化

## 快速开始

```bash
# 安装依赖
pnpm install

# 复制环境变量
cp .env.example .env

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
│   ├── db/           # 数据库连接 + Schema 定义
│   ├── errors/       # 自定义错误类
│   └── middleware/    # 全局中间件（认证、错误处理、日志）
├── lib/              # 通用工具（logger、响应格式化、网络工具）
├── app.ts            # Hono 实例 + 路由挂载
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

| 变量             | 说明           | 默认值      |
| ---------------- | -------------- | ----------- |
| `PORT`           | 服务端口       | 3000        |
| `NODE_ENV`       | 环境           | development |
| `DATABASE_URL`   | 数据库路径     | ./data.db   |
| `JWT_SECRET`     | JWT 密钥       | —           |
| `JWT_EXPIRES_IN` | Token 过期时间 | 7d          |
| `LOG_LEVEL`      | 日志级别       | info        |

## 如何添加新模块

1. 在 `src/modules/` 下创建新目录，如 `src/modules/post/`
2. 创建四个文件：
   - `post.schema.ts` — Zod schema 定义
   - `post.service.ts` — 业务逻辑
   - `post.route.ts` — OpenAPI 路由
   - `index.ts` — 导出路由
3. 在 `src/core/db/schema/` 中添加 Drizzle 表定义
4. 在 `src/app.ts` 中挂载新路由：
   ```ts
   import { postApp } from './modules/post/index.js'
   api.route('/posts', postApp)
   // 如果需要认证，加一行：
   app.use('/api/v1/posts/*', authMiddleware)
   ```
5. 在 `tests/modules/` 下添加测试

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

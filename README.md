# Full-Stack-Template

前后端一体化 monorepo 开发模板，基于 pnpm workspace + Turborepo。

## 架构概览

```
full-stack-template/
├── apps/
│   ├── client/          # 前端 — Vue 3 + Vite + TDesign
│   └── server/          # 后端 — Hono + Drizzle ORM + SQLite
├── packages/            # 共享包（预留）
├── turbo.json           # Turborepo 任务编排
├── pnpm-workspace.yaml  # pnpm workspace 配置
└── package.json         # 根 monorepo 配置
```

**技术栈**：

| 层 | 技术 |
|---|---|
| 前端 | Vue 3.5 + TypeScript + Vite 8 + TDesign + Pinia + Tailwind CSS |
| 后端 | Hono + TypeScript + Drizzle ORM + better-sqlite3 + Zod + JWT |
| 工程化 | pnpm workspace + Turborepo + Oxlint + Oxfmt + Husky |
| 类型安全 | OpenAPI spec → openapi-typescript → 前端自动生成类型 |

**前后端协作链路**：

```
后端 Drizzle 表 → drizzle-zod 自动生成 Zod schema → @hono/zod-openapi 生成 OpenAPI spec
→ pnpm generate:api → 前端自动生成 TypeScript 类型 → openapi-fetch 类型安全请求
```

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm（必须）

### 安装依赖

```bash
pnpm install
```

### 开发

```bash
pnpm dev          # 同时启动前后端开发服务器
```

也可以单独启动：

```bash
pnpm --filter @repo/client dev    # 仅前端
pnpm --filter @repo/server dev    # 仅后端
```

### 构建

```bash
pnpm build        # 并行构建前后端
```

### 其他命令

```bash
pnpm lint         # Oxlint 代码检查
pnpm format       # Oxfmt 格式化
pnpm test         # 运行测试（Vitest）
```

### API 类型同步

后端修改 API 后，一键同步前端类型：

```bash
pnpm generate:api
```

该命令会自动先导出后端 OpenAPI spec，再生成前端 TypeScript 类型。

## 项目详情

- **[apps/client/CLAUDE.md](apps/client/CLAUDE.md)** — 前端技术栈、目录结构、开发规范
- **[apps/server/CLAUDE.md](apps/server/CLAUDE.md)** — 后端技术栈、目录结构、API 路由、开发规范

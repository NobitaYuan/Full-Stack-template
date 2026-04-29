# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> 运用第一性原理思考，拒绝经验主义和路径盲从，不要假设我完全清楚目标，保持审慎，从原始需求和问题出发
> 若目标模糊请停下和我讨论，若目标清晰但路径非最优，请直接建议更短、更低成本的办法。

---

## Monorepo 概览

本项目是 pnpm workspace + Turborepo monorepo，包含前后端两个应用：

```
full-stack-template/
├── apps/
│   ├── client/          # @repo/client — Vue 3 前端
│   └── server/          # @repo/server — Hono 后端
├── packages/            # 共享包（预留）
├── turbo.json           # Turborepo 任务编排
└── pnpm-workspace.yaml  # workspace 定义
```

### 技术栈速查

| 应用 | 框架 | 构建 | 测试 | 规范 |
|------|------|------|------|------|
| client | Vue 3 + TDesign + Pinia | Vite 8 | — | Oxlint + Oxfmt |
| server | Hono + Drizzle ORM + SQLite | tsc | Vitest | Oxfmt |

### 根目录命令

```bash
pnpm dev            # 同时启动前后端（turbo 并行）
pnpm build          # 并行构建
pnpm lint           # Oxlint（仅 client 有 lint 脚本）
pnpm format         # Oxfmt 格式化
pnpm test           # Vitest（仅 server 有测试）
pnpm generate:api   # 自动导出 spec + 生成前端类型
```

### 单独操作某个应用

```bash
pnpm --filter @repo/client <command>
pnpm --filter @repo/server <command>
```

---

## 子项目规范

每个应用有独立的 CLAUDE.md，包含详细的开发规范和约定：

- **[apps/client/CLAUDE.md](apps/client/CLAUDE.md)** — 前端：页面创建、API 调用、UI 组件、状态管理、路由规范等
- **[apps/server/CLAUDE.md](apps/server/CLAUDE.md)** — 后端：模块结构、请求处理流程、响应规范、数据库操作、认证等

**在修改对应应用时，必须先阅读其 CLAUDE.md。**

---

## 前后端类型安全协作

本项目通过 OpenAPI spec 实现前后端类型同步：

```
后端 Drizzle 表 → Zod schema → OpenAPI spec (openapi.json)
  → 前端 TypeScript 类型 (src/api/generated/api.d.ts) → openapi-fetch 类型安全请求
```

### 后端修改 API 后

1. 运行 `pnpm generate:api`（从根目录一键完成 spec 导出 + 类型生成）
2. 前端在 `apps/client/src/api/server/` 中使用生成的类型

### 新增后端模块

使用 `/add-module <模块名>` 技能，自动完成从建表到前端类型生成的全流程。

---

## 代码质量

- **禁止补丁叠补丁** — 发现 workaround 堆叠时必须先重构
- **禁止 `any`** — 必须使用具体类型；第三方库类型缺失时用 type assertion 并注释说明
- **Lint & 格式化** — Oxlint + Oxfmt，通过 Husky + lint-staged 提交时自动执行

## 提交代码

不要在 commit 信息里写 Claude Code 水印

## 关于计划

与项目相关的计划文档写到 `plan/` 文件夹中

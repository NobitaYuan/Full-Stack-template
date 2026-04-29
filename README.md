# Full-Stack-Template

前后端一体化开发模板。

## 项目结构

- `apps/server/` — Hono + Drizzle ORM 后端
- `apps/client/` — Vue 3 + TDesign 前端

## 快速开始

### 安装依赖

```bash
cd server && pnpm install
cd ../client && pnpm install
```

### 开发

```bash
# 终端1：启动后端
cd server && pnpm dev

# 终端2：启动前端
cd client && pnpm dev
```

### API 类型同步

后端修改 API 后：

```bash
cd server && pnpm export-spec
cd ../client && pnpm generate:api
```

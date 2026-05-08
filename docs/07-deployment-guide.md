# 标书合规审查系统 — 部署运维文档

> 版本：1.0 | 日期：2026-05-08

---

## 1. 环境要求

### 1.1 运行时环境

| 依赖 | 最低版本 | 说明 |
|------|---------|------|
| Node.js | 20.x | 推荐 LTS 版本 |
| pnpm | 9.x | 包管理器 |
| PostgreSQL | 15.x | 数据库 |
| Anthropic API Key | — | 用于 Claude Agent SDK 调用 |

### 1.2 开发环境

| 依赖 | 说明 |
|------|------|
| Git | 版本管理 |
| VS Code | 推荐 IDE |
| Oxlint + Oxfmt | 代码检查和格式化（husky + lint-staged 自动执行） |

---

## 2. 配置

### 2.1 环境变量

在 `apps/server/.env` 中配置：

```bash
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/bidreviewr

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-xxx
ANTHROPIC_BASE_URL=https://api.anthropic.com  # 可选，用于代理

# LLM 模型配置（可选，不设置则使用 ANTHROPIC_MODEL）
PIPELINE_MODEL=claude-sonnet-4-6
DPA_MODEL=claude-sonnet-4-6
BCA_MODEL=claude-sonnet-4-6
FCA_MODEL=claude-sonnet-4-6
ORA_MODEL=claude-sonnet-4-6

# 服务器
PORT=3000
HOST=0.0.0.0

# 文件上传
UPLOAD_DIR=uploads/reviewer
MAX_FILE_SIZE=104857600  # 100MB
```

### 2.2 数据库初始化

```bash
# 创建数据库
createdb bidreviewr

# 运行 Drizzle 迁移（push schema 到数据库）
pnpm --filter @repo/server db:push
```

### 2.3 文件存储目录

```bash
# 创建上传目录
mkdir -p uploads/reviewer
```

上传目录需确保 Node.js 进程有读写权限。

---

## 3. 部署步骤

### 3.1 开发环境

```bash
# 1. 克隆代码
git clone <repo-url>
cd bidReviewr

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp apps/server/.env.example apps/server/.env
# 编辑 .env 填入实际配置

# 4. 初始化数据库
pnpm --filter @repo/server db:push

# 5. 启动开发服务器（前后端并行）
pnpm dev
```

启动后：
- 前端：`http://localhost:5173`（Vite dev server）
- 后端：`http://localhost:3000`（Hono dev server）

### 3.2 生产构建

```bash
# 构建前后端
pnpm build

# 构建产物位置
# 前端: apps/client/dist/
# 后端: apps/server/dist/
```

### 3.3 生产部署

#### 前端部署

前端构建产物为静态文件（`apps/client/dist/`），可部署到任意静态文件服务器：

```nginx
# Nginx 配置示例
server {
    listen 80;
    server_name example.com;

    root /path/to/apps/client/dist;
    index index.html;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
    }

    # WebSocket 代理
    location /api/v1/reviewer/ws/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### 后端部署

```bash
# 启动后端服务
cd apps/server
node dist/index.js
```

推荐使用 PM2 管理：

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start apps/server/dist/index.js --name bidreviewr-api

# 常用命令
pm2 logs bidreviewr-api     # 查看日志
pm2 restart bidreviewr-api  # 重启
pm2 monit                   # 监控
```

---

## 4. 数据库维护

### 4.1 Schema 迁移

```bash
# 开发阶段：直接 push schema（会同步表结构）
pnpm --filter @repo/server db:push

# 生产环境：生成迁移文件
pnpm --filter @repo/server db:generate
pnpm --filter @repo/server db:migrate
```

### 4.2 数据备份

```bash
# 全库备份
pg_dump bidreviewr > backup_$(date +%Y%m%d).sql

# 恢复
psql bidreviewr < backup_20260508.sql
```

### 4.3 文件备份

```bash
# 备份上传文件目录
tar czf uploads_backup_$(date +%Y%m%d).tar.gz uploads/reviewer/
```

---

## 5. 监控

### 5.1 应用日志

后端使用结构化日志（pino），输出到 stdout：

```bash
# PM2 查看实时日志
pm2 logs bidreviewr-api

# 日志格式示例
# {"level":"info","agentRole":"dpa","latencyMs":15230,"resultLength":8234,"msg":"Agent call completed"}
```

### 5.2 LLM 调用监控

通过 `llm_call_logs` 表监控：

```sql
-- 查看最近的 LLM 调用
SELECT agent_role, model, input_tokens, output_tokens, latency_ms, created_at
FROM llm_call_logs
ORDER BY created_at DESC
LIMIT 20;

-- 按 Agent 统计平均耗时
SELECT agent_role,
       COUNT(*) as call_count,
       AVG(latency_ms) as avg_latency_ms,
       SUM(input_tokens) as total_input_tokens,
       SUM(output_tokens) as total_output_tokens
FROM llm_call_logs
GROUP BY agent_role;

-- 查看失败的调用
SELECT * FROM llm_call_logs WHERE error IS NOT NULL ORDER BY created_at DESC;
```

### 5.3 任务状态监控

```sql
-- 查看运行中的任务
SELECT t.id, p.name, p.code, t.phase, t.status, t.updated_at
FROM reviewer_tasks t
JOIN projects p ON t.project_id = p.id
WHERE t.status = 'running';

-- 查看失败的任务
SELECT t.id, p.name, t.phase, t.error_message, t.updated_at
FROM reviewer_tasks t
JOIN projects p ON t.project_id = p.id
WHERE t.status = 'failed'
ORDER BY t.updated_at DESC;
```

---

## 6. 故障排查

### 6.1 常见问题

| 问题 | 可能原因 | 排查方式 |
|------|---------|---------|
| 流水线启动失败 | 缺少招标文件或投标文件 | 检查 `review_documents` 表 |
| LLM 调用超时 | API Key 无效或网络问题 | 检查 `.env` 配置，查看 `llm_call_logs.error` |
| 报告质量不达标 | LLM 输出格式不稳定 | 查看 `task_artifacts` 中 ORA 的输出 |
| WebSocket 连接断开 | 后端服务重启 | 刷新页面自动重连 |
| 文件上传失败 | 磁盘空间不足或权限问题 | 检查 `uploads/` 目录权限 |
| PDF 文本提取为空 | 扫描件 PDF | 正常情况，charCount 会很小 |

### 6.2 日志查看

```bash
# 查看后端实时日志
pm2 logs bidreviewr-api --lines 100

# 过滤特定 Agent 的调用日志
pm2 logs bidreviewr-api | grep "agentRole"
```

### 6.3 手动干预

```sql
-- 手动将失败任务重置为可启动状态
UPDATE reviewer_tasks
SET status = 'created', phase = 'DOC_UPLOADING', error_message = NULL
WHERE id = 'task-uuid';

-- 手动更新项目状态
UPDATE projects SET status = '未开始' WHERE id = 'project-uuid';
```

---

## 7. 安全注意事项

| 事项 | 说明 |
|------|------|
| API Key 保护 | `.env` 文件不纳入版本控制（已在 .gitignore 中） |
| 文件隔离 | 不同任务的文件按 taskId 目录隔离 |
| 文件名校验 | 上传时清理文件名，防止路径遍历攻击 |
| 文件类型校验 | 仅允许 .pdf / .docx / .doc |
| 文件大小限制 | 单文件 <= 100MB |
| 输入校验 | 所有 API 参数使用 Zod schema 校验 |
| SQL 注入防护 | 使用 Drizzle ORM 参数化查询 |

---

## 8. 目录结构总览

```
d:/coding/bidReviewr/
├── apps/
│   ├── client/                    # Vue 3 前端
│   │   ├── src/
│   │   │   ├── pages/reviewer/    # 审查系统页面
│   │   │   ├── stores/            # Pinia stores
│   │   │   ├── components/reviewer/ # 审查系统组件
│   │   │   └── api/reviewer/      # 自动生成的 API 类型
│   │   └── ...
│   └── server/                    # Hono 后端
│       ├── src/
│       │   └── modules/reviewer/  # 审查系统模块
│       │       ├── llm/           # LLM 调用层
│       │       ├── pipeline/      # 流水线引擎
│       │       └── prompts/       # Prompt 模板
│       └── ...
├── uploads/reviewer/              # 文件上传目录
├── docs/                          # 项目文档
└── demo/                          # Python demo（参考）
```

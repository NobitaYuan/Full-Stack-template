# 标书合规审查系统 — 概要设计文档 (HLD)

> 版本：1.0 | 日期：2026-05-08

---

## 1. 系统架构

### 1.1 整体架构

本系统作为 reviewer 模块嵌入现有 monorepo，与 writer 模块平行，共享基础设施层。

```
┌──────────────────────────────────────────────────────────────┐
│                     apps/client (Vue 3)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ 项目列表  │  │ 任务详情  │  │ 报告查看  │                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│       │             │(REST+WS)    │                          │
│  ┌────┴─────────────┴────────────┴─────┐                    │
│  │       Pinia Store + API Client       │                    │
│  └────────────────┬────────────────────┘                    │
└───────────────────┼──────────────────────────────────────────┘
                    │ HTTP / WebSocket
┌───────────────────┼──────────────────────────────────────────┐
│               apps/server (Hono)                              │
│                   │                                           │
│  ┌────────────────┴────────────────┐                         │
│  │         Hono 中间件层             │                         │
│  │  CORS / Auth / Error / Logger   │                         │
│  └────────────────┬────────────────┘                         │
│                   │                                           │
│  ┌────────────────┴────────────────────────────────────┐     │
│  │                 reviewer 模块                         │     │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐            │     │
│  │  │  Route    │ │ Service  │ │ WS Mgr   │            │     │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘            │     │
│  │       │            │            │                    │     │
│  │  ┌────┴────────────┴────────────┴────┐              │     │
│  │  │          Pipeline Engine           │              │     │
│  │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌────┐ │              │     │
│  │  │  │ DPA │ │ BCA │ │ FCA │ │ORA │ │              │     │
│  │  │  └──┬──┘ └──┬──┘ └──┬──┘ └─┬──┘ │              │     │
│  │  │     └────────┴─────┬───┴─────┘   │              │     │
│  │  │                LLM Gateway        │              │     │
│  │  └─────────────────┬─────────────────┘              │     │
│  └────────────────────┼────────────────────────────────┘     │
│                       │                                       │
│  ┌────────────────────┴───────────────────┐                  │
│  │        PostgreSQL (Drizzle ORM)         │                  │
│  │  projects / tasks / review_documents    │                  │
│  │  task_artifacts / llm_call_logs         │                  │
│  └────────────────────────────────────────┘                  │
│                                                               │
│  ┌────────────────────────────────────────┐                   │
│  │        文件系统 (uploads/reviewer/)     │                   │
│  └────────────────────────────────────────┘                   │
└───────────────────────────────────────────────────────────────┘
```

### 1.2 技术选型

| 层次 | 技术 | 理由 |
|------|------|------|
| 前端框架 | Vue 3 + TDesign | 与现有项目一致 |
| 状态管理 | Pinia | 与现有项目一致 |
| 后端框架 | Hono | 与现有项目一致 |
| ORM | Drizzle ORM | 与现有项目一致，支持类型安全的 SQL 构建 |
| 数据库 | PostgreSQL | 与现有项目一致 |
| LLM 调用 | Claude Agent SDK (`query`) | 与 writer 模块一致 |
| 实时通信 | WebSocket | 与 writer 模块一致 |
| 文件解析 | pdf-parse + mammoth | 成熟稳定，PDF/DOCX 文本提取 |
| 类型安全 | @hono/zod-openapi + openapi-typescript | 与现有项目一致 |

---

## 2. 模块划分

### 2.1 后端模块结构

```
apps/server/src/modules/reviewer/
├── index.ts                  # 模块注册：将路由挂载到 Hono app
├── reviewer.route.ts         # OpenAPI 路由定义（所有 API 端点）
├── reviewer.service.ts       # CRUD 业务逻辑（项目/任务/文件/产物）
├── reviewer.schema.ts        # Zod 校验 schema（请求/响应类型）
├── ws-manager.ts             # WebSocket 连接管理（复用 writer 模式）
├── types.ts                  # TypeScript 类型定义
│
├── llm/
│   ├── config.ts             # Agent 配置（temperature/maxTokens/model）
│   └── gateway.ts            # LLM 调用网关（复用 writer callAgent 模式）
│
├── pipeline/
│   ├── engine.ts             # 流水线编排引擎（主入口）
│   ├── registry.ts           # Agent 注册表（复用 writer 模式）
│   ├── context-builder.ts    # Prompt 构建（从 demo port）
│   ├── format-validator.ts   # 输出格式校验（从 demo port）
│   └── report-validator.ts   # 报告质量校验（从 demo port）
│
└── prompts/
    ├── loader.ts             # Prompt 模板加载器
    └── templates/            # System prompt 模板文件
        ├── dpa.md
        ├── bca.md
        ├── fca.md
        └── ora.md
```

### 2.2 前端模块结构

```
apps/client/src/
├── api/reviewer/                    # 自动生成的 API 类型
│   └── reviewer.d.ts
├── pages/reviewer/
│   ├── ProjectList.vue              # 项目列表页
│   ├── TaskDetail.vue               # 任务详情页（核心）
│   └── ReportView.vue               # 报告查看页
├── stores/
│   ├── useReviewerStore.ts          # 项目状态管理
│   └── useTaskStore.ts              # 任务状态 + WebSocket 管理
└── components/reviewer/
    ├── PipelineStatus.vue           # 流水线阶段状态组件
    ├── FileList.vue                 # 文件列表组件
    ├── ArtifactTabs.vue             # 产物 Tab 切换组件
    ├── MarkdownRenderer.vue         # Markdown 渲染组件
    └── ReportRenderer.vue           # 报告专用渲染组件
```

---

## 3. 核心模块设计

### 3.1 Pipeline Engine

流水线引擎是系统核心，负责编排四阶段 AI 审查流程。

**阶段状态机：**

```
DOC_UPLOADING ──→ DPA_ROUND1 ──→ DPA_ROUND2 ──→ BCA_FCA_RUNNING ──→ REPORT_COMPILING ──→ COMPLETED
                                                                          │
                                                                          └──→ FAILED
```

**执行模式：**
- DPA R1 → DPA R2：顺序执行（R2 依赖 R1 的 baseline 输出）
- BCA + FCA：并行执行（互不依赖）
- ORA：等 BCA/FCA 都完成后执行

**每阶段执行流程：**

```
构建 Prompt → 调用 LLM → 格式校验 → 通过？
                                    ├── 是：保存产物，推进阶段
                                    └── 否：追加修正要求，重试（最多 3 次）
```

### 3.2 LLM Gateway

复用 writer 模块的 `callAgent` 模式，使用 Claude Agent SDK 的 `query()` 函数：

- 输入：agentRole + systemPrompt + userPrompt
- 输出：text + sessionId + inputTokens + outputTokens
- 日志：每次调用记录到 `llm_call_logs` 表

### 3.3 Agent Registry

和 writer 一样使用注册制，4 个 Agent 各自实现 `ReviewerAgentHandler` 接口：

```typescript
interface ReviewerAgentHandler {
  role: 'dpa' | 'bca' | 'fca' | 'ora'
  getSystemPrompt(): string     // 加载 prompts/templates/{role}.md
  getConfig(): AgentConfig      // 返回 temperature/maxTokens/model
}
```

与 writer 的区别：reviewer 不需要在 Agent 上实现 `buildPrompt`，因为 prompt 构建依赖上下文（baseline/fields/bidDocs），在 `context-builder.ts` 中统一处理。

### 3.4 WebSocket Manager

复用 writer 模式的 WebSocket 管理器：

- 按 taskId 维护连接池
- `broadcast(taskId, event)` 推送事件给所有订阅者
- 事件类型：phase_changed / artifact_ready / agent_call_started / agent_call_completed / completed / failed

### 3.5 文件处理

**上传流程：**

```
前端上传文件（multipart/form-data）
  → 后端保存原始文件到 uploads/reviewer/{taskId}/{fileName}
  → 使用 pdf-parse（PDF）或 mammoth（DOCX）提取文本
  → 将提取文本存入 review_documents.textContent
  → 返回文件信息和提取字数
```

**约束：**
- 每个任务仅允许一个 `docType='tender'` 文件
- 投标文件可多次上传
- 文件大小限制：单个文件 <= 100MB

---

## 4. 数据流

### 4.1 完整审查数据流

```
用户操作层:
  创建项目 → 创建任务 → 上传招标文件 → 上传投标文件 → 点击"启动审查"

流水线执行层:
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. DPA R1:                                                   │
  │    输入: tenderDoc.textContent                                │
  │    处理: LLM 提取四张表                                       │
  │    输出: review_baseline artifact                             │
  │                                                               │
  │ 2. DPA R2:                                                   │
  │    输入: bidDocs[].textContent + review_baseline              │
  │    处理: LLM 提取八张表                                       │
  │    输出: extracted_fields artifact                            │
  │                                                               │
  │ 3. BCA (并行):                                                │
  │    输入: review_baseline + extracted_fields + bidDocs索引     │
  │    处理: LLM 废标红线 + 中标胜算审查                          │
  │    输出: bca_result artifact                                  │
  │                                                               │
  │ 3. FCA (并行):                                                │
  │    输入: bidDocs[].textContent + extracted_fields             │
  │    处理: LLM 隐蔽风险 + 电子文件安检                          │
  │    输出: fca_result artifact                                  │
  │                                                               │
  │ 4. ORA:                                                       │
  │    输入: review_baseline + bca_result + fca_result + 招标摘要 │
  │    处理: LLM 编译七章节报告                                   │
  │    输出: review_report artifact                               │
  └─────────────────────────────────────────────────────────────┘

实时推送层:
  每次阶段变更 → WebSocket broadcast phase_changed
  每次产物就绪 → WebSocket broadcast artifact_ready
  Agent 调用开始/完成 → WebSocket broadcast agent_call_*
```

### 4.2 错误处理策略

| 场景 | 处理方式 |
|------|---------|
| LLM 返回空内容 | 重试（最多 3 次） |
| 格式校验不通过 | 追加修正要求重试 |
| 报告质量不达标（< 60分） | 追加问题列表重试 |
| 3 次重试后仍失败 | 保留最后一次结果，标记阶段为 FAILED |
| 单阶段异常 | 不影响已完成阶段的产物，用户可查看 |
| BCA 或 FCA 其中一个失败 | 保留成功的结果，失败的标注异常信息 |
| 文件解析失败 | 标记文件状态为"解析失败"，不阻断流水线 |

---

## 5. 与现有系统的集成

### 5.1 模块注册

reviewer 模块通过 `index.ts` 注册到 Hono 应用：

```typescript
// apps/server/src/modules/reviewer/index.ts
export function registerReviewerModule(app: Hono) {
  app.route('/api/v1/reviewer', reviewerRoutes)
}
```

### 5.2 共享基础设施

| 基础设施 | 使用方式 |
|---------|---------|
| 数据库连接 | 复用现有 Drizzle 实例和连接池 |
| 配置管理 | 复用 `getConfig()` 获取 ANTHROPIC_API_KEY 等 |
| 日志系统 | 复用 `getLogger()` |
| 错误处理 | 复用全局错误中间件 |
| CORS | 复用现有 CORS 配置 |

### 5.3 独立部分

| 独立模块 | 说明 |
|---------|------|
| reviewer schema | 新增的数据库表定义 |
| reviewer routes | 独立的路由前缀 `/api/v1/reviewer` |
| reviewer pipeline | 独立的流水线引擎和 Agent 配置 |
| reviewer prompts | 独立的 prompt 模板 |
| reviewer WebSocket | 独立的 WS 连接管理 |

---

## 6. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Pipeline 同步 vs 异步 | 异步（fire-and-forget） | 流水线耗时长，HTTP 请求不能阻塞等待 |
| BCA+FCA 串行 vs 并行 | 并行 | 互不依赖，并行可缩短总时间 |
| 产物存储 | 数据库 text 字段 | 产物为 Markdown 文本，便于查询和展示 |
| 原始文件存储 | 文件系统 | PDF/DOCX 二进制文件不适合存数据库 |
| Prompt 管理 | 独立 .md 文件 | 便于编辑和版本管理，与 demo 保持一致 |

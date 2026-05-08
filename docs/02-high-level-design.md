# 标书合规审查系统 — 概要设计文档 (HLD)

> 版本：2.0 | 日期：2026-05-08
> 本文档基于 PRD、Pipeline 详细设计和前端页面设计进行架构级整合

---

## 1. 系统架构

### 1.1 整体架构

本系统作为 `reviewer` 模块嵌入现有 monorepo，与 `writer` 模块平行，共享基础设施层，但在业务领域完全独立。

#### 1.1.1 逻辑架构（分层视角）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           表现层 (Presentation)                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    apps/client (Vue 3 + Ant Design Vue)          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │   │
│  │  │ 上传与提交页   │  │   结果页      │  │     管理后台         │  │   │
│  │  │ /reviewer/new│  │/reviewer/    │  │  /reviewer/admin     │  │   │
│  │  └──────┬───────┘  │results/:id   │  └──────────┬───────────┘  │   │
│  │         │           └──────┬───────┘             │              │   │
│  │  ┌──────┴──────────────────┴─────────────────────┴──────┐       │   │
│  │  │  Pinia Store (useReviewerStore / useTaskResultStore) │       │   │
│  │  │  · 上传状态  · 流水线监控  · WebSocket           │       │   │
│  │  └────────────────────────┬────────────────────────────┘       │   │
│  │                           │ (HTTP + WebSocket)                 │   │
│  └───────────────────────────┼────────────────────────────────────┘   │
└───────────────────────────────┼─────────────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────────────┐
│                           应用层 (Application)                          │
│  ┌────────────────────────────┴────────────────────────────────────┐   │
│  │                    apps/server (Hono + @hono/zod-openapi)        │   │
│  │                                                                  │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │   │
│  │  │   路由层 (Routes) │  │   服务层 (Service)│  │  中间件层    │  │   │
│  │  │  · /projects      │ │  · 项目/任务 CRUD │  │  CORS/Auth   │  │   │
│  │  │  · /tasks         │ │  · 文件上传处理   │  │  Error/Logger│  │   │
│  │  │  · /tasks/:id/    │ │  · 产物查询       │  │  Zod Validate│  │   │
│  │  │    upload|start   │ │  · 产物查询       │  │              │  │   │
│  │  │  · /artifacts     │ │  · 管理员列表     │  │              │  │   │
│  │  │  · /system-prompts│ │  · Prompt 管理   │  │              │  │   │
│  │  │  · /ws/tasks/:id  │ │                  │  │              │  │   │
│  │  └────────┬─────────┘  └────────┬─────────┘  └──────────────┘  │   │
│  │           │                     │                              │   │
│  │  ┌────────┴─────────────────────┴──────────────────────┐       │   │
│  │  │              领域层 (Domain — reviewer 核心)         │      │   │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │       │   │
│  │  │  │Pipeline Engine│ │Context Builder│ │ Validators │ │      │   │
│  │  │  │  · 阶段编排   │  │  · Prompt组装 │  │·format     │ │       │   │
│  │  │  │  · 状态机驱动 │  │  · 文本截断   │  │·report     │ │       │   │
│  │  │  │  · 错误隔离   │  │  · 文件索引   │  │            │ │       │   │
│  │  │  └──────────────┘  └──────────────┘  └────────────┘ │       │   │
│  │  │  ┌──────────────┐  ┌────────────────────────────────┐│       │   │
│  │  │  │Agent Registry│  │         LLM Gateway            ││      │   │
│  │  │  │·DPA/BCA/FCA  │  │  · Claude Agent SDK (query)    ││       │   │
│  │  │  │ /ORA 配置    │  │  · 调用日志记录                 ││       │   │
│  │  │  │·SystemPrompt │  │  · 超时/异常处理                ││       │   │
│  │  │  │  运行时加载  │  │                                 ││       │   │
│  │  │  └──────────────┘  └────────────────────────────────┘│       │   │
│  │  └──────────────────────────┬────────────────────────────┘       │   │
│  │                             │                                    │   │
│  │  ┌──────────────────────────┴────────────────────────────────┐   │   │
│  │  │           基础设施层 (Infrastructure)                      │   │   │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │   │   │
│  │  │  │   Drizzle    │  │  File Parser │  │  WS Manager      │ │   │   │
│  │  │  │  · ORM/Query │  │  · pdf-parse │  │  · 按taskId广播   │ │   │   │
│  │  │  │  · Migration │  │  · mammoth   │  │  · 事件序列化     │ │   │   │
│  │  │  └──────────────┘  └──────────────┘  └──────────────────┘ │   │   │
│  │  │  ┌──────────────────────────────────────────────────────┐ │   │   │
│  │  │  │                      RAG Query Engine                │ │   │   │
│  │  │  │  · 4-dim: waste/score/risk/file                      │ │   │   │
│  │  │  │  · similarity filter + knowledge injection           │ │   │   │
│  │  │  └──────────────────────────────────────────────────────┘ │   │   │
│  │  └───────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                │
┌───────────────────────────────┼─────────────────────────────────────────┐
│                           数据层 (Data)                                 │
│  ┌────────────────────────────┴────────────────────────────────────┐   │
│  │              PostgreSQL (持久化) + 文件系统 (二进制)              │   │
│  │                                                                  │   │
│  │  ┌────────────────────────┐    ┌──────────────────────────────┐ │   │
│  │  │  关系型数据             │    │  文件系统                     │ │   │
│  │  │  · projects            │    │  uploads/reviewer/           │ │   │
│  │  │  · tasks               │    │  └─ {taskId}/                │ │   │
│  │  │  · review_documents    │    │     ├─ 招标文件.pdf          │ │   │
│  │  │  · task_artifacts      │    │     └─ 投标文件集合          │ │   │
│  │  │  · llm_call_logs       │    │                               │ │   │
│  │  │  · system_prompts      │    │                               │ │   │
│  │  └────────────────────────┘    └──────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 1.1.2 架构设计要点

| 设计决策 | 方案 | 理由 |
|---------|------|------|
| 分层边界 | 路由 → 服务 → 领域 → 基础设施 | 与 writer 模块保持一致，职责清晰，便于单测 |
| Project/Task 关系 | 用户无感知，后端自动创建 | 降低用户认知负担，入口即上传（PRD 核心设计） |
| System Prompt 管理 | 数据库存储 + LRU 缓存 | 支持运行时热更新和版本回滚，无需重新部署 |
| BCA + FCA 执行模式 | Promise.allSettled 并行 | 互不依赖，并行缩短总耗时；单维度失败不阻断另一维度 |
| 产物持久化 | 每阶段成功后立即写入 DB | 流水线失败时不丢失已完成阶段的产物，支持断点查看 |
| 文件存储 | 原始文件存文件系统，提取文本存 DB | 二进制文件不适合存数据库；文本便于流水线读取和调试 |
| RAG 知识库 | 四维度检索 + 相似度过滤后注入 Prompt | 补充手册未覆盖的废标案例、评分锚点、脱敏模式等平台兼容性知识 |

---

### 1.2 类型安全链路（前后端协作核心）

本项目通过 OpenAPI Spec 实现前后端类型同步，是 monorepo 的核心架构特色：

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐
│ Drizzle ORM  │───→│ drizzle-zod  │───→│@hono/zod-openapi │───→│OpenAPI Spec  │
│  (表定义)     │    │ (Schema生成) │    │  (路由+文档一体化) │    │ (spec.json)  │
└──────────────┘    └──────────────┘    └──────────────────┘    └──────┬───────┘
                                                                       │
                                                                       │ pnpm generate:api
                                                                       ▼
                                                              ┌──────────────────┐
                                                              │ openapi-typescript│
                                                              │  (按模块生成.d.ts) │
                                                              └────────┬─────────┘
                                                                       │
                                                                       ▼
┌──────────────┐    ┌──────────────────┐    ┌──────────────────────────────────┐
│  前端 Vue 3   │◄───│ openapi-fetch     │◄───│ apps/client/src/api/reviewer/    │
│  组件/页面    │    │ (类型安全HTTP客户端)│    │ · reviewer.d.ts (自动生成)       │
└──────────────┘    └──────────────────┘    └──────────────────────────────────┘
```

**链路说明：**

1. **单一数据源**：数据库表结构（Drizzle）是所有类型的唯一来源
2. **Schema 即校验**：`drizzle-zod` 从表定义自动生成 Zod schema，用于请求校验
3. **文档即契约**：`@hono/zod-openapi` 从 Zod schema 自动生成 OpenAPI spec，路由定义与 API 文档一体化
4. **类型自动同步**：`openapi-typescript` 从 spec 按模块生成前端 `.d.ts` 类型文件
5. **端到端类型安全**：`openapi-fetch` 让前端调用具备路径、参数、响应的完整类型提示

**变更流程：** 后端修改 API → 运行 `pnpm generate:api`（根目录一键完成）→ 前端编译即可发现类型不匹配。

---

### 1.3 物理部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户浏览器                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Vue 3 SPA (Vite 构建)                                   │   │
│  │  · Ant Design Vue 组件库                                 │   │
│  │  · Pinia 状态管理                                        │   │
│  │  · WebSocket 客户端                                      │   │
│  └───────────────────────────┬─────────────────────────────┘   │
└──────────────────────────────┼───────────────────────────────────┘
                               │ HTTPS / WSS
┌──────────────────────────────┼───────────────────────────────────┐
│                      服务端 (单节点/容器)                         │
│  ┌───────────────────────────┴─────────────────────────────┐   │
│  │  Node.js + Hono (apps/server)                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │ HTTP Server │  │  WebSocket  │  │ Pipeline Worker │  │   │
│  │  │ (REST API)  │  │  Server     │  │ (异步审查流水线) │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │   │
│  └───────────────────────────┬─────────────────────────────┘   │
│                              │                                   │
│  ┌───────────────────────────┴─────────────────────────────┐   │
│  │  外部依赖                                                │   │
│  │  · PostgreSQL (关系数据)                                 │   │
│  │  · 本地文件系统 (uploads/reviewer/)                      │   │
│  │  · Anthropic API (Claude LLM)                            │   │
│  │  · 邮件/短信网关                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**部署要点：**
- 当前阶段为单节点部署，HTTP Server、WebSocket Server 和 Pipeline Worker 运行在同一进程
- 流水线采用 `fire-and-forget` 异步模式，HTTP 请求不阻塞等待审查完成
- 文件系统目录按 `taskId` 隔离，防止跨任务文件泄露
- 如需水平扩展，未来可将 Pipeline Worker 拆分为独立队列消费者（Redis/BullMQ）

---

### 1.4 技术选型

| 层次 | 技术 | 版本/说明 | 选型理由 |
|------|------|----------|---------|
| 前端框架 | Vue 3 | Composition API + `<script setup>` | 与现有项目一致，官方推荐写法 |
| UI 组件库 | Ant Design Vue | 4.x | 与现有项目一致，丰富的表格/表单/上传组件 |
| 状态管理 | Pinia | 官方 Vue 状态库 | 与现有项目一致，类型安全 |
| 构建工具 | Vite | v8 (Rolldown) | 与现有项目一致，极速 HMR |
| 后端框架 | Hono | 轻量 Web 框架 | 与现有项目一致，Edge/Node 双兼容 |
| API 文档 | @hono/zod-openapi | OpenAPI 3.1 | 与现有项目一致，Zod schema 即文档 |
| ORM | Drizzle ORM | 类型安全 SQL 构建器 | 与现有项目一致，支持迁移和关系查询 |
| 数据库 | PostgreSQL | 14+ | 与现有项目一致，JSON 字段支持 metadata |
| LLM 调用 | Claude Agent SDK | `query()` 函数 | 与 writer 模块一致，复用网关模式 |
| 实时通信 | WebSocket (ws) | Hono 兼容的 ws 库 | 与 writer 模块一致，按 taskId 隔离连接 |
| 文件解析 | pdf-parse + mammoth | PDF 文本 / DOCX 文本 | 成熟稳定，满足文本提取需求 |
| 类型同步 | openapi-typescript | 从 spec 生成 `.d.ts` | 与现有项目一致，一键类型同步 |
| HTTP 客户端 | openapi-fetch | 带类型的 fetch 封装 | 与现有项目一致，零运行时开销 |
| RAG 检索 | 预留扩展（向量数据库 + Embedding） | 四维度知识库检索与相似度过滤 | 指令手册 3.2A 定义，技术选型待后续评估 |

---

## 2. 模块划分

### 2.1 划分原则

1. **职责单一**：每个模块只负责一个明确的业务领域（项目/任务/文件/流水线/产物/Prompt 管理）
2. **前后端对齐**：前端页面与后端路由按同一业务边界拆分（上传/结果/管理）
3. **领域独立**：reviewer 的流水线引擎、Agent 配置与 writer 完全隔离，避免交叉依赖
4. **类型内聚**：每个后端子模块包含自身的 route + service + schema，schema 是前后端的类型契约
5. **可测试性**：Pipeline Engine 纯逻辑无状态（状态通过 DB 持久化），便于单元测试

---

### 2.2 后端模块结构

```
apps/server/src/modules/reviewer/
├── index.ts                          # 模块注册入口，将 reviewer 路由挂载到 Hono app
│
├── db/
│   └── schema.ts                     # Drizzle 表定义（projects/tasks/review_documents/
│                                     # task_artifacts/llm_call_logs/system_prompts）
│
├── projects/
│   ├── projects.route.ts             # GET /api/v1/reviewer/projects (管理员列表)
│   └── projects.service.ts           # 项目 CRUD（自动创建、名称提取）
│
├── tasks/
│   ├── tasks.route.ts                # 任务创建/查询/启动/列表
│   └── tasks.service.ts              # 任务状态机、启动前校验、Token 生成
│
├── uploads/
│   ├── uploads.route.ts              # POST /tasks/:id/upload
│   └── uploads.service.ts            # 文件保存、文本提取(pdf-parse/mammoth)、docType 识别
│
├── artifacts/
│   ├── artifacts.route.ts            # GET /tasks/:id/artifacts /:type
│   └── artifacts.service.ts          # 产物查询、最新版本获取
│
├── system-prompts/
│   ├── system-prompts.route.ts       # CRUD + rollback 管理接口
│   └── system-prompts.service.ts     # Prompt 版本管理、缓存刷新
│
├── admin/
│   └── admin.route.ts                # 管理员任务列表、Token 校验
│
├── pipeline/
│   ├── engine.ts                     # 流水线编排主引擎（状态机 + 阶段调度）
│   ├── state.ts                      # PipelineState 内存模型定义
│   ├── context-builder.ts            # User Prompt 组装（文本截断 + 文件索引 + 模板填充）
│   ├── format-validator.ts           # DPA R1/R2、BCA、FCA 输出格式校验
│   └── report-validator.ts           # ORA 报告质量评分（七章节 + AI 痕迹 + 附录完整性）
│
├── llm/
│   ├── gateway.ts                    # LLM 调用网关（复用 writer callAgent 模式）
│   ├── config.ts                     # Agent 配置工厂（temperature/maxTokens/model）
│   └── prompt-loader.ts              # System Prompt 运行时加载（DB → LRU Cache）
│
├── rag/
│   ├── retriever.ts                  # 四维度知识检索（废标/胜算/隐蔽/安检）
│   ├── filter.ts                     # 相似度过滤（>80% pass / 50-80% 差异注入 / <50% 完整注入）
│   └── injector.ts                   # RAG 知识注入 Prompt 组装（[RAG_Supplement] / [RAG_New] 标注）
│
├── ws/
│   └── manager.ts                    # WebSocket 连接管理（按 taskId 分组广播）
│
└── types.ts                          # reviewer 域内共享类型（PipelineState、ReviewPhase 等）
```

#### 模块职责说明

| 模块 | 核心职责 | 对外暴露 |
|------|---------|---------|
| `projects` | 项目生命周期（自动创建、级联删除） | REST API |
| `tasks` | 任务状态机、启动校验、progress_token 生成 | REST API |
| `uploads` | 文件接收、文本提取、字数计算、文件系统存储 | REST API |
| `artifacts` | 产物版本查询、内容获取 | REST API |
| `system-prompts` | Prompt 版本管理（创建/查询/回滚）、缓存控制 | REST API（管理端） |
| `admin` | 全量任务列表、管理员 Token 认证 | REST API |
| `pipeline` | 四阶段流水线编排、Prompt 构建、输出校验 | 内部调用（由 tasks.start 触发） |
| `llm` | LLM 调用封装、Agent 配置、Prompt 加载 | 内部调用（由 pipeline 调用） |
| `rag` | 知识库检索、相似度过滤、Prompt 知识注入 | 内部调用（由 pipeline BCA/FCA 阶段前触发） |
| `ws` | WebSocket 连接生命周期管理、事件广播 | WebSocket Endpoint |

---

### 2.3 前端模块结构

```
apps/client/src/
│
├── api/reviewer/
│   └── reviewer.d.ts                 # 由 openapi-typescript 自动生成，请勿手动修改
│
├── views/reviewer/                   # 页面级组件（按路由划分）
│   ├── new/
│   │   ├── index.vue                 # 上传与提交页 (/reviewer/new)
│   │   └── components/
│   │       ├── FileUploadZone.vue    # Dragger 拖拽上传区
│   │       ├── FileCard.vue          # 文件卡片（名称/字数/类型/删除）
│   │       ├── ContactForm.vue       # 联系方式表单
│   │       └── SubmitCard.vue        # 提交确认区（流水线说明 + 启动按钮）
│   │
│   ├── result/
│   │   └── index.vue                 # 结果页 (/reviewer/results/:id)
│   │                                 # 含 4 个主 Tab：监控/产物/报告/原始文件
│   │
│   └── admin/
│       └── index.vue                 # 管理后台 (/reviewer/admin)
│                                       # Token 登录 + 全量任务表格
│
├── components/reviewer/              # 跨页面共享组件
│   ├── PipelineMonitor.vue           # 四阶段流水线状态展示（Steps）
│   ├── ArtifactTabs.vue              # 5 种产物子 Tab 切换
│   ├── MarkdownRenderer.vue          # 通用 Markdown 渲染（表格/代码块/标题）
│   └── ReportRenderer.vue            # 报告专用渲染（目录导航 + 四维度卡片 + 投标建议）
│
├── stores/
│   ├── useReviewerStore/
│   │   └── index.ts                  # 上传页状态：batchId/files/uploading
│   └── useTaskResultStore/
│       └── index.ts                  # 结果页状态：task/documents/artifacts/ws/phase
│
└── router/                           # 路由配置（需新增 reviewer 路由段）
    └── index.ts                      # /reviewer/new, /reviewer/results/:id, /reviewer/admin
```

#### 前端模块映射关系

| 路由 | 页面组件 | 状态管理 | 核心功能 |
|------|---------|---------|---------|
| `/reviewer/new` | `views/reviewer/new/index.vue` | `useReviewerStore` | 文件上传、提交审查 |
| `/reviewer/results/:id` | `views/reviewer/result/index.vue` | `useTaskResultStore` | 流水线监控、产物查看、报告渲染 |
| `/reviewer/admin` | `views/reviewer/admin/index.vue` | `useTaskResultStore`（复用 fetch） | 任务列表、状态筛选、跳转结果页 |

---

### 2.4 数据模型模块

数据库表按职责分组，全部定义在 `apps/server/src/modules/reviewer/db/schema.ts`：

```
projects (1) ──→ (N) tasks
                      │
                      ├──→ (N) review_documents   # 用户上传的文件（含提取文本）
                      ├──→ (N) task_artifacts      # 流水线产物（Markdown + metadata）
                      └──→ (N) llm_call_logs       # LLM 调用记录（计费/调试）

system_prompts        # 独立表，全局唯一，按 role + version 管理
```

| 表名 | 核心字段 | 说明 |
|------|---------|------|
| `projects` | id, name, code, createdAt | 项目信息（名称/编号从招标文件提取） |
| `tasks` | id, projectId, phase, status, contactName/Email/Phone/Company, projectShortName/Description, progressToken, adminToken | 任务状态机核心表 |
| `review_documents` | id, taskId, fileName, docType(tender/bid), charCount, textContent, uploadOrder | 上传文件及提取文本 |
| `task_artifacts` | id, taskId, name, artifactType, phase, version, content, metadata | 流水线产物（版本化存储） |
| `llm_call_logs` | id, taskId, agentRole, model, inputTokens, outputTokens, latencyMs, error | LLM 调用日志 |
| `system_prompts` | id, role, content, version, isActive, updatedBy, updatedAt | Agent 系统提示词（可热更新） |

---

## 3. 核心模块设计

### 3.1 Pipeline Engine

流水线引擎是 reviewer 模块的核心领域层，负责编排四阶段 AI 审查流程。

**阶段状态机：**

```
DOC_UPLOADING ──→ DPA_ROUND1 ──→ DPA_ROUND2 ──→ BCA_FCA_RUNNING ──→ REPORT_COMPILING ──→ COMPLETED
                                                                                      │
                                                                                      └──→ FAILED（任何阶段失败）
```

**执行模式：**
- **顺序阶段**：DPA R1 → DPA R2 → ORA（存在数据依赖）
- **并行阶段**：BCA + FCA（输入独立，Promise.allSettled 容错）
- **推进方式**：每阶段成功后立即持久化产物并广播 WS 事件，然后推进到下一阶段

**单阶段执行闭环：**

```
构建 Prompt ──→ 调用 LLM ──→ 输出校验 ──→ 通过？
                                         ├── 是：保存产物 → 广播 artifact_ready → 推进阶段
                                         └── 否：追加修正要求 → 重试（最多 3 次）
                                                └── 3 次后仍失败：保留最后一次结果 → 标记 FAILED
```

**引擎接口：**

```typescript
// pipeline/engine.ts
export async function startPipeline(taskId: string): Promise<void>

// 内部阶段函数
async function runDpaRound1(state: PipelineState): Promise<void>
async function runDpaRound2(state: PipelineState): Promise<void>
async function runBca(state: PipelineState): Promise<string>
async function runFca(state: PipelineState): Promise<string>
async function runOra(state: PipelineState): Promise<void>
```

**关键设计：**
- `PipelineState` 是纯内存对象，状态变更通过 DB 持久化（`task.status` / `task.phase` / `task_artifacts`）
- 引擎异常时，`phase` 停留在当前阶段，`status` 变为 `failed`，已完成的产物保留在 `task_artifacts`
- BCA/FCA 并行执行，任一失败不影响另一维度的结果保存

---

### 3.2 LLM Gateway

复用 writer 模块的 `callAgent` 模式，统一封装 LLM 调用：

```typescript
// llm/gateway.ts
interface LlmCallOptions {
  agentRole: 'dpa' | 'bca' | 'fca' | 'ora'
  systemPrompt: string      // 从 system_prompts 表加载
  userPrompt: string        // 从 context-builder.ts 组装
  temperature: number
  maxTokens: number
  model: string
}

interface LlmCallResult {
  text: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

export async function callLlm(options: LlmCallOptions): Promise<LlmCallResult>
```

**调用日志：** 每次调用（含重试）自动写入 `llm_call_logs` 表，用于计费和调试。

**Agent 配置来源：**

| 配置项 | 来源 | 优先级 |
|--------|------|--------|
| model | 环境变量 | `{ROLE}_MODEL` → `PIPELINE_MODEL` → `ANTHROPIC_MODEL` |
| temperature | 硬编码常量 | DPA 0.1 / BCA 0.0 / FCA 0.0 / ORA 0.2 |
| maxTokens | 硬编码常量 | DPA/BCA/FCA 8192 / ORA 16384 |

---

### 3.3 System Prompt 加载器

System Prompt 不再存储为本地文件，而是运行时从数据库加载：

```typescript
// llm/prompt-loader.ts
const promptCache = new LRUCache<string, string>({ max: 10, ttl: 300_000 })

export async function getSystemPrompt(role: string): Promise<string> {
  // 1. 查缓存
  const cached = promptCache.get(role)
  if (cached) return cached

  // 2. 查 DB（取 is_active = true 且 version 最大）
  const row = await db...

  // 3. 写入缓存
  promptCache.set(role, row.content)
  return row.content
}

export function invalidatePromptCache(role: string): void {
  promptCache.delete(role)
}
```

**初始化：** 部署时执行 `pnpm db:seed`，将 `docs/prompts/*.md` 读入 `system_prompts` 表。后续修改通过 `system-prompts` 管理接口操作。

---

### 3.4 WebSocket Manager

按 `taskId` 维护连接池，实现事件广播：

```typescript
// ws/manager.ts
interface ReviewerEvent {
  type: 'phase_changed' | 'artifact_ready' | 'agent_call_started'
       | 'agent_call_completed' | 'completed' | 'failed'
  // ... payload 根据 type 变化
}

export function broadcast(taskId: string, event: ReviewerEvent): void
export function registerConnection(taskId: string, ws: WebSocket): void
export function removeConnection(taskId: string, ws: WebSocket): void
```

**事件触发点：**
- `setPhase()` 内部 → `phase_changed`
- `saveArtifact()` 内部 → `artifact_ready`
- `callLlm()` 调用前 → `agent_call_started`
- `callLlm()` 返回后 → `agent_call_completed`
- 流水线成功结束 → `completed`
- 流水线异常 → `failed`

---

### 3.5 文件处理子系统

文件处理是 reviewer 模块的基础设施层，独立于流水线执行：

```
前端上传 (multipart/form-data)
        │
        ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────────┐
│  uploads/     │───→│  File Parser  │───→│  review_documents │
│  service.ts   │    │  · pdf-parse  │    │  表（文本+字数）   │
│  · 保存原始文件│    │  · mammoth    │    │                   │
│  · 路径隔离   │    │  · 字符数统计  │    │                   │
└───────────────┘    └───────────────┘    └───────────────────┘
        │
        ▼
文件系统: uploads/reviewer/{taskId}/{sanitizedFileName}
```

**约束：**
- 单文件 ≤ 100MB
- 仅允许 `.pdf` / `.docx` / `.doc`
- 每个任务仅允许 1 份 `docType='tender'` 文件
- 投标文件可上传多份
- 文件名校验防路径遍历

---

### 3.6 RAG 查询引擎

RAG（检索增强生成）知识库查询是审查流水线的关键补充环节，用于在 BCA/FCA 执行前获取与本次招标场景相关的补充检验知识和历史案例，修正和补齐四维审查模型。

**查询时机：**
- DPA Round 1 完成、BCA/FCA 执行前：**必查一次**
- 遇到手册未覆盖的特殊资质类型/文件格式时：**按需查询**

**四维度关联查询规则：**

| 维度 | 查询关键词 | 查询目标 | 知识用途 |
|------|-----------|---------|---------|
| 废标红线 | 资质有效期、废标案例、否决项判定、资格准入 | 最新废标案例、否决项判定口径、特殊资质要求 | 补充未覆盖的废标场景，修正否决项规则 |
| 中标胜算 | 评分标准、商务评审、技术评分、价格分计算 | 同类项目评分细则、商务评审锚点、技术方案评分模式 | 补齐评分锚点、校准专业度评估基准 |
| 隐蔽风险 | 暗标脱敏、数据一致性、元数据泄漏、文件哈希 | 脱敏失败案例、元数据泄漏模式、数据勾稽矛盾案例 | 扩展隐蔽风险检测面，补充已知泄漏模式 |
| 电子文件安检 | 电子签章、PDF合规、扫描件标准、文件命名 | 电子签章验证方法、PDF/A合规标准、平台兼容性要求 | 更新文件格式/签章技术要求，补充平台兼容性知识 |

**相似度过滤规则：**

| 相似度 | 处理方式 | 注入标注 |
|--------|---------|---------|
| > 80% | 与手册已有规则高度相似，直接 pass，不注入 | — |
| 50% ~ 80% | 提取差异点，标注后注入对应维度 | `[RAG_Supplement]` |
| < 50% | 完整注入对应维度 | `[RAG_New]` |

**空检索与低质量处理：**
- 某维度无检索结果 → 仅使用手册固化规则执行审查，报告中标注"基于手册固化规则，无RAG补充"
- 检索结果与当前招标场景明显不相关 → 丢弃，标注 `[RAG_Discarded]` 及丢弃理由

**接口设计：**

```typescript
// rag/retriever.ts
interface RagQuery {
  dimension: 'waste_redline' | 'scoring' | 'hidden_risk' | 'file_inspection'
  keywords: string[]
  tenderBaselines: string   // DPA Round 1 提取的审查基准（用于相关性过滤）
}

interface RagResult {
  dimension: string
  injected: Array<{
    id: string
    similarity: number
    tag: '[RAG_Supplement]' | '[RAG_New]'
    content: string
  }>
  discardedCount: number
}

export async function queryRag(dimension: string, keywords: string[]): Promise<RagResult>
```

**与 Pipeline 的集成：**

```
DPA Round 2 完成
    │
    ▼
┌────────────────────────────────────────┐
│ RAG 查询（顺序执行 4 个维度）            │
│ · 废标红线知识检索 → filter → 注入     │
│ · 中标胜算知识检索 → filter → 注入     │
│ · 隐蔽风险知识检索 → filter → 注入     │
│ · 电子安检知识检索 → filter → 注入     │
│ 产出: rag_results.json（按维度分类）    │
└────────────────────────────────────────┘
    │
    ▼
BCA/FCA 并行执行（Prompt 中携带对应维度的 RAG 注入知识）
```

**RAG 产物存储：** RAG 查询结果作为 `task_artifacts` 的一个特殊类型 `rag_results` 持久化，便于调试和追溯。

---

## 4. 数据流

### 4.1 完整审查数据流

```
用户操作层:
  进入 /reviewer/new ──→ 后端自动创建 project + task ──→ 获得 batchId
  上传招标文件 ──→ 文本提取 ──→ FileCard 显示解析状态
  上传投标文件(1~N) ──→ 文本提取 ──→ FileCard 显示解析状态
  填写联系方式 ──→ 解锁提交
  点击"启动审查" ──→ POST /tasks/:id/start ──→ 异步启动流水线

流水线执行层:
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. DPA Round 1 (审查基准提取):                                │
  │    输入: tenderDoc.textContent (截断 45K)                     │
  │    加载: system prompt ('dpa') + context-builder 组装         │
  │    调用: LLM → 格式校验(4表关键词) → 最多 3 次重试            │
  │    产出: review_baseline artifact → DB + WS artifact_ready    │
  │                                                               │
  │ 2. DPA Round 2 (字段护照提取):                                │
  │    输入: bidDocs (优先15K/其他4K) + review_baseline (10K)     │
  │    产出: extracted_fields artifact → DB + WS artifact_ready   │
  │                                                               │
  │ 2.5 RAG 知识库查询（BCA/FCA 前必查）:                        │
  │    输入: review_baseline + 四维度查询关键词                    │
  │    处理: 按废标/胜算/隐蔽/安检 4 维度分别检索知识库            │
  │           → 相似度过滤（>80% pass / 50-80% 差异注入 / <50% 完整注入）│
  │    产出: rag_results artifact → DB（按维度分类，标注 [RAG_Supplement]/[RAG_New]）│
  │                                                               │
  │ 3. BCA + FCA (并行审查):                                      │
  │    BCA 输入: review_baseline(12K) + extracted_fields(12K)    │
  │    BCA 产出: bca_result → DB + WS artifact_ready              │
  │    FCA 输入: bidDocs(15K) + extracted_fields(8K)              │
  │    FCA 产出: fca_result → DB + WS artifact_ready              │
  │    容错: Promise.allSettled，任一失败不影响另一维度           │
  │                                                               │
  │ 4. ORA (报告编译):                                            │
  │    输入: 招标摘要(4K) + baseline(6K) + bca(12K) + fca(12K)   │
  │    校验: 报告质量评分(七章节+附录A-G+AI痕迹) → 最多 3 次重试  │
  │    产出: review_report artifact + metadata(qualityScore)     │
  │    结束: WS completed { qualityScore } → task.status=completed│
  └─────────────────────────────────────────────────────────────┘

实时推送层:
  phase_changed ──→ 前端更新 PipelineMonitor 当前阶段
  artifact_ready ──→ 前端激活对应产物 Tab
  agent_call_started/completed ──→ 前端显示 Agent 调用耗时
  completed ──→ 前端显示完成提示，自动切换到报告 Tab
  failed ──→ 前端显示错误信息，保留已完成的产物查看
```

### 4.2 错误处理策略

| 场景 | 处理方式 | 产物保留 |
|------|---------|---------|
| LLM 返回空内容 | 直接重试（最多 3 次） | — |
| 格式校验不通过 | 追加修正要求重试 | — |
| 报告质量不达标（< 60分） | 追加问题列表重试 | — |
| 单阶段 3 次重试后仍失败 | 标记 FAILED，保留最后一次结果 | 该阶段及之前产物保留 |
| BCA 失败但 FCA 成功 | BCA 保存异常信息，FCA 正常保存 | FCA 产物保留 |
| FCA 失败但 BCA 成功 | FCA 保存异常信息，BCA 正常保存 | BCA 产物保留 |
| RAG 查询失败 | 标注"仅基于手册固化规则审查，无RAG补充"，不阻断流水线 | — |
| RAG 检索结果不相关 | 丢弃并标注 `[RAG_Discarded]` 及理由，继续审查 | — |
| 文件解析失败 | 标记文件 charCount=null | 不阻断流水线 |

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

| 基础设施 | 使用方式 | 说明 |
|---------|---------|------|
| 数据库连接 | 复用现有 Drizzle 实例 | reviewer 表定义在自身 `db/schema.ts`，通过 `drizzle.config.ts` 合并到全局迁移 |
| 配置管理 | 复用 `getConfig()` | 读取 `ANTHROPIC_API_KEY`、`PIPELINE_MODEL` 等 |
| 日志系统 | 复用 `getLogger()` | 流水线各阶段记录结构化日志 |
| 错误处理 | 复用全局错误中间件 | Zod 校验错误统一格式化 |
| CORS | 复用现有配置 | reviewer 路由共享同一 CORS 策略 |

### 5.3 独立部分

| 独立模块 | 说明 |
|---------|------|
| reviewer schema | 6 张独立数据库表（projects/tasks/review_documents/task_artifacts/llm_call_logs/system_prompts） |
| reviewer routes | 独立路由前缀 `/api/v1/reviewer`，与 writer 路由完全隔离 |
| reviewer pipeline | 独立的流水线引擎、Prompt 构建器和校验器 |
| reviewer WebSocket | 独立的 WS 端点 `/api/v1/reviewer/ws/tasks/:id`，事件体系独立 |
| reviewer system-prompts | 独立的运行时 Prompt 管理，与 writer 的 prompt 管理不共享 |
| reviewer rag | 独立的 RAG 知识库查询子系统（四维度检索 + 相似度过滤 + Prompt 注入） |

---

## 6. 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Project/Task 自动创建 | 用户无感知，后端自动创建 | PRD 核心设计：入口即上传，降低认知负担 |
| Pipeline 同步 vs 异步 | 异步（fire-and-forget） | 审查耗时 10~30 分钟，HTTP 不能阻塞等待 |
| BCA+FCA 串行 vs 并行 | 并行 + Promise.allSettled | 互不依赖，并行缩短总时间；容错不互相影响 |
| 产物存储位置 | DB `task_artifacts.content` (text) | Markdown 文本便于查询、版本管理和前端渲染 |
| 原始文件存储 | 文件系统 `uploads/reviewer/{taskId}/` | 二进制文件不适合数据库；按 taskId 隔离保证安全 |
| Prompt 管理 | 数据库 `system_prompts` 表 + LRU 缓存 | 支持运行时热更新、版本回滚，无需重新部署 |
| 报告质量校验 | 代码级多维度评分（非 LLM 自评） | 客观、可复现、可调试；120+ AI 痕迹模式匹配 |
| Token 访问控制 | progress_token（用户）+ admin_token（管理员） | 用户通过邮件链接访问，管理员独立认证，两者复用同一结果页 |
| 类型同步机制 | Drizzle → Zod → OpenAPI → 前端类型 | 单一数据源，后端修改 API 后编译即可发现前端类型不匹配 |
| RAG 注入策略 | 相似度分层过滤（>80% pass / 50-80% 差异注入 / <50% 完整注入） | 避免冗余信息干扰审查判断，仅注入与手册规则有差异或全新的知识 |
| RAG 失败处理 | 查询失败不阻断流水线，降级为"仅基于手册固化规则" | 保证审查流程的鲁棒性，RAG 是增强而非必需环节 |

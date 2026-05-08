# 标书合规审查系统 — 数据库设计文档

> 版本：1.0 | 日期：2026-05-08

---

## 1. 概述

### 1.1 设计原则

- 对标 writer 模块的 `projects → tasks → artifacts` 三层结构
- 新增 `review_documents` 表存储上传文件及提取文本
- 所有表使用 UUID 主键（varchar(36)）
- 所有时间字段使用 timestamp（带时区）
- 使用 Drizzle ORM 定义表结构，自动生成 Zod schema

### 1.2 ER 关系

```
projects (1) ──→ (N) tasks
tasks (1) ──→ (N) review_documents
tasks (1) ──→ (N) task_artifacts
tasks (1) ──→ (N) llm_call_logs
```

---

## 2. 表结构

### 2.1 projects — 审查项目

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | varchar(36) | PK | UUID |
| name | varchar(200) | NOT NULL | 项目名称（如"XX系统采购项目"） |
| code | varchar(50) | NOT NULL, UNIQUE | 项目编号（如"2026-JZ-001"） |
| clientOrg | varchar(200) | NULL | 委托单位名称 |
| status | varchar(30) | NOT NULL, DEFAULT '未开始' | 项目状态：未开始/审查中/已完成 |
| createdAt | timestamp | NOT NULL, DEFAULT now() | 创建时间 |
| updatedAt | timestamp | NOT NULL, DEFAULT now() | 更新时间 |

**Drizzle 定义：**

```typescript
export const projects = pgTable('reviewer_projects', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 200 }).notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  clientOrg: varchar('client_org', { length: 200 }),
  status: varchar('status', { length: 30 }).notNull().default('未开始'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**索引：**
- `code` UNIQUE — 快速按编号查找项目
- `createdAt` DESC — 列表按时间排序

---

### 2.2 tasks — 审查任务

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | varchar(36) | PK | UUID |
| projectId | varchar(36) | FK → projects.id, NOT NULL | 所属项目 |
| phase | varchar(30) | NOT NULL, DEFAULT 'DOC_UPLOADING' | 当前流水线阶段 |
| status | varchar(20) | NOT NULL, DEFAULT 'created' | 任务运行状态 |
| errorMessage | text | NULL | 失败时的错误信息 |
| createdAt | timestamp | NOT NULL, DEFAULT now() | 创建时间 |
| updatedAt | timestamp | NOT NULL, DEFAULT now() | 更新时间 |

**phase 枚举值：**

| 值 | 含义 | 可转入 |
|----|------|--------|
| DOC_UPLOADING | 文件上传阶段 | DPA_ROUND1 |
| DPA_ROUND1 | DPA 第一轮 — 审查基准提取 | DPA_ROUND2 |
| DPA_ROUND2 | DPA 第二轮 — 字段护照提取 | BCA_FCA_RUNNING |
| BCA_FCA_RUNNING | BCA + FCA 并行审查 | REPORT_COMPILING |
| REPORT_COMPILING | ORA 报告编译 | COMPLETED |
| COMPLETED | 审查完成 | — |
| FAILED | 审查失败 | — |

**status 枚举值：**

| 值 | 含义 |
|----|------|
| created | 已创建，等待启动 |
| running | 流水线执行中 |
| completed | 流水线已完成 |
| failed | 流水线失败 |

**Drizzle 定义：**

```typescript
export const tasks = pgTable('reviewer_tasks', {
  id: varchar('id', { length: 36 }).primaryKey(),
  projectId: varchar('project_id', { length: 36 }).notNull().references(() => projects.id),
  phase: varchar('phase', { length: 30 }).notNull().default('DOC_UPLOADING'),
  status: varchar('status', { length: 20 }).notNull().default('created'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**索引：**
- `projectId` — 按项目查任务
- `(projectId, createdAt DESC)` — 获取项目最新任务

---

### 2.3 review_documents — 上传文件

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | varchar(36) | PK | UUID |
| taskId | varchar(36) | FK → tasks.id, NOT NULL | 所属任务 |
| docType | varchar(10) | NOT NULL | 文件类型：tender（招标）/ bid（投标） |
| fileName | varchar(300) | NOT NULL | 原始文件名 |
| filePath | varchar(500) | NOT NULL | 服务器存储路径 |
| textContent | text | NULL | PDF/DOCX 解析后的文本内容 |
| charCount | integer | NULL | 提取文本的字符数 |
| uploadOrder | integer | NOT NULL, DEFAULT 0 | 上传顺序 |
| createdAt | timestamp | NOT NULL, DEFAULT now() | 上传时间 |

**约束：**
- 每个 task 最多一个 `docType='tender'` 的文件（应用层校验）
- `charCount` 在文本提取后更新

**Drizzle 定义：**

```typescript
export const reviewDocuments = pgTable('review_documents', {
  id: varchar('id', { length: 36 }).primaryKey(),
  taskId: varchar('task_id', { length: 36 }).notNull().references(() => tasks.id),
  docType: varchar('doc_type', { length: 10 }).notNull(),
  fileName: varchar('file_name', { length: 300 }).notNull(),
  filePath: varchar('file_path', { length: 500 }).notNull(),
  textContent: text('text_content'),
  charCount: integer('char_count'),
  uploadOrder: integer('upload_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**索引：**
- `taskId` — 按任务查文件
- `(taskId, docType)` — 快速检查是否已有招标文件

---

### 2.4 task_artifacts — 审查产物

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | varchar(36) | PK | UUID |
| taskId | varchar(36) | FK → tasks.id, NOT NULL | 所属任务 |
| name | varchar(200) | NOT NULL | 产物名称（如"审查基准"、"最终报告"） |
| artifactType | varchar(30) | NOT NULL | 产物类型枚举 |
| phase | varchar(30) | NOT NULL | 产出该产物的流水线阶段 |
| version | integer | NOT NULL, DEFAULT 1 | 版本号（重试时递增） |
| content | text | NOT NULL | 产物内容（Markdown 文本） |
| metadata | jsonb | NULL | 扩展元数据 |
| createdAt | timestamp | NOT NULL, DEFAULT now() | 创建时间 |

**artifactType 枚举值：**

| 值 | 含义 | 产出阶段 |
|----|------|---------|
| review_baseline | 审查基准（★条款/资格准入/评分/格式 四张表） | DPA_ROUND1 |
| extracted_fields | 字段护照（公司/资质/社保/审计/人员/业绩/报价/项目名称 八张表） | DPA_ROUND2 |
| bca_result | BCA 审查结果（废标红线 + 中标胜算） | BCA_FCA_RUNNING |
| fca_result | FCA 审查结果（隐蔽风险 + 电子文件安检） | BCA_FCA_RUNNING |
| review_report | 最终审查报告（七章节 + 附录 A-G） | REPORT_COMPILING |

**Drizzle 定义：**

```typescript
export const taskArtifacts = pgTable('task_artifacts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  taskId: varchar('task_id', { length: 36 }).notNull().references(() => tasks.id),
  name: varchar('name', { length: 200 }).notNull(),
  artifactType: varchar('artifact_type', { length: 30 }).notNull(),
  phase: varchar('phase', { length: 30 }).notNull(),
  version: integer('version').notNull().default(1),
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**索引：**
- `taskId` — 按任务查产物
- `(taskId, artifactType)` — 按类型查产物（唯一约束，同类型只保留最新版本）
- `(taskId, artifactType, version DESC)` — 查询历史版本

---

### 2.5 llm_call_logs — LLM 调用日志

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | varchar(36) | PK | UUID |
| taskId | varchar(36) | FK → tasks.id, NOT NULL | 所属任务 |
| agentRole | varchar(50) | NOT NULL | Agent 角色：dpa/bca/fca/ora |
| model | varchar(100) | NOT NULL | 使用的模型名称 |
| inputTokens | integer | NULL | 输入 token 数 |
| outputTokens | integer | NULL | 输出 token 数 |
| latencyMs | integer | NULL | 调用耗时（毫秒） |
| error | text | NULL | 错误信息（调用失败时） |
| createdAt | timestamp | NOT NULL, DEFAULT now() | 调用时间 |

**Drizzle 定义：**

```typescript
export const llmCallLogs = pgTable('llm_call_logs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  taskId: varchar('task_id', { length: 36 }).notNull().references(() => tasks.id),
  agentRole: varchar('agent_role', { length: 50 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  latencyMs: integer('latency_ms'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**索引：**
- `taskId` — 按任务查日志
- `(taskId, agentRole)` — 按 Agent 查日志
- `createdAt DESC` — 按时间排序

---

## 3. 文件存储设计

### 3.1 存储路径

```
uploads/
└── reviewer/
    └── {taskId}/
        ├── tender_招标文件.pdf
        ├── bid_投标函.pdf
        ├── bid_报价表.docx
        └── bid_资质证书.pdf
```

### 3.2 存储规则

| 规则 | 说明 |
|------|------|
| 路径格式 | `uploads/reviewer/{taskId}/{sanitizedFileName}` |
| 文件名清理 | 移除特殊字符，防止路径遍历 |
| 文件大小限制 | 单个文件 <= 100MB |
| 允许格式 | `.pdf`, `.docx`, `.doc` |
| 任务删除时清理 | 删除任务时同步删除对应目录 |

---

## 4. 数据字典

### 4.1 枚举值汇总

**projects.status：**

| 值 | 说明 |
|----|------|
| 未开始 | 项目已创建，尚未创建任务或任务未启动 |
| 审查中 | 项目下有任务正在执行流水线 |
| 已完成 | 项目下最新任务已完成审查 |

**tasks.phase：**（见 2.2 节 phase 枚举值表）

**tasks.status：**（见 2.2 节 status 枚举值表）

**review_documents.docType：**

| 值 | 说明 |
|----|------|
| tender | 招标文件（每个任务仅一个） |
| bid | 投标文件（可多个） |

**task_artifacts.artifactType：**（见 2.4 节 artifactType 枚举值表）

**llm_call_logs.agentRole：**

| 值 | 说明 |
|----|------|
| dpa | 文档解析智能体 |
| bca | 业务合规审查智能体 |
| fca | 技术取证审查智能体 |
| ora | 报告编译智能体 |

### 4.2 版本策略

`task_artifacts.version` 用于记录同一产物的重试历史：
- 每次同一 `artifactType` 保存新内容时，`version` 递增
- 查询时默认返回最新版本（`ORDER BY version DESC LIMIT 1`）
- 历史版本保留，便于对比和调试

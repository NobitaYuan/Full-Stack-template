# 标书合规审查系统 — 数据库与接口设计文档

> 版本：1.0 | 日期：2026-05-08
> 基于 PRD、HLD、Pipeline 详细设计和前端页面设计整合输出

---

## 1. 概述

本文档定义标书合规审查系统（reviewer 模块）的完整数据库表结构、字段约束、索引策略，以及前后端交互所需的全部 REST API 和 WebSocket 接口。

**关键变更（相对于文档前置输入）：**
- 验证码功能移除，联系方式改为直接填写：邮箱、手机号、姓名、公司、标书项目简称、项目说明
- RAG 知识库预留数据表和接口，支持后续无缝接入向量检索能力

---

## 2. 数据库设计

### 2.1 关系总览

```
projects (1) ──→ (N) tasks
                      │
                      ├──→ (N) review_documents
                      ├──→ (N) task_artifacts
                      ├──→ (N) llm_call_logs
                      └──→ (N) rag_query_logs  [预留]

system_prompts        (独立全局表)

rag_knowledge_chunks  [预留，独立表]
```

### 2.2 表定义

#### `projects` — 项目信息

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK | 项目唯一标识 |
| name | text | nullable | 项目名称（从招标文件提取，可能初始为空） |
| code | text | nullable | 项目编号（从招标文件提取） |
| createdAt | timestamptz | default now() | 创建时间 |

> 项目名和编号在 DPA Round 1 完成后回填。

#### `tasks` — 审查任务（状态机核心）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK | 任务唯一标识，对外暴露的 ID |
| projectId | uuid | FK → projects.id, not null | 所属项目 |
| phase | text | not null, default 'DOC_UPLOADING' | 当前阶段 |
| status | text | not null, default 'created' | created / queued / running / completed / failed |
| contactName | text | nullable | 联系人姓名 |
| contactEmail | text | nullable | 联系人邮箱 |
| contactPhone | text | nullable | 联系人手机号 |
| contactCompany | text | nullable | 公司 |
| projectShortName | text | nullable | 标书项目简称（用户填写） |
| projectDescription | text | nullable | 项目说明（用户填写） |
| progressToken | text | nullable, unique | 用户结果页访问 Token |
| adminToken | text | nullable, unique | 管理员结果页访问 Token |
| qualityScore | integer | nullable | 最终报告质量评分 0-100 |
| createdAt | timestamptz | default now() | 创建时间 |
| updatedAt | timestamptz | default now() | 更新时间 |

**状态枚举（status）流转：**

```
created → queued → running → completed
                      │
                      └──→ failed
```

**阶段枚举（phase）：**

```
DOC_UPLOADING → QUEUED → (extractTexts) → DPA_ROUND1 → DPA_ROUND2 → BCA_FCA_RUNNING → REPORT_COMPILING → COMPLETED
                                                                                                            |
                                                                                                            └──→ FAILED（任何阶段失败）
```

> `QUEUED` 阶段仅在并发槽位满时出现。有空闲槽位时，任务直接从 `DOC_UPLOADING` 跳到 `DPA_ROUND1`。

#### `review_documents` — 上传文件及提取文本

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK | 文件记录 ID |
| taskId | uuid | FK → tasks.id, not null | 所属任务 |
| fileName | text | not null | 服务器存储文件名（已清理特殊字符） |
| originalName | text | not null | 原始文件名 |
| fileSize | bigint | not null | 文件大小（字节） |
| docType | text | not null | tender（招标文件）/ bid（投标文件） |
| charCount | integer | nullable | 提取字符数，null 表示提取失败 |
| textContent | text | nullable | 提取的纯文本内容 |
| parseStatus | text | not null, default 'pending' | pending / parsing / completed / failed |
| uploadOrder | integer | not null, default 0 | 上传顺序 |
| createdAt | timestamptz | default now() | 上传时间 |

**业务约束：** 每个 taskId 下 docType='tender' 的记录最多 1 条。

#### `task_artifacts` — 流水线产物（版本化存储）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK | 产物记录 ID |
| taskId | uuid | FK → tasks.id, not null | 所属任务 |
| name | text | not null | 产物显示名（如"审查基准表"） |
| artifactType | text | not null | 产物类型标识 |
| phase | text | not null | 生成时的阶段名 |
| version | integer | not null, default 1 | 同类型递增版本号 |
| content | text | not null | Markdown 正文 |
| metadata | jsonb | nullable | 扩展信息（各类型结构不同） |
| createdAt | timestamptz | default now() | 生成时间 |

**artifactType 枚举：**

| 值 | 含义 | 产出阶段 |
|----|------|---------|
| review_baseline | 审查基准（4 张表） | DPA_ROUND1 |
| extracted_fields | 字段护照（8 张表） | DPA_ROUND2 |
| bca_result | BCA 审查结果 | BCA_FCA_RUNNING |
| fca_result | FCA 审查结果 | BCA_FCA_RUNNING |
| review_report | 最终审查报告 | REPORT_COMPILING |
| rag_results | RAG 查询结果 | BCA_FCA_RUNNING（预留） |

**metadata 各类型结构：**

| artifactType | metadata 示例 |
|-------------|--------------|
| review_baseline | `{ charCount, tableCount, formatValid: boolean }` |
| extracted_fields | `{ charCount, tableCount, formatValid: boolean }` |
| bca_result | `{ passCount, failCount, warningCount, rejectionItemCount }` |
| fca_result | `{ passCount, failCount, warningCount, defectItemCount }` |
| review_report | `{ qualityScore, isPass, issues: string[], charCount, aiTraceCount }` |
| rag_results | `{ dimensionResults: Record<string, RagDimensionResult> }` |

#### `llm_call_logs` — LLM 调用日志

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK | 日志 ID |
| taskId | uuid | FK → tasks.id, not null | 所属任务 |
| agentRole | text | not null | dpa / bca / fca / ora |
| model | text | not null | 实际使用的模型名称 |
| inputTokens | integer | not null | 输入 token 数 |
| outputTokens | integer | not null | 输出 token 数 |
| latencyMs | integer | not null | 调用耗时（毫秒） |
| error | text | nullable | 错误信息（调用失败时） |
| createdAt | timestamptz | default now() | 调用时间 |

#### `system_prompts` — Agent 系统提示词

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | serial | PK | 自增 ID |
| role | text | not null, unique | dpa / bca / fca / ora |
| content | text | not null | 完整的 system prompt markdown |
| version | integer | not null, default 1 | 版本号，每次更新递增 |
| isActive | boolean | not null, default true | 是否启用（支持灰度/回滚） |
| updatedBy | text | nullable | 最后修改人 |
| updatedAt | timestamptz | default now() | 更新时间 |
| createdAt | timestamptz | default now() | 创建时间 |

> 生效规则：role 相同取 `isActive = true` 且 `version` 最大的那条。

### 2.3 RAG 预留表

#### `rag_knowledge_chunks` — 知识片段 [预留]

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK | 片段 ID |
| dimension | text | not null | 所属维度：waste_redline / scoring / hidden_risk / file_inspection |
| source | text | nullable | 知识来源 |
| content | text | not null | 知识内容文本 |
| metadata | jsonb | nullable | 预留扩展（后续接入向量时存放 embedding 相关） |
| createdAt | timestamptz | default now() | 创建时间 |

#### `rag_query_logs` — RAG 查询日志 [预留]

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | uuid | PK | 日志 ID |
| taskId | uuid | FK → tasks.id, not null | 关联任务 |
| dimension | text | not null | 查询维度 |
| keywords | text[] | nullable | 查询关键词数组 |
| resultsCount | integer | nullable | 检索结果总数 |
| injectedCount | integer | nullable | 注入 Prompt 的数量 |
| discardedCount | integer | nullable | 丢弃的数量 |
| createdAt | timestamptz | default now() | 查询时间 |

### 2.4 索引建议

| 表 | 索引字段 | 用途 |
|----|---------|------|
| tasks | projectId | 按项目查任务 |
| tasks | progressToken, adminToken | Token 校验（unique 自带索引） |
| tasks | status + createdAt | 管理后台列表筛选+排序 |
| review_documents | taskId + docType | 查某任务的招标文件/投标文件 |
| task_artifacts | taskId + artifactType + version | 查某任务某类型最新产物 |
| llm_call_logs | taskId + agentRole | 按任务和 Agent 查调用记录 |
| system_prompts | role + isActive + version | 查生效 prompt |

---

## 3. RAG 预留策略

### 3.1 预留思路

RAG 的完整数据流已在 PRD 和 Pipeline 设计中定义（四维度检索 → 相似度过滤 → 注入 BCA/FCA Prompt），但底层向量数据库和 Embedding 模型待后续选型。本次通过**数据层预留 + 接口层占位**保证后续可无缝接入，不影响核心流水线执行。

### 3.2 已预留的数据层

| 预留点 | 说明 |
|--------|------|
| `rag_knowledge_chunks` 表 | 知识片段存储，metadata 字段预留 embedding 相关扩展 |
| `rag_query_logs` 表 | 每次 RAG 查询记录，便于后续分析检索效果 |
| `task_artifacts.artifactType = 'rag_results'` | RAG 查询结果作为产物持久化，注入 BCA/FCA 前可直接读取 |

### 3.3 后续接入改动点

1. `rag_knowledge_chunks` 表增加向量字段（或使用独立向量扩展表）
2. `rag/retriever.ts` 中实现真实检索逻辑（当前可 mock 返回空）
3. 其余数据流（filter → injector → pipeline 集成）已设计完成，无需改动

---

## 4. 接口设计

接口前缀统一为 `/api/v1/reviewer`。

### 4.1 项目管理（projects）

| 方法 | 路径 | 用途 | 认证 |
|------|------|------|------|
| GET | `/projects` | 项目列表（分页） | adminToken |
| GET | `/projects/:id` | 项目详情（含关联任务列表） | adminToken |

### 4.2 任务管理（tasks）

| 方法 | 路径 | 用途 | 认证 |
|------|------|------|------|
| POST | `/tasks` | 创建任务（自动创建 project） | 无 |
| GET | `/tasks/:id` | 任务详情（含文件列表、产物摘要） | progressToken / adminToken |
| POST | `/tasks/:id/start` | 启动审查流水线 | progressToken |
| POST | `/tasks/:id/rerun` | 重新跑流水线（completed/failed → created） | progressToken |
| GET | `/tasks/:id/status` | 获取当前阶段和状态（短轮询备用） | progressToken / adminToken |

**POST /tasks 说明：**
- 进入上传页时调用，后端自动创建 project + task
- 请求体：无（或可选预填联系信息）
- 返回：`{ taskId, projectId }`

**POST /tasks/:id/start 前置校验（全部通过才允许启动）：**

| 校验项 | 要求 | 失败响应 |
|--------|------|---------|
| 任务状态 | `status === 'created'` | 400，"任务已启动或已完成" |
| 招标文件 | 已上传且仅 1 份（docType='tender'） | 400，"请上传招标文件" |
| 投标文件 | 至少 1 份（docType='bid'） | 400，"请至少上传一份投标文件" |
| 联系方式 | `contactEmail` 和 `contactName` 已填写 | 400，"请填写联系方式" |

**POST /tasks/:id/start 执行流程：**
1. 保存联系人信息到 task 记录
2. 生成 `progressToken`（UUID）
3. 调用 `scheduler.enqueue(taskId)`，进入排队逻辑：
   - **有空闲槽位**（`activeTasks.size < MAX_CONCURRENT_TASKS`）：
     a. 更新 `status = 'running'`
     b. 异步启动流水线引擎 `engine.start(taskId)`（fire-and-forget，内部先执行 extractTexts 再进入 DPA_ROUND1）
     c. 返回 `{ progressToken, started: true }`
   - **无空闲槽位**：
     a. 更新 `status = 'queued'`，`phase = 'QUEUED'`
     b. WebSocket 广播 `phase_changed { from: 'DOC_UPLOADING', to: 'QUEUED' }`
     c. 计算排队位置：`SELECT COUNT(*) FROM tasks WHERE status = 'queued' AND createdAt < ?`
     d. 返回 `{ progressToken, started: false, queuePosition }`

**GET /tasks/:id/status 排队响应扩展：**

当 `status = 'queued'` 时，响应额外包含 `queuePosition` 字段：

```json
{
  "status": "queued",
  "phase": "QUEUED",
  "queuePosition": 3
}
```

**POST /tasks/:id/rerun 执行流程：**

| 校验项 | 要求 | 失败响应 |
|--------|------|---------|
| 任务状态 | `status === 'completed'` 或 `status === 'failed'` | 400，"仅已完成或失败的任务可重新运行" |

1. 清除旧产物：`DELETE FROM task_artifacts WHERE taskId = $1`
2. 重置状态：`UPDATE tasks SET status = 'created', phase = 'DOC_UPLOADING' WHERE id = $1`
3. 返回 `{ taskId }`，前端引导用户点击"开始"走正常 `POST /start` 流程

> 文档解析（extractTexts）在重跑时重新执行。pdf-parse / mammoth 提取纯文本很快（几秒），无需特殊跳过逻辑。

### 4.3 文件上传与下载（uploads）

| 方法 | 路径 | 用途 | 认证 |
|------|------|------|------|
| POST | `/tasks/:id/upload` | 上传文件（multipart/form-data） | 无（taskId 即凭证） |
| DELETE | `/tasks/:id/documents/:docId` | 删除已上传文件 | 无 |
| GET | `/tasks/:id/documents/:docId/download` | 下载原始文件 | progressToken / adminToken |

**POST /upload 行为：**
- 仅接受 `.pdf` / `.docx` / `.doc`
- 单文件 ≤ 100MB
- 每个 task 限 1 份 tender（重复上传返回 409）
- bid 文件可多份
- 文件存入磁盘 `data/uploads/{taskId}/{fileName}`，数据库仅记录元数据（文件名、大小、docType）
- **不执行文本提取**，文本提取在流水线启动时统一执行

**GET /download 行为：**
- 从磁盘读取文件并返回，Content-Type 根据扩展名设置
- 使用原始文件名（`originalName`）作为 `Content-Disposition` 的文件名

### 4.4 产物查询（artifacts）

| 方法 | 路径 | 用途 | 认证 |
|------|------|------|------|
| GET | `/tasks/:id/artifacts` | 产物列表（各类型最新版本） | progressToken / adminToken |
| GET | `/tasks/:id/artifacts/:type` | 指定类型最新产物完整内容 | progressToken / adminToken |

**type 枚举：** `review_baseline` / `extracted_fields` / `bca_result` / `fca_result` / `review_report` / `rag_results`

### 4.5 管理员（admin）

| 方法 | 路径 | 用途 | 认证 |
|------|------|------|------|
| POST | `/admin/login` | 管理员登录，获取 adminToken | adminKey（请求体） |
| GET | `/admin/tasks` | 全量任务列表（分页、筛选、排序） | adminToken |

**GET /admin/tasks 查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | 筛选：created / running / completed / failed |
| page | integer | 页码，默认 1 |
| pageSize | integer | 每页条数，默认 20 |
| sortBy | string | 排序字段，默认 createdAt |
| sortOrder | asc / desc | 排序方向，默认 desc |

**响应字段（任务列表项）：**

| 字段 | 说明 |
|------|------|
| id | 任务 ID |
| status | 状态 |
| contactName + contactEmail | 联系人（"姓名 · 邮箱"格式） |
| fileCount | 文件总数 |
| phase | 当前阶段 |
| createdAt | 提交时间 |

### 4.6 System Prompt 管理（system-prompts）

| 方法 | 路径 | 用途 | 认证 |
|------|------|------|------|
| GET | `/system-prompts` | 列出所有 prompt（含版本信息，不含 content） | adminToken |
| GET | `/system-prompts/:role` | 获取指定 role 的当前生效 prompt content | adminToken |
| PUT | `/system-prompts/:role` | 更新 prompt（自动递增 version，旧版保留为 isActive=false） | adminToken |
| POST | `/system-prompts/:role/rollback` | 回滚到指定 version | adminToken |

**更新约束：** 每次 PUT 创建新版本，旧版本保留为 `isActive = false`。修改后 5 分钟内生效（受缓存 TTL 控制）。

### 4.7 WebSocket

| 方法 | 路径 | 用途 |
|------|------|------|
| WS | `/ws/tasks/:id` | 任务实时事件流 |

**连接方式：** 客户端通过 `ws://host/api/v1/reviewer/ws/tasks/:id` 建立连接，服务端按 `taskId` 分组广播。

**事件类型（服务端 → 客户端）：**

| 事件 | Payload | 触发时机 |
|------|---------|---------|
| `phase_changed` | `{ from: string, to: string }` | 阶段切换（含进入 QUEUED） |
| `queue_position` | `{ position: number }` | 排队位置变化（前方任务完成时推送） |
| `document_parsed` | `{ docId: string, fileName: string, status: 'completed' \| 'failed', charCount: number \| null, error?: string }` | 单文件解析完成（成功或失败） |
| `artifact_ready` | `{ artifactType: string }` | 产物生成完成，前端刷新对应 Tab 内容 |
| `agent_call_started` | `{ agentRole: string, attempt: number }` | LLM 调用开始 |
| `agent_call_completed` | `{ agentRole: string, latencyMs: number, tokens: { input: number, output: number } }` | LLM 调用完成 |
| `completed` | `{ qualityScore: number }` | 流水线全部完成 |
| `failed` | `{ phase: string, error: string }` | 流水线失败 |

> WS 用于 PipelineMonitor 进度展示 + 产物内容实时刷新。不自动切换 Tab，仅标记有新内容并在用户当前查看时刷新。

### 4.8 RAG 预留接口（rag）

| 方法 | 路径 | 用途 | 认证 |
|------|------|------|------|
| POST | `/rag/query` | 四维度知识检索 | 内部调用（pipeline 触发） |

**请求体：**

```json
{
  "dimension": "waste_redline | scoring | hidden_risk | file_inspection",
  "keywords": ["资质有效期", "废标案例"],
  "tenderBaselines": "审查基准文本摘要（用于相关性过滤）"
}
```

**响应：**

```json
{
  "dimension": "waste_redline",
  "injected": [
    {
      "id": "RAG-RL-001",
      "similarity": 0.65,
      "tag": "[RAG_Supplement]",
      "content": "XX项目因保密资质换证期仅提供受理回执被否决"
    }
  ],
  "discardedCount": 1
}
```

> 当前可先 mock 返回空结果，不影响流水线执行。RAG 失败时降级为"仅基于手册固化规则审查"。

---

## 5. 接口汇总

| 模块 | 接口数量 | 核心功能 |
|------|---------|---------|
| projects | 2 | 项目列表 / 详情 |
| tasks | 4 | 创建 / 详情 / 启动 / 状态 |
| uploads | 3 | 上传 / 删除 / 下载文件 |
| artifacts | 2 | 产物列表 / 内容 |
| admin | 2 | 登录 / 任务列表 |
| system-prompts | 4 | Prompt CRUD / 回滚 |
| ws | 1 | 实时事件推送 |
| rag | 1 | 知识检索（预留） |
| **合计** | **19** | |

---

## 6. 认证方式说明

| Token 类型 | 用途 | 获取方式 | 有效期 |
|-----------|------|---------|--------|
| progressToken | 用户查看自己的任务结果 | POST /tasks/:id/start 时生成 | 30 分钟 |
| adminToken | 管理员查看所有任务结果 | POST /admin/login 验证通过后生成 | Session 级（存 sessionStorage） |

**结果页访问规则：**
- 携带 `?token=progressToken` → 可查看对应任务
- 携带 `?token=adminToken` → 可查看所有任务
- Token 无效 → 返回 403，前端展示"链接无效或已过期"

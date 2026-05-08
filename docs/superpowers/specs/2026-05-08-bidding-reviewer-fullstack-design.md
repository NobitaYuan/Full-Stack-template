# 标书合规审查系统 — 全栈设计规格

> 基于 demo/biddings-reviewer 的业务流程，构建完整的前后端全栈应用。
> 架构模式完全对标 writer 模块（D:\coding\Full-Stack-template\apps\server\src\modules\writer）。

---

## 1. 技术决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 流水线实现 | Port Python → TypeScript | 统一技术栈，共享认证/数据库/中间件 |
| LLM 调用 | Claude Agent SDK (`query`) | 与 writer 模块一致，复用 gateway 模式 |
| 实时通信 | WebSocket | 与 writer 模块一致，复用 ws-manager 模式 |
| 文件处理 | PDF/DOCX 上传 + 后端解析 | 用户体验好，demo 已有文本提取逻辑 |
| 模块架构 | reviewer 独立模块 | 遵循 writer 模块的模块组织方式 |

---

## 2. 数据模型

### 2.1 表结构

对标 writer 的 `projects → tasks → artifacts` 三层结构，新增 `review_documents` 存储上传文件。

**projects** — 审查项目
```
id              varchar(36) PK
name            varchar(200) NOT NULL
code            varchar(50) NOT NULL UNIQUE
clientOrg       varchar(200)
status          varchar(30) NOT NULL DEFAULT '未开始'
createdAt       timestamp
updatedAt       timestamp
```

**tasks** — 审查任务（一个项目可多次审查）
```
id              varchar(36) PK
projectId       varchar(36) FK → projects
phase           varchar(30) NOT NULL DEFAULT 'DOC_UPLOADING'
status          varchar(20) NOT NULL DEFAULT 'created'
errorMessage    text
createdAt       timestamp
updatedAt       timestamp
```

phase 状态机：`DOC_UPLOADING → DPA_ROUND1 → DPA_ROUND2 → BCA_FCA_RUNNING → REPORT_COMPILING → COMPLETED | FAILED`

status 值：`created | running | paused | completed | failed`

**review_documents** — 上传的原始文件
```
id              varchar(36) PK
taskId          varchar(36) FK → tasks
docType         varchar(10) NOT NULL  -- 'tender' | 'bid'
fileName        varchar(300) NOT NULL
filePath        varchar(500) NOT NULL -- 原始文件存储路径
textContent     text                  -- PDF/DOCX 解析后的文本
charCount       integer               -- 提取文本字符数
uploadOrder     integer DEFAULT 0
createdAt       timestamp
```

约束：每个 task 只能有一个 `docType='tender'` 的文件（招标文件），投标文件可多次上传。

**task_artifacts** — 中间产物（复用 writer 模式）
```
id              varchar(36) PK
taskId          varchar(36) FK → tasks
name            varchar(200) NOT NULL
artifactType    varchar(30) NOT NULL
phase           varchar(30) NOT NULL
version         integer DEFAULT 1
content         text NOT NULL
metadata        jsonb
createdAt       timestamp
```

artifactType 枚举：
- `review_baseline` — DPA R1：★号条款 / 资格准入 / 评分标准 / 格式要求（四张表）
- `extracted_fields` — DPA R2：公司信息 / 资质 / 社保 / 审计 / 人员 / 业绩 / 报价 / 项目名称一致性（八张表）
- `bca_result` — BCA 审查结果（废标红线 + 中标胜算）
- `fca_result` — FCA 审查结果（隐蔽风险 + 电子文件安检）
- `review_report` — ORA 编译的最终七章节报告

**llm_call_logs** — LLM 调用日志（复用 writer 模式）
```
id              varchar(36) PK
taskId          varchar(36) FK → tasks
agentRole       varchar(50) NOT NULL  -- 'dpa' | 'bca' | 'fca' | 'ora'
model           varchar(100) NOT NULL
inputTokens     integer
outputTokens    integer
latencyMs       integer
error           text
createdAt       timestamp
```

### 2.2 文件存储

原始文件（PDF/DOCX）存储在文件系统：
- 路径：`uploads/reviewer/{taskId}/{fileName}`
- 文本提取后存入 `review_documents.textContent`
- 使用 `pdf-parse`（PDF）和 `mammoth`（DOCX）提取文本

---

## 3. Pipeline 编排

### 3.1 模块结构

```
apps/server/src/modules/reviewer/
├── index.ts                  # 模块注册入口
├── reviewer.route.ts         # OpenAPI 路由定义
├── reviewer.service.ts       # CRUD 业务逻辑
├── reviewer.schema.ts        # Zod schemas
├── ws-manager.ts             # WebSocket 管理（复用 writer 模式）
├── types.ts                  # 类型定义
│
├── llm/
│   ├── config.ts             # Agent 配置（temperature/maxTokens/model）
│   └── gateway.ts            # LLM 调用网关（复用 writer gateway 模式）
│
├── pipeline/
│   ├── engine.ts             # 流水线编排引擎（主入口）
│   ├── registry.ts           # Agent 注册表（复用 writer 模式）
│   ├── context-builder.ts    # Prompt 构建（port from demo）
│   ├── format-validator.ts   # 格式校验（port from demo）
│   └── report-validator.ts   # 报告质量校验（port from demo）
│
└── prompts/
    ├── loader.ts             # Prompt 模板加载器
    └── templates/            # System prompt 模板文件
        ├── dpa.md
        ├── bca.md
        ├── fca.md
        └── ora.md
```

### 3.2 流水线引擎

```typescript
// pipeline/engine.ts
export async function runPipeline(taskId: string): Promise<void> {
  try {
    // 从数据库加载文档
    const { tenderDoc, bidDocs, bidDocsText } = await loadDocuments(taskId)

    // Phase 1: DPA Round 1 — 提取审查基准
    await setPhase(taskId, 'DPA_ROUND1')
    broadcast(taskId, { type: 'phase_changed', to: 'DPA_ROUND1' })
    const baseline = await runPhase(taskId, 'dpa', buildDpaRound1Prompt(tenderDoc))
    await saveArtifact(taskId, 'review_baseline', 'DPA_ROUND1', baseline)
    broadcast(taskId, { type: 'artifact_ready', artifactType: 'review_baseline' })

    // Phase 2: DPA Round 2 — 字段护照提取
    await setPhase(taskId, 'DPA_ROUND2')
    broadcast(taskId, { type: 'phase_changed', to: 'DPA_ROUND2' })
    const fields = await runPhase(taskId, 'dpa', buildDpaRound2Prompt(bidDocs, baseline))
    await saveArtifact(taskId, 'extracted_fields', 'DPA_ROUND2', fields)
    broadcast(taskId, { type: 'artifact_ready', artifactType: 'extracted_fields' })

    // Phase 3: BCA + FCA 并行
    await setPhase(taskId, 'BCA_FCA_RUNNING')
    broadcast(taskId, { type: 'phase_changed', to: 'BCA_FCA_RUNNING' })
    const [bcaResult, fcaResult] = await Promise.all([
      runPhase(taskId, 'bca', buildBcaPrompt(baseline, fields, bidDocs)),
      runPhase(taskId, 'fca', buildFcaPrompt(bidDocsText, fields, bidDocs)),
    ])
    await saveArtifact(taskId, 'bca_result', 'BCA_FCA_RUNNING', bcaResult)
    await saveArtifact(taskId, 'fca_result', 'BCA_FCA_RUNNING', fcaResult)
    broadcast(taskId, { type: 'artifact_ready', artifactType: 'bca_result' })
    broadcast(taskId, { type: 'artifact_ready', artifactType: 'fca_result' })

    // Phase 4: ORA 报告编译
    await setPhase(taskId, 'REPORT_COMPILING')
    broadcast(taskId, { type: 'phase_changed', to: 'REPORT_COMPILING' })
    const report = await runPhase(taskId, 'ora', buildReportPrompt(taskId, baseline, bcaResult, fcaResult, tenderDoc))
    await saveArtifact(taskId, 'review_report', 'REPORT_COMPILING', report)
    broadcast(taskId, { type: 'artifact_ready', artifactType: 'review_report' })

    // 完成
    await setPhase(taskId, 'COMPLETED')
    broadcast(taskId, { type: 'completed' })
  } catch (err) {
    broadcast(taskId, { type: 'failed', error: String(err) })
    await setPhase(taskId, 'FAILED')
  }
}
```

### 3.3 单阶段执行（含重试+格式校验）

```typescript
async function runPhase(taskId: string, role: string, prompt: string): Promise<string> {
  const agent = getAgent(role)
  const MAX_RETRY = 3

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    broadcast(taskId, { type: 'agent_call_started', agentRole: role })
    const result = await callAgent({
      agentRole: role,
      systemPrompt: agent.getSystemPrompt(),
      userPrompt: prompt,
    })
    broadcast(taskId, { type: 'agent_call_completed', agentRole: role, latencyMs: result.latencyMs })

    if (!result.text.trim()) continue

    // 格式校验
    const issues = validateReviewFormat(result.text, role)
    if (isFormatValid(issues)) return result.text

    // 格式不通过，追加修正要求重试
    if (attempt < MAX_RETRY - 1) {
      prompt = appendFormatFix(prompt, issues)
    }
  }

  // 最后一次结果即使不完美也保留
  return result.text
}
```

### 3.4 Agent 配置

| Agent | temperature | maxTokens | 说明 |
|-------|------------|-----------|------|
| DPA | 0.1 | 8192 | 精确提取 |
| BCA | 0.0 | 8192 | 确定性审查 |
| FCA | 0.0 | 8192 | 确定性安全检查 |
| ORA | 0.2 | 16384 | 报告编译需要更多 token |

### 3.5 Agent Registry

和 writer 一样用注册制，4 个 Agent 各自实现 `AgentHandler` 接口：

```typescript
interface ReviewerAgentHandler {
  role: string                          // 'dpa' | 'bca' | 'fca' | 'ora'
  getSystemPrompt: () => string         // 加载 prompts/templates/{role}.md
  getConfig: () => AgentConfig          // temperature/maxTokens/model
}
```

注意：reviewer 不需要 writer 的 `buildPrompt` 方法在 Agent 上，因为 prompt 构建依赖上下文（baseline/fields/bidDocs），在 `context-builder.ts` 中统一处理。

---

## 4. API 路由

### 4.1 项目管理

```
POST   /api/v1/reviewer/projects              创建审查项目
GET    /api/v1/reviewer/projects              项目列表（分页+搜索）
GET    /api/v1/reviewer/projects/:id          项目详情
PATCH  /api/v1/reviewer/projects/:id          更新项目
DELETE /api/v1/reviewer/projects/:id          删除项目
```

### 4.2 任务管理

```
POST   /api/v1/reviewer/tasks                 创建审查任务
GET    /api/v1/reviewer/tasks/:id             任务详情（含当前phase）
GET    /api/v1/reviewer/projects/:id/latest-task  项目最新任务
DELETE /api/v1/reviewer/tasks/:id             删除任务
```

### 4.3 文件上传

```
POST   /api/v1/reviewer/tasks/:id/upload      上传文件
       body: multipart/form-data { file, docType: 'tender'|'bid' }
       后端：解析 PDF/DOCX → 提取文本 → 存 review_documents

GET    /api/v1/reviewer/tasks/:id/documents   获取文件列表
```

### 4.4 流水线控制

```
POST   /api/v1/reviewer/tasks/:id/start       启动审查流水线
POST   /api/v1/reviewer/tasks/:id/pause       暂停
POST   /api/v1/reviewer/tasks/:id/resume      恢复
```

### 4.5 产物查看

```
GET    /api/v1/reviewer/tasks/:id/artifacts         获取全部产物列表
GET    /api/v1/reviewer/tasks/:id/artifacts/:type   获取指定产物内容
       type: review_baseline | extracted_fields | bca_result | fca_result | review_report
```

### 4.6 WebSocket

```
GET    /api/v1/reviewer/ws/tasks/:id          WebSocket 连接
```

事件类型：

```typescript
type ReviewerEvent =
  | { type: 'phase_changed'; from: string; to: string }
  | { type: 'artifact_ready'; artifactType: string; artifactId: string }
  | { type: 'agent_call_started'; agentRole: string }
  | { type: 'agent_call_completed'; agentRole: string; latencyMs: number }
  | { type: 'completed' }
  | { type: 'failed'; error: string }
```

---

## 5. 前端页面

### 5.1 路由

```
/reviewer/projects           项目列表页
/reviewer/tasks/:id          任务详情页（核心）
/reviewer/reports/:id        报告查看页
```

### 5.2 任务详情页（核心页面）

布局：**左右分栏**

- **左侧（300px）**：
  - 流水线阶段状态列表（当前阶段高亮，已完成打勾，等待中灰色）
  - 已上传文件列表（文件名 + 提取字数 + 状态标签）
  - 添加文件按钮

- **右侧**：
  - Tab 切换栏：审查基准 | 字段护照 | BCA 结果 | FCA 结果 | 审查报告
  - 已就绪的 Tab 正常显示，未就绪的灰色禁用
  - 内容区：Markdown 渲染（中间产物）或完整报告渲染（最终报告）

### 5.3 项目列表页

标准 TDesign Table 列表：项目名称、项目编号、委托单位、状态、最新审查时间、操作按钮。

### 5.4 报告查看页

最终审查报告的 Markdown 渲染，带目录导航。后续可加 PDF 导出。

### 5.5 状态管理

Pinia store：
- `useReviewerStore` — 项目列表、当前项目
- `useTaskStore` — 当前任务、阶段状态、产物列表、WebSocket 连接管理

---

## 6. 从 Demo Port 的代码清单

以下文件从 demo 的 Python 代码 port 为 TypeScript：

| Demo 文件 | 目标位置 | 内容 |
|-----------|---------|------|
| `src/shared/models.py` | `types.ts` | ReviewPhase, ReviewVerdict, RiskLevel 等枚举和类型 |
| `src/orchestrator/state.py` | 数据库 tasks 表 | 状态管理改为数据库驱动，不再用 JSON 文件 |
| `src/orchestrator/pipeline.py` | `pipeline/engine.ts` | 流水线编排主逻辑 |
| `src/orchestrator/context_builder.py` | `pipeline/context-builder.ts` | Prompt 构建（truncate, file_index, 各阶段 prompt） |
| `src/orchestrator/report_validator.py` | `pipeline/report-validator.ts` | 报告质量校验（结构/表格/标题编号/AI痕迹） |
| `src/agents/client.py` | `llm/gateway.ts` | 复用 writer 的 callAgent 模式 |
| `src/agents/options.py` | `llm/config.ts` | Agent 配置 |
| `src/agents/prompts/*.md` | `prompts/templates/*.md` | System prompt 原样搬入 |

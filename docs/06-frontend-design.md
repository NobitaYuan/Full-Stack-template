# 标书合规审查系统 — 前端页面设计文档

> 版本：1.0 | 日期：2026-05-08
> 前端技术栈：Vue 3 + TDesign + Pinia + Vite

---

## 1. 路由设计

| 路由路径 | 页面 | 说明 |
|---------|------|------|
| `/reviewer/projects` | ProjectList.vue | 项目列表页（入口） |
| `/reviewer/tasks/:id` | TaskDetail.vue | 任务详情页（核心页面） |
| `/reviewer/reports/:id` | ReportView.vue | 报告查看页 |

---

## 2. 页面设计

### 2.1 项目列表页 `/reviewer/projects`

**功能：** 审查项目的 CRUD 管理，系统入口

**页面结构：**

```
┌─────────────────────────────────────────────────────────┐
│  标书合规审查                          [+ 新建审查项目]    │
├─────────────────────────────────────────────────────────┤
│  🔍 搜索项目名称/编号                                     │
├─────────────────────────────────────────────────────────┤
│  ┌─────┬──────────┬─────────┬────────┬──────┬────────┐  │
│  │ 选择 │ 项目名称  │ 项目编号  │ 委托单位 │ 状态  │ 操作   │  │
│  ├─────┼──────────┼─────────┼────────┼──────┼────────┤  │
│  │ □   │ XX系统... │ 2026-.. │ XX部队  │ 审查中│ 详情.. │  │
│  │ □   │ YY平台... │ 2026-.. │ YY单位  │ 已完成│ 详情.. │  │
│  └─────┴──────────┴─────────┴────────┴──────┴────────┘  │
│  分页: < 1 2 3 ... >                                     │
└─────────────────────────────────────────────────────────┘
```

**组件拆分：**

| 组件 | 说明 |
|------|------|
| TDesign Table | 表格主体，支持排序和分页 |
| 搜索输入框 | TDesign Input，防抖搜索 |
| 新建对话框 | TDesign Dialog + Form，填写项目名称/编号/委托单位 |
| 操作按钮 | 查看详情（跳转任务详情页）、删除（二次确认） |

**交互流程：**
1. 页面加载时请求项目列表 API
2. 点击"新建审查项目"弹出对话框，填写信息后创建
3. 创建成功后自动跳转到任务详情页（自动创建第一个任务）
4. 点击"查看详情"跳转到 `/reviewer/tasks/:latestTaskId`

**表格列定义：**

| 列名 | 字段 | 宽度 | 排序 | 说明 |
|------|------|------|------|------|
| 项目名称 | name | 自适应 | 是 | 点击可跳转 |
| 项目编号 | code | 160px | 是 | — |
| 委托单位 | clientOrg | 200px | 否 | — |
| 状态 | status | 100px | 是 | TDesign Tag 组件 |
| 最新审查 | latestTaskPhase | 180px | 否 | 当前阶段名称 |
| 操作 | — | 150px | 否 | 查看详情 / 删除 |

---

### 2.2 任务详情页 `/reviewer/tasks/:id`（核心页面）

**功能：** 文件上传、流水线监控、产物查看

**布局方案：左右分栏**

```
┌────────────────────────────────────────────────────────────────┐
│  ← 返回   XX系统采购项目 > 任务详情                               │
├──────────────┬─────────────────────────────────────────────────┤
│  流水线状态    │  [审查基准] [字段护照] [BCA结果] [FCA结果] [审查报告] │
│              │─────────────────────────────────────────────────│
│  ✓ DPA R1    │                                                 │
│    审查基准    │  产物内容渲染区域                                  │
│  ✓ DPA R2    │                                                 │
│    字段护照    │  - 审查基准：Markdown 表格渲染                     │
│  ⟳ BCA+FCA   │  - 字段护照：Markdown 表格渲染                     │
│    并行审查    │  - BCA/FCA：Markdown 渲染                        │
│  ○ ORA       │  - 审查报告：专用报告渲染（带目录）                   │
│    报告编译    │                                                 │
│              │                                                 │
│  ─────────── │                                                 │
│  已上传文件    │                                                 │
│  📄 招标文件  │                                                 │
│    82,340字   │                                                 │
│  📄 投标函    │                                                 │
│    3,200字    │                                                 │
│  📄 报价表    │                                                 │
│    5,100字    │                                                 │
│              │                                                 │
│  [+ 添加文件] │                                                 │
│  [▶ 启动审查] │                                                 │
├──────────────┴─────────────────────────────────────────────────┤
│  (300px固定)                                                    │
└────────────────────────────────────────────────────────────────┘
```

**左侧面板（300px 固定宽度）：**

#### 流水线状态组件 PipelineStatus.vue

| 状态 | 样式 | 说明 |
|------|------|------|
| 已完成 | 绿色圆形 ✓ + 白色背景 | 阶段已完成 |
| 进行中 | 蓝色圆形 ⟳ + 蓝色边框 + 浅蓝背景 | 当前执行阶段 |
| 等待中 | 灰色边框圆形 + 灰色文字 | 尚未开始 |
| 失败 | 红色圆形 ✗ + 红色边框 | 阶段执行失败 |

每个阶段显示：
- 阶段名称（DPA Round 1 / DPA Round 2 / BCA + FCA / ORA 报告编译）
- 阶段描述（审查基准提取 / 字段护照提取 / 并行审查 / 报告编译）

#### 文件列表组件 FileList.vue

| 元素 | 说明 |
|------|------|
| 文件图标 | 📄（PDF）/ 📝（DOCX） |
| 文件名 | 显示原始文件名 |
| 字数标签 | 绿色: 正常字数 / 黄色: "扫描件" / 红色: "解析失败" |
| 类型标签 | "招标文件" (tender) / "投标文件" (bid) |
| 添加文件按钮 | 弹出上传对话框 |

#### 操作按钮

| 按钮 | 显示条件 | 说明 |
|------|---------|------|
| 启动审查 | status=created 且文件齐全 | 校验后调用 start API |
| 重新审查 | status=failed | 从失败阶段重新开始 |

**右侧面板（自适应宽度）：**

#### 产物 Tab 组件 ArtifactTabs.vue

| Tab 名称 | artifactType | 激活条件 |
|---------|-------------|---------|
| 审查基准 | review_baseline | phase >= DPA_ROUND2 |
| 字段护照 | extracted_fields | phase >= BCA_FCA_RUNNING |
| BCA 结果 | bca_result | phase >= REPORT_COMPILING 且 bca_result 存在 |
| FCA 结果 | fca_result | phase >= REPORT_COMPILING 且 fca_result 存在 |
| 审查报告 | review_report | phase = COMPLETED 且 review_report 存在 |

未激活的 Tab 显示为灰色禁用状态。

激活逻辑基于 WebSocket 推送的 `artifact_ready` 事件实时更新。

#### 内容渲染

| 产物类型 | 渲染方式 | 说明 |
|---------|---------|------|
| review_baseline | MarkdownRenderer | 四张 Markdown 表格 |
| extracted_fields | MarkdownRenderer | 八张 Markdown 表格 |
| bca_result | MarkdownRenderer | 检查项列表 + 判定结果 |
| fca_result | MarkdownRenderer | 检查项列表 + 判定结果 |
| review_report | ReportRenderer | 七章节 + 目录导航 |

---

### 2.3 报告查看页 `/reviewer/reports/:id`

**功能：** 最终审查报告的独立查看页面

**页面结构：**

```
┌──────────────────────────────────────────────────────────┐
│  ← 返回   审查报告 - XX系统采购项目                         │
├──────────────┬───────────────────────────────────────────┤
│  目录导航     │                                           │
│              │  报告正文渲染区域                             │
│  一、项目概况  │                                           │
│  二、废标红线  │  七章节 + 审查签署 + 附录 A-G               │
│  三、中标胜算  │  Markdown 渲染                              │
│  四、隐蔽风险  │                                           │
│  五、电子文件  │                                           │
│  六、整改建议  │                                           │
│  七、人工复核  │                                           │
│              │                                           │
├──────────────┴───────────────────────────────────────────┤
│  (200px)                                                 │
└──────────────────────────────────────────────────────────┘
```

**组件：**

| 组件 | 说明 |
|------|------|
| ReportRenderer.vue | 报告专用渲染，支持目录跳转 |
| MarkdownRenderer.vue | 通用 Markdown 渲染（基于 markdown-it 或 marked） |

---

## 3. 状态管理

### 3.1 useReviewerStore

```typescript
// stores/useReviewerStore.ts
interface ReviewerState {
  // 项目列表
  projects: Project[]
  total: number
  page: number
  pageSize: number
  keyword: string

  // 当前项目
  currentProject: Project | null
}
```

| Action | 说明 |
|--------|------|
| fetchProjects() | 请求项目列表 API |
| createProject(data) | 创建项目 |
| fetchProject(id) | 获取项目详情 |
| updateProject(id, data) | 更新项目 |
| deleteProject(id) | 删除项目 |

### 3.2 useTaskStore

```typescript
// stores/useTaskStore.ts
interface TaskState {
  // 当前任务
  currentTask: Task | null
  documents: ReviewDocument[]
  artifacts: Artifact[]

  // WebSocket
  wsConnected: boolean
  currentPhase: string

  // 活跃产物 Tab
  activeArtifactType: string | null
}
```

| Action | 说明 |
|--------|------|
| fetchTask(id) | 获取任务详情（含文件和产物列表） |
| uploadFile(taskId, file, docType) | 上传文件 |
| startPipeline(taskId) | 启动审查流水线 |
| fetchArtifact(taskId, type) | 获取指定产物内容 |
| connectWS(taskId) | 建立 WebSocket 连接 |
| disconnectWS() | 断开 WebSocket |

**WebSocket 事件处理：**

| 事件 | 处理 |
|------|------|
| phase_changed | 更新 currentTask.phase |
| artifact_ready | 将新产物加入 artifacts 列表 |
| agent_call_started | 显示 Agent 调用中状态 |
| agent_call_completed | 更新调用耗时显示 |
| completed | 标记流水线完成 |
| failed | 显示错误信息 |

---

## 4. 组件设计

### 4.1 组件清单

```
components/reviewer/
├── PipelineStatus.vue      # 流水线阶段状态列表
├── FileList.vue            # 已上传文件列表
├── FileUploadDialog.vue    # 文件上传对话框
├── ArtifactTabs.vue        # 产物 Tab 切换
├── MarkdownRenderer.vue    # 通用 Markdown 渲染
└── ReportRenderer.vue      # 报告专用渲染（含目录）
```

### 4.2 PipelineStatus.vue

**Props：**

| Prop | 类型 | 说明 |
|------|------|------|
| phase | string | 当前阶段 |
| status | string | 任务状态 |

**阶段配置：**

```typescript
const PHASES = [
  { key: 'DPA_ROUND1', label: 'DPA Round 1', desc: '审查基准提取' },
  { key: 'DPA_ROUND2', label: 'DPA Round 2', desc: '字段护照提取' },
  { key: 'BCA_FCA_RUNNING', label: 'BCA + FCA', desc: '并行审查' },
  { key: 'REPORT_COMPILING', label: 'ORA 报告编译', desc: '报告编译' },
]
```

**状态判定逻辑：**

```typescript
function getPhaseState(phaseKey: string): 'completed' | 'running' | 'waiting' | 'failed' {
  const order = ['DOC_UPLOADING', 'DPA_ROUND1', 'DPA_ROUND2', 'BCA_FCA_RUNNING', 'REPORT_COMPILING', 'COMPLETED']
  const currentIdx = order.indexOf(props.phase)
  const phaseIdx = order.indexOf(phaseKey)

  if (props.status === 'failed' && phaseIdx === currentIdx) return 'failed'
  if (phaseIdx < currentIdx) return 'completed'
  if (phaseIdx === currentIdx) return 'running'
  return 'waiting'
}
```

### 4.3 FileList.vue

**Props：**

| Prop | 类型 | 说明 |
|------|------|------|
| documents | ReviewDocument[] | 文件列表 |
| taskStatus | string | 任务状态（控制是否可上传） |

**字数标签样式：**

| charCount | 样式 | 文案 |
|-----------|------|------|
| null | 红色 | 解析失败 |
| < 50 且 PDF | 黄色 | 扫描件 |
| < 50 | 黄色 | 内容极少 |
| >= 5000 | 绿色 | N,NNN 字 |
| >= 500 | 绿色 | N,NNN 字 |
| > 0 | 绿色 | N 字 |

### 4.4 ArtifactTabs.vue

**Props：**

| Prop | 类型 | 说明 |
|------|------|------|
| artifacts | Artifact[] | 已就绪的产物列表 |
| phase | string | 当前阶段（用于判定 Tab 是否可用） |

**Tab 配置：**

```typescript
const TABS = [
  { key: 'review_baseline', label: '审查基准', minPhase: 'DPA_ROUND2' },
  { key: 'extracted_fields', label: '字段护照', minPhase: 'BCA_FCA_RUNNING' },
  { key: 'bca_result', label: 'BCA 结果', minPhase: 'REPORT_COMPILING' },
  { key: 'fca_result', label: 'FCA 结果', minPhase: 'REPORT_COMPILING' },
  { key: 'review_report', label: '审查报告', minPhase: 'COMPLETED' },
]
```

Tab 激活条件：`artifacts` 中存在对应 `artifactType` 的产物。

### 4.5 MarkdownRenderer.vue

**Props：**

| Prop | 类型 | 说明 |
|------|------|------|
| content | string | Markdown 文本 |

**渲染方案：**
- 使用 `markdown-it` 或 `marked` 解析
- 支持表格渲染（TDesign 样式覆盖）
- 代码块语法高亮
- 自定义样式适配审查报告的表格和标题层级

### 4.6 ReportRenderer.vue

**Props：**

| Prop | 类型 | 说明 |
|------|------|------|
| content | string | 完整报告 Markdown |

**特殊功能：**
- 解析 H2 标题生成目录导航
- 目录点击滚动到对应章节
- 报告中表格样式增强（交替行颜色、固定表头）

---

## 5. 交互流程

### 5.1 新建项目并审查

```
1. 项目列表页 → 点击"新建审查项目"
2. 弹出对话框 → 填写项目名称/编号/委托单位 → 确认创建
3. 自动跳转到任务详情页（自动创建任务）
4. 上传招标文件 → 文件列表显示招标文件
5. 上传投标文件 → 文件列表显示投标文件
6. 点击"启动审查" → 流水线开始执行
7. 左侧 PipelineStatus 实时更新阶段状态
8. 右侧 Tab 依次激活 → 用户可随时查看已完成阶段的产物
9. 审查完成 → 所有 Tab 激活，最终报告可查看
```

### 5.2 查看已有审查结果

```
1. 项目列表页 → 点击"查看详情"
2. 跳转到任务详情页 → 直接显示最新状态和所有产物
3. 如果任务正在执行 → 自动建立 WebSocket 连接，实时更新
4. 如果任务已完成 → 直接显示所有产物
```

### 5.3 WebSocket 连接管理

```
进入任务详情页 → connectWS(taskId)
  ├── 连接成功 → wsConnected = true
  ├── 收到 phase_changed → 更新 phase，刷新 PipelineStatus
  ├── 收到 artifact_ready → 添加到 artifacts，激活对应 Tab
  ├── 收到 agent_call_started → 显示加载状态
  ├── 收到 agent_call_completed → 隐藏加载状态
  ├── 收到 completed → 标记完成，刷新所有产物
  ├── 收到 failed → 显示错误提示
  └── 连接断开 → wsConnected = false

离开任务详情页 → disconnectWS()
```

---

## 6. TDesign 组件使用

| 场景 | 组件 |
|------|------|
| 表格 | `<t-table>` |
| 分页 | `<t-pagination>` |
| 对话框 | `<t-dialog>` |
| 表单 | `<t-form>` + `<t-form-item>` + `<t-input>` |
| 按钮 | `<t-button>` |
| 标签 | `<t-tag>` |
| Tab 切换 | `<t-tabs>` + `<t-tab-panel>` |
| 上传 | `<t-upload>` |
| 消息提示 | `MessagePlugin.success/error/warning` |
| 确认对话框 | `DialogPlugin.confirm` |
| 加载 | `<t-loading>` |
| 面包屑 | `<t-breadcrumb>` |

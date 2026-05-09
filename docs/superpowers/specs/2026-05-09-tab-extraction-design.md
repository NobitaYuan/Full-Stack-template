# Tab 内容抽离设计

## 目标

将 `complianceCheck/index.vue`（~1877 行）中四个 tab 的模板和状态数据抽离到独立的 `tab1-4/index.vue` 组件中，提高可维护性。

## 架构

```
complianceCheck/
├── index.vue              # 父组件：步骤条 + tabs 外壳 + 共享状态
├── types.ts               # 不变
├── raw.tsx                # 不变
├── tab1/index.vue         # 文档上传（含索引查看/文件预览模态框）
├── tab2/index.vue         # 检查项解析
├── tab3/index.vue         # 合规检查（含 Drools 模态框）
└── tab4/index.vue         # 报告生成（含雷达图）
```

## 父组件 index.vue 保留内容

- 页面标题 + 描述
- `<a-steps>` 步骤条
- `<a-tabs>` 外壳 + `activeTab` 状态
- 共享数据源（通过 props 下发）：
  - `currentProject`（computed）
  - `complianceData`（ref，Tab 2/3/4 共用）
  - `REVIEW_TASKS`（Tab 3 用）
- 所有 mock 数据的初始引入
- `formatFileSize` 公共工具函数
- Tab 切换方法

## Props / Emits 接口

### Tab 1 — 文档上传

- **Props**: 无外部依赖
- **Emits**: 无
- **内部状态**: bidFiles, responseFiles, checklistFiles, knowledgeFiles, 所有 OCR/索引方法、模态框状态

### Tab 2 — 检查项解析

- **Props**: `complianceData: ComplianceItem[]`, `complianceColumns`（computed 表格列配置）
- **Emits**: `update:complianceData`（编辑/删除/新增后通知父组件更新）, `regenerate`（请求重新生成）
- **内部状态**: editingComplianceKey, expandedComplianceKeys

### Tab 3 — 合规检查

- **Props**: `complianceData: ComplianceItem[]`, `reviewTasks: ReviewTask[]`
- **Emits**: `update:complianceData`
- **内部状态**: selectedComplianceKey, customRules, isQueuePaused, collapsedCategories, taskPausedMap, manualConfirmedSet, Drools 编辑器状态, 所有 computed (stats, groupedData, etc.)
- **内部组件**: Drools 模态框

### Tab 4 — 报告生成

- **Props**: `complianceData: ComplianceItem[]`, `currentProject`
- **Emits**: 无
- **内部状态**: reportSection, isGeneratingReport, reportEditMode, expandedReportKeys, reportContents
- **内部组件**: 报告预览/编辑区 + SVG 雷达图

## 共享数据流

```
index.vue (complianceData ref)
  ├── Tab2: props→complianceData, emit→update:complianceData
  ├── Tab3: props→complianceData, emit→update:complianceData
  └── Tab4: props→complianceData (只读)
```

父组件监听 `update:complianceData`，更新自己的 ref，Vue 响应式自动传递到其他 Tab 的 props。

## 导入策略

- 共用类型和配置常量从 `../types` 导入
- 各 Tab 按需导入自己使用的图标
- `MessageResponse` 组件仅 Tab 4 导入

## 不变内容

- `types.ts` — 类型定义、配置常量、mock 数据
- `raw.tsx` — React 原型文件

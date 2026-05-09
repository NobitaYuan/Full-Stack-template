# 标书合规审查系统 — Agent 沙箱设计

> 版本：1.0 | 日期：2026-05-09
> 本文档是 [03-pipeline-design.md](03-pipeline-design.md) 的配套文档，描述流水线中 Agent 的沙箱执行机制

---

## 1. 概述

当前 demo 实现通过 `query()` 调用 Claude Agent SDK，但 `allowedTools` 仅包含 `["Write"]`，Agent 无法主动读取或搜索文件——所有内容都塞进 prompt，受截断限制。

沙箱模式的核心改动：**设 `cwd` 指向沙箱目录，开放 Read/Grep/Glob/Write/Bash 工具，让 Agent 自主读取文件、搜索内容、写出结果。**

这对 `callLlm()` 来说是纯内部实现变更，下游 validate → state → saveArtifact → DB → WS 全部不动。

---

## 2. Claude Code SDK 官方参考

> 官方文档：https://docs.anthropic.com/en/docs/claude-code/sdk
> NPM 包：`@anthropic-ai/claude-code`（TypeScript SDK 包含在主包内）

### 2.1 `query()` 函数签名

```typescript
import { query } from '@anthropic-ai/claude-code'

const messageStream = query({
  prompt: string,
  options: {
    model: string,
    systemPrompt: string,
    cwd: string,// ← 关键：设为沙箱目录的绝对路径
    permissionMode: string, // 'bypassPermissions'
    tools: string[],// 允许的工具列表 ["Read", "Grep", "Glob", "Write", "Bash"]
    maxTurns: number,
    maxTokens: number,
    temperature: number,
    abortController: AbortController,
    // ... 其他选项见官方文档
  },
})

for await (const message of messageStream) {
  // 处理流式消息
}
```

### 2.2 沙箱相关选项

| 选项 | 值 | 说明 |
|------|---|------|
| `cwd` | 沙箱目录绝对路径 | Agent 的 Read/Grep/Glob/Write 都基于此目录 |
| `permissionMode` | `'bypassPermissions'` | 服务端运行，跳过权限弹窗 |
| `tools` | `['Read','Grep','Glob','Write','Bash']` | 文件读写和搜索工具，无网络访问 |

### 2.3 项目中已有的用法

`apps/server/src/modules/agent/agent.service.ts` 已有 `query()` 的完整使用示例（管理助手场景）：

```typescript
const messageStream = query({
  prompt,
  options: {
    model: 'claude-sonnet-4-6',
    tools: ['AskUserQuestion'],
    systemPrompt: SYSTEM_PROMPT,
    maxTurns: 20,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    cwd: process.cwd(),
    // ...
  },
})
```

沙箱模式只需改动 `cwd` 和 `tools` 两个参数。

---

## 3. 沙箱构建机制

### 3.1 目录结构

每个沙箱是一个普通文件系统目录：

```
{SANDBOX_ROOT}/{taskId}/{stage}/
├── input/               ← 流水线写入，Agent 可读
│   └── *.md / *.json    ← 各阶段需要的输入文件
└── output/              ← Agent 用 Write 工具写出结果
    └── result.md        ← Agent 产出的 Markdown
```

- `SANDBOX_ROOT`：通过环境变量配置（如 `SANDBOX_ROOT=.sandbox`），默认为项目根目录下的 `.sandbox/`
- 每个任务 `taskId/` 隔离，每个阶段 `stage/` 隔离
- 并发任务之间零共享、零冲突（各自 cwd 指向不同绝对路径）

### 3.2 生命周期

```
1. 创建沙箱     mkdir -p {sandbox}/input {sandbox}/output
2. 写入 input   将阶段所需文件写入 input/ 目录
3. 调用 Agent   query(prompt, { cwd: sandbox绝对路径, tools: [...] })
4. 读取 output  从 output/result.md 读取 Agent 产出
5. 清理沙箱     任务完成后 rm -rf {taskId}/（失败时可保留用于调试）
```

### 3.3 阶段间数据传递

Agent 产出从沙箱读取后写入 PipelineState（内存），下一阶段从 PipelineState 取数据写入新沙箱的 input/。不跨沙箱共享文件。

```
DPA R1 沙箱 output/result.md
  → 读出文本 → state.reviewBaseline = text
  → DPA R2 沙箱 input/review_baseline.md ← 写入 state.reviewBaseline
```

### 3.4 与现有持久化的关系

沙箱是临时文件系统，不替代数据库持久化。流程不变：

```
Agent 写 output/result.md
  → callLlm() 读取并返回文本
  → validate(result)
  → state.xxx = result
  → saveArtifact(taskId, type, phase, result)    ← 写入 task_artifacts 表
  → WS artifact_ready                            ← 广播前端
```

---

## 4. 各阶段沙箱设计

### 4.1 DPA Round 1 — 审查基准提取

**目标**：从招标文件提取 ★号条款、资格准入、评分标准、格式要求四张表。

```
sandbox/{taskId}/dpa_r1/
├── input/
│   └── tender.md          ← 招标文件全文（不截断）
└── output/
```

**工具价值**：Agent 可 `Grep "★"` 定位星号条款，`Grep "废标"` 搜索废标条款，`Read` 精读相关段落。不受 45K 字符截断限制。

**prompt 指令要点**：
- 招标文件在 `input/tender.md`，请用 Read 工具读取
- 搜索 ★ 条款时用 Grep 工具
- 结果用 Write 工具写到 `output/result.md`
- 输出格式要求与 §3.2 一致（四张 Markdown 表格）

### 4.2 DPA Round 2 — 字段护照提取

**目标**：从投标文件提取 8 类字段信息（公司信息、资质证书、社保纳税等）。

```
sandbox/{taskId}/dpa_r2/
├── input/
│   ├── bid_投标函.md       ← 按实际文件名命名
│   ├── bid_资质证书.md
│   ├── bid_社保.md
│   ├── ...                 ← 其他投标文件（不截断）
│   └── review_baseline.md  ← DPA R1 产出
└── output/
```

**工具价值**：每个投标文件独立存在，Agent 可逐个 Read，也可 Grep 跨文件搜索关键词（如搜索所有文件中的"营业执照"）。

**prompt 指令要点**：
- 用 Glob 浏览 `input/` 下有哪些投标文件
- 按优先级读取（投标函、授权书、价格构成优先）
- review_baseline.md 是审查基准，用于交叉校验
- 结果写到 `output/result.md`

### 4.3 BCA — 废标红线审查 + 中标胜算评估

**目标**：逐项检查废标条件，评估中标胜算。

```
sandbox/{taskId}/bca/
├── input/
│   ├── tender.md            ← 招标文件全文（供搜证据用）
│   ├── review_baseline.md   ← 审查基准
│   ├── extracted_fields.md  ← 字段护照
│   └── file_index.md        ← 文件索引表
└── output/
```

**工具价值**：BCA 判定"文件缺失"或"信息不符"时，Agent 可 `Grep` 原文件验证，而不只依赖 extracted_fields 里的数据。例如检查"社保缴纳证明"时，Agent 可直接搜索投标文件中的社保相关内容。

**prompt 指令要点**：
- 需要验证投标文件内容时，用 Grep 搜索 tender.md 或对应 bid 文件
- file_index.md 记录文件状态（是否扫描件、是否缺失）
- 每个 FAIL 判定必须有原文引用 + 投标文件实际值

### 4.4 FCA — 隐蔽风险 + 电子文件安检

**目标**：暗标脱敏检查、数据勾稽、文件格式/签章/命名检查。

```
sandbox/{taskId}/fca/
├── input/
│   ├── bid_投标函.md        ← 投标文件全文（不截断）
│   ├── bid_技术方案.md
│   ├── ...                  ← 所有投标文件
│   ├── extracted_fields.md  ← 字段护照
│   └── file_index.md        ← 文件索引表
└── output/
```

**工具价值**：FCA 需要逐文件检查命名规范、搜索敏感词（公司名、人名）、比对数据勾稽关系。Agent 可 `Grep "公司名"` 检查暗标脱敏，`Grep "缺|无|bak"` 检查文件名信号词。

### 4.5 ORA — 报告编译

**目标**：将 BCA/FCA 结果编译为七章节审查报告。

```
sandbox/{taskId}/ora/
├── input/
│   ├── tender_summary.md    ← 招标文件摘要（提取项目名称/编号）
│   ├── review_baseline.md   ← 审查基准
│   ├── bca_result.md        ← BCA 产出
│   └── fca_result.md        ← FCA 产出
└── output/
```

**工具价值**：ORA 输入全是结构化中间产物，沙箱收益较小。但可省去 34K 字符的截断拼接。Agent 可 Read 各个结果文件，交叉引用后写出完整报告。

---

## 5. 环境变量

| 变量 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `SANDBOX_ROOT` | string | `.sandbox` | 沙箱根目录（相对于项目根或绝对路径） |
| `SANDBOX_CLEANUP` | boolean | `true` | 任务完成后是否自动清理沙箱 |

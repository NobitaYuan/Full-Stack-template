# 标书合规审查系统 — Pipeline 详细设计文档

> 版本：1.0 | 日期：2026-05-08
> 本文档从 `demo/biddings-reviewer` 的 Python 代码 port 而来，是整个系统最核心的模块

---

## 1. Pipeline 概述

### 1.1 流水线结构

```
DPA Round 1 (审查基准提取)
        ↓
DPA Round 2 (字段护照提取)
        ↓
BCA (废标红线+中标胜算) ──并行── FCA (隐蔽风险+电子文件安检)
        ↓
ORA (报告编译)
```

### 1.2 阶段依赖关系

| 阶段 | 输入依赖 | 产出 |
|------|---------|------|
| DPA R1 | 招标文件文本 | review_baseline |
| DPA R2 | 投标文件文本 + review_baseline | extracted_fields |
| BCA | review_baseline + extracted_fields + 文件索引 | bca_result |
| FCA | 投标文件文本 + extracted_fields + 文件索引 | fca_result |
| ORA | review_baseline + bca_result + fca_result + 招标文件摘要 | review_report |

---

## 2. Agent 配置

### 2.1 四个 Agent 的配置

| Agent | temperature | maxTokens | 说明 |
|-------|------------|-----------|------|
| DPA | 0.1 | 8192 | 极低温度，精确提取，不允许创造性解读 |
| BCA | 0.0 | 8192 | 零温度，确定性审查判断，不接受模糊结论 |
| FCA | 0.0 | 8192 | 零温度，确定性安全检查 |
| ORA | 0.2 | 16384 | 轻微温度，报告编译需要流畅表述 |

### 2.2 Agent Registry 设计

```typescript
interface ReviewerAgentHandler {
  role: 'dpa' | 'bca' | 'fca' | 'ora'
  getSystemPrompt(): string     // 从 prompts/templates/{role}.md 加载
  getConfig(): {
    model: string               // 从环境变量读取
    temperature: number
    maxTokens: number
  }
}
```

注册和获取：

```typescript
const agents = new Map<string, ReviewerAgentHandler>()

function registerAgent(handler: ReviewerAgentHandler): void
function getAgent(role: string): ReviewerAgentHandler
```

### 2.3 模型配置

模型从环境变量读取，优先级：`{ROLE}_MODEL` → `PIPELINE_MODEL` → `ANTHROPIC_MODEL`

---

## 3. Prompt 构建（context-builder.ts）

### 3.1 工具函数

#### 文本截断 `_truncate(text, maxChars)`

| 参数 | 说明 |
|------|------|
| text | 原始文本 |
| maxChars | 最大字符数 |
| 返回值 | 截断后的文本，超出时末尾追加 `[已截断，原文共N字符]` |

空文本返回 `[无内容]`。

#### 文件索引构建 `_buildFileIndex(bidDocs)`

生成 Markdown 表格，帮助 LLM 了解文件存在状态：

```
| 序号 | 文件名 | 提取字符数 | 文件状态说明 |
|------|--------|-----------|-------------|
| 1 | 投标函.pdf | 3,200 | 已提取 3,200 字符（内容基本完整） |
| 2 | 资质证书.pdf | 12 | 扫描件PDF，文本未能提取（文件实体存在，需人工查看） |
```

状态判定规则：

| 条件 | 状态说明 |
|------|---------|
| PDF 且 charCount < 50 | 扫描件PDF，文本未能提取 |
| charCount < 50 | 文本极少（可能为空模板或扫描件） |
| charCount > 5000 | 已提取 N 字符（内容完整） |
| charCount > 500 | 已提取 N 字符（内容基本完整） |
| 其他 | 部分提取 N 字符 |

### 3.2 DPA Round 1 Prompt

**用途：** 从招标文件提取四类审查基准

**输入：** 招标文件全文（截断到 45000 字符）

**输出要求（四张表）：**

| 表格 | 内容 |
|------|------|
| A. ★号条款提取 | 序号/条款编号/原文摘要/所在章节/是否接受负偏离/所需支撑材料类型 |
| B. 资格准入条件提取 | 序号/条件类型/招标要求摘要/所在章节/是否标注废标项 |
| C. 评分标准提取 | 序号/评分类别/评分项名称/满分/评分规则摘要 |
| D. 格式与封装要求提取 | 序号/要求类型/招标要求摘要/所在章节 |

**关键搜索规则：**
- ★号搜索标记：★、\*（加粗）、【★】、(实质性要求)
- "不接受负偏离"、"视为无效投标"、"按无效投标处理" → 纳入隐性★条款
- 招标文件中的"示例""如""假设"引出的数值 → 标注"此为招标文件示例值，非实际要求"

**Prompt 模板结构：**

```
【任务：招标文件解析与审查基准提取】
━━━━━━━━━━━━━━━━━━━━━━━━━━
招标文件全文
━━━━━━━━━━━━━━━━━━━━━━━━━━
{truncatedTenderDoc}

━━━━━━━━━━━━━━━━━━━━━━━━━━
提取要求
━━━━━━━━━━━━━━━━━━━━━━━━━━
[四张表的结构定义和搜索规则]

━━━━━━━━━━━━━━━━━━━━━━━━━━
输出要求
━━━━━━━━━━━━━━━━━━━━━━━━━━
[输出格式约束]
```

### 3.3 DPA Round 2 Prompt

**用途：** 从投标文件提取关键字段信息

**输入：**
- 投标文件内容（优先文件 15000 字符，其他 4000 字符）
- 文件索引表格
- 审查基准（截断到 10000 字符）

**优先文件关键词：**

```
投标函, 授权, 价格构成, 开标一览, 偏离表, 营业执照,
保密资质, 社保, 纳税, 审计, 承诺, 保证金, 业绩, 售后服务, 人员
```

**输出要求（八张表）：**

| 表格 | 字段 |
|------|------|
| 1. 公司基本信息 | 公司名称/统一社会信用代码/法定代表人/注册资本/成立日期/营业期限/经营范围 |
| 2. 资质证书信息 | 资质类型/证书编号/等级/有效期起止/持证单位/来源文件 |
| 3. 社保与纳税 | 类型/参保单位/缴纳月份/险种/来源文件 |
| 4. 审计报告 | 审计年度/事务所/注册会计师/审计意见/双签双章/来源文件 |
| 5. 人员与授权 | 角色/姓名/身份证号/社保关系/来源文件 |
| 6. 业绩合同 | 合同名称/金额/签订日期/标的类别/双方/来源文件 |
| 7. 报价信息 | 分项名称/单价/数量/合价/备注/来源文件 |
| 8. 项目名称一致性检查 | 文件名/出现的项目名称/是否与招标文件一致 |

**核心区分原则：**
- "未从提取文本中发现" ≠ "文件不存在"（文件可能是扫描件）
- 文件名含"缺"标记 → 信号词，需特别关注

### 3.4 BCA Prompt

**用途：** 废标红线审查 + 中标胜算评估

**输入：**
- 审查基准（截断到 12000 字符）
- 提取字段（截断到 12000 字符）
- 文件索引（用于区分"文件存在但无法提取"与"文件缺失"）

**审查任务结构：**

#### 废标红线审查

| 检查项 | 内容 |
|--------|------|
| 2.1 资格准入合规性 | 逐项检查 9 项（军采库/信用/营业执照/保密资质/涉密集成/社保/纳税/审计/非外资） |
| 2.2 项目名称一致性 | 逐文件核对项目名称是否与招标文件完全一致 |
| 2.3 投标保证金与授权文件 | 保证金三要素 + 授权书五要素 |
| 2.4 ★号条款响应对撞 | 逐条★条款对撞：响应自述 vs 支撑材料 vs 招标要求 |
| 2.5 反串通与反雷同筛查 | 元数据、EXIF、文件哈希 |
| 2.6 形式要件与附属文件 | 格式/签章/日期/声明书/承诺函 |

#### 中标胜算评估

| 评估项 | 内容 |
|--------|------|
| 3.1 商务响应竞争力 | 评分项/满分/预估得分/失分项 |
| 3.2 技术方案专业度 | 评分维度/满分/预估得分/评估依据 |
| 3.3 经济合理性 | 算术校验/大小写/异常低价/限价 |

**判定边界速查（关键！）：**

| 场景 | 判定 |
|------|------|
| 提取字段为空 + 文件清单中存在 | WARNING（需人工复核） |
| 提取字段为空 + 文件清单中不存在 | FAIL（文件缺失） |
| 提取字段为空 + 文件名含"缺" | FAIL（投标人自标注缺失） |
| 支撑材料PDF无法提取 | "无法判定（需人工复核）" |
| ★条款不接受负偏离 + 负偏离检出 | 否决项 |

**证据链要求：**
- 每个 FAIL 必须包含：招标条款原文引用 + 投标文件实际值 + 差异逐字对比 + 来源文件名
- 缺少任一环节 → 降级为 WARNING

### 3.5 FCA Prompt

**用途：** 隐蔽风险探测 + 电子文件安检

**输入：**
- 投标文件内容（截断到 15000 字符）
- 提取字段（截断到 8000 字符）
- 文件索引

**审查任务结构：**

#### 隐蔽风险探测

| 检查项 | 内容 |
|--------|------|
| 4.1 暗标脱敏彻底性 | 公司名称/人员姓名/文档属性/图片/水印 逐项检查 |
| 4.2 数据勾稽关系 | 人员↔报价/设备↔清单/进度↔函件/报价分项/财务跨年/社保人数↔金额 |

#### 电子文件安检

| 检查项 | 内容 |
|--------|------|
| 5.1 文件格式与平台兼容性 | 文件格式/大小/命名规范 |
| 5.2 扫描件质量 | 分辨率/OCR可搜索/图像质量 |
| 5.3 电子签章合规 | 签章存在性/位置/多页独立性 |
| 5.4 文件命名与组织 | 逐文件检查命名规则和信号词 |
| 5.5 暗标反还原 | 删除遮盖层是否有敏感信息暴露 |

**文件名信号词检测：**

| 信号词 | 含义 |
|--------|------|
| "缺"、"无"、"未" | 投标人自标注缺失 |
| "zzz"、"匿名" | 暗标标记 |
| "副本"、"草稿"、"旧"、"bak" | 版本管理问题 |
| 文件名与内容不符 | 编制失误 |

### 3.6 ORA Prompt（报告编译）

**用途：** 将 BCA/FCA 结果编译为标准七章节审查报告

**输入：**
- 招标文件摘要（4000 字符，用于提取项目名称/编号等基本信息）
- 审查基准（6000 字符）
- BCA 结果（12000 字符）
- FCA 结果（12000 字符）

**报告结构（七章节 + 附录）：**

| 章节 | 内容 |
|------|------|
| 第一部分 | 项目概况与审查摘要（基本信息表 + 四维度总览 + 审查摘要） |
| 第二部分 | 废标红线审查（资格准入 + 保证金 + ★条款对撞 + 反串通 + 形式要件） |
| 第三部分 | 中标胜算评估（商务 + 技术 + 经济） |
| 第四部分 | 隐蔽风险探测（暗标脱敏 + 数据勾稽） |
| 第五部分 | 电子文件安检（格式 + 扫描件 + 签章 + 命名 + 反还原） |
| 第六部分 | 审查发现与整改建议（否决项清单 + 缺陷项 + 综合结论 + 投标建议） |
| 第七部分 | 线下人工复核事项（6项固定检查清单） |
| 审查签署 | 审查人/复核人/批准人签名表 |
| 附录 A~G | 资格准入明细/元数据扫描/技术合规/签章验证/暗标攻击/勾稽核验/证据索引 |

**关键输出要求：**
- 投标建议必须三选一并用粗体：**建议递交** / **有条件递交** / **不建议递交**
- ORA 是报告编译者而非审查者，不得对 BCA/FCA 判定做升级或降级
- 附录 A-G 必须全部生成，数据与正文一致
- 禁止 AI 痕迹表述

---

## 4. 格式校验（format-validator.ts）

### 4.1 DPA Round 1 校验

检查输出必须包含四张表的关键词：

| 必含关键词 | 对应表格 |
|-----------|---------|
| ★号条款 | A. ★号条款提取 |
| 资格准入条件 | B. 资格准入条件提取 |
| 评分标准 | C. 评分标准提取 |
| 格式与封装 | D. 格式与封装要求提取 |

### 4.2 DPA Round 2 校验

检查输出必须包含字段提取表：

| 必含关键词（至少3个） |
|---------------------|
| 公司基本信息、资质证书、社保、审计、报价、项目名称一致性 |

少于 3 类 → "字段提取表不完整"

### 4.3 BCA/FCA 校验

| 检查项 | 规则 |
|--------|------|
| 判定存在性 | 必须包含 PASS 或 FAIL 或 合格/不合格 |
| 检查项数量 | 至少 2 个检查项（匹配 "检查项N：" 格式） |
| 否决项/缺陷项（BCA） | 必须包含 "否决项" 或 "缺陷项" |
| 文件命名（FCA） | 必须包含 "文件命名" 或 "命名规则" |
| 模糊用语 | 检测 "可能""或许""大概""似乎" |

### 4.4 ORA 校验

| 检查项 | 规则 |
|--------|------|
| 关键章节 | 必须包含：项目/审查/废标/胜算/隐蔽/电子文件/否决/人工复核（缺失>4个为严重） |
| 投标建议 | 必须包含 "建议递交" 或 "有条件递交" 或 "不建议递交" |
| AI 痕迹 | 检测 10 种 AI 痕迹表述 |

---

## 5. 报告质量校验（report-validator.ts）

### 5.1 七章节结构校验

| 必含章节 | 关键词 |
|---------|--------|
| 项目概况 | "项目概况"/"项目基本信息"/"审查摘要" |
| 审查结论总览 | "审查结论"/"审查状态"/"审查总览" |
| 废标红线 | "废标红线"/"资格准入" |
| 中标胜算 | "中标胜算"/"得分预测"/"评分预估" |
| 隐蔽风险 | "隐蔽风险"/"暗标脱敏"/"勾稽" |
| 电子文件安检 | "电子文件"/"文件安检"/"签章" |
| 否决项清单 | "否决项"/"否决" |
| 人工复核 | "人工复核"/"线下确认"/"复核事项" |

缺失章节扣 10 分/个。

### 5.2 附录完整性

检查附录 A-G 是否齐全，缺失附录记录为问题。

### 5.3 表格校验

| 检查项 | 规则 |
|--------|------|
| 表格行数 | Markdown 表格行 >= 8 行 |
| 表格数量 | 表头分隔行 >= 3 个 |
| 必含表格 | 项目基本信息表、审查结论表、否决项清单表 |

### 5.4 AI 痕迹检测

120+ 种模式，分为四类：

| 类别 | 示例 |
|------|------|
| 指令手册引用 | "根据指令手册"/"按照SOP"/"依据指令手册" |
| Agent 身份暴露 | "作为DPA"/"作为BCA"/"智能体判断"/"AI审查" |
| 工作流元信息 | "根据审查流程"/"审查任务完成"/"已按模板" |
| 模板指令暴露 | "{{"/"}}"/"输出格式要求"/"请按模板" |
| 系统身份 | "本报告由"/"生成时间"/"Claude"/"GPT"/"AI生成" |

每处 AI 痕迹扣 15 分。

### 5.5 标题编号 Lint

**H2 校验：** "第X部分" 从一到七连续、无重复、无缺失

**H3 校验：** "X.Y" 子节编号与父章节匹配、无缺失、无重复

### 5.6 质量评分

```
满分 100
- 缺少章节：-10 分/个
- 缺少表格：-8 分/个
- AI 痕迹：-15 分/处
- 缺少投标建议：-15 分
- 报告过短(<500字)：-20 分
- 报告偏短(<1500字)：-10 分

通过条件：score >= 60 且 缺少章节 <= 2
```

---

## 6. 重试策略

### 6.1 单阶段重试

每个阶段最多重试 3 次：

```
attempt 0: 构建初始 prompt → 调用 LLM
  ├── 空响应 → 重试
  └── 格式校验不通过 → 追加修正要求 → 重试

attempt 1: 修正后的 prompt → 调用 LLM
  ├── 空响应 → 重试
  └── 格式校验不通过 → 追加修正要求 → 重试

attempt 2: 再次修正的 prompt → 调用 LLM
  └── 无论结果如何 → 保留（最后一次兜底）
```

### 6.2 格式修正 Prompt

在原始 prompt 后追加：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ 格式修正要求（上一轮输出存在以下格式问题）
━━━━━━━━━━━━━━━━━━━━━━━━━━
- 缺少★号条款提取表
- 缺少明确的 PASS/FAIL 判定

请重新输出，务必修正上述格式问题。其余内容不变。
```

### 6.3 报告质量修正

ORA 阶段使用报告质量校验替代格式校验，修正 prompt：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ 上一版报告存在以下问题，请修正后重新编译完整报告：
━━━━━━━━━━━━━━━━━━━━━━━━━━
- 缺少「审查结论总览」章节
- 报告表格行数过少（3行）

请确保报告包含全部七个部分。直接输出完整报告，不要输出任何解释或说明。
```

---

## 7. 文本截断策略

各阶段的截断阈值（从 demo 的 qwen3.6-27b 适配参数）：

| 阶段 | 输入 | 截断阈值 |
|------|------|---------|
| DPA R1 | 招标文件 | 45,000 字符 |
| DPA R2 | 审查基准 | 10,000 字符 |
| DPA R2 | 优先投标文件 | 15,000 字符/个 |
| DPA R2 | 其他投标文件 | 4,000 字符/个 |
| BCA | 审查基准 | 12,000 字符 |
| BCA | 提取字段 | 12,000 字符 |
| FCA | 投标文件内容 | 15,000 字符 |
| FCA | 提取字段 | 8,000 字符 |
| ORA | 招标文件摘要 | 4,000 字符 |
| ORA | 审查基准 | 6,000 字符 |
| ORA | BCA 结果 | 12,000 字符 |
| ORA | FCA 结果 | 12,000 字符 |

---

## 8. 数据流详细路径

### 8.1 从数据库加载文档

```typescript
async function loadDocuments(taskId: string): Promise<{
  tenderDoc: string
  bidDocs: Map<string, string>  // fileName → textContent
  bidDocsText: string           // 所有投标文件拼接
}> {
  const docs = await db.query(reviewDocuments)
    .where(eq(reviewDocuments.taskId, taskId))

  const tenderDoc = docs.find(d => d.docType === 'tender')?.textContent ?? ''
  const bidDocs = new Map(
    docs.filter(d => d.docType === 'bid')
      .map(d => [d.fileName, d.textContent ?? ''])
  )
  const bidDocsText = Array.from(bidDocs.entries())
    .map(([name, content]) => `【${name}】\n${content.slice(0, 12000)}`)
    .join('\n\n')

  return { tenderDoc, bidDocs, bidDocsText }
}
```

### 8.2 产物保存

```typescript
async function saveArtifact(
  taskId: string,
  artifactType: string,
  phase: string,
  content: string
): Promise<void> {
  // 查询当前最大版本
  const existing = await db.query(taskArtifacts)
    .where(and(
      eq(taskArtifacts.taskId, taskId),
      eq(taskArtifacts.artifactType, artifactType)
    ))
    .orderBy(desc(taskArtifacts.version))
    .limit(1)

  const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1

  await db.insert(taskArtifacts).values({
    id: generateUUID(),
    taskId,
    name: ARTIFACT_NAMES[artifactType],
    artifactType,
    phase,
    version: nextVersion,
    content,
    metadata: null,
  })
}
```

### 8.3 WebSocket 事件广播

```typescript
function broadcast(taskId: string, event: ReviewerEvent): void {
  wsManager.broadcast(taskId, event)
}
```

事件在以下时机触发：
- `setPhase()` → `phase_changed`
- `saveArtifact()` → `artifact_ready`
- `runPhase()` 开始 → `agent_call_started`
- `runPhase()` 完成 → `agent_call_completed`
- 流水线完成 → `completed`
- 流水线失败 → `failed`

---

## 9. 错误处理

### 9.1 异常传播

```
runPipeline()
  ├── loadDocuments 失败 → 设置 FAILED，广播 failed
  ├── DPA R1 失败 → 设置 FAILED，广播 failed
  ├── DPA R2 失败 → 设置 FAILED，广播 failed
  ├── BCA 失败 → 保留异常信息，不影响 FCA
  ├── FCA 失败 → 保留异常信息，不影响 BCA
  ├── BCA 和 FCA 都失败 → 设置 FAILED
  ├── ORA 失败 → 设置 FAILED
  └── 未捕获异常 → 设置 FAILED，广播 failed
```

### 9.2 BCA+FCA 并行容错

```typescript
const [bcaResult, fcaResult] = await Promise.allSettled([
  runPhase(taskId, 'bca', bcaPrompt),
  runPhase(taskId, 'fca', fcaPrompt),
])

const bcaText = bcaResult.status === 'fulfilled'
  ? bcaResult.value
  : `BCA 审查异常: ${bcaResult.reason}`

const fcaText = fcaResult.status === 'fulfilled'
  ? fcaResult.value
  : `FCA 审查异常: ${fcaResult.reason}`

// 即使部分失败也保存结果
await saveArtifact(taskId, 'bca_result', 'BCA_FCA_RUNNING', bcaText)
await saveArtifact(taskId, 'fca_result', 'BCA_FCA_RUNNING', fcaText)
```

---

## 10. 从 Demo Port 的文件映射

| Demo 文件 (Python) | 目标文件 (TypeScript) | 说明 |
|--------------------|-----------------------|------|
| `src/shared/models.py` | `types.ts` | 枚举和类型定义，去掉 dataclass 装饰器 |
| `src/orchestrator/state.py` | 数据库 tasks 表 | 状态管理从 JSON 文件改为数据库驱动 |
| `src/orchestrator/pipeline.py` | `pipeline/engine.ts` | 流水线主逻辑，async/await 替代 Python asyncio |
| `src/orchestrator/context_builder.py` | `pipeline/context-builder.ts` | Prompt 构建，截断参数保持一致 |
| `src/orchestrator/context_builder.py::validate_review_format` | `pipeline/format-validator.ts` | 格式校验逻辑原样 port |
| `src/orchestrator/report_validator.py` | `pipeline/report-validator.ts` | 报告质量校验，全部校验规则原样 port |
| `src/agents/client.py` | `llm/gateway.ts` | 复用 writer 的 callAgent 模式 |
| `src/agents/options.py` | `llm/config.ts` | Agent 配置工厂 |
| `src/agents/prompts/dpa.md` | `prompts/templates/dpa.md` | 原样搬入 |
| `src/agents/prompts/bca.md` | `prompts/templates/bca.md` | 原样搬入 |
| `src/agents/prompts/fca.md` | `prompts/templates/fca.md` | 原样搬入 |
| `src/agents/prompts/ora.md` | `prompts/templates/ora.md` | 原样搬入 |
| `config/pipeline.toml` | 环境变量 + 硬编码默认值 | 配置项合并到代码常量 |

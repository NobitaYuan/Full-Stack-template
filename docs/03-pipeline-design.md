# 标书合规审查系统 — Pipeline 详细设计文档

> 版本：1.0 | 日期：2026-05-08
> 本文档从 `demo/biddings-reviewer` 的 Python 代码 port 而来，是整个系统最核心的模块

---

## 1. Pipeline 概述

### 1.1 流水线结构

```
用户上传招标文件 + 投标文件
        ↓
ORA 启动，调度 DPA Round 1 (审查基准提取)
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

### 1.3 启动前置校验

`POST /tasks/:id/start` 被调用时，引擎先执行以下校验，全部通过后才允许进入 `DPA_ROUND1`：

| 校验项 | 要求 | 失败响应 |
|--------|------|---------|
| 任务状态 | `status === 'created'` | 400，"任务已启动或已完成" |
| 招标文件 | 已上传且仅 1 份（`docType='tender'`） | 400，"请上传招标文件" |
| 投标文件 | 至少 1 份（`docType='bid'`） | 400，"请至少上传一份投标文件" |
| 联系方式 | `contactEmail` 和 `contactName` 已填写 | 400，"请填写联系方式" |

**校验通过后执行：**

1. 保存联系人和项目信息到 task（`contactName`, `contactEmail`, `contactPhone`, `contactCompany`, `projectShortName`, `projectDescription`）
2. 生成 `progress_token`（用于结果页免登录访问）
3. 调用 `scheduler.enqueue(taskId)`（详见 §11）：
   - **有空闲槽位**：`status = 'running'`，异步启动 `engine.start(taskId)`
   - **无空闲槽位**：`status = 'queued'`，`phase = 'QUEUED'`，等待出队

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
  getSystemPrompt(): Promise<string>   // 从 system_prompts 表查询加载
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

### 2.3 System Prompt 管理

四个 Agent 的系统提示词存储在数据库中，支持运行时 CRUD，不再硬编码为本地文件。

#### 2.3.1 数据表设计

表结构定义见 [05-database-and-api-design.md](05-database-and-api-design.md) §2.2 `system_prompts` 表。生效规则：role 相同取 `isActive = true` 且 `version` 最大的那条。

#### 2.3.2 初始数据

系统初始化时从 `docs/prompts/` 目录的 4 个 markdown 文件导入：

| role | 来源文件 | 说明 |
|------|---------|------|
| `dpa` | `docs/prompts/02-dpa.md` | 文档解析智能体系统提示词 |
| `bca` | `docs/prompts/03-bca.md` | 业务审查智能体系统提示词 |
| `fca` | `docs/prompts/04-fca.md` | 技术取证智能体系统提示词 |
| `ora` | `docs/prompts/01-ora.md` | 审查编排智能体系统提示词 |

> **导入方式：** 部署时执行一次 `pnpm db:seed`，将 `docs/prompts/*.md` 读入 `system_prompts` 表。后续修改通过管理接口操作，不再依赖本地文件。

#### 2.3.3 运行时加载流程

```typescript
async function getSystemPrompt(role: string): Promise<string> {
  // 1. 查缓存（LRU，TTL 5 分钟）
  const cached = promptCache.get(role)
  if (cached) return cached

  // 2. 查数据库（取 is_active = true 且 version 最大的那条）
  const row = await db
    .select()
    .from(systemPrompts)
    .where(eq(systemPrompts.role, role))
    .where(eq(systemPrompts.isActive, true))
    .orderBy(desc(systemPrompts.version))
    .limit(1)

  const content = row[0]?.content ?? ''

  // 3. 写入缓存
  promptCache.set(role, content, 300_000) // 5min
  return content
}
```

**缓存失效：**
- TTL 过期自动失效
- 管理端更新/删除 prompt 后主动 `promptCache.del(role)`
- 服务重启时缓存清空，首次调用自动从 DB 重建

#### 2.3.4 CRUD 管理接口

由后端 `system-prompts` 模块提供（参见 `04-api-specification.md`）：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/system-prompts` | 列出所有 prompt（含版本信息，不含 content） |
| GET | `/system-prompts/:role` | 获取指定 role 的当前生效 prompt content |
| PUT | `/system-prompts/:role` | 更新 prompt（自动递增 version，旧版保留） |
| POST | `/system-prompts/:role/rollback` | 回滚到指定 version |

**更新约束：**
- 每次 PUT 创建新版本，旧版本保留为 `is_active = false`（保留历史，可回滚）
- 前端编辑时提供 Markdown 编辑器 + 实时预览
- 修改后 5 分钟内生效（受缓存 TTL 控制），也可手动触发缓存刷新

### 2.4 模型配置

模型从环境变量读取，优先级：`{ROLE}_MODEL` → `PIPELINE_MODEL` → `ANTHROPIC_MODEL`

---

## 3. Prompt 构建（context-builder.ts）

本章描述的是 **User Prompt 的组装逻辑**。完整的 LLM 调用由两部分组成：

| 部分 | 来源 | 说明 |
|------|------|------|
| System Prompt | `system_prompts` 表（见 2.3 节） | 智能体的身份、知识、方法论、规则 — 运行时从数据库加载 |
| User Prompt | `context-builder.ts`（本章） | 具体审查数据（招标文件文本、投标文件、文件索引等）— 每次调用时动态组装 |

**完整的 `messages` 数组结构：**

```typescript
const messages = [
  {
    role: 'system',
    content: await getSystemPrompt('dpa')   // 从 system_prompts 表加载
  },
  {
    role: 'user',
    content: buildPrompt('dpa_round1', {    // context-builder 组装
      tenderDoc: truncatedTenderDoc,
      fileIndex: fileIndexTable,
    })
  }
]
```

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

## 8. 数据流转与产物生命周期

### 8.1 产物类型与格式定义

每个流水线阶段产出一种结构化数据，存入 `task_artifacts` 表的 `content` 字段（Markdown 格式）：

| 产物 | artifactType | 生成阶段 | 内容结构 |
|------|-------------|---------|---------|
| 审查基准 | `review_baseline` | DPA R1 | 4 张表：★号条款 / 资格准入条件 / 评分标准 / 格式与封装要求 |
| 字段护照 | `extracted_fields` | DPA R2 | 8 张表：公司信息 / 资质证书 / 社保与纳税 / 审计报告 / 人员与授权 / 业绩合同 / 报价信息 / 项目名称一致性 |
| BCA 审查结果 | `bca_result` | BCA | 废标红线 6 项检查（逐项 PASS/FAIL/WARNING）+ 中标胜算 3 项评估 + 否决项/缺陷项汇总表 |
| FCA 审查结果 | `fca_result` | FCA | 隐蔽风险 2 项检查（暗标脱敏 7 子项 + 数据勾稽 4 子项）+ 电子文件安检 5 项检查 + 缺陷项汇总表 |
| 最终报告 | `review_report` | ORA | 7 章节（项目概况 → 废标红线 → 中标胜算 → 隐蔽风险 → 电子文件安检 → 整改建议 → 人工复核）+ 审查签署 + 附录 A-G |

**产物命名约定：** `{项目代号}-{artifactType}`，例如 `LZ270-review_baseline`

### 8.2 流水线内存模型

流水线运行时在内存中维护一个 `PipelineState` 对象，所有阶段共享同一实例：

```typescript
interface PipelineState {
  // 身份与状态
  taskId: string
  phase: ReviewPhase          // 当前阶段
  status: 'running' | 'completed' | 'failed'

  // 原始文档（从 DB 加载，贯穿全程）
  tenderDoc: string           // 招标文件全文
  bidDocs: Map<string, string> // { fileName → textContent }

  // 各阶段产出（Markdown 文本）
  reviewBaseline: string      // DPA R1 产出
  extractedFields: string     // DPA R2 产出
  bcaResult: string           // BCA 产出
  fcaResult: string           // FCA 产出
  reviewReport: string        // ORA 产出

  // 错误收集
  errors: PipelineError[]
}
```

**生命周期：**

1. `start()` 时从 DB 加载文档 → 初始化 state
2. 每个阶段读取 state 中的上游产出 → 构建 Prompt → 调用 LLM → 将结果写回 state
3. 每个阶段成功后立即持久化到 DB
4. 流水线结束时 state 被释放

### 8.3 阶段间数据流转

#### 整体流程

```
POST /tasks/:id/start
    │
    ▼
scheduler.enqueue(taskId)           ← TaskScheduler 判断是否有空闲槽位
    │
    ├─ 有空闲 → status = 'running'，立即进入 pipeline
    │
    └─ 无空闲 → status = 'queued', phase = 'QUEUED'
                  广播 WS: phase_changed { to: 'QUEUED' }, queue_position { position: N }
                  │
                  ▼ (scheduler.onTaskFinished → dequeueNext → 当前任务出队)
                status = 'running'
                  │
                  ▼
extractTexts(taskId)                ← 并发提取所有文件文本（Promise.allSettled + pdf-parse / mammoth）
    │ 逐文件流程：parseStatus → 'parsing' → 提取文本 → 更新 textContent/charCount
    │   成功：parseStatus → 'completed'，广播 WS document_parsed { docId, status: 'completed', charCount }
    │   失败：parseStatus → 'failed'，textContent = null，广播 WS document_parsed { docId, status: 'failed', error }
    │ 单文件失败不阻塞其他文件，tender 文件提取后回填 projects.name / projects.code
    │
    │ ⚠ TODO: 当前仅提取文字层，不支持扫描件/图片 OCR。若文档含扫描图片（资质证书、营业执照等），
    │ 文字内容会丢失。后续需引入 OCR（如 Tesseract.js 或外部 OCR 服务）作为兜底。
    ▼
loadDocuments(taskId)              ← DB: review_documents 表（此时 textContent 已填充）
    │ tenderDoc, bidDocs 写入 state
    │ 若 tender 文件解析失败 → 流水线终止，广播 failed
    ▼
setPhase(DPA_ROUND1)               → WS: phase_changed { from: DOC_UPLOADING, to: DPA_ROUND1 }
    │
    ▼
┌──────────────────────────────────────────────────────────────────┐
│ DPA Round 1：审查基准提取                                         │
│                                                                  │
│ 读取：state.tenderDoc                                            │
│ 加载：system prompt（DB → 缓存 → getSystemPrompt('dpa')）          │
│ 构建 User Prompt：招标文件全文(45K截断)                              │
│                  + context-builder.ts 按模板组装                      │
│ 调用 LLM：messages = [system, user]                                │
│ 校验：格式校验(4表关键词) → 不通过则追加修正 prompt 重试(最多3次)    │
│ 产出：state.reviewBaseline = llmOutput                           │
│ 持久化：saveArtifact(taskId, 'review_baseline', 'DPA_ROUND1')    │
│ 广播：WS artifact_ready { artifactType: 'review_baseline' }      │
└──────────────────────────────────────────────────────────────────┘
    │
    ▼
setPhase(DPA_ROUND2)               → WS: phase_changed { to: DPA_ROUND2 }
    │
    ▼
┌──────────────────────────────────────────────────────────────────┐
│ DPA Round 2：字段护照提取                                         │
│                                                                  │
│ 读取：state.bidDocs + state.reviewBaseline                       │
│ 加载：system prompt（DB → 缓存 → getSystemPrompt('dpa')）          │
│ 构建 User Prompt：投标文件(优先15K/其他4K截断) + 审查基准(10K截断)    │
│                  + 文件索引表 + context-builder 组装               │
│ 调用 LLM：messages = [system, user]                                │
│ 校验：格式校验(至少3类字段表) → 不通过则重试                        │
│ 产出：state.extractedFields = llmOutput                          │
│ 持久化：saveArtifact(taskId, 'extracted_fields', 'DPA_ROUND2')   │
│ 广播：WS artifact_ready { artifactType: 'extracted_fields' }     │
└──────────────────────────────────────────────────────────────────┘
    │
    ▼
setPhase(BCA_FCA_RUNNING)          → WS: phase_changed { to: BCA_FCA_RUNNING }
    │
    ├──────────────────────────┐
    ▼                          ▼
┌─────────────────────┐  ┌─────────────────────┐
│ BCA：废标红线+中标胜算 │  │ FCA：隐蔽风险+文件安检│  ← 并行执行
│                     │  │                     │
│ 读取：              │  │ 读取：              │
│  · reviewBaseline   │  │  · bidDocs合并文本   │
│    (12K截断)        │  │    (15K截断)        │
│  · extractedFields  │  │  · extractedFields  │
│    (12K截断)        │  │    (8K截断)         │
│  · 文件索引表       │  │  · 文件索引表       │
│ 加载：              │  │ 加载：              │
│  system prompt      │  │  system prompt      │
│  (DB → 'bca')       │  │  (DB → 'fca')       │
│                     │  │                     │
│ 校验：判定存在性     │  │ 校验：判定存在性     │
│   + 检查项数量       │  │   + 文件命名关键词   │
│                     │  │                     │
│ 产出：              │  │ 产出：              │
│  state.bcaResult    │  │  state.fcaResult    │
│                     │  │                     │
│ 持久化：             │  │ 持久化：             │
│  saveArtifact(      │  │  saveArtifact(      │
│   'bca_result')     │  │   'fca_result')     │
│                     │  │                     │
│ 广播：              │  │ 广播：              │
│  artifact_ready     │  │  artifact_ready     │
│  { bca_result }     │  │  { fca_result }     │
└─────────────────────┘  └─────────────────────┘
    │                          │
    └──────────┬───────────────┘
               │ Promise.allSettled 容错
               ▼
setPhase(REPORT_COMPILING)         → WS: phase_changed { to: REPORT_COMPILING }
    │
    ▼
┌──────────────────────────────────────────────────────────────────┐
│ ORA：报告编译                                                     │
│                                                                  │
│ 读取：state.tenderDoc(4K摘要) + state.reviewBaseline(6K截断)      │
│       + state.bcaResult(12K截断) + state.fcaResult(12K截断)      │
│ 加载：system prompt（DB → 缓存 → getSystemPrompt('ora')）          │
│ 构建 User Prompt：四部分拼接 + context-builder 组装                  │
│ 调用 LLM：messages = [system, user]                                │
│ 校验：报告质量校验(7章节结构 + 附录A-G + 表格 + AI痕迹 + 投标建议)  │
│   → 质量不通过则追加修正要求重试(最多3次)                            │
│ 产出：state.reviewReport = llmOutput                             │
│ 持久化：saveArtifact(taskId, 'review_report', 'REPORT_COMPILING') │
│         metadata: { qualityScore, isPass, issues }               │
│ 广播：WS artifact_ready { artifactType: 'review_report' }        │
└──────────────────────────────────────────────────────────────────┘
    │
    ▼
setPhase(COMPLETED)                → WS: completed { qualityScore }
    │ 更新 task.status = 'completed'
    ▼
  流水线结束，PipelineState 释放
```

#### 每阶段数据流总结

| 阶段 | 读取 state 字段 | Prompt 输入 | 产出字段 | 持久化 artifactType |
|------|----------------|------------|---------|-------------------|
| DPA R1 | `tenderDoc` | 招标文件(45K) | `reviewBaseline` | `review_baseline` |
| DPA R2 | `bidDocs` + `reviewBaseline` | 投标文件(15K/4K) + 基准(10K) + 文件索引 | `extractedFields` | `extracted_fields` |
| BCA | `reviewBaseline` + `extractedFields` | 基准(12K) + 字段(12K) + 文件索引 | `bcaResult` | `bca_result` |
| FCA | `bidDocs` + `extractedFields` | 投标文件(15K) + 字段(8K) + 文件索引 | `fcaResult` | `fca_result` |
| ORA | `tenderDoc` + `reviewBaseline` + `bcaResult` + `fcaResult` | 招标摘要(4K) + 基准(6K) + BCA(12K) + FCA(12K) | `reviewReport` | `review_report` |

### 8.4 数据库持久化策略

#### task_artifacts 表使用规则

```
task_artifacts
├── taskId          ← 关联 tasks 表
├── name            ← 产物显示名（如 "审查基准表"）
├── artifactType    ← 类型标识（review_baseline / extracted_fields / bca_result / fca_result / review_report）
├── phase           ← 生成时的阶段名
├── version         ← 版本号（同类型递增）
├── content         ← Markdown 正文
├── metadata        ← JSON 扩展信息
└── createdAt       ← 创建时间
```

**持久化时机：** 每个阶段 LLM 输出通过校验后，**立即写入** `task_artifacts`。不等到流水线结束。

**版本策略：** 同一 taskId + artifactType 的记录，version 从 1 递增。重试产生的新版本保留，旧版本不删除（便于调试和对比）。

```typescript
async function saveArtifact(
  taskId: string,
  artifactType: string,
  phase: string,
  content: string,
  metadata?: Record<string, unknown>
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
    metadata: metadata ?? null,
  })
}
```

**ARTIFACT_NAMES 映射：**

```typescript
const ARTIFACT_NAMES: Record<string, string> = {
  review_baseline: '审查基准表',
  extracted_fields: '字段护照',
  bca_result: '废标红线与中标胜算审查',
  fca_result: '隐蔽风险与电子文件安检',
  review_report: '标书合规检验报告',
}
```

**metadata 字段用途：**

| artifactType | metadata 内容 |
|-------------|--------------|
| `review_baseline` | `{ charCount, tableCount, formatValid: boolean }` |
| `extracted_fields` | `{ charCount, tableCount, formatValid: boolean }` |
| `bca_result` | `{ passCount, failCount, warningCount, rejectionItemCount }` |
| `fca_result` | `{ passCount, failCount, warningCount, defectItemCount }` |
| `review_report` | `{ qualityScore, isPass, issues: string[], charCount, aiTraceCount }` |

#### llm_call_logs 记录

每次 LLM 调用（含重试）都记录一条日志：

```typescript
interface LlmCallLog {
  taskId: string
  agentRole: 'dpa' | 'bca' | 'fca' | 'ora'
  model: string
  inputTokens: number
  outputTokens: number
  latencyMs: number
  error: string | null      // 失败时记录错误信息
}
```

### 8.5 WebSocket 事件设计

前端通过 `GET /api/v1/reviewer/ws/tasks/:id` 建立 WebSocket 连接，接收实时事件。

#### 事件类型与 Payload

```typescript
type ReviewerEvent =
  | PhaseChangedEvent
  | QueuePositionEvent
  | DocumentParsedEvent
  | ArtifactReadyEvent
  | AgentCallStartedEvent
  | AgentCallCompletedEvent
  | CompletedEvent
  | FailedEvent

interface PhaseChangedEvent {
  type: 'phase_changed'
  from: string    // 旧阶段
  to: string      // 新阶段
}

interface QueuePositionEvent {
  type: 'queue_position'
  position: number  // 当前排队位置（1-based，0 表示即将执行）
}

interface DocumentParsedEvent {
  type: 'document_parsed'
  docId: string           // review_documents 表的 id
  fileName: string        // 文件名
  status: 'completed' | 'failed'
  charCount: number | null
  error?: string          // 失败时的错误信息
}

interface ArtifactReadyEvent {
  type: 'artifact_ready'
  artifactType: string   // review_baseline / extracted_fields / bca_result / fca_result / review_report
}

interface AgentCallStartedEvent {
  type: 'agent_call_started'
  agentRole: string      // dpa / bca / fca / ora
  attempt: number        // 第几次尝试（1-based）
}

interface AgentCallCompletedEvent {
  type: 'agent_call_completed'
  agentRole: string
  latencyMs: number
  tokens: { input: number, output: number }
}

interface CompletedEvent {
  type: 'completed'
  qualityScore: number   // 报告质量评分 0-100
}

interface FailedEvent {
  type: 'failed'
  phase: string          // 失败发生在哪个阶段
  error: string          // 错误信息
}
```

#### 事件触发时机

```typescript
function broadcast(taskId: string, event: ReviewerEvent): void {
  wsManager.broadcast(taskId, event)
}

// 触发点：
// 1. setPhase() 内部 → phase_changed
// 2. extractTexts() 逐文件 → document_parsed
// 3. callLlm() 调用前 → agent_call_started
// 4. callLlm() 返回后 → agent_call_completed
// 5. 流水线成功结束 → completed
// 6. 流水线异常 → failed
// 7. scheduler 排队 → queue_position
// 8. saveArtifact() 内部 → artifact_ready
```

#### 前端消费示例

**WS 驱动 PipelineMonitor 进度展示 + 产物内容实时刷新。不自动切换 Tab。**

```typescript
// 前端 WebSocket 处理
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)

  switch (data.type) {
    case 'phase_changed':
      updatePipelineSteps(data.to)        // PipelineMonitor 步骤高亮
      break

    case 'queue_position':
      updateQueuePosition(data.position)  // 排队位置更新
      break

    case 'document_parsed':
      updateFileStatus(data.docId, data.status, data.charCount) // 文件解析状态
      break

    case 'artifact_ready':
      // 标记对应 Tab 有新内容
      markTabHasContent(data.artifactType)
      // 如果用户正好在查看这个 Tab，立即刷新内容
      if (currentActiveTab === data.artifactType) {
        fetchAndRenderArtifact(data.artifactType)
      }
      break

    case 'agent_call_started':
      showAgentLoading(data.agentRole, data.attempt)  // 当前 Agent 调用指示
      break

    case 'agent_call_completed':
      hideAgentLoading(data.agentRole)
      break

    case 'completed':
      showCompletionNotice(data.qualityScore)
      break

    case 'failed':
      showError(data.phase, data.error)
      break
  }
}

// WS 断线重连策略
ws.onreconnect = async () => {
  const task = await api.GET('/tasks/{id}', { params: { id: taskId } })
  syncPipelineMonitor(task.status, task.phase)  // 用最新状态刷新 PipelineMonitor
}
```

#### 产物 Tab 按需加载

用户点击产物 Tab 时，前端调用 GET 接口获取内容：

```typescript
async function onTabClick(artifactType: string) {
  const res = await api.GET('/tasks/{id}/artifacts/{type}', {
    params: { id: taskId, type: artifactType }
  })
  if (res.data) {
    renderMarkdown(res.data.content)
  } else {
    showEmpty('暂无数据，流水线可能尚未生成此产物')
  }
}
```

### 8.6 前端数据获取

#### 初始化流程

```
前端打开结果页 → GET /tasks/:id (获取 task 状态 + 文档列表)
             → 建立 WebSocket 连接
             → PipelineMonitor 根据 task.phase 显示当前步骤
```

#### 产物查看流程

```
用户点击产物 Tab → GET /tasks/:id/artifacts/:type
                 → 有内容 → MarkdownRenderer 渲染
                 → 无内容 → 显示"暂无数据"
```

> 产物 Tab 始终可点击（不依赖 WS 事件激活），内容由用户主动查看时按需加载。

#### PipelineMonitor 步骤映射

| 步骤 | 对应 phase | 激活时机 |
|------|-----------|---------|
| 1. 文档上传 | DOC_UPLOADING | 页面加载时（如果 status=created） |
| 2. 基准提取 | DPA_ROUND1 → DPA_ROUND2 | `phase_changed { to: DPA_ROUND1 }` |
| 3. 四维度审查 | BCA_FCA_RUNNING | `phase_changed { to: BCA_FCA_RUNNING }` |
| 4. 报告生成 | REPORT_COMPILING → COMPLETED | `phase_changed { to: REPORT_COMPILING }` |

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

#### 9.2.1 执行逻辑

BCA 和 FCA 通过 `Promise.allSettled` 并行执行，任一失败不阻塞另一个。两个都失败则流水线整体标记 failed。

```typescript
const [bcaResult, fcaResult] = await Promise.allSettled([
  runPhase(taskId, 'bca', bcaPrompt),
  runPhase(taskId, 'fca', fcaPrompt),
])

const bcaText = bcaResult.status === 'fulfilled'
  ? bcaResult.value
  : buildDegradedInput('bca', bcaResult.reason)

const fcaText = fcaResult.status === 'fulfilled'
  ? fcaResult.value
  : buildDegradedInput('fca', fcaResult.reason)

// 即使部分失败也保存结果
await saveArtifact(taskId, 'bca_result', 'BCA_FCA_RUNNING', bcaText)
await saveArtifact(taskId, 'fca_result', 'BCA_FCA_RUNNING', fcaText)
```

#### 9.2.2 失败降级文本（buildDegradedInput）

当 BCA 或 FCA 执行失败时，不能把原始错误信息直接喂给 ORA（如 `"BCA 审查异常: TimeoutError"`），ORA 无法理解这是何种失败、该如何处理。需要生成结构化的降级文本，让 ORA 按指令手册的规则生成对应章节。

```typescript
function buildDegradedInput(
  agentRole: 'bca' | 'fca',
  error: unknown
): string {
  const label = agentRole === 'bca'
    ? '废标红线与中标胜算审查'
    : '隐蔽风险与电子文件安检'

  const sections = agentRole === 'bca'
    ? [
        '第二部分 废标红线审查：全部检查项标注 [Human_Required]',
        '第三部分 中标胜算评估：全部评估项标注 [Human_Required]',
        '否决项清单：无法判定，标注 [Human_Required]',
      ]
    : [
        '第四部分 隐蔽风险探测：全部检查项标注 [Human_Required]',
        '第五部分 电子文件安检：全部检查项标注 [Human_Required]',
        '缺陷项汇总：无法判定，标注 [Human_Required]',
      ]

  const reason = error instanceof Error ? error.message : String(error)

  return [
    `⚠ ${label}执行异常，数据不可用。`,
    '',
    `失败原因：${reason}`,
    '',
    '以下章节全部标注 [Human_Required]，列入第七部分人工复核清单：',
    ...sections.map(s => `- ${s}`),
    '',
    '请按正常流程编译报告，在对应章节中使用上述标注替代审查数据。',
    '报告其余章节（有数据的部分）正常生成。',
  ].join('\n')
}
```

**降级文本示例（BCA 失败）：**

```
⚠ 废标红线与中标胜算审查执行异常，数据不可用。

失败原因：LLM 调用重试耗尽（3 phase × 3 call 全部超时）

以下章节全部标注 [Human_Required]，列入第七部分人工复核清单：
- 第二部分 废标红线审查：全部检查项标注 [Human_Required]
- 第三部分 中标胜算评估：全部评估项标注 [Human_Required]
- 否决项清单：无法判定，标注 [Human_Required]

请按正常流程编译报告，在对应章节中使用上述标注替代审查数据。
报告其余章节（有数据的部分）正常生成。
```

#### 9.2.3 与 ORA 的配合

ORA 收到降级文本后，按指令手册的规则处理：

| 情况 | ORA 行为 |
|------|---------|
| BCA 成功 + FCA 成功 | 正常编译完整报告 |
| BCA 失败 + FCA 成功 | 第二/三/否决项章节用 `[Human_Required]` 替代，第四/五章节正常生成 |
| BCA 成功 + FCA 失败 | 第二/三/否决项章节正常生成，第四/五/缺陷项章节用 `[Human_Required]` 替代 |
| BCA 失败 + FCA 失败 | 流水线整体标记 failed，不进入 ORA |

产物仍会保存（含降级文本），方便调试和事后排查失败原因。metadata 中记录降级状态：

```typescript
// 失败时的 artifact metadata
{
  degraded: true,
  error: 'LLM 调用重试耗尽（3 phase × 3 call 全部超时）',
  passCount: 0,
  failCount: 0,
  warningCount: 0,
  rejectionItemCount: 0
}
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
| `docs/prompts/01-ora.md` | 系统提示词（ORA） | 从指令手册完整摘取，运行时加载 |
| `docs/prompts/02-dpa.md` | 系统提示词（DPA） | 从指令手册完整摘取，运行时加载 |
| `docs/prompts/03-bca.md` | 系统提示词（BCA） | 从指令手册完整摘取，运行时加载 |
| `docs/prompts/04-fca.md` | 系统提示词（FCA） | 从指令手册完整摘取，运行时加载 |
| `config/pipeline.toml` | 环境变量 + 硬编码默认值 | 配置项合并到代码常量 |

---

## 11. TaskScheduler 与并发控制

### 11.1 设计目标

- 限制同时执行的流水线数量，防止 LLM API 限流
- 多用户同时提交时公平排队（FIFO）
- 服务重启后队列不丢失

### 11.2 架构

TaskScheduler 是进程级单例，在服务启动时初始化：

```typescript
class TaskScheduler {
  private maxConcurrent: number            // 环境变量 MAX_CONCURRENT_TASKS，默认 2
  private activeTaskIds: Set<string>       // 当前运行中的任务 ID 集合

  // 入队（POST /start 调用）
  async enqueue(taskId: string): Promise<EnqueueResult>

  // 任务完成/失败时调用
  async onTaskFinished(taskId: string): Promise<void>

  // 服务启动时恢复队列
  async recover(): Promise<void>

  // 内部：尝试出队下一个任务
  private async dequeueNext(): Promise<void>
}
```

**EnqueueResult：**

```typescript
interface EnqueueResult {
  started: boolean       // true = 直接开始执行，false = 排队等待
  queuePosition?: number // 排队位置（仅 started=false 时返回，1-based）
}
```

### 11.3 幂等保护（防止重复启动）

`POST /tasks/:id/start` 通过数据库条件更新保证幂等：

```sql
UPDATE tasks SET status = 'queued'
WHERE id = $1 AND status = 'created'
```

- 影响行数 = 1 → 首次启动，继续走 enqueue 流程
- 影响行数 = 0 → 任务已启动过（queued / running / completed / failed），返回对应的提示

覆盖场景：用户重复点击、前端网络重试、并发请求。

### 11.4 排队流程

```
POST /tasks/:id/start → 校验通过 → 幂等检查通过 → scheduler.enqueue(taskId)
    │
    ├─ activeTaskIds.size < maxConcurrent
    │     │
    │     ├─ task.status = 'running'
    │     ├─ activeTaskIds.add(taskId)
    │     ├─ engine.start(taskId)（异步，不 await）
    │     └─ 返回 { started: true }
    │
    └─ activeTaskIds.size >= maxConcurrent
          │
          ├─ task.status = 'queued', task.phase = 'QUEUED'
          ├─ 广播 WS: phase_changed { from: 'DOC_UPLOADING', to: 'QUEUED' }
          ├─ 计算 queuePosition（DB 查询 createdAt 排名）
          ├─ 广播 WS: queue_position { position }
          └─ 返回 { started: false, queuePosition }
```

### 11.5 出队流程

```
Pipeline 完成/失败
    │
    ▼
scheduler.onTaskFinished(taskId)
    │
    ├─ activeTaskIds.delete(taskId)
    │
    ├─ dequeueNext()
    │     │
    │     ├─ 查询下一个排队任务：
    │     │   SELECT id FROM tasks
    │     │   WHERE status = 'queued'
    │     │   ORDER BY createdAt ASC
    │     │   LIMIT 1
    │     │
    │     ├─ 找到 → task.status = 'running'
    │     │         activeTaskIds.add(task.id)
    │     │         广播 WS: phase_changed { from: 'QUEUED', to: 'DPA_ROUND1' }
    │     │         engine.start(task.id)（异步）
    │     │
    │     └─ 未找到 → 队列为空，无操作
    │
    └─ 广播 WS: queue_position 给剩余排队任务（位置前移）
```

### 11.6 排队位置推送

当出队触发后，所有排队任务的位置需要更新：

```typescript
// 在 dequeueNext() 内部
const queuedTasks = await db
  .select({ id: tasks.id })
  .from(tasks)
  .where(eq(tasks.status, 'queued'))
  .orderBy(asc(tasks.createdAt))

for (let i = 0; i < queuedTasks.length; i++) {
  broadcast(queuedTasks[i].id, {
    type: 'queue_position',
    position: i + 1
  })
}
```

### 11.7 启动恢复

服务启动时，`TaskScheduler.recover()` 执行：

```
1. 查询 status = 'running' 的任务：
   - 内存中的 PipelineState 已丢失，无法恢复运行进度
   - 策略：标记为 failed（phase 记录崩溃前的阶段）
   - 可选优化：检查 task_artifacts 是否有完整产物链，如有则标记 completed（见 §12 崩溃恢复）

2. 查询 status = 'queued' 的任务：
   - 按 createdAt 排序，依次尝试出队执行
   - 恢复 activeTaskIds 计数

3. 初始化完成，scheduler 进入正常工作状态
```

### 11.8 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `MAX_CONCURRENT_TASKS` | 2 | 最大同时运行的任务数 |

> 该值取决于 LLM API 的 RPM/TPM 限制。每个任务峰值并发 2 个 LLM 调用（BCA+FCA 阶段），因此 `MAX_CONCURRENT_TASKS = N` 意味着最坏情况下同时 `2N` 个 LLM 请求。设置时需确保 `2N ≤ API 并发上限`。

### 11.9 前端交互

**排队状态展示：**

| 阶段 | PipelineMonitor 显示 | 说明 |
|------|---------------------|------|
| QUEUED | 全步骤灰色 + 顶部提示"排队等待中（前方 N 个任务）" | 阶段未开始 |
| DPA_ROUND1 | 步骤 2 高亮，正常进度 | 排队结束，流水线启动 |

**事件消费：**

```typescript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)

  switch (data.type) {
    case 'phase_changed':
      if (data.to === 'QUEUED') {
        showQueueWaiting()  // 显示排队提示
      } else {
        updatePipelineSteps(data.to)  // 正常阶段切换
      }
      break

    case 'queue_position':
      updateQueuePosition(data.position)  // 更新"前方 N 个任务"
      break
  }
}
```

---

## 12. 状态机健壮性与崩溃恢复

### 12.1 需要应对的异常场景

| # | 场景 | 后果 |
|---|------|------|
| 1 | 服务器崩溃/进程被杀 | task 永久卡在 running |
| 2 | 崩溃在 LLM 返回成功到 saveArtifact 完成之间 | LLM 结果丢失（token 白费） |
| 3 | 崩溃在 saveArtifact 完成到 setPhase 完成之间 | 产物已存但 phase 没更新 |
| 4 | WS 断连后重连 | 客户端漏掉中间事件 |
| 5 | 任务卡死（未捕获异常/死锁） | task.status 永远是 running |

### 12.2 崩溃恢复（覆盖 #1-#3）

**策略：服务重启时，所有 status = 'running' 的任务直接标记为 failed。**

```typescript
async function recoverCrashedTasks(): Promise<void> {
  const crashed = await db
    .update(tasks)
    .set({ status: 'failed' })
    .where(eq(tasks.status, 'running'))
    .returning({ id: tasks.id, phase: tasks.phase })

  for (const task of crashed) {
    broadcast(task.id, {
      type: 'failed',
      phase: task.phase,
      error: '服务重启，任务异常终止'
    })
  }
}
```

**为什么不从 artifact 检查点恢复？**

| 考虑因素 | 结论 |
|---------|------|
| 恢复逻辑复杂度 | 需要实现 engine.resume(phase)，逐阶段重建 state，大幅增加引擎复杂度 |
| 崩溃频率 | 服务崩溃是低频事件（部署/硬件故障），不值得为此引入检查点机制 |
| 产物不丢失 | 已保存的 artifact 仍在 DB 中，用户和管理员可随时查看已生成的中间产物 |
| Token 浪费 | #2 场景（LLM 结果未持久化）概率极低（窗口在毫秒级），接受损失 |

### 12.3 WS 断连重连（覆盖 #4）

**策略：前端重连后主动拉取最新状态，不依赖服务端缓存事件。**

```
WS 断连 → 自动重连 → 前端调用 GET /tasks/:id
                      → 用返回的 status + phase 刷新 PipelineMonitor
                      → 恢复 WS 监听
```

服务端无需特殊处理，WS 连接是幂等的。

### 12.4 僵尸任务检测（覆盖 #5）

**策略：后台看门狗定时扫描超时的 running 任务。**

```typescript
// 看门狗：每 60 秒执行一次
setInterval(async () => {
  const timeout = new Date(Date.now() - TASK_TIMEOUT_MINUTES * 60 * 1000)

  const zombies = await db
    .update(tasks)
    .set({ status: 'failed' })
    .where(and(
      eq(tasks.status, 'running'),
      lt(tasks.updatedAt, timeout)
    ))
    .returning({ id: tasks.id, phase: tasks.phase })

  for (const task of zombies) {
    broadcast(task.id, {
      type: 'failed',
      phase: task.phase,
      error: `任务超时（超过 ${TASK_TIMEOUT_MINUTES} 分钟无进展）`
    })
    scheduler.onTaskFinished(task.id)  // 释放槽位，出队下一个
  }
}, 60_000)
```

**超时阈值：**

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `TASK_TIMEOUT_MINUTES` | 120 | 任务最大运行时长，超时视为卡死 |

> 正常流水线 5-15 分钟跑完，但含大量重试或 LLM API 响应慢时可能需要 30-60 分钟。2 小时阈值覆盖极端情况，超过则说明遇到了 API 长时间不可用或服务内部死锁。

### 12.5 完整的状态流转

```
created ──→ queued ──→ running ──→ completed
  │           │          │
  │           │          ├─→ failed（流水线异常）
  │           │          ├─→ failed（服务崩溃，重启恢复时标记）
  │           │          └─→ failed（看门狗超时）
  │           │
  │           └─（重启恢复时，queued 任务重新入队）
  │
  └─→ created（用户未启动就离开，不转换）
```

### 12.6 启动恢复完整流程

服务启动时，按顺序执行：

```
1. recoverCrashedTasks()     ← running → failed
2. scheduler.recover()       ← queued 任务重新入队 + 尝试出队执行
3. startWatchdog()           ← 启动看门狗定时扫描
```

**scheduler.recover() 细节（补充 §11.6）：**

```
1. 查询 status = 'queued' 的任务，按 createdAt 排序
2. 计算当前可用槽位：maxConcurrent - running 任务数（此时 running 已被步骤1清零）
3. 依次出队前 N 个任务启动
4. 剩余任务保持 queued 状态等待
```

---

## 13. LLM 调用层容错

### 13.1 两层重试架构

```
Phase 层重试（§6，最多 3 次）
  └── 每次 attempt 调用 callLlm()
      └── LLM 调用层重试（§13，最多 3 次）
           └── 单次 HTTP 请求 → LLM API
```

- **LLM 调用层**：处理 API 本身的故障（429、5xx、超时、网络错误）
- **Phase 层**：处理业务逻辑问题（格式不对、质量不达标），用修正 prompt 重试

两层各管各的，最坏情况单个阶段 3 × 3 = 9 次 API 调用（极端场景，正常 1 次即成功）。

### 13.2 错误分类

| 错误类型 | 例子 | 是否重试 | 处理方式 |
|---------|------|---------|---------|
| 速率限制 | HTTP 429 | ✅ | 读 Retry-After，否则指数退避 |
| 服务端错误 | HTTP 500/502/503 | ✅ | 指数退避 |
| 调用超时 | 15 分钟内无响应 | ✅ | 指数退避 |
| 网络错误 | ECONNRESET / DNS 失败 | ✅ | 指数退避 |
| 认证错误 | HTTP 401/403 | ❌ | 直接抛出，不浪费 attempt |
| 请求错误 | HTTP 400 | ❌ | 直接抛出（说明 prompt 本身有问题） |

### 13.3 指数退避

```
delay = base × 2^attempt + random(0, base)
base = 2000ms

attempt 0 → ~2s
attempt 1 → ~4s
attempt 2 → ~8s
```

429 时优先使用 `Retry-After` header 的值，没有则走指数退避。加 jitter（随机偏移）避免多个任务同时重试造成"惊群"。

### 13.4 callLlm 实现

```typescript
async function callLlm(prompt: string, options: AgentOptions): Promise<string> {
  const maxRetries = getLLMMaxRetries()    // 默认 3
  const timeoutMs = getLLMCallTimeoutMs()  // 默认 900000 (15 分钟)

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(
        llmApiCall(prompt, options),
        timeoutMs
      )
    } catch (error) {
      // 不可重试的错误直接抛出
      if (!isRetryable(error) || attempt === maxRetries) {
        throw error
      }

      // 429 优先读 Retry-After，否则指数退避
      const delay = error.status === 429
        ? getRetryAfterMs(error) ?? backoff(attempt)
        : backoff(attempt)

      await sleep(delay)
    }
  }

  throw new Error('unreachable')
}
```

### 13.5 与 Phase 层的配合

```typescript
// pipeline/engine.ts 中的 runPhase 伪代码
async function runPhase(taskId, agentRole, prompt) {
  const maxAttempts = 3

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await callLlm(prompt, options)  // ← 调用层重试在这里
      const issues = validateReviewFormat(result, agentRole)

      if (issues.length === 0) return result          // 格式正确，完成

      if (attempt < maxAttempts - 1) {
        prompt = buildFormatFixPrompt(prompt, issues)  // 追加修正 prompt
      } else {
        return result                                   // 最后一次，兜底保留
      }
    } catch (error) {
      // callLlm 所有重试耗尽后抛出 → 当前 phase attempt 失败
      if (attempt === maxAttempts - 1) throw error
      // 否则继续下一次 phase attempt（同样的 prompt）
    }
  }
}
```

### 13.6 调用层对前端透明

LLM 调用层的重试对前端完全不可见。前端只看到：

- `agent_call_started { agentRole, attempt }` — phase 层的 attempt 编号
- `agent_call_completed { agentRole, latencyMs, tokens }` — 最终成功的那次调用

调用层内部的 429/5xx 重试不触发 WS 事件，不影响 PipelineMonitor 显示。

### 13.7 配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `LLM_CALL_TIMEOUT_MS` | 900000 | 单次 API 调用超时（毫秒），默认 15 分钟 |
| `LLM_MAX_RETRIES` | 3 | 调用层最大重试次数 |
| `LLM_RETRY_BASE_MS` | 2000 | 退避基数（毫秒） |

> 单阶段最坏情况：3 phase attempt × (1 + 3 call retry) = 12 次 API 调用 × 15 分钟 = 理论最大 180 分钟。
> 但实际不可能所有调用都超时，看门狗 120 分钟兜底会先触发。

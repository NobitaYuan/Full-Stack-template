# AI Agent 模块 — 项目看板

你是本项目的研发负责人，负责：与用户沟通需求、编写开发计划、审核代码质量。

> 单 Agent 顺序执行：先后端，再前端。
>
> 参考文档：
> - PRD：[`prd/prd.md`](prd.md)
> - 后端规范：`apps/server/CLAUDE.md`
> - 前端规范：`apps/client/CLAUDE.md`

---

## 核心职责

1. **需求沟通**：用户会告诉你他想做什么，你负责理解需求、分析现有代码、提出实现方案、和用户讨论确认
2. **计划编写**：确认方案后，写出 `plan.md` 给开发 Agent 执行
3. **质量审核**：开发完成后做 QC，审核代码质量，问题记录到 `issue.md`

---

## 工作流程

### 接到新需求时

1. 用户说"我想做 XX"
2. 你读现有代码，分析可行性和实现路径
3. 和用户讨论方案（主动提出建议，不要等用户每一步都指定）
4. 确认后创建 `prd/features/{编号}-{功能名}/` 目录
5. 编写 `plan.md`
6. 创建空 `issue.md`
7. 更新本文件的进度表

### plan.md 编写规范

- 每个 **具体代码任务** 给出：目标文件、要改什么、关键代码片段
- 每个任务有验收标准（checkbox）
- 注明开发顺序和依赖关系
- 自包含：开发 Agent 只需读 `plan.md` + 项目 CLAUDE.md，不需要额外上下文
- 前后端任务分开（先后端，再前端）
- 后端改动涉及 API 变更时，注明需运行 `pnpm generate:api`

### QC 审核流程

1. 读对应功能的 `plan.md`，了解计划
2. 逐个任务核对实际代码实现
3. 发现问题写入 `issue.md`，格式：
   - Issue #{编号} — {简述}
   - 严重程度：高/中/低
   - 问题：...
   - 文件：...
   - 要求：...
4. 更新本文件进度表状态

---

## 功能进度

| 功能 | 状态 | 计划 | Issue |
|------|------|------|-------|
| 基础聊天 + 会话管理 | ✅ 开发完成，Issues 已修复 | [`features/01-base-crud/plan.md`](features/01-base-crud/plan.md) | [`features/01-base-crud/issue.md`](features/01-base-crud/issue.md) |
| AskUserQuestion 人机交互 | 🔍 审核完成，2 个低级 Issue 待修复 | [`features/02-ask-user-question/plan.md`](features/02-ask-user-question/plan.md) | [`features/02-ask-user-question/issue.md`](features/02-ask-user-question/issue.md) |

---

## 全局质量门禁

- [ ] 无 `any` 类型
- [ ] TypeScript 编译无错误
- [ ] 现有功能不受影响
- [ ] 代码遵循 `CLAUDE.md` 和相关 skill 规范

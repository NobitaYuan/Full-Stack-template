# Issue Report — 02-ask-user-question

## 全局质量门禁

- [x] 无 `any` 类型（未发现 `any` 使用）
- [x] TypeScript 编译无错误（server / client 均通过）
- [x] 现有功能不受影响（会话管理、SSE 聊天等原有功能完整保留）
- [x] `pnpm generate:api` 已执行（`agent.d.ts` 已包含 Permission 相关类型）

---

## Issue #1 — PermissionResponseSchema 与 plan 不一致

- **严重程度：** 低
- **问题：** `PermissionResponseSchema` 中 `ok` 字段类型为 `z.boolean()`，plan 要求 `z.literal(true)`
- **文件：** `apps/server/src/modules/agent/agent.schema.ts:104`
- **要求：** 按 plan 改为 `ok: z.literal(true).describe('操作成功')`，使 schema 更精确

## Issue #2 — PermissionRequestSchema.updatedInput 与 plan 不一致

- **严重程度：** 低
- **问题：** `updatedInput` 字段类型为 `z.object({}).passthrough().optional()`，plan 要求 `z.record(z.unknown()).optional()`
- **文件：** `apps/server/src/modules/agent/agent.schema.ts:97`
- **要求：** 按 plan 改为 `z.record(z.unknown()).optional()`，语义更清晰

---

## 验收标准核对

| 验收项 | 状态 |
|--------|------|
| 用户说"帮我规划旅游" → 模型调用 AskUserQuestion → 前端显示选项 UI → 用户选择 → 模型继续 | ⬜ 待实测验证 |
| 用户说"删除用户张三" → 模型调用 AskUserQuestion 确认 → 用户确认/取消 → 模型执行或放弃 | ⬜ 待实测验证 |
| 用户说"查询所有用户" → 模型直接调用 MCP query_users（自动放行），不询问 | ⬜ 待实测验证 |
| TypeScript 编译无错误 | ✅ 通过 |
| 现有功能不受影响 | ✅ 通过 |

**注意：** 上述三个业务验收项需要运行时实测确认，当前仅完成代码层面审核。

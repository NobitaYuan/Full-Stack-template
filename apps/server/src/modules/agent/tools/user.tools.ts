/**
 * 用户相关 MCP 工具定义
 *
 * z 导入自 zod/v4 而非 @hono/zod-openapi，因为 Agent SDK tool() 内部
 * 使用 zod/v4 的 schema 解析，与 @hono/zod-openapi 内置的 Zod 3 不兼容。
 */
import { z } from 'zod/v4'
import { tool } from '@anthropic-ai/claude-agent-sdk'
import * as userService from '../../user/user.service.js'

function formatUser(user: { id: string; username: string; createdAt: string }) {
  return { id: user.id, username: user.username, createdAt: user.createdAt }
}

export const queryUsersTool = tool(
  'query_users',
  '查询用户列表。支持按用户名搜索和分页。返回用户 id、username、createdAt。',
  {
    keyword: z.string().optional().describe('搜索关键词（用户名模糊匹配）'),
    page: z.number().int().min(1).default(1).describe('页码'),
    pageSize: z.number().int().min(1).max(100).default(10).describe('每页数量'),
  },
  async (args) => {
    try {
      const result = await userService.listUsers(args.page, args.pageSize, args.keyword)
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `查询用户失败: ${String(err)}` }],
        isError: true,
      }
    }
  },
  { annotations: { readOnlyHint: true } },
)

export const createUserTool = tool(
  'create_user',
  '创建新用户。需要提供用户名和密码。',
  {
    username: z.string().min(2).max(50).describe('用户名'),
    password: z.string().min(6).describe('密码'),
  },
  async (args) => {
    try {
      const user = await userService.createUser(args.username, args.password)
      return {
        content: [{ type: 'text', text: JSON.stringify(user, null, 2) }],
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `创建用户失败: ${String(err)}` }],
        isError: true,
      }
    }
  },
)

export const updateUserTool = tool(
  'update_user',
  '更新用户信息。',
  {
    id: z.string().describe('用户 ID'),
    username: z.string().min(2).max(50).optional().describe('新用户名'),
  },
  async (args) => {
    try {
      const user = await userService.updateUser(args.id, { username: args.username })
      return {
        content: [{ type: 'text', text: JSON.stringify(user, null, 2) }],
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `更新用户失败: ${String(err)}` }],
        isError: true,
      }
    }
  },
)

export const deleteUserTool = tool(
  'delete_user',
  '删除用户。此操作不可撤销。',
  {
    id: z.string().describe('用户 ID'),
  },
  async (args) => {
    try {
      await userService.deleteUser(args.id)
      return {
        content: [{ type: 'text', text: `用户 ${args.id} 已删除` }],
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `删除用户失败: ${String(err)}` }],
        isError: true,
      }
    }
  },
  { annotations: { destructiveHint: true } },
)

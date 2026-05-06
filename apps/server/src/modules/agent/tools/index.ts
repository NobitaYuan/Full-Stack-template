import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { queryUsersTool, createUserTool, updateUserTool, deleteUserTool } from './user.tools.js'

export const mcpServer = createSdkMcpServer({
  name: 'business',
  version: '1.0.0',
  tools: [queryUsersTool, createUserTool, updateUserTool, deleteUserTool],
})

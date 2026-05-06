import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const aiSessions = sqliteTable('ai_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('新对话'),
  agentSessionId: text('agent_session_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
})

export const aiMessages = sqliteTable('ai_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  type: text('type').notNull(),
  subtype: text('subtype'),
  sessionIdSdk: text('session_id_sdk'),
  parentToolUseId: text('parent_tool_use_id'),
  raw: text('raw').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

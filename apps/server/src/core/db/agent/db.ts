import { pgTable, varchar, text, timestamp } from 'drizzle-orm/pg-core'

export const aiSessions = pgTable('ai_sessions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  title: text('title').notNull().default('新对话'),
  agentSessionId: varchar('agent_session_id'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
})

export const aiMessages = pgTable('ai_messages', {
  id: varchar('id', { length: 36 }).primaryKey(),
  sessionId: varchar('session_id', { length: 36 }).notNull(),
  type: text('type').notNull(),
  subtype: text('subtype'),
  sessionIdSdk: varchar('session_id_sdk'),
  parentToolUseId: varchar('parent_tool_use_id'),
  raw: text('raw').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .$defaultFn(() => new Date()),
})

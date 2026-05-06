import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: ['./src/core/db/user/index.ts', './src/core/db/agent/index.ts'],
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './data.db',
  },
})

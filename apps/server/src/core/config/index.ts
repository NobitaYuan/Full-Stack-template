import { z } from 'zod'
import 'dotenv/config'

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('postgresql://localhost:5432/server_template'),
  JWT_SECRET: z.string().min(1).default('dev-secret-change-in-production'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().int().min(1).default(60),
})

export type Config = z.infer<typeof envSchema>

let _config: Config | null = null

export function getConfig(): Config {
  if (_config) return _config
  const result = envSchema.safeParse(process.env)
  if (!result.success) {
    console.error('Invalid environment variables:', z.treeifyError(result.error))
    process.exit(1)
  }
  _config = result.data
  return _config
}

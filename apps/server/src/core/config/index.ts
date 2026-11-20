import { z } from 'zod'
import 'dotenv/config'

const developmentSecret = 'dev-secret-change-in-production'

const envSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().default('postgresql://localhost:5432/server_template'),
    JWT_SECRET: z
      .string()
      .refine((secret) => secret.trim().length > 0)
      .default(developmentSecret),
    JWT_EXPIRES_IN: z.string().default('7d'),
    ADMIN_USER_IDS: z
      .string()
      .default('')
      .transform(
        (ids) =>
          new Set(
            ids
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean),
          ),
      ),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((origins) => origins.split(',').map((origin) => origin.trim())),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
    RATE_LIMIT_WINDOW: z.coerce.number().int().min(1).default(60),
  })
  .superRefine((config, ctx) => {
    if (config.NODE_ENV !== 'production') return

    const secret = config.JWT_SECRET
    if (new TextEncoder().encode(secret.trim()).length < 32 || secret.trim() === 'your-secret-key-change-in-production') {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: '生产环境请设置至少 32 字节的 JWT_SECRET，避免使用示例值',
      })
    }
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

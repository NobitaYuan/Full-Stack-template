import { beforeAll, afterAll } from 'vitest'

beforeAll(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/server_template_test'
  process.env.JWT_SECRET = 'test-secret-key-for-testing'
  process.env.JWT_EXPIRES_IN = '7d'
  process.env.LOG_LEVEL = 'fatal'
  process.env.NODE_ENV = 'test'
  process.env.PORT = '0'
  process.env.CORS_ORIGINS = 'http://localhost:5173'
  process.env.RATE_LIMIT_MAX = '1000'
  process.env.RATE_LIMIT_WINDOW = '60'
})

afterAll(() => {
  // Cleanup handled per test file
})

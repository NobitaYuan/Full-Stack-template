import { beforeAll, afterAll } from 'vitest'

beforeAll(() => {
  process.env.DATABASE_URL = ':memory:'
  process.env.JWT_SECRET = 'test-secret-key-for-testing'
  process.env.JWT_EXPIRES_IN = '7d'
  process.env.LOG_LEVEL = 'fatal'
  process.env.NODE_ENV = 'test'
  process.env.PORT = '0'
})

afterAll(() => {
  // Cleanup handled per test file
})

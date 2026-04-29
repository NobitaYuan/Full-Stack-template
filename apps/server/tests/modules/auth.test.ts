import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { app } from '../../src/app.js'
import { initDb, getDb, closeDb } from '../../src/core/db/index.js'
import { sql } from 'drizzle-orm'

beforeAll(() => {
  initDb()
})

afterEach(() => {
  const db = getDb()
  db.run(sql`DELETE FROM users`)
})

describe('Auth', () => {
  const testUser = {
    username: 'testuser',
    password: '123456',
    confirmPassword: '123456',
  }

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.user.username).toBe(testUser.username)
      expect(json.data.accessToken).toBeDefined()
    })

    it('should reject duplicate username', async () => {
      await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      })

      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.code).toBe(409)
    })

    it('should reject mismatched passwords', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...testUser, confirmPassword: 'wrong' }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.code).toBe(422)
    })
  })

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      })

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: testUser.username,
          password: testUser.password,
        }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.accessToken).toBeDefined()
    })

    it('should reject wrong password', async () => {
      await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      })

      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: testUser.username,
          password: 'wrongpassword',
        }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.code).toBe(401)
    })
  })
})

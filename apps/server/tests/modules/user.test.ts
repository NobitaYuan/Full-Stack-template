import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { app } from '../../src/app.js'
import { initDb, getDb } from '../../src/core/db/index.js'
import { sql } from 'drizzle-orm'

beforeAll(() => {
  initDb()
})

afterEach(() => {
  const db = getDb()
  db.run(sql`DELETE FROM users`)
})

async function registerAndGetToken() {
  const res = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'testuser',
      password: '123456',
      confirmPassword: '123456',
    }),
  })
  const json = await res.json()
  return {
    token: json.data.accessToken,
    userId: json.data.user.id,
  }
}

describe('Users', () => {
  describe('GET /api/v1/users', () => {
    it('should require authentication', async () => {
      const res = await app.request('/api/v1/users')
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.code).toBe(401)
    })

    it('should return user list', async () => {
      const { token } = await registerAndGetToken()

      const res = await app.request('/api/v1/users', {
        headers: { Authorization: `Bearer ${token}` },
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.items).toBeInstanceOf(Array)
      expect(json.data.total).toBeGreaterThan(0)
    })
  })

  describe('GET /api/v1/users/:id', () => {
    it('should return a user by id', async () => {
      const { token, userId } = await registerAndGetToken()

      const res = await app.request(`/api/v1/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.id).toBe(userId)
    })

    it('should return 404 for non-existent user', async () => {
      const { token } = await registerAndGetToken()

      const res = await app.request('/api/v1/users/non-existent-id', {
        headers: { Authorization: `Bearer ${token}` },
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.code).toBe(404)
    })
  })

  describe('PATCH /api/v1/users/:id', () => {
    it('should update a user', async () => {
      const { token, userId } = await registerAndGetToken()

      const res = await app.request(`/api/v1/users/${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'updated' }),
      })

      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.data.username).toBe('updated')
    })
  })

  describe('DELETE /api/v1/users/:id', () => {
    it('should delete a user', async () => {
      const { token, userId } = await registerAndGetToken()

      const res = await app.request(`/api/v1/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      expect(res.status).toBe(200)

      const getRes = await app.request(`/api/v1/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      expect(getRes.status).toBe(200)
      const getJson = await getRes.json()
      expect(getJson.code).toBe(404)
    })
  })
})

import bcrypt from 'bcryptjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'
import { getDb } from '../../src/core/db/index.js'
import { users } from '../../src/core/db/user/db.js'
import { AuthResponseSchema } from '../../src/modules/auth/auth.schema.js'

const password = 'example-password'
const adminId = 'admin-fixture'
const adminName = 'admin-fixture'

beforeAll(async () => {
  await getDb()
    .insert(users)
    .values({ id: adminId, username: adminName, passwordHash: await bcrypt.hash(password, 4) })
})

async function authenticate(path: 'register' | 'login', username: string) {
  const res = await app.request(`/api/v1/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, confirmPassword: password }),
  })

  expect(res.status).toBe(200)
  const result = await res.json()
  const { accessToken, user } = AuthResponseSchema.parse(result.data)
  return { user, authorization: `Bearer ${accessToken}` }
}

function registerUser() {
  return authenticate('register', `test-${crypto.randomUUID()}`)
}

function loginAdmin() {
  return authenticate('login', adminName)
}

describe('Users', () => {
  describe('GET /api/v1/users', () => {
    it('requires authentication', async () => {
      const res = await app.request('/api/v1/users')

      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ code: 401, data: null })
    })

    it('returns HTTP 403 to an ordinary user', async () => {
      const { authorization } = await registerUser()
      const res = await app.request('/api/v1/users', { headers: { Authorization: authorization } })

      expect(res.status).toBe(403)
      expect(await res.json()).toMatchObject({ code: 403, data: null })
    })

    it('returns a paginated list to an administrator', async () => {
      const { authorization, user } = await loginAdmin()
      expect(user.isAdmin).toBe(true)
      const res = await app.request('/api/v1/users', { headers: { Authorization: authorization } })

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        code: 200,
        data: {
          items: expect.arrayContaining([expect.objectContaining({ id: adminId, isAdmin: true })]),
        },
      })
    })
  })

  describe('GET /api/v1/users/:id', () => {
    it('shows an ordinary user their account', async () => {
      const { authorization, user } = await registerUser()
      const res = await app.request(`/api/v1/users/${user.id}`, { headers: { Authorization: authorization } })

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ code: 200, data: { id: user.id, isAdmin: false } })
    })

    it('returns HTTP 404 to an administrator when the user does not exist', async () => {
      const { authorization } = await loginAdmin()
      const res = await app.request('/api/v1/users/non-existent-id', { headers: { Authorization: authorization } })

      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ code: 404, data: null })
    })
  })

  it.each(['GET', 'PATCH', 'DELETE'])('returns HTTP 403 when an ordinary user uses %s on another account', async (method) => {
    const { authorization } = await registerUser()
    const request: RequestInit = { method, headers: { Authorization: authorization } }
    if (method === 'PATCH') {
      request.headers = { ...request.headers, 'Content-Type': 'application/json' }
      request.body = JSON.stringify({ username: 'updated' })
    }

    const res = await app.request(`/api/v1/users/${adminId}`, request)

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: 403, data: null })
  })

  describe('PATCH /api/v1/users/:id', () => {
    it('allows a user to update their own account', async () => {
      const { authorization, user } = await registerUser()
      const res = await app.request(`/api/v1/users/${user.id}`, {
        method: 'PATCH',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'updated' }),
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ code: 200, data: { id: user.id, username: 'updated' } })
    })

    it('allows an administrator to update another account', async () => {
      const { user } = await registerUser()
      const { authorization } = await loginAdmin()
      const res = await app.request(`/api/v1/users/${user.id}`, {
        method: 'PATCH',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'updated-by-admin' }),
      })

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ code: 200, data: { id: user.id, username: 'updated-by-admin' } })
    })

    it('returns HTTP 409 when the new username is taken', async () => {
      const { authorization, user } = await registerUser()
      const res = await app.request(`/api/v1/users/${user.id}`, {
        method: 'PATCH',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminName }),
      })

      expect(res.status).toBe(409)
      expect(await res.json()).toMatchObject({ code: 409, data: null })
    })
  })

  describe('DELETE /api/v1/users/:id', () => {
    it('revokes access through a deleted account', async () => {
      const { authorization, user } = await registerUser()
      const res = await app.request(`/api/v1/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: authorization },
      })
      expect(res.status).toBe(200)

      const getRes = await app.request(`/api/v1/users/${user.id}`, { headers: { Authorization: authorization } })
      expect(getRes.status).toBe(401)
      expect(await getRes.json()).toMatchObject({ code: 401, data: null })
    })
  })
})

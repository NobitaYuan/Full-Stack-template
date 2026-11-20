import { describe, expect, it } from 'vitest'
import { app } from '../../src/app.js'

function createUserInput() {
  return {
    username: `test-${crypto.randomUUID()}`,
    password: 'example-password',
    confirmPassword: 'example-password',
  }
}

function postAuth(path: 'register' | 'login', body: unknown) {
  return app.request(`/api/v1/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Auth', () => {
  describe('POST /api/v1/auth/register', () => {
    it('registers an ordinary user', async () => {
      const input = createUserInput()
      const res = await postAuth('register', input)

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        code: 200,
        data: {
          user: { username: input.username, isAdmin: false },
          accessToken: expect.any(String),
        },
      })
    })

    it('returns HTTP 409 when a concurrent registration claims the same username', async () => {
      const input = createUserInput()
      const responses = await Promise.all([postAuth('register', input), postAuth('register', input)])

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 409])
      const rejected = responses.find(({ status }) => status === 409)
      expect(await rejected?.json()).toMatchObject({ code: 409, data: null })
    })

    it('returns HTTP 422 for mismatched passwords with field details', async () => {
      const res = await postAuth('register', { ...createUserInput(), confirmPassword: 'wrong' })

      expect(res.status).toBe(422)
      expect(await res.json()).toMatchObject({
        code: 422,
        data: [{ path: 'confirmPassword', message: expect.any(String) }],
      })
    })

    it('returns HTTP 400 for malformed JSON', async () => {
      const res = await app.request('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      })

      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: 400, data: null })
    })
  })

  describe('POST /api/v1/auth/login', () => {
    it('logs in with valid credentials', async () => {
      const input = createUserInput()
      expect((await postAuth('register', input)).status).toBe(200)

      const res = await postAuth('login', { username: input.username, password: input.password })

      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ code: 200, data: { accessToken: expect.any(String) } })
    })

    it('returns HTTP 401 for the wrong password', async () => {
      const input = createUserInput()
      expect((await postAuth('register', input)).status).toBe(200)

      const res = await postAuth('login', { username: input.username, password: 'wrongpassword' })

      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ code: 401, data: null })
    })
  })
})

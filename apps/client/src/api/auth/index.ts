import { request } from '../request'

/** 注册 */
export function register(username: string, password: string, confirmPassword: string) {
  return request.POST('/api/v1/auth/register', {
    body: { username, password, confirmPassword },
  })
}

/** 登录 */
export function login(username: string, password: string) {
  return request.POST('/api/v1/auth/login', {
    body: { username, password },
  })
}

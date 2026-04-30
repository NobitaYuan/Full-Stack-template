import { request } from '../request'

/** 用户列表（分页） */
export function getUserList(params?: { page?: number; size?: number }) {
  return request.GET('/api/v1/users', { params: { query: params } })
}

/** 用户详情 */
export function getUser(id: string) {
  return request.GET('/api/v1/users/{id}', { params: { path: { id } } })
}

/** 更新用户 */
export function updateUser(id: string, body: { username?: string }) {
  return request.PATCH('/api/v1/users/{id}', { params: { path: { id } }, body })
}

/** 删除用户 */
export function deleteUser(id: string) {
  return request.DELETE('/api/v1/users/{id}', { params: { path: { id } } })
}

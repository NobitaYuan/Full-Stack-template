import { request } from '../request'
import type { components, paths } from '../api-types'

type UserListQuery = paths['/api/v1/users']['get']['parameters']['query']

/** 用户列表（分页） */
export function getUserList(params?: UserListQuery) {
  return request.GET('/api/v1/users', { params: { query: params } })
}

/** 用户详情 */
export function getUser(id: string) {
  return request.GET('/api/v1/users/{id}', { params: { path: { id } } })
}

/** 更新用户 */
export function updateUser(id: string, body: components['schemas']['UpdateUserInput']) {
  return request.PATCH('/api/v1/users/{id}', { params: { path: { id } }, body })
}

/** 删除用户 */
export function deleteUser(id: string) {
  return request.DELETE('/api/v1/users/{id}', { params: { path: { id } } })
}

import { request } from '../request'

/** 会话列表 */
export function getSessionList() {
  return request.GET('/api/v1/agent/sessions')
}

/** 创建会话 */
export function createSession(body?: { title?: string }) {
  return request.POST('/api/v1/agent/sessions', { body })
}

/** 获取会话详情（含消息历史） */
export function getSession(id: string) {
  return request.GET('/api/v1/agent/sessions/{id}', { params: { path: { id } } })
}

/** 删除会话 */
export function deleteSession(id: string) {
  return request.DELETE('/api/v1/agent/sessions/{id}', { params: { path: { id } } })
}

/** 更新会话标题 */
export function updateSessionTitle(id: string, body: { title: string }) {
  return request.PATCH('/api/v1/agent/sessions/{id}', { params: { path: { id } }, body })
}

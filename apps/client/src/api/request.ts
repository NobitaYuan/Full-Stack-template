import createClient from 'openapi-fetch'
import type { paths } from './api-types'
import { getToken } from '@/utils/localStorage/token'
import { MessagePlugin } from 'tdesign-vue-next'
import router from '@/router'
import { useUserStore } from '@/stores/useUserStore'

const request = createClient<paths>()

request.use({
  onRequest({ request, schemaPath }) {
    const token = getToken()
    if (token && schemaPath !== '/api/v1/auth/login' && schemaPath !== '/api/v1/auth/register') {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
  async onResponse({ request, response }) {
    if (response.ok) return
    const token = getToken()
    if (response.status === 401 && token && request.headers.get('Authorization') === `Bearer ${token}`) {
      MessagePlugin.warning({ content: '身份验证失效，请重新登录', closeBtn: true })
      useUserStore().logout()
      const route = router.currentRoute.value
      if (route.meta.requiresAdmin) {
        void router.replace({ name: 'login', query: { redirect: route.fullPath } })
      }
      return
    }

    let message = '请求失败'
    if (response.headers.get('content-type')?.includes('application/json')) {
      const body: unknown = await response
        .clone()
        .json()
        .catch(() => undefined)
      if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
        message = body.message
      }
    }
    MessagePlugin.error({ content: message, closeBtn: true })
  },
  async onError({ error }) {
    const message = error instanceof TypeError ? '网络连接异常，请检查网络' : '请求出错，请稍后重试'
    MessagePlugin.error({ content: message, closeBtn: true })
    throw error
  },
})

export { request }

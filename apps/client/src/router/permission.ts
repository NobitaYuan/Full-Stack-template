import 'nprogress/nprogress.css' // progress bar style
import NProgress from 'nprogress' // progress bar
import { MessagePlugin } from 'tdesign-vue-next'

import { useUserStore } from '@/stores/useUserStore/index'
import router from '@/router/index'

NProgress.configure({ showSpinner: false })

// 白名单
const whiteListRouters = new Set(['/login', '/index'])

// 路由守卫--前置
router.beforeEach(async (to) => {
  NProgress.start()
  const userStore = useUserStore()

  if (to.path === '/login') return

  if (userStore.token && !userStore.hasUserInfo) {
    // 失败提示由请求层处理。无法确认权限时，后续判断会拦截管理页。
    await userStore.getUserInfo().catch(() => undefined)
  }

  if (!userStore.token && !whiteListRouters.has(to.path)) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.meta.requiresAdmin && !userStore.isAdmin) {
    MessagePlugin.warning('用户管理仅向管理员开放')
    return { name: 'index' }
  }
})

// 路由守卫--后置
router.afterEach((to, _from, failure) => {
  NProgress.done()
  if (!failure && to.path === '/login') {
    const userStore = useUserStore()
    userStore.logout()
  }
})

router.onError(() => NProgress.done())

import { defineStore } from 'pinia'
import { clearUserToken, getToken, setToken, userInfoKey, userTokenKey } from '@/utils/localStorage/token'
import { removeFromLocal } from '@/utils'
import * as serverAuthApi from '@/api/auth'
import * as serverUserApi from '@/api/users'
import type { components } from '@/api/api-types'

type UserInfo = components['schemas']['AuthUser']

const InitUserInfo: UserInfo = {
  id: '',
  username: '',
  isAdmin: false,
}

// 用户信息store
export const useUserStore = defineStore('userStore', {
  state: () => ({
    hasUserInfo: false,
    token: getToken() || '',
    info: { ...InitUserInfo },
  }),
  getters: {
    userName(state) {
      return state.info?.username || ''
    },
    userToken(state) {
      return state.token
    },
    userInfo(state) {
      return state.info
    },
    isAdmin(state) {
      return state.hasUserInfo && state.info.isAdmin
    },
  },
  actions: {
    async login(username: string, password: string) {
      const { data } = await serverAuthApi.login(username, password)
      if (!data) return false
      this.token = data.data.accessToken
      setToken(data.data.accessToken)
      this.info = data.data.user
      this.hasUserInfo = true
      return true
    },
    async getUserInfo() {
      const { id } = this.info
      if (!id) {
        this.logout()
        return
      }

      const token = this.token
      const { data } = await serverUserApi.getUser(id)
      if (token !== this.token) return
      if (!data) {
        this.hasUserInfo = false
        return
      }
      this.info = { id: data.data.id, username: data.data.username, isAdmin: data.data.isAdmin }
      this.hasUserInfo = true
    },
    logout(reload: boolean = false) {
      this.$patch({ token: '', hasUserInfo: false, info: { ...InitUserInfo } })
      clearUserToken()
      removeFromLocal(userInfoKey)
      if (reload) {
        window.location.reload()
      }
    },
  },
  // 持久化 token 和 userInfo
  persist: [
    {
      key: userTokenKey,
      pick: ['token'],
      serializer: {
        serialize: (value) => value.token,
        deserialize: (value) => ({ token: value }),
      },
    },
    {
      key: userInfoKey,
      pick: ['info'],
      serializer: {
        serialize: (value) => {
          return JSON.stringify(value.info)
        },
        deserialize: (value) => ({ info: { ...InitUserInfo, ...JSON.parse(value) } }),
      },
    },
  ],
})

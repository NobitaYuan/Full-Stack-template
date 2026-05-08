<script lang="tsx" setup>
import { useDarkModeStore } from '@/stores'
import { BulbOutlined, BulbFilled } from '@ant-design/icons-vue'
import { RouterLink } from 'vue-router'
import navCom from './nav.vue'
import userInfo from './components/userInfo.vue'

import LogoSvg from '@/assets/images/vite.svg?component'

const darkModeStore = useDarkModeStore()

const title = import.meta.env.VITE_APP_TITLE
const checked = computed({
  get: () => darkModeStore.isDark,
  set: (val: boolean | undefined) => {
    darkModeStore.toggleDark(val ?? false)
  },
})
</script>

<template>
  <div class="header">
    <RouterLink to="/" class="logo">
      <LogoSvg class="logoImg" />
      <div class="text">
        {{ title }}
      </div>
    </RouterLink>
    <div class="nav">
      <navCom />
    </div>
    <div class="setting">
      <a-switch v-model:checked="checked" size="small">
        <template #checkedChildren><BulbFilled /></template>
        <template #unCheckedChildren><BulbOutlined /></template>
      </a-switch>
      <userInfo />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.header {
  height: var(--topbar-h);
  display: flex;
  align-items: center;
  padding-left: 12px;
  padding-right: 24px;
  background-color: #0052d9;
  transition: all 0.3s;
  color: #fff;
  .logo {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: bold;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    .text {
      font-size: 20px;
      font-weight: bold;
    }
    .logoImg {
      font-size: 24px;
    }
  }
  .nav {
    height: 100%;
    padding: 0 12px;
  }
  .setting {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }
}
</style>

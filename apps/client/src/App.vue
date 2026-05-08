<script setup lang="ts">
import Layout from '@/layout/index.vue'
import zhCN from 'ant-design-vue/es/locale/zh_CN'
import { theme } from 'ant-design-vue'
import { useDarkModeStore } from '@/stores'

const darkModeStore = useDarkModeStore()

const themeConfig = computed(() => ({
  algorithm: darkModeStore.isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
}))
</script>

<template>
  <a-config-provider :locale="zhCN" :theme="themeConfig">
    <Layout />
  </a-config-provider>
</template>

<style lang="scss" scoped></style>

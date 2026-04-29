<script lang="ts" setup>
const navList = [
  { name: '示例页面', path: '/index', icon: 'app' },
  { name: '用户管理', path: '/user-manage', icon: 'usergroup' },
]

const route = useRoute()
const activePath = computed(() => route.path)
const isPathActive = (path: string) => {
  const rootPath = activePath.value.split('/')[1]
  return `/${rootPath}` === path
}
</script>

<template>
  <div class="nav">
    <RouterLink class="navItem" :class="{ active: isPathActive(item.path) }" v-for="item in navList" :key="item.path" :to="item.path">
      <t-icon v-if="item.icon" :name="item.icon" />
      <div class="text">{{ item.name }}</div>
    </RouterLink>
  </div>
</template>

<style lang="scss" scoped>
.nav {
  width: 100%;
  height: 100%;
  overflow: auto;
  display: flex;
  gap: 12px;
  flex-wrap: nowrap;
  align-items: center;
  .navItem {
    padding: 6px 10px;
    border-radius: 2px;
    transition: all 0.15s ease-in-out;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 4px;
    .text {
      white-space: nowrap;
    }
    &.active {
      background-color: #fff;
      color: var(--td-brand-color);
    }
    &:hover {
      background-color: #fff;
      color: var(--td-brand-color);
    }
  }
}
</style>

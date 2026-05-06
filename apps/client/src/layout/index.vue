<script lang="ts" setup>
import headerView from './header.vue'
</script>

<template>
  <div class="layout_container">
    <header class="hd" v-if="$route.meta.showHeader !== false">
      <headerView></headerView>
    </header>
    <main class="bd">
      <RouterView v-slot="{ Component, route }">
        <!-- <transition :mode="'out-in'" enter-active-class="animate__animated animate__fadeInDown" leave-active-class="animate__animated animate__fadeOutUp"> -->
        <component :is="Component" :key="route.name" class="bd_container" />
        <!-- </transition> -->
      </RouterView>
    </main>
  </div>
</template>

<style lang="scss" scoped>
.layout_container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--layout-bg);
  .hd {
    flex-shrink: 0;
  }
  .bd {
    flex: 1;
    overflow: auto;
    .bd_container {
      height: 100%;
    }
  }
}
// 动画速度
.animate__animated {
  --animate-duration: 0.15s;
}
</style>

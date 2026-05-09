<script lang="ts" setup>
import demoBox from '@/components/demoBox.vue'
import ComplianceCheck from '../complianceCheck/index.vue'
</script>

<template>
  <div class="index_container">
    <a-card style="height: 100%; overflow: hidden">
      <ComplianceCheck />
    </a-card>
  </div>
</template>

<style lang="scss" scoped>
.index_container {
  height: 100%;
  background-color: var(--td-bg-color-container);
  padding: 16px;
  :deep(.ant-card-body) {
    overflow: auto;
    overflow-x: hidden;
    height: 100%;
  }
}
</style>

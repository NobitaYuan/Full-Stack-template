<script setup lang="ts">
import { UploadOutlined, FileSearchOutlined, SafetyCertificateOutlined, FileDoneOutlined } from '@ant-design/icons-vue'
import { COMPLIANCE_DATA, REVIEW_TASKS } from './types'
import type { ComplianceItem, ReviewTask } from './types'

import Tab1 from './tab1/index.vue'
import Tab2 from './tab2/index.vue'
import Tab3 from './tab3/index.vue'
import Tab4 from './tab4/index.vue'

/* =================== 项目信息 =================== */

const currentProject = computed(() => ({
  name: 'XX市智慧园区项目',
  id: '2026-GZ-001',
  deadline: '2026-04-15',
}))

/* =================== 共享状态 =================== */

const curActiveTab = ref<number>(0)
const complianceData = ref<ComplianceItem[]>([...COMPLIANCE_DATA])
const reviewTasks = ref<ReviewTask[]>([...REVIEW_TASKS])

const tabComponents = [Tab1, Tab2, Tab3, Tab4]

/* =================== Tab 2 事件处理 =================== */

function handleComplianceDataUpdate(newData: ComplianceItem[]) {
  complianceData.value = newData
}

function handleComplianceRegenerate() {
  complianceData.value = [...COMPLIANCE_DATA]
}
</script>

<template>
  <div class="complianceCheck_index">
    <a-card class="card" style="height: 100%; overflow: hidden">
      <div class="flex flex-col h-full overflow-hidden">
        <!-- 页面标题 -->
        <div style="margin-bottom: 24px; flex-shrink: 0">
          <h1 style="font-size: 22px; font-weight: 600; margin-bottom: 8px">合规检查</h1>
          <p style="color: #666">系统的"主审官"，形式合规检查，跨模态一致性内容逻辑检查，敏感性与排他性检查，以及异常打回管理等。</p>
        </div>

        <!-- 步骤条 -->
        <a-steps v-model:current="curActiveTab" style="margin-bottom: 24px">
          <a-step title="文档上传"
            ><template #icon><UploadOutlined /></template
          ></a-step>
          <a-step title="检查项解析"
            ><template #icon><FileSearchOutlined /></template
          ></a-step>
          <a-step title="合规检查"
            ><template #icon><SafetyCertificateOutlined /></template
          ></a-step>
          <a-step title="报告生成"
            ><template #icon><FileDoneOutlined /></template
          ></a-step>
        </a-steps>

        <!-- 动态组件切换 -->
        <div style="flex: 1; min-height: 0; overflow: auto; overflow-x: hidden">
          <component
            :is="tabComponents[curActiveTab]"
            :compliance-data="complianceData"
            :review-tasks="reviewTasks"
            :current-project="currentProject"
            @update:compliance-data="handleComplianceDataUpdate"
            @regenerate="handleComplianceRegenerate"
          />
        </div>
      </div>
    </a-card>
  </div>
</template>
<style lang="scss" scoped>
.complianceCheck_index {
  height: 100%;
  background-color: var(--td-bg-color-container);
  padding: 16px;
  .card {
    :deep(.ant-card-body) {
      overflow: auto;
      overflow-x: hidden;
      height: 100%;
    }
  }
}
</style>

<script setup lang="ts">
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  SafetyCertificateOutlined,
  FileSearchOutlined,
  RobotOutlined,
  SyncOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  EditOutlined,
  PlusOutlined,
  ClockCircleOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
  CodeOutlined,
  StopOutlined,
  WarningOutlined,
  UserOutlined,
  CheckOutlined,
} from '@ant-design/icons-vue'
import { CATEGORY_CONFIG, CATEGORY_ORDER, DROOLS_FACT_TYPES } from '../types'
import type { ComplianceCategory, ComplianceItem, ReviewTask, ReviewTaskStatus } from '../types'

const props = defineProps<{
  complianceData: ComplianceItem[]
  reviewTasks: ReviewTask[]
}>()

const emit = defineEmits<{
  'update:complianceData': [value: ComplianceItem[]]
}>()

/* =================== 样式常量 =================== */

const CARD_FLEX_STYLE: Record<string, string> = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
}

const cardBodyFlex = (padding = '12px'): Record<string, string> => ({
  padding,
  flex: '1',
  overflow: 'auto',
  minHeight: '0',
})

/* =================== 计算属性 =================== */

const stats = computed(() => {
  const data = props.complianceData
  const passCount = data.filter((d) => d.status === 'pass').length
  const failCount = data.filter((d) => d.status === 'fail').length
  const warningCount = data.filter((d) => d.status === 'warning').length
  const totalScore = data.reduce((sum, item) => sum + item.score, 0)
  const maxTotalScore = data.reduce((sum, item) => sum + item.maxScore, 0)
  const complianceRate = maxTotalScore > 0 ? totalScore / maxTotalScore : 0
  const total = data.length
  return { passCount, failCount, warningCount, totalScore, maxTotalScore, complianceRate, total }
})

const scoreColor = computed(() => {
  const rate = stats.value.complianceRate
  if (rate >= 0.9) return '#52c41a'
  if (rate >= 0.7) return '#faad14'
  return '#f5222d'
})

const groupedData = computed(() =>
  CATEGORY_ORDER.map((cat) => {
    const items = props.complianceData.filter((d) => d.category === cat)
    const pass = items.filter((d) => d.status === 'pass').length
    const fail = items.filter((d) => d.status === 'fail').length
    const warn = items.filter((d) => d.status === 'warning').length
    return { category: cat, config: CATEGORY_CONFIG[cat], items, pass, fail, warn }
  }),
)

const currentItem = computed(() => props.complianceData.find((d) => d.key === selectedComplianceKey.value) ?? null)

/* =================== 状态 =================== */

const selectedComplianceKey = ref<string>('L-01')
const customRules = ref<string[]>(['数据脱敏强制检查', 'SM国密算法验证'])
const isQueuePaused = ref(false)
const collapsedCategories = ref<Set<ComplianceCategory>>(new Set())
const taskPausedMap = ref<Record<string, boolean>>({})
const pendingManualTaskId = ref<string | null>(null)
const manualConfirmedSet = ref<Set<string>>(new Set())
const manualNote = ref('')

/* =================== Drools 状态 =================== */

const droolsModalOpen = ref(false)
const editingRuleIndex = ref<number | null>(null)
const droolsRuleName = ref('')
const droolsSalience = ref('100')
const droolsFactType = ref('BidDocument')
const droolsCondition = ref('')
const droolsAction = ref('')

interface DrlLine {
  text: string
  color: string
}

function getDrlLineColor(line: string): string {
  if (line.startsWith('package') || line.startsWith('import')) return '#c586c0'
  if (line.trimStart().startsWith('rule')) return '#569cd6'
  if (line.trimStart().startsWith('salience')) return '#b5cea8'
  if (line.trimStart().startsWith('when') || line.trimStart().startsWith('then') || line.trimStart().startsWith('end')) return '#569cd6'
  if (line.includes('//')) return '#6a9955'
  if (line.includes('$')) return '#9cdcfe'
  return '#d4d4d4'
}

const generatedDrl = computed(() => {
  return `package com.baguwen.compliance.rules;\n\nimport com.baguwen.model.${droolsFactType.value};\nimport com.baguwen.model.ComplianceAlert;\n\nrule "${droolsRuleName.value}"\n    salience ${droolsSalience.value}\n    when\n        ${droolsCondition.value.split('\n').join('\n        ')}\n    then\n        ${droolsAction.value.split('\n').join('\n        ')}\nend`
})

const drlLines = computed<DrlLine[]>(() => {
  return generatedDrl.value.split('\n').map((line) => ({ text: line, color: getDrlLineColor(line) }))
})

/* =================== 方法 =================== */

function toggleCategory(cat: ComplianceCategory) {
  const next = new Set(collapsedCategories.value)
  if (next.has(cat)) {
    next.delete(cat)
  } else {
    next.add(cat)
  }
  collapsedCategories.value = next
}

function toggleTaskPaused(taskId: string) {
  taskPausedMap.value = { ...taskPausedMap.value, [taskId]: !taskPausedMap.value[taskId] }
}

function handleManualConfirm() {
  const next = new Set(manualConfirmedSet.value)
  if (pendingManualTaskId.value) next.add(pendingManualTaskId.value)
  manualConfirmedSet.value = next
  pendingManualTaskId.value = null
  manualNote.value = ''
}

function getEffectiveStatus(task: ReviewTask): ReviewTaskStatus {
  const isConfirmed = manualConfirmedSet.value.has(task.id)
  return isConfirmed && task.status === 'suspended' ? 'completed' : task.status
}

function getProgressStatus(effectiveStatus: ReviewTaskStatus, isTaskPaused: boolean): string {
  if (effectiveStatus === 'completed') return 'success'
  if (effectiveStatus === 'suspended') return 'exception'
  if (isTaskPaused) return 'normal'
  if (effectiveStatus === 'reviewing') return 'active'
  return 'normal'
}

function getProgressColor(effectiveStatus: ReviewTaskStatus, isTaskPaused: boolean): string | undefined {
  if (effectiveStatus === 'suspended') return '#f5222d'
  if (isTaskPaused) return '#faad14'
  if (effectiveStatus === 'reviewing') return '#1890ff'
  return undefined
}

function openDroolsEditor(index: number) {
  editingRuleIndex.value = index
  const ruleName = customRules.value[index]
  droolsRuleName.value = ruleName
  if (ruleName === '数据脱敏强制检查') {
    droolsSalience.value = '200'
    droolsFactType.value = 'BidDocument'
    droolsCondition.value = '$doc : BidDocument(\n    contentText matches ".*(?:身份证号|手机号|银行账号).*",\n    desensitized == false\n)'
    droolsAction.value =
      '$doc.setStatus("FAIL");\n$doc.addViolation("检测到未脱敏的敏感信息");\ninsert(new ComplianceAlert("CRITICAL", "数据脱敏违规", $doc.getLocation()));'
  } else if (ruleName === 'SM国密算法验证') {
    droolsSalience.value = '150'
    droolsFactType.value = 'TechnicalSpec'
    droolsCondition.value = '$spec : TechnicalSpec(\n    category == "加密算法",\n    algorithm not matches "SM[234].*"\n)'
    droolsAction.value =
      '$spec.setStatus("FAIL");\n$spec.addViolation("未使用国密SM系列算法");\ninsert(new ComplianceAlert("WARNING", "国密算法合规", $spec.getSection()));'
  } else {
    droolsSalience.value = '100'
    droolsFactType.value = 'BidDocument'
    droolsCondition.value = '$doc : BidDocument(\n    // 在此定义条件\n)'
    droolsAction.value = '$doc.setStatus("WARNING");\n$doc.addViolation("自定义规则触发");'
  }
  droolsModalOpen.value = true
}

function handleDroolsSave() {
  if (editingRuleIndex.value !== null && droolsRuleName.value.trim()) {
    const updated = [...customRules.value]
    updated[editingRuleIndex.value] = droolsRuleName.value.trim()
    customRules.value = updated
  }
  droolsModalOpen.value = false
  editingRuleIndex.value = null
}

function closeDroolsModal() {
  droolsModalOpen.value = false
  editingRuleIndex.value = null
}
</script>

<template>
  <!-- 从原文件 L1237-L1655 + L1741-L1822 完整复制 -->
  <div style="display: flex; flex-direction: column; flex: 1">
    <!-- 指标卡 -->
    <a-row :gutter="16" style="margin-bottom: 16px; flex-shrink: 0">
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card
          style="height: 156px; display: flex; flex-direction: column; text-align: center"
          :body-style="{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' }"
        >
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 8px"><SafetyCertificateOutlined style="margin-right: 6px" />合规评分</div>
          <div style="display: flex; align-items: center; justify-content: center; gap: 16px; flex: 1">
            <a-progress type="dashboard" :percent="Math.round(stats.complianceRate * 100)" :stroke-color="scoreColor" :stroke-width="8" :size="70">
              <template #format="{ percent }">
                <div style="text-align: center">
                  <div :style="{ fontSize: 16, fontWeight: 700, color: scoreColor }">{{ percent }}%</div>
                </div>
              </template>
            </a-progress>
            <div>
              <div>
                <span :style="{ fontSize: 32, fontWeight: 700, color: scoreColor }">{{ stats.totalScore }}</span
                ><span style="font-size: 14px; color: #8c8c8c; margin-left: 2px">分</span>
              </div>
              <div style="font-size: 11px; color: #8c8c8c; margin-top: 4px">满分 {{ stats.maxTotalScore }} 分</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card
          style="height: 156px; display: flex; flex-direction: column; text-align: center"
          :body-style="{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' }"
        >
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 8px"><FileSearchOutlined style="margin-right: 6px" />规则项</div>
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center">
            <div>
              <span style="font-size: 32px; font-weight: 700; color: #1890ff">{{ stats.total }}</span
              ><span style="font-size: 14px; color: #8c8c8c; margin-left: 2px">项</span>
            </div>
            <div style="font-size: 11px; color: #8c8c8c; margin-top: 4px">规则覆盖率 100%</div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card
          style="height: 156px; display: flex; flex-direction: column; text-align: center"
          :body-style="{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' }"
        >
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 8px"><CheckCircleOutlined style="margin-right: 6px" />通过项</div>
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center">
            <div>
              <span style="font-size: 32px; font-weight: 700; color: #52c41a">{{ stats.passCount }}</span
              ><span style="font-size: 14px; color: #8c8c8c; margin-left: 2px">项</span>
            </div>
            <div style="font-size: 11px; color: #8c8c8c; margin-top: 4px">占比 {{ Math.round((stats.passCount / stats.total) * 100) }}%</div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card
          style="height: 156px; display: flex; flex-direction: column; text-align: center"
          :body-style="{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' }"
        >
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 8px"><CloseCircleOutlined style="margin-right: 6px" />负偏离项</div>
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center">
            <div>
              <span style="font-size: 32px; font-weight: 700; color: #f5222d">{{ stats.failCount }}</span
              ><span style="font-size: 14px; color: #8c8c8c; margin-left: 2px">项</span>
            </div>
            <div style="font-size: 11px; color: #8c8c8c; margin-top: 4px">占比 {{ Math.round((stats.failCount / stats.total) * 100) }}%</div>
          </div>
        </a-card>
      </a-col>
    </a-row>

    <!-- 三列布局 -->
    <a-row :gutter="12" style="flex: 1; min-height: 0">
      <!-- 左列: 合规检查项列表 -->
      <a-col :xs="24" :lg="6" style="display: flex; flex-direction: column">
        <a-card size="small" :style="CARD_FLEX_STYLE" :body-style="cardBodyFlex('8px 0')">
          <template #title>
            <a-space>
              <FileSearchOutlined style="color: #1890ff" />
              <span>合规检查项</span>
              <a-tag color="blue" style="font-size: 11px; margin: 0">{{ stats.total }} 项</a-tag>
            </a-space>
          </template>
          <div
            v-for="(group, groupIdx) in groupedData"
            :key="group.category"
            :style="{ borderBottom: groupIdx < groupedData.length - 1 ? '1px solid #f0f0f0' : 'none' }"
          >
            <div
              :style="{
                padding: '8px 12px',
                cursor: 'pointer',
                background: group.config.bgColor,
                boxShadow: `inset 3px 0 0 0 ${group.config.color}`,
                transition: 'all 0.2s',
                userSelect: 'none',
              }"
              @click="toggleCategory(group.category)"
            >
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0">
                  <CaretRightOutlined v-if="collapsedCategories.has(group.category)" :style="{ fontSize: 10, color: group.config.color, flexShrink: 0 }" />
                  <CaretDownOutlined v-else :style="{ fontSize: 10, color: group.config.color, flexShrink: 0 }" />
                  <span
                    :style="{ fontSize: 12, fontWeight: 600, color: group.config.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }"
                    >{{ group.config.label }}</span
                  >
                  <a-tag
                    :style="{
                      fontSize: 10,
                      margin: 0,
                      lineHeight: '16px',
                      padding: '0 4px',
                      border: `1px solid ${group.config.borderColor}`,
                      color: group.config.color,
                      background: 'rgba(255,255,255,0.7)',
                    }"
                    >{{ group.config.tag }}</a-tag
                  >
                </div>
                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0">
                  <span v-if="group.pass > 0" style="font-size: 10px; color: #52c41a"><CheckCircleOutlined style="margin-right: 1px" />{{ group.pass }}</span>
                  <span v-if="group.warn > 0" style="font-size: 10px; color: #faad14"
                    ><ExclamationCircleOutlined style="margin-right: 1px" />{{ group.warn }}</span
                  >
                  <span v-if="group.fail > 0" style="font-size: 10px; color: #f5222d"><CloseCircleOutlined style="margin-right: 1px" />{{ group.fail }}</span>
                </div>
              </div>
            </div>
            <template v-if="!collapsedCategories.has(group.category)">
              <div
                v-for="(item, itemIdx) in group.items"
                :key="item.key"
                :style="{
                  padding: '8px 12px 8px 18px',
                  cursor: 'pointer',
                  background: selectedComplianceKey === item.key ? '#e6f4ff' : 'transparent',
                  boxShadow: selectedComplianceKey === item.key ? 'inset 3px 0 0 0 #1890ff' : 'none',
                  transition: 'all 0.15s',
                }"
                @click="selectedComplianceKey = item.key"
              >
                <div style="display: flex; align-items: flex-start; gap: 8px">
                  <span
                    :style="{
                      fontSize: 10,
                      color: '#8c8c8c',
                      background: '#f5f5f5',
                      borderRadius: 3,
                      padding: '1px 5px',
                      fontFamily: 'monospace',
                      flexShrink: 0,
                      marginTop: 1,
                    }"
                  >
                    {{ groupedData.slice(0, groupIdx).reduce((sum, g) => sum + g.items.length, 0) + itemIdx + 1 }}
                  </span>
                  <div style="flex: 1; min-width: 0">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px">
                      <span style="font-size: 12px; font-weight: 500; color: #262626; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{
                        item.requirement
                      }}</span>
                      <span style="flex-shrink: 0">
                        <CheckCircleOutlined v-if="item.status === 'pass'" style="color: #52c41a; font-size: 14px" />
                        <CloseCircleOutlined v-else-if="item.status === 'fail'" style="color: #f5222d; font-size: 14px" />
                        <ExclamationCircleOutlined v-else style="color: #faad14; font-size: 14px" />
                      </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 3px">
                      <span style="font-size: 11px; color: #8c8c8c">
                        得分:
                        <span :style="{ color: item.status === 'pass' ? '#52c41a' : item.status === 'warning' ? '#faad14' : '#f5222d', fontWeight: 600 }">{{
                          item.score
                        }}</span
                        >/{{ item.maxScore }}
                      </span>
                      <a-tag v-if="item.isCritical" color="error" style="font-size: 10px; line-height: 14px; padding: 0 3px; margin: 0">一票否决</a-tag>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </a-card>
      </a-col>

      <!-- 中列: 审查工作区 -->
      <a-col :xs="24" :lg="11" style="display: flex; flex-direction: column">
        <a-card size="small" :style="CARD_FLEX_STYLE" :body-style="cardBodyFlex('16px')">
          <template #title>
            <a-space>
              <EditOutlined style="color: #722ed1" />
              <span>审查工作区</span>
              <a-tag v-if="pendingManualTaskId" color="error" style="font-size: 10px; margin: 0">待人工确认</a-tag>
            </a-space>
          </template>

          <!-- 人工介入确认区 -->
          <template v-if="pendingManualTaskId">
            <div style="margin-bottom: 16px">
              <div style="font-size: 13px; font-weight: 600; color: #cf1322; margin-bottom: 10px; display: flex; align-items: center; gap: 6px">
                <WarningOutlined /><span>人工介入确认</span>
                <a-tag color="error" style="font-size: 10px; margin: 0">任务挂起中</a-tag>
              </div>
              <template v-if="reviewTasks.find((t) => t.id === pendingManualTaskId)">
                <div style="background: #fff1f0; border: 1px solid #ffccc7; border-radius: 6px; padding: 14px; margin-bottom: 12px">
                  <div style="font-size: 12px; font-weight: 600; color: #262626; margin-bottom: 6px">
                    <RobotOutlined style="color: #f5222d; margin-right: 6px" />
                    {{ reviewTasks.find((t) => t.id === pendingManualTaskId)!.title }}
                    <span style="font-size: 11px; color: #8c8c8c; margin-left: 8px"
                      >执行者: {{ reviewTasks.find((t) => t.id === pendingManualTaskId)!.agent }}</span
                    >
                  </div>
                  <div style="font-size: 12px; color: #595959; line-height: 1.6">
                    <strong>AI挂起原因：</strong>{{ reviewTasks.find((t) => t.id === pendingManualTaskId)!.manualReason }}
                  </div>
                </div>
              </template>
              <div style="margin-bottom: 10px">
                <div style="font-size: 12px; color: #262626; font-weight: 500; margin-bottom: 6px">人工核查结果说明</div>
                <a-textarea
                  v-model:value="manualNote"
                  :rows="3"
                  placeholder="请填写核查结果，例如：已查阅原件，银行回执单真实有效，签章清晰可见…"
                  style="font-size: 12px"
                />
              </div>
              <div style="display: flex; gap: 8px">
                <a-button
                  type="primary"
                  :disabled="!manualNote.trim()"
                  style="flex: 1; background: #52c41a; border-color: #52c41a"
                  @click="handleManualConfirm"
                >
                  <template #icon><CheckOutlined /></template>确认通过，恢复队列
                </a-button>
                <a-button
                  danger
                  style="flex: 1"
                  @click="
                    () => {
                      pendingManualTaskId = null
                      manualNote = ''
                    }
                  "
                >
                  <template #icon><StopOutlined /></template>取消（保持挂起）
                </a-button>
              </div>
              <a-divider style="margin: 14px 0" />
            </div>
          </template>

          <!-- 当前问题详情 -->
          <div style="margin-bottom: 16px">
            <div style="font-size: 13px; font-weight: 600; color: #262626; margin-bottom: 12px">当前问题详情</div>
            <template v-if="currentItem">
              <div
                :style="{
                  background: currentItem.status === 'fail' ? '#fff1f0' : currentItem.status === 'warning' ? '#fffbe6' : '#f6ffed',
                  border: `1px solid ${currentItem.status === 'fail' ? '#ffccc7' : currentItem.status === 'warning' ? '#ffe58f' : '#b7eb8f'}`,
                  borderRadius: 6,
                  padding: 14,
                }"
              >
                <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap">
                  <a-tag :color="currentItem.status === 'pass' ? 'success' : currentItem.status === 'warning' ? 'warning' : 'error'">
                    {{ currentItem.status === 'pass' ? '通过' : currentItem.status === 'warning' ? '警告' : '负偏离' }}
                  </a-tag>
                  <a-tag
                    :style="{
                      fontSize: 10,
                      margin: 0,
                      border: `1px solid ${CATEGORY_CONFIG[currentItem.category].borderColor}`,
                      color: CATEGORY_CONFIG[currentItem.category].color,
                      background: CATEGORY_CONFIG[currentItem.category].bgColor,
                    }"
                  >
                    {{ CATEGORY_CONFIG[currentItem.category].label }}
                  </a-tag>
                  <span style="font-size: 11px; color: #8c8c8c; font-family: monospace">{{ currentItem.key }}</span>
                  <a-tag v-if="currentItem.isCritical" color="error" style="font-size: 10px; margin: 0">一票否决</a-tag>
                </div>
                <div style="font-size: 12px; color: #595959; margin-bottom: 8px"><strong>招标要求：</strong> {{ currentItem.requirement }}</div>
                <a-divider style="margin: 8px 0" />
                <div style="font-size: 12px; color: #595959"><strong>AI响应：</strong> {{ currentItem.aiResponse }}</div>
                <div style="margin-top: 8px; font-size: 11px; color: #8c8c8c">
                  得分:
                  <span
                    :style="{ color: currentItem.status === 'pass' ? '#52c41a' : currentItem.status === 'warning' ? '#faad14' : '#f5222d', fontWeight: 600 }"
                    >{{ currentItem.score }}</span
                  >
                  / {{ currentItem.maxScore }}
                </div>

                <template v-if="currentItem.status !== 'pass'">
                  <a-divider style="margin: 12px 0" />
                  <div style="background: #fff; border-radius: 4px; padding: 10px; border: 1px solid #ffa39e">
                    <div style="font-size: 11px; font-weight: 600; color: #cf1322; margin-bottom: 6px; display: flex; align-items: center; gap: 4px">
                      <span>问题位置</span>
                    </div>
                    <div
                      style="
                        font-size: 11px;
                        color: #595959;
                        background: #fff7e6;
                        padding: 6px 8px;
                        border-radius: 3px;
                        border: 1px dashed #ffa940;
                        margin-bottom: 8px;
                      "
                    >
                      <div>
                        <span style="color: #8c8c8c">定位：</span
                        ><span style="color: #fa8c16; font-weight: 500; font-family: monospace">第2章 2.1节 - 第3段 第2-4行</span>
                      </div>
                    </div>
                    <div
                      style="
                        font-size: 11px;
                        color: #262626;
                        background: #fffaf0;
                        padding: 8px 10px;
                        border-radius: 3px;
                        border: 1px solid #ffe7ba;
                        border-left: 3px solid #fa8c16;
                        line-height: 1.6;
                      "
                    >
                      <div style="color: #8c8c8c; font-size: 10px; margin-bottom: 4px">原文片段：</div>
                      <div
                        style="
                          font-family:
                            system-ui,
                            -apple-system,
                            sans-serif;
                        "
                      >
                        系统采用微服务架构设计，基于Spring Cloud框架实现<span style="background: #ffccc7; padding: 1px 3px; border-radius: 2px; color: #cf1322"
                          >服务拆分和治理</span
                        >，确保系统的高可用性和可扩展性...
                      </div>
                    </div>
                  </div>
                </template>

                <template v-if="currentItem.status !== 'pass'">
                  <a-divider style="margin: 12px 0" />
                  <div style="background: #fff; border-radius: 4px; padding: 10px; border: 1px solid #91d5ff">
                    <div style="font-size: 11px; font-weight: 600; color: #096dd9; margin-bottom: 6px; display: flex; align-items: center; gap: 4px">
                      <span>AI修改建议</span>
                    </div>
                    <div
                      style="
                        font-size: 11px;
                        color: #262626;
                        background: #e6f7ff;
                        padding: 8px 10px;
                        border-radius: 3px;
                        border: 1px solid #91d5ff;
                        line-height: 1.6;
                      "
                    >
                      建议在技术方案描述中补充具体的容量规划数据，明确标注系统支持的并发用户数≥300、响应时间≤2秒等关键性能指标，并配合架构图进行说明。
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </div>

          <a-divider />

          <!-- 个性化审查规则 -->
          <div>
            <div
              style="font-size: 13px; font-weight: 600; color: #262626; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between"
            >
              <span>个性化审查规则</span>
              <a-button size="small" type="primary" @click="customRules = [...customRules, '新规则']"
                ><template #icon><PlusOutlined /></template>添加规则</a-button
              >
            </div>
            <div style="border: 1px solid #f0f0f0; border-radius: 6px">
              <div
                v-for="(rule, index) in customRules"
                :key="index"
                :style="{
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: index < customRules.length - 1 ? '1px solid #f0f0f0' : 'none',
                }"
              >
                <a-space
                  ><SafetyCertificateOutlined style="color: #1890ff" /><span style="font-size: 12px">{{ rule }}</span></a-space
                >
                <a-button type="link" size="small" @click="openDroolsEditor(index)"
                  ><template #icon><EditOutlined /></template>编辑</a-button
                >
              </div>
            </div>
            <div style="margin-top: 12px; padding: 10px; background: #f0f5ff; border-radius: 4px; border: 1px solid #adc6ff">
              <div style="font-size: 11px; color: #1d39c4; line-height: 1.6">
                <strong>提示：</strong>自定义规则将与Drools规则引擎集成，实时监控标书内容。支持正则表达式、关键词匹配、数值范围校验等多种规则类型。
              </div>
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 右列: AI合规检查 + 审查队列 -->
      <a-col :xs="24" :lg="7" style="display: flex; flex-direction: column; gap: 8px">
        <a-card size="small" style="flex-shrink: 0" :body-style="{ padding: '14px 16px' }">
          <template #title>
            <a-space><RobotOutlined style="color: #1890ff" /><span>AI 检查</span></a-space>
          </template>
          <a-row :gutter="12" style="margin-bottom: 12px">
            <a-col :span="8">
              <div style="text-align: center">
                <div style="font-size: 22px; font-weight: 600; color: #52c41a">{{ stats.passCount }}</div>
                <div style="font-size: 11px; color: #666; margin-top: 2px">已通过</div>
              </div>
            </a-col>
            <a-col :span="8">
              <div style="text-align: center">
                <div style="font-size: 22px; font-weight: 600; color: #faad14">{{ reviewTasks.filter((t) => t.status === 'reviewing').length }}</div>
                <div style="font-size: 11px; color: #666; margin-top: 2px">审查中</div>
              </div>
            </a-col>
            <a-col :span="8">
              <div style="text-align: center">
                <div style="font-size: 22px; font-weight: 600; color: #f5222d">{{ reviewTasks.filter((t) => t.status === 'waiting').length }}</div>
                <div style="font-size: 11px; color: #666; margin-top: 2px">排队中</div>
              </div>
            </a-col>
          </a-row>
          <div
            :style="{
              padding: '9px 12px',
              background: isQueuePaused ? '#fff7e6' : '#f6ffed',
              borderRadius: 4,
              border: `1px solid ${isQueuePaused ? '#ffd591' : '#b7eb8f'}`,
              marginBottom: 12,
            }"
          >
            <div style="margin-bottom: 6px">
              <div :style="{ fontSize: 12, color: isQueuePaused ? '#faad14' : '#52c41a', fontWeight: 500, marginBottom: 4 }">
                {{ isQueuePaused ? '检查已暂停' : '2个合规Agent并行工作中' }}
              </div>
              <a-progress
                :percent="Math.round(stats.complianceRate * 100)"
                size="small"
                :stroke-color="isQueuePaused ? '#faad14' : scoreColor"
                :show-info="false"
              />
            </div>
            <div style="font-size: 11px; color: #666">共 {{ stats.total }} 项检查 . 合规率 {{ Math.round(stats.complianceRate * 100) }}%</div>
          </div>
          <div style="display: flex; gap: 8px">
            <a-button
              size="small"
              :style="{ flex: 1, borderColor: isQueuePaused ? '#52c41a' : '#faad14', color: isQueuePaused ? '#52c41a' : '#faad14' }"
              @click="isQueuePaused = !isQueuePaused"
            >
              <template #icon><PlayCircleOutlined v-if="isQueuePaused" /><PauseCircleOutlined v-else /></template>
              {{ isQueuePaused ? '全部开始' : '全部暂停' }}
            </a-button>
            <a-button size="small" type="primary" style="flex: 1"
              ><template #icon><SyncOutlined /></template>全部重新检查</a-button
            >
          </div>
        </a-card>

        <!-- 审查队列 Card -->
        <a-card size="small" style="flex: 1; min-height: 0; display: flex; flex-direction: column" :body-style="cardBodyFlex('8px')">
          <template #title>
            <a-space>
              <SyncOutlined :spin="!isQueuePaused" />
              <span>检查队列</span>
              <a-tag color="blue" style="font-size: 11px; margin: 0">{{ reviewTasks.length }} 项</a-tag>
              <a-tag v-if="reviewTasks.some((t) => t.status === 'suspended' && !manualConfirmedSet.has(t.id))" color="error" style="font-size: 10px; margin: 0">
                {{ reviewTasks.filter((t) => t.status === 'suspended' && !manualConfirmedSet.has(t.id)).length }} 项待介入
              </a-tag>
            </a-space>
          </template>
          <a-collapse :bordered="false" style="background: transparent">
            <a-collapse-panel v-for="task in reviewTasks" :key="task.id">
              <template #header>
                <div style="width: 100%">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px">
                    <a-space :size="4" style="min-width: 0; flex: 1">
                      <CheckCircleOutlined v-if="getEffectiveStatus(task) === 'completed'" style="color: #52c41a" />
                      <WarningOutlined v-else-if="getEffectiveStatus(task) === 'suspended'" style="color: #f5222d" />
                      <SyncOutlined v-else-if="getEffectiveStatus(task) === 'reviewing'" spin style="color: #1890ff" />
                      <ClockCircleOutlined v-else style="color: #bfbfbf" />
                      <span
                        :title="task.title"
                        style="
                          font-size: 12px;
                          font-weight: 500;
                          overflow: hidden;
                          text-overflow: ellipsis;
                          white-space: nowrap;
                          max-width: 110px;
                          display: inline-block;
                        "
                        >{{ task.title }}</span
                      >
                      <a-tag v-if="getEffectiveStatus(task) === 'suspended'" color="error" style="font-size: 10px; margin: 0; padding: 0 4px; flex-shrink: 0"
                        >挂起</a-tag
                      >
                      <a-tag v-if="getEffectiveStatus(task) === 'completed'" color="success" style="font-size: 10px; margin: 0; padding: 0 4px; flex-shrink: 0"
                        >完成</a-tag
                      >
                      <a-tag
                        v-if="getEffectiveStatus(task) === 'waiting'"
                        style="font-size: 10px; margin: 0; padding: 0 4px; flex-shrink: 0; border: 1px solid #d9d9d9; color: #8c8c8c"
                        >排队</a-tag
                      >
                    </a-space>
                    <a-space :size="2" style="flex-shrink: 0; margin-left: 4px" @click.stop>
                      <a-tooltip
                        v-if="getEffectiveStatus(task) !== 'suspended' && getEffectiveStatus(task) !== 'completed'"
                        :title="taskPausedMap[task.id] ? '继续检查' : '暂停检查'"
                      >
                        <a-button type="text" size="small" :style="{ padding: '0 3px' }" @click.stop="toggleTaskPaused(task.id)">
                          <template #icon>
                            <PlayCircleOutlined v-if="taskPausedMap[task.id]" style="color: #52c41a" />
                            <PauseCircleOutlined v-else style="color: #faad14" />
                          </template>
                        </a-button>
                      </a-tooltip>
                      <a-tooltip v-if="getEffectiveStatus(task) === 'suspended' && !manualConfirmedSet.has(task.id)" title="点击前往人工确认区处理">
                        <a-button
                          type="text"
                          size="small"
                          danger
                          :style="{ padding: '0 3px' }"
                          @click.stop="
                            pendingManualTaskId = task.id
                            manualNote = ''
                          "
                        >
                          <template #icon><UserOutlined /></template>
                        </a-button>
                      </a-tooltip>
                    </a-space>
                  </div>
                  <a-progress
                    :percent="getEffectiveStatus(task) === 'completed' ? 100 : task.progress"
                    size="small"
                    :status="getProgressStatus(getEffectiveStatus(task), !!taskPausedMap[task.id]) as 'success' | 'exception' | 'active' | 'normal'"
                    :stroke-color="getProgressColor(getEffectiveStatus(task), !!taskPausedMap[task.id])"
                  />
                </div>
              </template>
              <div style="background: #fafafa; padding: 12px; border-radius: 4px; max-height: 260px; overflow: auto">
                <div style="font-size: 12px; font-weight: 600; color: #1890ff; margin-bottom: 8px; display: flex; align-items: center; gap: 5px">
                  <RobotOutlined /><span>{{ task.agent }} . 工作日志</span>
                  <a-tag
                    :color="
                      getEffectiveStatus(task) === 'completed'
                        ? 'success'
                        : getEffectiveStatus(task) === 'suspended'
                          ? 'error'
                          : getEffectiveStatus(task) === 'reviewing'
                            ? 'processing'
                            : 'default'
                    "
                    style="font-size: 10px; margin: 0"
                  >
                    {{
                      getEffectiveStatus(task) === 'completed'
                        ? '已完成'
                        : getEffectiveStatus(task) === 'suspended'
                          ? '挂起等待'
                          : getEffectiveStatus(task) === 'reviewing'
                            ? '执行中'
                            : '等待中'
                    }}
                  </a-tag>
                </div>
                <div style="font-size: 11px; line-height: 1.75; display: flex; flex-direction: column; gap: 2px">
                  <div v-if="task.logs.length === 0" style="color: #8c8c8c; font-style: italic">等待前序任务完成后自动启动...</div>
                  <div v-for="(log, i) in task.logs" :key="i" style="display: flex; gap: 6px; align-items: flex-start">
                    <span style="color: #8c8c8c; flex-shrink: 0; font-family: monospace">[{{ log.time }}]</span>
                    <span style="color: #262626">
                      <a-tag :color="log.color" style="font-size: 10px; padding: 0 4px; margin: 0 5px 0 0; line-height: 16px">{{ log.skill }}</a-tag>
                      {{ log.message }}
                    </span>
                  </div>
                  <div
                    v-if="task.logs.length > 0"
                    :style="{
                      marginTop: 6,
                      padding: '6px 10px',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 6,
                      background:
                        getEffectiveStatus(task) === 'completed'
                          ? '#f6ffed'
                          : getEffectiveStatus(task) === 'suspended'
                            ? '#fff1f0'
                            : getEffectiveStatus(task) === 'reviewing'
                              ? '#e6f7ff'
                              : '#fafafa',
                      border: `1px solid ${getEffectiveStatus(task) === 'completed' ? '#b7eb8f' : getEffectiveStatus(task) === 'suspended' ? '#ffccc7' : getEffectiveStatus(task) === 'reviewing' ? '#91d5ff' : '#e8e8e8'}`,
                    }"
                  >
                    <template v-if="getEffectiveStatus(task) === 'completed'">
                      <CheckCircleOutlined style="color: #52c41a; flex-shrink: 0; margin-top: 1px" />
                      <span style="color: #389e0d; font-weight: 600">人工确认完成，任务已通过</span>
                    </template>
                    <template v-else-if="getEffectiveStatus(task) === 'suspended'">
                      <WarningOutlined style="color: #f5222d; flex-shrink: 0; margin-top: 1px" />
                      <span style="color: #cf1322">任务挂起 . {{ manualConfirmedSet.has(task.id) ? '已确认' : task.manualReason }}</span>
                    </template>
                    <template v-else-if="getEffectiveStatus(task) === 'reviewing'">
                      <SyncOutlined spin style="color: #1890ff; flex-shrink: 0; margin-top: 1px" />
                      <span style="color: #0958d9">执行中 . 进度 {{ task.progress }}%</span>
                    </template>
                    <template v-else>
                      <ClockCircleOutlined style="color: #bfbfbf; flex-shrink: 0; margin-top: 1px" />
                      <span style="color: #8c8c8c">等待前序任务完成后自动启动</span>
                    </template>
                  </div>
                  <a-button
                    v-if="getEffectiveStatus(task) === 'suspended' && !manualConfirmedSet.has(task.id)"
                    type="primary"
                    danger
                    size="small"
                    style="margin-top: 8px; width: 100%"
                    @click.stop="
                      pendingManualTaskId = task.id
                      manualNote = ''
                    "
                  >
                    <template #icon><UserOutlined /></template>前往中间区完成人工确认
                  </a-button>
                </div>
              </div>
            </a-collapse-panel>
          </a-collapse>
        </a-card>
      </a-col>
    </a-row>
  </div>

  <!-- Drools规则编辑器模态框 -->
  <a-modal :open="droolsModalOpen" width="820" @cancel="closeDroolsModal">
    <template #title>
      <a-space><CodeOutlined style="color: #722ed1" /><span>Drools 规则引擎 -- 规则配置</span></a-space>
    </template>
    <div style="display: flex; flex-direction: column; gap: 16px">
      <div style="display: flex; gap: 12px">
        <div style="flex: 2">
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 4px">规则名称 (rule name)</div>
          <a-input v-model:value="droolsRuleName" placeholder="请输入规则名称" />
        </div>
        <div style="flex: 1">
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 4px">优先级 (salience)</div>
          <a-input v-model:value="droolsSalience" placeholder="100" />
        </div>
        <div style="flex: 1">
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 4px">事实类型 (Fact)</div>
          <a-select v-model:value="droolsFactType" style="width: 100%">
            <a-select-option v-for="item in DROOLS_FACT_TYPES" :key="item.value" :value="item.value">{{ item.label }}</a-select-option>
          </a-select>
        </div>
      </div>
      <a-row :gutter="12">
        <a-col :span="12">
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 4px">
            <a-tag color="blue" style="font-size: 10px; margin: 0 4px 0 0">when</a-tag>条件 (LHS)
          </div>
          <a-textarea
            v-model:value="droolsCondition"
            placeholder="$doc : BidDocument(&#10;    // 条件表达式&#10;)"
            :rows="6"
            style="font-family: monospace; font-size: 12px"
          />
        </a-col>
        <a-col :span="12">
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 4px">
            <a-tag color="green" style="font-size: 10px; margin: 0 4px 0 0">then</a-tag>动作 (RHS)
          </div>
          <a-textarea
            v-model:value="droolsAction"
            placeholder='$doc.setStatus("FAIL");&#10;$doc.addViolation("...");'
            :rows="6"
            style="font-family: monospace; font-size: 12px"
          />
        </a-col>
      </a-row>
      <div>
        <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 4px; display: flex; align-items: center; gap: 6px">
          <CodeOutlined />生成的 .drl 文件预览
        </div>
        <div style="background: #1e1e1e; border-radius: 6px; padding: 14px; max-height: 220px; overflow: auto">
          <pre style="margin: 0; font-family: monospace; font-size: 12px; line-height: 1.6; color: #d4d4d4; white-space: pre-wrap; word-break: break-all">
            <div v-for="(line, i) in drlLines" :key="i" style="display: flex">
              <span style="color: #636363; min-width: 28px; text-align: right; margin-right: 12px; user-select: none">{{ i + 1 }}</span>
              <span :style="{ color: line.color }">{{ line.text }}</span>
            </div>
          </pre>
        </div>
      </div>
      <div style="padding: 8px 12px; background: #f9f0ff; border-radius: 4px; border: 1px solid #d3adf7">
        <div style="font-size: 11px; color: #722ed1; line-height: 1.6">
          <strong>Drools 语法说明：</strong>
          <code style="background: #f0e6ff; padding: 0 3px; border-radius: 2px; margin: 0 2px">when</code> 块定义匹配条件（LHS），支持
          <code style="background: #f0e6ff; padding: 0 3px; border-radius: 2px; margin: 0 2px">matches</code>正则、
          <code style="background: #f0e6ff; padding: 0 3px; border-radius: 2px; margin: 0 2px">eval()</code>表达式、
          <code style="background: #f0e6ff; padding: 0 3px; border-radius: 2px; margin: 0 2px">not exists</code>否定检查等；
          <code style="background: #f0e6ff; padding: 0 3px; border-radius: 2px; margin: 0 2px">then</code> 块定义触发动作（RHS），支持
          <code style="background: #f0e6ff; padding: 0 3px; border-radius: 2px; margin: 0 2px">insert()</code>、
          <code style="background: #f0e6ff; padding: 0 3px; border-radius: 2px; margin: 0 2px">modify()</code>、
          <code style="background: #f0e6ff; padding: 0 3px; border-radius: 2px; margin: 0 2px">retract()</code> 等工作内存操作。
          <code style="background: #f0e6ff; padding: 0 3px; border-radius: 2px; margin: 0 2px">salience</code> 值越大优先级越高。
        </div>
      </div>
    </div>
    <template #footer>
      <a-button @click="closeDroolsModal">取消</a-button>
      <a-button type="primary" @click="handleDroolsSave">保存规则</a-button>
    </template>
  </a-modal>
</template>

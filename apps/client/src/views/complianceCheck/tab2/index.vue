<script setup lang="ts">
import { message } from 'ant-design-vue'
import {
  PlusOutlined,
  RobotOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  FileSearchOutlined,
} from '@ant-design/icons-vue'
import { CATEGORY_CONFIG, CATEGORY_ORDER } from '../types'
import type { ComplianceCategory, ComplianceItem } from '../types'

const props = defineProps<{
  complianceData: ComplianceItem[]
}>()

const emit = defineEmits<{
  'update:complianceData': [value: ComplianceItem[]]
  regenerate: []
}>()

const editingComplianceKey = ref('')
const expandedComplianceKeys = ref<string[]>([])

function isComplianceEditing(record: ComplianceItem | Record<string, any>): boolean {
  return (record as ComplianceItem).key === editingComplianceKey.value
}

function handleComplianceEdit(record: ComplianceItem | Record<string, any>) {
  editingComplianceKey.value = (record as ComplianceItem).key
}

function getCategoryConfig(cat: string) {
  return CATEGORY_CONFIG[cat as ComplianceCategory]
}

function handleComplianceSave() {
  editingComplianceKey.value = ''
  message.success('检查项已保存')
}

function handleComplianceCancel() {
  editingComplianceKey.value = ''
}

function handleComplianceDelete(key: string) {
  const updated = props.complianceData.filter((item) => item.key !== key)
  emit('update:complianceData', updated)
  message.success('检查项已删除')
}

function handleComplianceFieldChange(key: string, field: keyof ComplianceItem, value: string | number | boolean) {
  const updated = props.complianceData.map((item) => (item.key === key ? { ...item, [field]: value } : item))
  emit('update:complianceData', updated)
}

function handleComplianceRegenerate() {
  emit('regenerate')
}

function handleAddComplianceItem() {
  const newKey = `NEW-${Date.now().toString(36).slice(-4).toUpperCase()}`
  const newItem: ComplianceItem = {
    key: newKey,
    category: 'formal' as ComplianceCategory,
    requirement: '请输入检查项要求',
    aiResponse: '',
    status: 'warning',
    score: 0,
    maxScore: 0,
    isCritical: false,
  }
  emit('update:complianceData', [...props.complianceData, newItem])
  editingComplianceKey.value = newKey
  message.success('已添加新检查项，请编辑内容')
}

function toggleComplianceExpand(key: string) {
  expandedComplianceKeys.value = expandedComplianceKeys.value.includes(key)
    ? expandedComplianceKeys.value.filter((k) => k !== key)
    : [...expandedComplianceKeys.value, key]
}

const complianceColumns = computed(() => [
  { title: '序号', key: 'index', width: 55, fixed: 'left' as const, align: 'center' as const },
  { title: '编号', dataIndex: 'key', key: 'key', width: 70 },
  {
    title: '检查类别',
    dataIndex: 'category',
    key: 'category',
    width: 150,
    filters: CATEGORY_ORDER.map((cat) => ({ text: CATEGORY_CONFIG[cat].label, value: cat })),
    onFilter: (value: string | number | boolean, record: ComplianceItem) => record.category === value,
  },
  { title: '检查项要求', dataIndex: 'requirement', key: 'requirement' },
  {
    title: '满分',
    dataIndex: 'maxScore',
    key: 'maxScore',
    width: 80,
    align: 'center' as const,
    sorter: (a: ComplianceItem, b: ComplianceItem) => a.maxScore - b.maxScore,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 110,
    filters: [
      { text: '通过', value: 'pass' },
      { text: '需人工复核', value: 'warning' },
      { text: '存在风险', value: 'fail' },
    ],
    onFilter: (value: string | number | boolean, record: ComplianceItem) => record.status === value,
  },
  {
    title: '一票否决',
    dataIndex: 'isCritical',
    key: 'isCritical',
    width: 90,
    align: 'center' as const,
    filters: [
      { text: '是', value: true },
      { text: '否', value: false },
    ],
    onFilter: (value: string | number | boolean, record: ComplianceItem) => (record.isCritical || false) === value,
  },
  { title: '操作', key: 'action', width: 130, fixed: 'right' as const },
])
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px">
    <a-row :gutter="[16, 16]" style="flex-shrink: 0">
      <a-col v-for="cat in CATEGORY_ORDER" :key="cat" :xs="24" :lg="6">
        <a-card>
          <a-statistic
            :title="CATEGORY_CONFIG[cat].label"
            :value="complianceData.filter((d) => d.category === cat).length"
            suffix="项"
            :value-style="{ color: CATEGORY_CONFIG[cat].color }"
          />
        </a-card>
      </a-col>
    </a-row>

    <a-card title="合规检查项总表" size="small">
      <template #extra>
        <a-space>
          <a-button type="primary" size="small" @click="handleAddComplianceItem"
            ><template #icon><PlusOutlined /></template>新增检查项</a-button
          >
          <a-button size="small" @click="handleComplianceRegenerate"
            ><template #icon><RobotOutlined /></template>AI 重新生成</a-button
          >
        </a-space>
      </template>
      <a-table
        :columns="complianceColumns"
        :data-source="complianceData"
        row-key="key"
        :pagination="{ pageSize: 10, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 项` }"
        size="small"
        :scroll="{ x: 1000 }"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'index'">
            <span style="font-size: 11px; color: #8c8c8c; font-family: monospace">{{ index + 1 }}</span>
          </template>
          <template v-if="column.key === 'key'">
            <span style="font-size: 11px; color: #8c8c8c; font-family: monospace">{{ record.key }}</span>
          </template>
          <template v-if="column.key === 'category'">
            <a-select
              v-if="isComplianceEditing(record)"
              :value="record.category"
              size="small"
              style="width: 100%"
              @change="(value: any) => handleComplianceFieldChange(record.key, 'category', value)"
            >
              <a-select-option v-for="c in CATEGORY_ORDER" :key="c" :value="c">{{ CATEGORY_CONFIG[c].label }}</a-select-option>
            </a-select>
            <a-tag
              v-else
              :style="{
                margin: 0,
                fontSize: 11,
                color: getCategoryConfig(record.category).color,
                background: getCategoryConfig(record.category).bgColor,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: getCategoryConfig(record.category).borderColor,
              }"
            >
              {{ getCategoryConfig(record.category).label }}
            </a-tag>
          </template>
          <template v-if="column.key === 'requirement'">
            <a-textarea
              v-if="isComplianceEditing(record)"
              :value="record.requirement"
              size="small"
              :auto-size="{ minRows: 2, maxRows: 6 }"
              @change="(e: Event) => handleComplianceFieldChange(record.key, 'requirement', (e.target as HTMLTextAreaElement).value)"
            />
            <template v-else>
              <div
                :style="{
                  cursor: record.requirement.length > 40 ? 'pointer' : 'default',
                  maxHeight: expandedComplianceKeys.includes(record.key) ? '200px' : '44px',
                  overflow: expandedComplianceKeys.includes(record.key) ? 'auto' : 'hidden',
                  textOverflow: expandedComplianceKeys.includes(record.key) ? 'initial' : 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: expandedComplianceKeys.includes(record.key) ? 'unset' : 2,
                  WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word',
                  transition: 'all 0.3s ease',
                  fontSize: 12,
                }"
                @click="record.requirement.length > 40 && toggleComplianceExpand(record.key)"
              >
                {{ record.requirement }}
                <span v-if="record.requirement.length > 40 && !expandedComplianceKeys.includes(record.key)" style="color: #1890ff"> ...展开</span>
                <span v-if="record.requirement.length > 40 && expandedComplianceKeys.includes(record.key)" style="color: #1890ff"> 收起</span>
              </div>
            </template>
          </template>
          <template v-if="column.key === 'maxScore'">
            <a-input
              v-if="isComplianceEditing(record)"
              :value="record.maxScore"
              size="small"
              type="number"
              style="width: 60px"
              @change="(e: Event) => handleComplianceFieldChange(record.key, 'maxScore', Number((e.target as HTMLInputElement).value))"
            />
            <span v-else style="font-weight: 600; color: #1890ff">{{ record.maxScore }}</span>
          </template>
          <template v-if="column.key === 'status'">
            <a-select
              v-if="isComplianceEditing(record)"
              :value="record.status"
              size="small"
              style="width: 100%"
              @change="(value: any) => handleComplianceFieldChange(record.key, 'status', value)"
            >
              <a-select-option value="pass">通过</a-select-option>
              <a-select-option value="warning">需人工复核</a-select-option>
              <a-select-option value="fail">存在风险</a-select-option>
            </a-select>
            <a-tag v-else-if="record.status === 'pass'" color="success" style="margin: 0"
              ><template #icon><CheckCircleOutlined /></template>通过</a-tag
            >
            <a-tag v-else-if="record.status === 'warning'" color="warning" style="margin: 0"
              ><template #icon><ExclamationCircleOutlined /></template>需复核</a-tag
            >
            <a-tag v-else color="error" style="margin: 0"
              ><template #icon><CloseCircleOutlined /></template>风险</a-tag
            >
          </template>
          <template v-if="column.key === 'isCritical'">
            <a-select
              v-if="isComplianceEditing(record)"
              :value="record.isCritical || false"
              size="small"
              style="width: 100%"
              @change="(value: any) => handleComplianceFieldChange(record.key, 'isCritical', value)"
            >
              <a-select-option :value="true">是</a-select-option>
              <a-select-option :value="false">否</a-select-option>
            </a-select>
            <template v-else>
              <a-tag v-if="record.isCritical" color="error" style="margin: 0; font-size: 10px">一票否决</a-tag>
              <span v-else style="color: #bfbfbf; font-size: 11px">&mdash;</span>
            </template>
          </template>
          <template v-if="column.key === 'action'">
            <template v-if="isComplianceEditing(record)">
              <a-space :size="4">
                <a-button type="link" size="small" @click="handleComplianceSave">保存</a-button>
                <a-button type="link" size="small" @click="handleComplianceCancel">取消</a-button>
              </a-space>
            </template>
            <template v-else>
              <a-space :size="4">
                <a-button type="link" size="small" @click="handleComplianceEdit(record)"
                  ><template #icon><EditOutlined /></template>编辑</a-button
                >
                <a-popconfirm title="确定删除此项？" @confirm="handleComplianceDelete(record.key)">
                  <a-button type="link" size="small" danger
                    ><template #icon><DeleteOutlined /></template
                  ></a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </template>
      </a-table>
      <a-divider style="margin: 12px 0" />
      <div style="color: #666; font-size: 13px">
        提示：红色「一票否决」标记的检查项为形式合规强制项，必须100%满足，否则直接废标。点击「编辑」可手动修改，点击「AI 重新生成」可重新解析。
      </div>
    </a-card>
  </div>
</template>

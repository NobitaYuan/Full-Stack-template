# Tab 内容抽离实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 complianceCheck/index.vue 四个 tab 的模板和状态抽离到 tab1-4/index.vue 子组件。

**Architecture:** Props + Emit 模式。父组件保留共享数据源（complianceData、currentProject、REVIEW_TASKS），通过 props 下发，子 tab 通过 emit 通知更新。模态框跟着功能归属走。

**Tech Stack:** Vue 3 Composition API (`<script setup lang="ts">`), defineProps/defineEmits

---

## 文件变更清单

| 文件 | 操作 | 职责 |
|------|------|------|
| `complianceCheck/tab1/index.vue` | 重写 | 文档上传（自包含，含 OCR/索引模态框） |
| `complianceCheck/tab2/index.vue` | 重写 | 检查项解析表格 |
| `complianceCheck/tab3/index.vue` | 重写 | 合规检查面板（含 Drools 模态框） |
| `complianceCheck/tab4/index.vue` | 重写 | 报告生成（含雷达图） |
| `complianceCheck/index.vue` | 大幅精简 | 步骤条 + tabs 外壳 + 共享状态 |

---

## Task 1: Tab 1 — 文档上传

**Files:**
- Rewrite: `apps/client/src/views/complianceCheck/tab1/index.vue`

**Props 接口:** 无（完全自包含）

**从父组件 index.vue 提取的内容:**

Script 部分:
- 状态: `bidFiles`, `responseFiles`, `checklistFiles`, `knowledgeFiles`, `indexViewVisible`, `currentIndexFile`, `filePreviewVisible`, `currentPreviewFile`
- 工具函数: `formatFileSize`
- 上传处理: `addUploadedFile`, `bidUploadProps`, `responseUploadProps`, `checklistUploadProps`, `knowledgeUploadBeforeUpload`
- OCR 方法: `triggerOCR`, `onBidOCR`, `onBidOCRAll`, `onBidDelete`, `onResponseOCR`, `onResponseOCRAll`, `onResponseDelete`, `triggerKnowledgeOCR`, `triggerIndexBuild`, `handleBatchKnowledgeOCR`, `handleBatchIndexBuild`, `handleDeleteKnowledgeFile`, `removeUploadedFile`
- 导入: 所有文件上传相关的类型和常量 (`UploadedFile`, `KnowledgeFile`, `OcrStatus`, `IndexStatus`, `MOCK_BID_FILES`, `MOCK_RESPONSE_FILES`, `MOCK_CHECKLIST_FILES`, `MOCK_KNOWLEDGE_FILES`, `OCR_STATUS_CONFIG`, `INDEX_STATUS_CONFIG`, `FILE_TYPE_ICONS`, `FILE_TYPE_ICON_COLORS`)
- 图标: `FileTextOutlined, ScanOutlined, DeleteOutlined, FileSearchOutlined, DatabaseOutlined, BookOutlined, RocketOutlined, UploadOutlined, SafetyCertificateOutlined`

Template 部分:
- 原文件 L960-L1117: `<a-row>` 内的三个 `<a-col>`（招标文件、投标响应文件、知识库文件）
- 原文件 L1824-L1875: 知识库索引查看 Modal + 文件预览 Modal

- [ ] **Step 1: 创建 tab1/index.vue**

```vue
<script setup lang="ts">
import { message, Modal } from 'ant-design-vue'
import type { UploadProps } from 'ant-design-vue'
import {
  FileTextOutlined,
  SafetyCertificateOutlined,
  ScanOutlined,
  DeleteOutlined,
  FileSearchOutlined,
  DatabaseOutlined,
  BookOutlined,
  RocketOutlined,
} from '@ant-design/icons-vue'
import {
  MOCK_BID_FILES,
  MOCK_RESPONSE_FILES,
  MOCK_CHECKLIST_FILES,
  MOCK_KNOWLEDGE_FILES,
  OCR_STATUS_CONFIG,
  INDEX_STATUS_CONFIG,
  FILE_TYPE_ICONS,
  FILE_TYPE_ICON_COLORS,
} from '../types'
import type { OcrStatus, UploadedFile, IndexStatus, KnowledgeFile } from '../types'

/* =================== 工具函数 =================== */

function formatFileSize(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2)
}

/* =================== 状态 =================== */

const bidFiles = ref<UploadedFile[]>([...MOCK_BID_FILES])
const responseFiles = ref<UploadedFile[]>([...MOCK_RESPONSE_FILES])
const checklistFiles = ref<UploadedFile[]>([...MOCK_CHECKLIST_FILES])
const knowledgeFiles = ref<KnowledgeFile[]>([...MOCK_KNOWLEDGE_FILES])
const indexViewVisible = ref(false)
const currentIndexFile = ref<KnowledgeFile | null>(null)
const filePreviewVisible = ref(false)
const currentPreviewFile = ref<KnowledgeFile | null>(null)

/* =================== 文档上传处理 =================== */

function addUploadedFile(fileList: Ref<UploadedFile[]>, file: File, fileType: UploadedFile['type']) {
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  let type: UploadedFile['type'] = fileType
  if (['pdf'].includes(ext)) type = 'pdf'
  else if (['doc', 'docx'].includes(ext)) type = 'word'
  else if (['xls', 'xlsx'].includes(ext)) type = 'excel'
  else if (['jpg', 'jpeg', 'png', 'bmp', 'tiff'].includes(ext)) type = 'image'

  const newFile: UploadedFile = {
    key: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    size: file.size,
    type,
    uploadTime: new Date()
      .toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .replace(/\//g, '-'),
    ocrStatus: 'completed',
    ocrProgress: 100,
  }
  fileList.value = [...fileList.value, newFile]
}

const bidUploadProps: UploadProps['beforeUpload'] = (file) => {
  addUploadedFile(bidFiles, file as File, 'pdf')
  return false
}

const responseUploadProps: UploadProps['beforeUpload'] = (file) => {
  addUploadedFile(responseFiles, file as File, 'pdf')
  return false
}

const checklistUploadProps: UploadProps['beforeUpload'] = (file) => {
  addUploadedFile(checklistFiles, file as File, 'word')
  return false
}

const knowledgeUploadBeforeUpload: UploadProps['beforeUpload'] = (file) => {
  const raw = file as File
  const ext = raw.name.split('.').pop()?.toLowerCase() || ''
  let type: UploadedFile['type'] = 'pdf'
  if (['pdf'].includes(ext)) type = 'pdf'
  else if (['doc', 'docx'].includes(ext)) type = 'word'
  else if (['xls', 'xlsx'].includes(ext)) type = 'excel'
  else if (['jpg', 'jpeg', 'png', 'bmp', 'tiff'].includes(ext)) type = 'image'

  const newFile: KnowledgeFile = {
    key: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: raw.name,
    size: raw.size,
    type,
    uploadTime: new Date()
      .toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .replace(/\//g, '-'),
    ocrStatus: 'pending',
    ocrProgress: 0,
    indexStatus: 'pending',
    indexProgress: 0,
  }
  knowledgeFiles.value = [...knowledgeFiles.value, newFile]
  setTimeout(() => triggerKnowledgeOCR(newFile), 300)
  return false
}

/* =================== OCR / 索引方法 =================== */

function triggerOCR(file: UploadedFile, fileList: Ref<UploadedFile[]>) {
  fileList.value = fileList.value.map((f) => (f.key === file.key ? { ...f, ocrStatus: 'processing' as OcrStatus, ocrProgress: 0 } : f))
  let progress = 0
  const timer = setInterval(() => {
    progress += Math.random() * 30
    if (progress >= 100) {
      progress = 100
      clearInterval(timer)
      fileList.value = fileList.value.map((f) => (f.key === file.key ? { ...f, ocrStatus: 'completed' as OcrStatus, ocrProgress: 100 } : f))
    } else {
      fileList.value = fileList.value.map((f) => (f.key === file.key ? { ...f, ocrProgress: Math.round(progress) } : f))
    }
  }, 500)
}

function onBidOCR(file: UploadedFile) { triggerOCR(file, bidFiles) }
function onBidOCRAll() { bidFiles.value.forEach((f) => triggerOCR(f, bidFiles)) }
function onBidDelete(key: string) { bidFiles.value = bidFiles.value.filter((f) => f.key !== key) }
function onResponseOCR(file: UploadedFile) { triggerOCR(file, responseFiles) }
function onResponseOCRAll() { responseFiles.value.forEach((f) => triggerOCR(f, responseFiles)) }
function onResponseDelete(key: string) { responseFiles.value = responseFiles.value.filter((f) => f.key !== key) }

function triggerKnowledgeOCR(file: KnowledgeFile | UploadedFile) {
  knowledgeFiles.value = knowledgeFiles.value.map((f) =>
    f.key === file.key ? { ...f, ocrStatus: 'processing' as OcrStatus, ocrProgress: 0 } : f,
  )
  let progress = 0
  const timer = setInterval(() => {
    progress += Math.random() * 25
    if (progress >= 100) {
      progress = 100
      clearInterval(timer)
      knowledgeFiles.value = knowledgeFiles.value.map((f) =>
        f.key === file.key ? { ...f, ocrStatus: 'completed' as OcrStatus, ocrProgress: 100 } : f,
      )
      message.success(`${file.name} OCR识别完成`)
    } else {
      knowledgeFiles.value = knowledgeFiles.value.map((f) => (f.key === file.key ? { ...f, ocrProgress: Math.round(progress) } : f))
    }
  }, 500)
}

function triggerIndexBuild(file: KnowledgeFile) {
  knowledgeFiles.value = knowledgeFiles.value.map((f) => (f.key === file.key ? { ...f, indexStatus: 'processing' as IndexStatus, indexProgress: 0 } : f))
  let progress = 0
  const timer = setInterval(() => {
    progress += Math.random() * 20
    if (progress >= 100) {
      progress = 100
      clearInterval(timer)
      knowledgeFiles.value = knowledgeFiles.value.map((f) =>
        f.key === file.key
          ? {
              ...f,
              indexStatus: 'completed' as IndexStatus,
              indexProgress: 100,
              indexChunks: [
                { id: `chunk-${file.key}-1`, content: '合规检查规则：投标文件需包含法人授权委托书原件，签署日期不得晚于投标截止日。', metadata: '来源：第1页 | 类别：形式合规 | 向量维度：1536' },
                { id: `chunk-${file.key}-2`, content: '技术方案需明确列出性能指标参数，并与招标文件要求逐项对应，偏差需标注说明。', metadata: '来源：第3页 | 类别：内容逻辑 | 向量维度：1536' },
                { id: `chunk-${file.key}-3`, content: '敏感信息排查：检查投标文件中是否包含未脱敏的个人身份信息、银行账号、内部项目编号等。', metadata: '来源：第5页 | 类别：敏感排查 | 向量维度：1536' },
              ],
            }
          : f,
      )
      message.success(`${file.name} 索引构建完成`)
    } else {
      knowledgeFiles.value = knowledgeFiles.value.map((f) => (f.key === file.key ? { ...f, indexProgress: Math.round(progress) } : f))
    }
  }, 600)
}

function handleBatchKnowledgeOCR() {
  message.info(`正在对 ${knowledgeFiles.value.length} 个知识库文件重新进行OCR识别...`)
  knowledgeFiles.value.forEach((file) => { triggerKnowledgeOCR(file) })
}

function handleBatchIndexBuild() {
  const eligible = knowledgeFiles.value.filter((f) => f.ocrStatus === 'completed')
  if (eligible.length === 0) { message.warning('没有可构建索引的文件，请先完成OCR识别'); return }
  message.info(`正在对 ${eligible.length} 个文件重构索引...`)
  eligible.forEach((file) => { triggerIndexBuild(file) })
}

function handleDeleteKnowledgeFile(fileKey: string) {
  Modal.confirm({
    title: '确认删除',
    content: '删除后将同时清除该文件的OCR结果和索引数据，是否继续？',
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => {
      knowledgeFiles.value = knowledgeFiles.value.filter((f) => f.key !== fileKey)
      message.success('文件已删除')
    },
  })
}
</script>

<template>
  <!-- 从原文件 L960-L1117 复制三个上传区域模板 -->
  <!-- 招标文件 / 投标响应文件 / 知识库文件 上传区域 -->
  <a-row :gutter="[16, 16]">
    <a-col :xs="24" :lg="12">
      <a-card>
        <template #title><FileTextOutlined /> 招标文件</template>
        <template #extra>
          <a-button v-if="bidFiles.length > 0" type="primary" @click="onBidOCRAll()">
            <template #icon><ScanOutlined /></template>全部重新识别
          </a-button>
        </template>
        <a-upload-dragger :show-upload-list="false" :multiple="true" :before-upload="bidUploadProps">
          <p class="ant-upload-drag-icon"><FileTextOutlined style="font-size: 48px; color: #1890ff" /></p>
          <p class="ant-upload-text">点击或拖拽上传招标文件</p>
          <p class="ant-upload-hint">支持 PDF / Word / 图片（自动OCR识别）</p>
        </a-upload-dragger>
        <template v-if="bidFiles.length > 0">
          <a-divider />
          <div v-for="file in bidFiles" :key="file.key" style="display: flex; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid #f0f0f0">
            <div style="margin-right: 12px; font-size: 20px; margin-top: 2px; color: #999">
              <component :is="FILE_TYPE_ICONS[file.type]" :style="{ color: FILE_TYPE_ICON_COLORS[file.type] }" />
            </div>
            <div style="flex: 1; min-width: 0">
              <div style="margin-bottom: 8px"><a-space><span>{{ file.name }}</span><a-tag :color="OCR_STATUS_CONFIG[file.ocrStatus].color">{{ OCR_STATUS_CONFIG[file.ocrStatus].text }}</a-tag></a-space></div>
              <div style="font-size: 12px; color: #999; margin-bottom: 4px">{{ file.uploadTime }} . {{ formatFileSize(file.size) }} MB</div>
              <a-progress v-if="file.ocrStatus === 'processing'" :percent="file.ocrProgress" size="small" status="active" />
            </div>
            <div style="margin-left: 12px">
              <a-space :size="4">
                <a-button type="link" size="small"><template #icon><FileSearchOutlined /></template>查看详情</a-button>
                <a-button type="link" size="small" :disabled="file.ocrStatus === 'processing'" @click="onBidOCR(file)"><template #icon><ScanOutlined /></template>重新识别</a-button>
                <a-button type="link" size="small" danger @click="onBidDelete(file.key)"><template #icon><DeleteOutlined /></template>删除</a-button>
              </a-space>
            </div>
          </div>
        </template>
      </a-card>
    </a-col>

    <a-col :xs="24" :lg="12">
      <a-card>
        <template #title><SafetyCertificateOutlined /> 投标响应文件</template>
        <template #extra>
          <a-button v-if="responseFiles.length > 0" type="primary" @click="onResponseOCRAll()">
            <template #icon><ScanOutlined /></template>全部重新识别
          </a-button>
        </template>
        <a-upload-dragger :show-upload-list="false" :multiple="true" :before-upload="responseUploadProps">
          <p class="ant-upload-drag-icon"><SafetyCertificateOutlined style="font-size: 48px; color: #52c41a" /></p>
          <p class="ant-upload-text">点击或拖拽上传投标响应文件</p>
          <p class="ant-upload-hint">支持 PDF / Word / Excel / 图片（自动OCR识别）</p>
        </a-upload-dragger>
        <template v-if="responseFiles.length > 0">
          <a-divider />
          <div v-for="file in responseFiles" :key="file.key" style="display: flex; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid #f0f0f0">
            <div style="margin-right: 12px; font-size: 20px; margin-top: 2px">
              <component :is="FILE_TYPE_ICONS[file.type]" :style="{ color: FILE_TYPE_ICON_COLORS[file.type] }" />
            </div>
            <div style="flex: 1; min-width: 0">
              <div style="margin-bottom: 8px"><a-space><span>{{ file.name }}</span><a-tag :color="OCR_STATUS_CONFIG[file.ocrStatus].color">{{ OCR_STATUS_CONFIG[file.ocrStatus].text }}</a-tag></a-space></div>
              <div style="font-size: 12px; color: #999; margin-bottom: 4px">{{ file.uploadTime }} . {{ formatFileSize(file.size) }} MB</div>
              <a-progress v-if="file.ocrStatus === 'processing'" :percent="file.ocrProgress" size="small" status="active" />
            </div>
            <div style="margin-left: 12px">
              <a-space :size="4">
                <a-button type="link" size="small"><template #icon><FileSearchOutlined /></template>查看详情</a-button>
                <a-button type="link" size="small" :disabled="file.ocrStatus === 'processing'" @click="onResponseOCR(file)"><template #icon><ScanOutlined /></template>重新识别</a-button>
                <a-button type="link" size="small" danger @click="onResponseDelete(file.key)"><template #icon><DeleteOutlined /></template>删除</a-button>
              </a-space>
            </div>
          </div>
        </template>
      </a-card>
    </a-col>

    <a-col :xs="24">
      <a-card>
        <template #title><DatabaseOutlined /> 知识库文件 (RAG/OAG)</template>
        <template #extra>
          <a-space v-if="knowledgeFiles.length > 0">
            <a-button type="primary" @click="handleBatchKnowledgeOCR"><template #icon><ScanOutlined /></template>全部重新识别</a-button>
            <a-button type="primary" @click="handleBatchIndexBuild"><template #icon><RocketOutlined /></template>全部重构索引</a-button>
          </a-space>
        </template>
        <a-upload-dragger :show-upload-list="false" :multiple="true" :before-upload="knowledgeUploadBeforeUpload">
          <p class="ant-upload-drag-icon"><DatabaseOutlined style="font-size: 48px; color: #722ed1" /></p>
          <p class="ant-upload-text">点击或拖拽上传知识库文件</p>
          <p class="ant-upload-hint">支持 Markdown / Word / Excel / PDF / 图片（自动OCR识别）</p>
        </a-upload-dragger>
        <template v-if="knowledgeFiles.length > 0">
          <a-divider />
          <div v-for="file in knowledgeFiles" :key="file.key" style="display: flex; align-items: flex-start; padding: 12px 0; border-bottom: 1px solid #f0f0f0">
            <div style="margin-right: 12px; font-size: 20px; margin-top: 2px">
              <component :is="FILE_TYPE_ICONS[file.type]" :style="{ color: FILE_TYPE_ICON_COLORS[file.type] }" />
            </div>
            <div style="flex: 1; min-width: 0">
              <div style="margin-bottom: 8px">
                <a-space>
                  <span>{{ file.name }}</span>
                  <a-tag :color="OCR_STATUS_CONFIG[file.ocrStatus].color">OCR: {{ OCR_STATUS_CONFIG[file.ocrStatus].text }}</a-tag>
                  <a-tag v-if="file.ocrStatus === 'completed'" :color="INDEX_STATUS_CONFIG[file.indexStatus].color">索引: {{ INDEX_STATUS_CONFIG[file.indexStatus].text }}</a-tag>
                  <a-badge v-if="file.indexStatus === 'completed' && file.indexChunks" :count="file.indexChunks.length" :style="{ backgroundColor: '#722ed1' }" title="知识块数量" />
                </a-space>
              </div>
              <div style="font-size: 12px; color: #999; margin-bottom: 4px">{{ file.uploadTime }} . {{ formatFileSize(file.size) }} MB</div>
              <div v-if="file.ocrStatus === 'processing'" style="margin-bottom: 4px">
                <div style="font-size: 12px; color: #999; margin-bottom: 2px">OCR识别进度:</div>
                <a-progress :percent="file.ocrProgress" size="small" status="active" />
              </div>
              <div v-if="file.indexStatus === 'processing'" style="margin-bottom: 4px">
                <div style="font-size: 12px; color: #999; margin-bottom: 2px">索引构建进度:</div>
                <a-progress :percent="file.indexProgress" size="small" status="active" stroke-color="#722ed1" />
              </div>
            </div>
            <div style="margin-left: 12px">
              <a-space :size="4" direction="vertical">
                <a-space :size="4">
                  <a-button type="link" size="small" @click="currentPreviewFile = file; filePreviewVisible = true"><template #icon><FileSearchOutlined /></template>查看详情</a-button>
                  <a-button type="link" size="small" :disabled="file.ocrStatus === 'processing'" @click="triggerKnowledgeOCR(file)"><template #icon><ScanOutlined /></template>重新识别</a-button>
                </a-space>
                <a-space :size="4">
                  <a-button type="link" size="small" :disabled="file.ocrStatus !== 'completed' || file.indexStatus === 'processing'" @click="triggerIndexBuild(file)"><template #icon><RocketOutlined /></template>重构索引</a-button>
                  <a-button v-if="file.indexStatus === 'completed' && file.indexChunks" type="link" size="small" @click="currentIndexFile = file; indexViewVisible = true"><template #icon><BookOutlined /></template>查看索引</a-button>
                  <a-button type="link" size="small" danger @click="handleDeleteKnowledgeFile(file.key)">删除</a-button>
                </a-space>
              </a-space>
            </div>
          </div>
        </template>
        <a-divider />
        <div style="color: #666; font-size: 13px">提示：知识库文件将自动进行OCR识别并构建RAG/OAG索引，用于提升合规检查的准确性和规则匹配能力</div>
      </a-card>
    </a-col>
  </a-row>

  <!-- 知识库索引查看 Modal -->
  <a-modal :open="indexViewVisible" :footer="null" width="720" @cancel="indexViewVisible = false">
    <template #title>
      <a-space><BookOutlined style="color: #722ed1" /> 索引知识块 - {{ currentIndexFile?.name }}</a-space>
    </template>
    <template v-if="currentIndexFile?.indexChunks?.length">
      <a-card v-for="(chunk, idx) in currentIndexFile.indexChunks" :key="chunk.id" size="small" style="margin-bottom: 12px">
        <template #title>
          <a-space>
            <a-tag color="purple" style="margin: 0">Chunk #{{ idx + 1 }}</a-tag>
            <span style="font-size: 12px; color: #999">{{ chunk.id }}</span>
          </a-space>
        </template>
        <div style="font-size: 13px; line-height: 1.8; margin-bottom: 8px">{{ chunk.content }}</div>
        <div style="font-size: 11px; color: #999; padding: 4px 8px; background: #fafafa; border-radius: 4px; border: 1px solid #f0f0f0">{{ chunk.metadata }}</div>
      </a-card>
    </template>
    <div v-else style="text-align: center; padding: 24px 0; color: #999">暂无索引数据</div>
  </a-modal>

  <!-- 知识库文件预览 Modal -->
  <a-modal :open="filePreviewVisible" :footer="null" width="640" @cancel="filePreviewVisible = false">
    <template #title>
      <a-space><FileSearchOutlined /> 文件详情 - {{ currentPreviewFile?.name }}</a-space>
    </template>
    <template v-if="currentPreviewFile">
      <div>
        <a-row :gutter="[16, 12]">
          <a-col :span="12">
            <div style="font-size: 12px; color: #999">文件名</div>
            <div style="font-size: 13px; font-weight: 500">{{ currentPreviewFile.name }}</div>
          </a-col>
          <a-col :span="12">
            <div style="font-size: 12px; color: #999">文件大小</div>
            <div style="font-size: 13px">{{ formatFileSize(currentPreviewFile.size) }} MB</div>
          </a-col>
          <a-col :span="12">
            <div style="font-size: 12px; color: #999">上传时间</div>
            <div style="font-size: 13px">{{ currentPreviewFile.uploadTime }}</div>
          </a-col>
          <a-col :span="12">
            <div style="font-size: 12px; color: #999">OCR状态</div>
            <a-tag :color="OCR_STATUS_CONFIG[currentPreviewFile.ocrStatus].color">{{ OCR_STATUS_CONFIG[currentPreviewFile.ocrStatus].text }}</a-tag>
          </a-col>
        </a-row>
        <a-divider />
        <div style="padding: 16px; background: #fafafa; border-radius: 6px; border: 1px solid #f0f0f0; font-size: 13px; line-height: 1.8; color: #333; max-height: 400px; overflow: auto">
          该文件包含合规检查相关知识数据，OCR识别后可用于构建RAG/OAG索引，增强合规审查Agent的检查精度与召回率。
        </div>
      </div>
    </template>
  </a-modal>
</template>
```

- [ ] **Step 2: 验证 tab1 编译**

Run: `cd d:/coding/bidReviewr && pnpm --filter @repo/client exec vue-tsc --noEmit 2>&1 | head -20`
Expected: 编译通过（tab1 不依赖外部 props，独立可用）

---

## Task 2: Tab 2 — 检查项解析

**Files:**
- Rewrite: `apps/client/src/views/complianceCheck/tab2/index.vue`

**Props 接口:**

```typescript
const props = defineProps<{
  complianceData: ComplianceItem[]
}>()

const emit = defineEmits<{
  'update:complianceData': [value: ComplianceItem[]]
  regenerate: []
}>()
```

**从父组件提取的内容:**

Script 部分:
- 状态: `editingComplianceKey`, `expandedComplianceKeys`
- 列定义: `complianceColumns` (computed)
- 方法: `isComplianceEditing`, `handleComplianceEdit`, `getCategoryConfig`, `handleComplianceSave`, `handleComplianceCancel`, `handleComplianceDelete`, `handleComplianceFieldChange`, `handleComplianceRegenerate`, `handleAddComplianceItem`
- 图标: `PlusOutlined, RobotOutlined, EditOutlined, CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, DeleteOutlined, FileSearchOutlined`
- 导入类型: `ComplianceItem`, `ComplianceCategory`, `CATEGORY_CONFIG`, `CATEGORY_ORDER`

Template 部分:
- 原文件 L1123-L1231: 分类统计卡片 + 合规检查项总表

- [ ] **Step 1: 创建 tab2/index.vue**

```vue
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

/* =================== 状态 =================== */

const editingComplianceKey = ref('')
const expandedComplianceKeys = ref<string[]>([])

/* =================== 方法 =================== */

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
  const newItem: ComplianceItem = { key: newKey, category: 'formal' as ComplianceCategory, requirement: '请输入检查项要求', aiResponse: '', status: 'warning', score: 0, maxScore: 0, isCritical: false }
  emit('update:complianceData', [...props.complianceData, newItem])
  editingComplianceKey.value = newKey
  message.success('已添加新检查项，请编辑内容')
}

/* =================== 表格列定义 =================== */

const complianceColumns = computed(() => [
  { title: '序号', key: 'index', width: 55, fixed: 'left' as const, align: 'center' as const },
  { title: '编号', dataIndex: 'key', key: 'key', width: 70 },
  {
    title: '检查类别', dataIndex: 'category', key: 'category', width: 150,
    filters: CATEGORY_ORDER.map((cat) => ({ text: CATEGORY_CONFIG[cat].label, value: cat })),
    onFilter: (value: string | number | boolean, record: ComplianceItem) => record.category === value,
  },
  { title: '检查项要求', dataIndex: 'requirement', key: 'requirement' },
  { title: '满分', dataIndex: 'maxScore', key: 'maxScore', width: 80, align: 'center' as const, sorter: (a: ComplianceItem, b: ComplianceItem) => a.maxScore - b.maxScore },
  {
    title: '状态', dataIndex: 'status', key: 'status', width: 110,
    filters: [{ text: '通过', value: 'pass' }, { text: '需人工复核', value: 'warning' }, { text: '存在风险', value: 'fail' }],
    onFilter: (value: string | number | boolean, record: ComplianceItem) => record.status === value,
  },
  {
    title: '一票否决', dataIndex: 'isCritical', key: 'isCritical', width: 90, align: 'center' as const,
    filters: [{ text: '是', value: true }, { text: '否', value: false }],
    onFilter: (value: string | number | boolean, record: ComplianceItem) => (record.isCritical || false) === value,
  },
  { title: '操作', key: 'action', width: 130, fixed: 'right' as const },
])
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 16px">
    <!-- 分类统计卡片 -->
    <a-row :gutter="[16, 16]" style="flex-shrink: 0">
      <a-col v-for="cat in CATEGORY_ORDER" :key="cat" :xs="24" :lg="6">
        <a-card>
          <a-statistic :title="CATEGORY_CONFIG[cat].label" :value="complianceData.filter((d) => d.category === cat).length" suffix="项" :value-style="{ color: CATEGORY_CONFIG[cat].color }" />
        </a-card>
      </a-col>
    </a-row>

    <!-- 合规检查项总表 -->
    <a-card title="合规检查项总表" size="small">
      <template #extra>
        <a-space>
          <a-button type="primary" size="small" @click="handleAddComplianceItem">
            <template #icon><PlusOutlined /></template>新增检查项
          </a-button>
          <a-button size="small" @click="handleComplianceRegenerate"><template #icon><RobotOutlined /></template>AI 重新生成</a-button>
        </a-space>
      </template>
      <a-table :columns="complianceColumns" :data-source="complianceData" row-key="key" :pagination="{ pageSize: 10, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 项` }" size="small" :scroll="{ x: 1000 }">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'index'">
            <span style="font-size: 11px; color: #8c8c8c; font-family: monospace">{{ index + 1 }}</span>
          </template>
          <template v-if="column.key === 'key'">
            <span style="font-size: 11px; color: #8c8c8c; font-family: monospace">{{ record.key }}</span>
          </template>
          <template v-if="column.key === 'category'">
            <a-select v-if="isComplianceEditing(record)" :value="record.category" size="small" style="width: 100%" @change="(value: any) => handleComplianceFieldChange(record.key, 'category', value)">
              <a-select-option v-for="c in CATEGORY_ORDER" :key="c" :value="c">{{ CATEGORY_CONFIG[c].label }}</a-select-option>
            </a-select>
            <a-tag v-else :style="{ margin: 0, fontSize: 11, color: getCategoryConfig(record.category).color, background: getCategoryConfig(record.category).bgColor, borderWidth: 1, borderStyle: 'solid', borderColor: getCategoryConfig(record.category).borderColor }">
              {{ getCategoryConfig(record.category).label }}
            </a-tag>
          </template>
          <template v-if="column.key === 'requirement'">
            <a-textarea v-if="isComplianceEditing(record)" :value="record.requirement" size="small" :auto-size="{ minRows: 2, maxRows: 6 }" @change="(e: Event) => handleComplianceFieldChange(record.key, 'requirement', (e.target as HTMLTextAreaElement).value)" />
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
                @click="record.requirement.length > 40 && (expandedComplianceKeys = expandedComplianceKeys.includes(record.key) ? expandedComplianceKeys.filter((k) => k !== record.key) : [...expandedComplianceKeys, record.key])"
              >
                {{ record.requirement }}
                <span v-if="record.requirement.length > 40 && !expandedComplianceKeys.includes(record.key)" style="color: #1890ff"> ...展开</span>
                <span v-if="record.requirement.length > 40 && expandedComplianceKeys.includes(record.key)" style="color: #1890ff"> 收起</span>
              </div>
            </template>
          </template>
          <template v-if="column.key === 'maxScore'">
            <a-input v-if="isComplianceEditing(record)" :value="record.maxScore" size="small" type="number" style="width: 60px" @change="(e: Event) => handleComplianceFieldChange(record.key, 'maxScore', Number((e.target as HTMLInputElement).value))" />
            <span v-else style="font-weight: 600; color: #1890ff">{{ record.maxScore }}</span>
          </template>
          <template v-if="column.key === 'status'">
            <a-select v-if="isComplianceEditing(record)" :value="record.status" size="small" style="width: 100%" @change="(value: any) => handleComplianceFieldChange(record.key, 'status', value)">
              <a-select-option value="pass">通过</a-select-option>
              <a-select-option value="warning">需人工复核</a-select-option>
              <a-select-option value="fail">存在风险</a-select-option>
            </a-select>
            <a-tag v-else-if="record.status === 'pass'" color="success" style="margin: 0"><template #icon><CheckCircleOutlined /></template>通过</a-tag>
            <a-tag v-else-if="record.status === 'warning'" color="warning" style="margin: 0"><template #icon><ExclamationCircleOutlined /></template>需复核</a-tag>
            <a-tag v-else color="error" style="margin: 0"><template #icon><CloseCircleOutlined /></template>风险</a-tag>
          </template>
          <template v-if="column.key === 'isCritical'">
            <a-select v-if="isComplianceEditing(record)" :value="record.isCritical || false" size="small" style="width: 100%" @change="(value: any) => handleComplianceFieldChange(record.key, 'isCritical', value)">
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
                <a-button type="link" size="small" @click="handleComplianceEdit(record)"><template #icon><EditOutlined /></template>编辑</a-button>
                <a-popconfirm title="确定删除此项？" @confirm="handleComplianceDelete(record.key)">
                  <a-button type="link" size="small" danger><template #icon><DeleteOutlined /></template></a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </template>
      </a-table>
      <a-divider style="margin: 12px 0" />
      <div style="color: #666; font-size: 13px">提示：红色「一票否决」标记的检查项为形式合规强制项，必须100%满足，否则直接废标。点击「编辑」可手动修改，点击「AI 重新生成」可重新解析。</div>
    </a-card>
  </div>
</template>
```

- [ ] **Step 2: 验证 tab2 编译**

Run: `cd d:/coding/bidReviewr && pnpm --filter @repo/client exec vue-tsc --noEmit 2>&1 | head -20`

---

## Task 3: Tab 3 — 合规检查

**Files:**
- Rewrite: `apps/client/src/views/complianceCheck/tab3/index.vue`

**Props 接口:**

```typescript
const props = defineProps<{
  complianceData: ComplianceItem[]
  reviewTasks: ReviewTask[]
}>()

const emit = defineEmits<{
  'update:complianceData': [value: ComplianceItem[]]
}>()
```

**从父组件提取的内容:**

Script 部分:
- 样式常量: `CARD_FLEX_STYLE`, `cardBodyFlex`
- 计算属性: `stats`, `scoreColor`, `groupedData`, `currentItem`
- 状态: `selectedComplianceKey`, `customRules`, `isQueuePaused`, `collapsedCategories`, `taskPausedMap`, `pendingManualTaskId`, `manualConfirmedSet`, `manualNote`
- Drools 状态: `droolsModalOpen`, `editingRuleIndex`, `droolsRuleName`, `droolsSalience`, `droolsFactType`, `droolsCondition`, `droolsAction`
- Drools 计算属性和方法: `DrlLine` 接口, `getDrlLineColor`, `generatedDrl`, `drlLines`, `openDroolsEditor`, `handleDroolsSave`, `closeDroolsModal`
- 辅助方法: `toggleCategory`, `toggleTaskPaused`, `handleManualConfirm`, `getEffectiveStatus`, `getProgressStatus`, `getProgressColor`
- 图标: `CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, SafetyCertificateOutlined, FileSearchOutlined, RobotOutlined, SyncOutlined, PlayCircleOutlined, PauseCircleOutlined, EditOutlined, PlusOutlined, ClockCircleOutlined, CaretRightOutlined, CaretDownOutlined, CodeOutlined, StopOutlined, WarningOutlined, UserOutlined, CheckOutlined`
- 导入: `DROOLS_FACT_TYPES`, `CATEGORY_CONFIG`, `CATEGORY_ORDER`, 类型

Template 部分:
- 原文件 L1237-L1655: 指标卡 + 三列布局（左列检查项列表、中列审查工作区、右列 AI 检查 + 审查队列）
- 原文件 L1741-L1822: Drools 规则编辑器模态框

- [ ] **Step 1: 创建 tab3/index.vue**

```vue
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
  if (next.has(cat)) { next.delete(cat) } else { next.add(cat) }
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
    droolsSalience.value = '200'; droolsFactType.value = 'BidDocument'
    droolsCondition.value = '$doc : BidDocument(\n    contentText matches ".*(?:身份证号|手机号|银行账号).*",\n    desensitized == false\n)'
    droolsAction.value = '$doc.setStatus("FAIL");\n$doc.addViolation("检测到未脱敏的敏感信息");\ninsert(new ComplianceAlert("CRITICAL", "数据脱敏违规", $doc.getLocation()));'
  } else if (ruleName === 'SM国密算法验证') {
    droolsSalience.value = '150'; droolsFactType.value = 'TechnicalSpec'
    droolsCondition.value = '$spec : TechnicalSpec(\n    category == "加密算法",\n    algorithm not matches "SM[234].*"\n)'
    droolsAction.value = '$spec.setStatus("FAIL");\n$spec.addViolation("未使用国密SM系列算法");\ninsert(new ComplianceAlert("WARNING", "国密算法合规", $spec.getSection()));'
  } else {
    droolsSalience.value = '100'; droolsFactType.value = 'BidDocument'
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
        <a-card style="height: 156px; display: flex; flex-direction: column; text-align: center" :body-style="{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' }">
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
              <div><span :style="{ fontSize: 32, fontWeight: 700, color: scoreColor }">{{ stats.totalScore }}</span><span style="font-size: 14px; color: #8c8c8c; margin-left: 2px">分</span></div>
              <div style="font-size: 11px; color: #8c8c8c; margin-top: 4px">满分 {{ stats.maxTotalScore }} 分</div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card style="height: 156px; display: flex; flex-direction: column; text-align: center" :body-style="{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' }">
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 8px"><FileSearchOutlined style="margin-right: 6px" />规则项</div>
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center">
            <div><span style="font-size: 32px; font-weight: 700; color: #1890ff">{{ stats.total }}</span><span style="font-size: 14px; color: #8c8c8c; margin-left: 2px">项</span></div>
            <div style="font-size: 11px; color: #8c8c8c; margin-top: 4px">规则覆盖率 100%</div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card style="height: 156px; display: flex; flex-direction: column; text-align: center" :body-style="{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' }">
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 8px"><CheckCircleOutlined style="margin-right: 6px" />通过项</div>
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center">
            <div><span style="font-size: 32px; font-weight: 700; color: #52c41a">{{ stats.passCount }}</span><span style="font-size: 14px; color: #8c8c8c; margin-left: 2px">项</span></div>
            <div style="font-size: 11px; color: #8c8c8c; margin-top: 4px">占比 {{ Math.round((stats.passCount / stats.total) * 100) }}%</div>
          </div>
        </a-card>
      </a-col>
      <a-col :xs="24" :sm="12" :lg="6">
        <a-card style="height: 156px; display: flex; flex-direction: column; text-align: center" :body-style="{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' }">
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 8px"><CloseCircleOutlined style="margin-right: 6px" />负偏离项</div>
          <div style="flex: 1; display: flex; flex-direction: column; justify-content: center">
            <div><span style="font-size: 32px; font-weight: 700; color: #f5222d">{{ stats.failCount }}</span><span style="font-size: 14px; color: #8c8c8c; margin-left: 2px">项</span></div>
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
          <div v-for="(group, groupIdx) in groupedData" :key="group.category" :style="{ borderBottom: groupIdx < groupedData.length - 1 ? '1px solid #f0f0f0' : 'none' }">
            <div :style="{ padding: '8px 12px', cursor: 'pointer', background: group.config.bgColor, boxShadow: `inset 3px 0 0 0 ${group.config.color}`, transition: 'all 0.2s', userSelect: 'none' }" @click="toggleCategory(group.category)">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px">
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0">
                  <CaretRightOutlined v-if="collapsedCategories.has(group.category)" :style="{ fontSize: 10, color: group.config.color, flexShrink: 0 }" />
                  <CaretDownOutlined v-else :style="{ fontSize: 10, color: group.config.color, flexShrink: 0 }" />
                  <span :style="{ fontSize: 12, fontWeight: 600, color: group.config.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }">{{ group.config.label }}</span>
                  <a-tag :style="{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px', border: `1px solid ${group.config.borderColor}`, color: group.config.color, background: 'rgba(255,255,255,0.7)' }">{{ group.config.tag }}</a-tag>
                </div>
                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0">
                  <span v-if="group.pass > 0" style="font-size: 10px; color: #52c41a"><CheckCircleOutlined style="margin-right: 1px" />{{ group.pass }}</span>
                  <span v-if="group.warn > 0" style="font-size: 10px; color: #faad14"><ExclamationCircleOutlined style="margin-right: 1px" />{{ group.warn }}</span>
                  <span v-if="group.fail > 0" style="font-size: 10px; color: #f5222d"><CloseCircleOutlined style="margin-right: 1px" />{{ group.fail }}</span>
                </div>
              </div>
            </div>
            <template v-if="!collapsedCategories.has(group.category)">
              <div
                v-for="(item, itemIdx) in group.items" :key="item.key"
                :style="{ padding: '8px 12px 8px 18px', cursor: 'pointer', background: selectedComplianceKey === item.key ? '#e6f4ff' : 'transparent', boxShadow: selectedComplianceKey === item.key ? 'inset 3px 0 0 0 #1890ff' : 'none', transition: 'all 0.15s' }"
                @click="selectedComplianceKey = item.key"
              >
                <div style="display: flex; align-items: flex-start; gap: 8px">
                  <span :style="{ fontSize: 10, color: '#8c8c8c', background: '#f5f5f5', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', flexShrink: 0, marginTop: 1 }">
                    {{ groupedData.slice(0, groupIdx).reduce((sum, g) => sum + g.items.length, 0) + itemIdx + 1 }}
                  </span>
                  <div style="flex: 1; min-width: 0">
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px">
                      <span style="font-size: 12px; font-weight: 500; color: #262626; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ item.requirement }}</span>
                      <span style="flex-shrink: 0">
                        <CheckCircleOutlined v-if="item.status === 'pass'" style="color: #52c41a; font-size: 14px" />
                        <CloseCircleOutlined v-else-if="item.status === 'fail'" style="color: #f5222d; font-size: 14px" />
                        <ExclamationCircleOutlined v-else style="color: #faad14; font-size: 14px" />
                      </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; margin-top: 3px">
                      <span style="font-size: 11px; color: #8c8c8c">
                        得分: <span :style="{ color: item.status === 'pass' ? '#52c41a' : item.status === 'warning' ? '#faad14' : '#f5222d', fontWeight: 600 }">{{ item.score }}</span>/{{ item.maxScore }}
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
                    <span style="font-size: 11px; color: #8c8c8c; margin-left: 8px">执行者: {{ reviewTasks.find((t) => t.id === pendingManualTaskId)!.agent }}</span>
                  </div>
                  <div style="font-size: 12px; color: #595959; line-height: 1.6">
                    <strong>AI挂起原因：</strong>{{ reviewTasks.find((t) => t.id === pendingManualTaskId)!.manualReason }}
                  </div>
                </div>
              </template>
              <div style="margin-bottom: 10px">
                <div style="font-size: 12px; color: #262626; font-weight: 500; margin-bottom: 6px">人工核查结果说明</div>
                <a-textarea v-model:value="manualNote" :rows="3" placeholder="请填写核查结果，例如：已查阅原件，银行回执单真实有效，签章清晰可见…" style="font-size: 12px" />
              </div>
              <div style="display: flex; gap: 8px">
                <a-button type="primary" :disabled="!manualNote.trim()" style="flex: 1; background: #52c41a; border-color: #52c41a" @click="handleManualConfirm">
                  <template #icon><CheckOutlined /></template>确认通过，恢复队列
                </a-button>
                <a-button danger style="flex: 1" @click="pendingManualTaskId = null; manualNote = ''">
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
              <div :style="{ background: currentItem.status === 'fail' ? '#fff1f0' : currentItem.status === 'warning' ? '#fffbe6' : '#f6ffed', border: `1px solid ${currentItem.status === 'fail' ? '#ffccc7' : currentItem.status === 'warning' ? '#ffe58f' : '#b7eb8f'}`, borderRadius: 6, padding: 14 }">
                <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap">
                  <a-tag :color="currentItem.status === 'pass' ? 'success' : currentItem.status === 'warning' ? 'warning' : 'error'">
                    {{ currentItem.status === 'pass' ? '通过' : currentItem.status === 'warning' ? '警告' : '负偏离' }}
                  </a-tag>
                  <a-tag :style="{ fontSize: 10, margin: 0, border: `1px solid ${CATEGORY_CONFIG[currentItem.category].borderColor}`, color: CATEGORY_CONFIG[currentItem.category].color, background: CATEGORY_CONFIG[currentItem.category].bgColor }">
                    {{ CATEGORY_CONFIG[currentItem.category].label }}
                  </a-tag>
                  <span style="font-size: 11px; color: #8c8c8c; font-family: monospace">{{ currentItem.key }}</span>
                  <a-tag v-if="currentItem.isCritical" color="error" style="font-size: 10px; margin: 0">一票否决</a-tag>
                </div>
                <div style="font-size: 12px; color: #595959; margin-bottom: 8px"><strong>招标要求：</strong> {{ currentItem.requirement }}</div>
                <a-divider style="margin: 8px 0" />
                <div style="font-size: 12px; color: #595959"><strong>AI响应：</strong> {{ currentItem.aiResponse }}</div>
                <div style="margin-top: 8px; font-size: 11px; color: #8c8c8c">
                  得分: <span :style="{ color: currentItem.status === 'pass' ? '#52c41a' : currentItem.status === 'warning' ? '#faad14' : '#f5222d', fontWeight: 600 }">{{ currentItem.score }}</span> / {{ currentItem.maxScore }}
                </div>

                <template v-if="currentItem.status !== 'pass'">
                  <a-divider style="margin: 12px 0" />
                  <div style="background: #fff; border-radius: 4px; padding: 10px; border: 1px solid #ffa39e">
                    <div style="font-size: 11px; font-weight: 600; color: #cf1322; margin-bottom: 6px; display: flex; align-items: center; gap: 4px"><span>问题位置</span></div>
                    <div style="font-size: 11px; color: #595959; background: #fff7e6; padding: 6px 8px; border-radius: 3px; border: 1px dashed #ffa940; margin-bottom: 8px">
                      <div><span style="color: #8c8c8c">定位：</span><span style="color: #fa8c16; font-weight: 500; font-family: monospace">第2章 2.1节 - 第3段 第2-4行</span></div>
                    </div>
                    <div style="font-size: 11px; color: #262626; background: #fffaf0; padding: 8px 10px; border-radius: 3px; border: 1px solid #ffe7ba; border-left: 3px solid #fa8c16; line-height: 1.6">
                      <div style="color: #8c8c8c; font-size: 10px; margin-bottom: 4px">原文片段：</div>
                      <div style="font-family: system-ui, -apple-system, sans-serif">
                        系统采用微服务架构设计，基于Spring Cloud框架实现<span style="background: #ffccc7; padding: 1px 3px; border-radius: 2px; color: #cf1322">服务拆分和治理</span>，确保系统的高可用性和可扩展性...
                      </div>
                    </div>
                  </div>
                </template>

                <template v-if="currentItem.status !== 'pass'">
                  <a-divider style="margin: 12px 0" />
                  <div style="background: #fff; border-radius: 4px; padding: 10px; border: 1px solid #91d5ff">
                    <div style="font-size: 11px; font-weight: 600; color: #096dd9; margin-bottom: 6px; display: flex; align-items: center; gap: 4px"><span>AI修改建议</span></div>
                    <div style="font-size: 11px; color: #262626; background: #e6f7ff; padding: 8px 10px; border-radius: 3px; border: 1px solid #91d5ff; line-height: 1.6">
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
            <div style="font-size: 13px; font-weight: 600; color: #262626; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between">
              <span>个性化审查规则</span>
              <a-button size="small" type="primary" @click="customRules = [...customRules, '新规则']"><template #icon><PlusOutlined /></template>添加规则</a-button>
            </div>
            <div style="border: 1px solid #f0f0f0; border-radius: 6px">
              <div v-for="(rule, index) in customRules" :key="index" :style="{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: index < customRules.length - 1 ? '1px solid #f0f0f0' : 'none' }">
                <a-space><SafetyCertificateOutlined style="color: #1890ff" /><span style="font-size: 12px">{{ rule }}</span></a-space>
                <a-button type="link" size="small" @click="openDroolsEditor(index)"><template #icon><EditOutlined /></template>编辑</a-button>
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
          <div :style="{ padding: '9px 12px', background: isQueuePaused ? '#fff7e6' : '#f6ffed', borderRadius: 4, border: `1px solid ${isQueuePaused ? '#ffd591' : '#b7eb8f'}`, marginBottom: 12 }">
            <div style="margin-bottom: 6px">
              <div :style="{ fontSize: 12, color: isQueuePaused ? '#faad14' : '#52c41a', fontWeight: 500, marginBottom: 4 }">
                {{ isQueuePaused ? '检查已暂停' : '2个合规Agent并行工作中' }}
              </div>
              <a-progress :percent="Math.round(stats.complianceRate * 100)" size="small" :stroke-color="isQueuePaused ? '#faad14' : scoreColor" :show-info="false" />
            </div>
            <div style="font-size: 11px; color: #666">共 {{ stats.total }} 项检查 . 合规率 {{ Math.round(stats.complianceRate * 100) }}%</div>
          </div>
          <div style="display: flex; gap: 8px">
            <a-button size="small" :style="{ flex: 1, borderColor: isQueuePaused ? '#52c41a' : '#faad14', color: isQueuePaused ? '#52c41a' : '#faad14' }" @click="isQueuePaused = !isQueuePaused">
              <template #icon><PlayCircleOutlined v-if="isQueuePaused" /><PauseCircleOutlined v-else /></template>
              {{ isQueuePaused ? '全部开始' : '全部暂停' }}
            </a-button>
            <a-button size="small" type="primary" style="flex: 1"><template #icon><SyncOutlined /></template>全部重新检查</a-button>
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
                      <span :title="task.title" style="font-size: 12px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px; display: inline-block">{{ task.title }}</span>
                      <a-tag v-if="getEffectiveStatus(task) === 'suspended'" color="error" style="font-size: 10px; margin: 0; padding: 0 4px; flex-shrink: 0">挂起</a-tag>
                      <a-tag v-if="getEffectiveStatus(task) === 'completed'" color="success" style="font-size: 10px; margin: 0; padding: 0 4px; flex-shrink: 0">完成</a-tag>
                      <a-tag v-if="getEffectiveStatus(task) === 'waiting'" style="font-size: 10px; margin: 0; padding: 0 4px; flex-shrink: 0; border: 1px solid #d9d9d9; color: #8c8c8c">排队</a-tag>
                    </a-space>
                    <a-space :size="2" style="flex-shrink: 0; margin-left: 4px" @click.stop>
                      <a-tooltip v-if="getEffectiveStatus(task) !== 'suspended' && getEffectiveStatus(task) !== 'completed'" :title="taskPausedMap[task.id] ? '继续检查' : '暂停检查'">
                        <a-button type="text" size="small" :style="{ padding: '0 3px' }" @click.stop="toggleTaskPaused(task.id)">
                          <template #icon>
                            <PlayCircleOutlined v-if="taskPausedMap[task.id]" style="color: #52c41a" />
                            <PauseCircleOutlined v-else style="color: #faad14" />
                          </template>
                        </a-button>
                      </a-tooltip>
                      <a-tooltip v-if="getEffectiveStatus(task) === 'suspended' && !manualConfirmedSet.has(task.id)" title="点击前往人工确认区处理">
                        <a-button type="text" size="small" danger :style="{ padding: '0 3px' }" @click.stop="pendingManualTaskId = task.id; manualNote = ''">
                          <template #icon><UserOutlined /></template>
                        </a-button>
                      </a-tooltip>
                    </a-space>
                  </div>
                  <a-progress :percent="getEffectiveStatus(task) === 'completed' ? 100 : task.progress" size="small" :status="getProgressStatus(getEffectiveStatus(task), !!taskPausedMap[task.id]) as 'success' | 'exception' | 'active' | 'normal'" :stroke-color="getProgressColor(getEffectiveStatus(task), !!taskPausedMap[task.id])" />
                </div>
              </template>
              <div style="background: #fafafa; padding: 12px; border-radius: 4px; max-height: 260px; overflow: auto">
                <div style="font-size: 12px; font-weight: 600; color: #1890ff; margin-bottom: 8px; display: flex; align-items: center; gap: 5px">
                  <RobotOutlined /><span>{{ task.agent }} . 工作日志</span>
                  <a-tag :color="getEffectiveStatus(task) === 'completed' ? 'success' : getEffectiveStatus(task) === 'suspended' ? 'error' : getEffectiveStatus(task) === 'reviewing' ? 'processing' : 'default'" style="font-size: 10px; margin: 0">
                    {{ getEffectiveStatus(task) === 'completed' ? '已完成' : getEffectiveStatus(task) === 'suspended' ? '挂起等待' : getEffectiveStatus(task) === 'reviewing' ? '执行中' : '等待中' }}
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
                  <div v-if="task.logs.length > 0" :style="{ marginTop: 6, padding: '6px 10px', borderRadius: 4, display: 'flex', alignItems: 'flex-start', gap: 6, background: getEffectiveStatus(task) === 'completed' ? '#f6ffed' : getEffectiveStatus(task) === 'suspended' ? '#fff1f0' : getEffectiveStatus(task) === 'reviewing' ? '#e6f7ff' : '#fafafa', border: `1px solid ${getEffectiveStatus(task) === 'completed' ? '#b7eb8f' : getEffectiveStatus(task) === 'suspended' ? '#ffccc7' : getEffectiveStatus(task) === 'reviewing' ? '#91d5ff' : '#e8e8e8'}` }">
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
                  <a-button v-if="getEffectiveStatus(task) === 'suspended' && !manualConfirmedSet.has(task.id)" type="primary" danger size="small" style="margin-top: 8px; width: 100%" @click.stop="pendingManualTaskId = task.id; manualNote = ''">
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
          <a-textarea v-model:value="droolsCondition" placeholder="$doc : BidDocument(&#10;    // 条件表达式&#10;)" :rows="6" style="font-family: monospace; font-size: 12px" />
        </a-col>
        <a-col :span="12">
          <div style="font-size: 12px; color: #8c8c8c; margin-bottom: 4px">
            <a-tag color="green" style="font-size: 10px; margin: 0 4px 0 0">then</a-tag>动作 (RHS)
          </div>
          <a-textarea v-model:value="droolsAction" placeholder='$doc.setStatus("FAIL");&#10;$doc.addViolation("...");' :rows="6" style="font-family: monospace; font-size: 12px" />
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
```

- [ ] **Step 2: 验证 tab3 编译**

Run: `cd d:/coding/bidReviewr && pnpm --filter @repo/client exec vue-tsc --noEmit 2>&1 | head -20`

---

## Task 4: Tab 4 — 报告生成

**Files:**
- Rewrite: `apps/client/src/views/complianceCheck/tab4/index.vue`

**Props 接口:**

```typescript
const props = defineProps<{
  complianceData: ComplianceItem[]
  currentProject: { name: string; id: string; deadline: string }
}>()
```

**从父组件提取的内容:**

Script 部分:
- 计算属性/接口: `RadarDimension` 接口, `getRadarPoints`, `getAxisPoint`, `radarData`, `radarScores`
- 状态: `reportSection`, `isGeneratingReport`, `reportEditMode`, `expandedReportKeys`, `reportContents`
- 报告大纲树: `ReportTreeNode` 接口, `reportTreeData`, `reportPreviewParts`, `reportSectionTitle`
- 方法: `initReportContents`, `generateReport`, `exportToDocx`, `onReportTreeSelect`, `onReportTreeExpand`
- 导入: `MessageResponse` 组件, `CATEGORY_CONFIG`
- 图标: `BookOutlined, FileDoneOutlined, DownloadOutlined`

Template 部分:
- 原文件 L1661-L1737: 报告大纲树 + 编辑/预览区 + SVG 雷达图

Style 部分:
- 原文件 `.report-content` 样式块

- [ ] **Step 1: 创建 tab4/index.vue**

```vue
<script setup lang="ts">
import { message } from 'ant-design-vue'
import {
  BookOutlined,
  FileDoneOutlined,
  DownloadOutlined,
} from '@ant-design/icons-vue'
import { CATEGORY_CONFIG } from '../types'
import type { ComplianceCategory, ComplianceItem } from '../types'
import MessageResponse from '@/components/ai-elements/message/MessageResponse.vue'

const props = defineProps<{
  complianceData: ComplianceItem[]
  currentProject: { name: string; id: string; deadline: string }
}>()

/* =================== 雷达图辅助 =================== */

interface RadarDimension {
  dimension: string
  score: number
}

function getRadarPoints(values: number[], cx: number, cy: number, r: number): string {
  const n = values.length
  return values.map((v, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const ratio = v / 100
    const x = cx + r * ratio * Math.cos(angle)
    const y = cy + r * ratio * Math.sin(angle)
    return `${x},${y}`
  }).join(' ')
}

function getAxisPoint(index: number, total: number, cx: number, cy: number, r: number): string {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2
  return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
}

const radarData = computed<RadarDimension[]>(() => {
  const cats: ComplianceCategory[] = ['formal', 'response', 'sensitive', 'logic']
  return cats.map((cat) => {
    const items = props.complianceData.filter((i) => i.category === cat)
    const score = items.reduce((sum, i) => sum + i.score, 0)
    const maxScore = items.reduce((sum, i) => sum + i.maxScore, 0)
    const dimLabels: Record<ComplianceCategory, string> = { formal: '形式合规', response: '响应完整性', sensitive: '敏感性检查', logic: '逻辑一致性' }
    return { dimension: dimLabels[cat], score: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0 }
  })
})

const radarScores = computed(() => radarData.value.map((d) => d.score))

/* =================== 状态 =================== */

const reportSection = ref<string>('summary')
const isGeneratingReport = ref(false)
const reportEditMode = ref<'preview' | 'edit'>('preview')
const expandedReportKeys = ref<string[]>(['summary', 'blockers', 'details', 'checklist'])
const reportContents = ref<Record<string, string>>({ summary: '', blockers: '', details: '', checklist: '' })

/* =================== 报告内容初始化 =================== */

function initReportContents() {
  const data = props.complianceData
  const proj = props.currentProject
  const failCritical = data.filter((i) => i.status === 'fail' && i.isCritical)
  const failItems = data.filter((i) => i.status === 'fail')
  const warnItems = data.filter((i) => i.status === 'warning')
  const passItems = data.filter((i) => i.status === 'pass')
  const totalScore = data.reduce((sum, i) => sum + i.score, 0)
  const maxTotalScore = data.reduce((sum, i) => sum + i.maxScore, 0)
  const rate = Math.round((totalScore / (maxTotalScore || 1)) * 100)

  reportContents.value = {
    summary: `# 第一部分：审计综述 (Executive Summary)\n\n## 项目基本信息\n\n**项目名称**：${proj.name}\n**项目编号**：${proj.id}\n**投递截止时间**：${proj.deadline}\n\n---\n\n## 风险雷达图\n\n综合分析四个维度的得分情况：\n\n:::radar-chart\n\n## 结论判定\n\n${failCritical.length > 0 ? '🔴 **极高风险** - 发现致命废标项，不建议提交' : failItems.length > 0 || warnItems.length > 3 ? '🟡 **中危建议** - 发现若干问题，建议修改后提交' : '🟢 **准予封标** - 所有检查项均符合要求，可以提交'}\n\n---\n\n### 总体评估\n\n- **检查项总数**：${data.length} 项\n- **通过项**：${passItems.length} 项\n- **失败项**：${failItems.length} 项\n- **警告项**：${warnItems.length} 项\n- **一票否决触发**：${failCritical.length} 项\n\n### 综合得分\n\n**${rate}** / 100 分`,

    blockers: `# 第二部分：废标项警示 (Blocker Issues)\n\n## 致命风险列表\n\n${failCritical.length === 0 ? '✅ **未发现致命废标项**，所有一票否决项均已通过检查。' : `⚠️ **发现 ${failCritical.length} 项致命风险**，必须立即处理：\n\n${failCritical.map((item, idx) => `### ${idx + 1}. ${item.requirement} [${item.key}]\n\n**检查结果**：${item.aiResponse}\n\n**得分**：${item.score} / ${item.maxScore}\n\n**影响**：触发一票否决，将导致废标\n\n---`).join('\n\n')}`}\n\n## 其他失败项\n\n${data.filter((i) => i.status === 'fail' && !i.isCritical).length === 0 ? '✅ 无其他失败项' : data.filter((i) => i.status === 'fail' && !i.isCritical).map((item, idx) => `### ${idx + 1}. ${item.requirement} [${item.key}]\n\n**检查结果**：${item.aiResponse}\n\n**得分**：${item.score} / ${item.maxScore}\n\n---`).join('\n\n')}`,

    details: `# 第三部分：维度详述 (Detailed Audit)\n\n${['formal', 'response', 'sensitive', 'logic'].map((cat, catIdx) => {\n    const catLabels = ['形式合规检查', '响应完整性检查', '敏感性与排他性检查', '内容逻辑一致性检查']\n    return `## ${catIdx + 1}. ${catLabels[catIdx]}\n\n${data.filter((i) => i.category === cat).map((item, idx) => `### ${idx + 1}. ${item.requirement}\n**状态**：${item.status === 'pass' ? '✅ 通过' : item.status === 'fail' ? '❌ 失败' : '⚠️ 警告'}\n**编号**：${item.key}\n**得分**：${item.score} / ${item.maxScore}\n${item.isCritical ? '**标记**：一票否决项\n' : ''}**AI 审计结果**：${item.aiResponse}\n---`).join('\\n\\n')}`\n}).join('\n\n')}`,

    checklist: `# 第四部分：封标确认清单 (Final Checklist)\n\n## 签章位置汇总\n\n| 序号 | 页码 | 位置说明 | 印章类型 | 状态 |\n|------|------|----------|----------|------|\n| 1 | P.5 | 投标函 | 公章 | ✅ 已检测 |\n| 2 | P.12 | 法定代表人授权书 | 公章 + 法人章 | ✅ 已检测 |\n| 3 | P.23 | 商务响应文件封面 | 公章 | ✅ 已检测 |\n| 4 | P.156 | 技术响应文件封面 | 公章 | ✅ 已检测 |\n| 5 | P.198 | 分项报价表 | 法人章 | ⚠️ 未检测到 |\n| 6 | P.245 | 投标保证金缴纳凭证 | 公章 | ✅ 已检测 |\n\n---\n\n## 装订与加密要求\n\n### 文档分册要求\n\n- **正本**：1 册（含原件）\n- **副本**：5 册（彩色复印件）\n- **电子版**：U 盘 1 个（含 PDF 格式文件）\n\n### PDF 命名规范\n\n\`\`\`\n[项目编号]_[单位名称]_正本.pdf\n[项目编号]_[单位名称]_副本.pdf\n\`\`\`\n\n示例：\`2026-GZ-001_XX科技有限公司_正本.pdf\`\n\n### 装订要求\n\n- 采用胶装或线装\n- 页码连续编号\n- 封面使用 200g 铜版纸\n- 封底使用 120g 白卡纸\n\n### U 盘备份要求\n\n- 容量不小于 8GB\n- 格式化为 FAT32 格式\n- 文件不加密、不压缩\n- 外贴标签注明项目名称\n\n---\n\n## 提交前最终确认\n\n- [ ] 所有资质证照均在有效期内\n- [ ] 所有印章位置齐全清晰\n- [ ] 页码连续无缺页\n- [ ] 电子版与纸质版内容一致\n- [ ] 投标文件密封完整\n- [ ] 报价金额大小写一致\n- [ ] 所有必填项均已填写\n- [ ] 未出现其他项目名称或客户信息\n- [ ] U 盘已备份并贴标签\n- [ ] 投标保证金已缴纳\n\n---\n\n**报告生成时间**：${new Date().toLocaleString('zh-CN')}\n**AI 引擎版本**：Baguwen AI v2.0\n**检查项版本**：GB/T 2024-001`,
  }
}

/* =================== 报告大纲树 =================== */

interface ReportTreeNode {
  key: string
  title: string
  children?: ReportTreeNode[]
}

const reportTreeData = computed<ReportTreeNode[]>(() => {
  const sections = [
    { key: 'summary', title: '审计综述' },
    { key: 'blockers', title: '废标项警示' },
    { key: 'details', title: '维度详述' },
    { key: 'checklist', title: '封标确认清单' },
  ]
  return sections.map((sec) => {
    const content = reportContents.value[sec.key] || ''
    const lines = content.split('\n')
    const h2Nodes: ReportTreeNode[] = []
    lines.forEach((line, idx) => {
      const h2Match = line.match(/^##\s+(.+)$/)
      if (h2Match) { h2Nodes.push({ key: `${sec.key}-h2-${idx}`, title: h2Match[1].trim() }) }
    })
    return { ...sec, children: h2Nodes }
  })
})

const reportPreviewParts = computed(() => {
  const content = reportContents.value[reportSection.value] || ''
  return content.split(':::radar-chart')
})

const reportSectionTitle = computed(() => {
  const node = reportTreeData.value.find((d) => d.key === reportSection.value)
  return node?.title || '审计报告'
})

/* =================== 方法 =================== */

function generateReport() {
  isGeneratingReport.value = true
  message.loading({ content: 'AI 正在生成审计报告...', key: 'report-gen' })
  setTimeout(() => {
    isGeneratingReport.value = false
    message.success({ content: '报告生成完成', key: 'report-gen' })
  }, 2000)
}

async function exportToDocx() {
  message.info('请先安装 docx 和 file-saver 依赖以支持导出功能')
}

function onReportTreeSelect(keys: (string | number)[]) {
  if (keys.length > 0) {
    const key = String(keys[0])
    const mainKey = key.split('-')[0]
    reportSection.value = mainKey
  }
}

function onReportTreeExpand(keys: (string | number)[]) {
  expandedReportKeys.value = keys.map(String)
}

onMounted(() => {
  initReportContents()
})
</script>

<template>
  <div style="display: flex; gap: 16px; height: calc(100vh - 240px); min-height: 600px">
    <!-- 左侧: 动态大纲 Tree -->
    <a-card style="width: 280px; flex-shrink: 0; display: flex; flex-direction: column" :body-style="{ padding: '12px 0', flex: 1, overflowY: 'auto' }">
      <template #title>
        <a-space :size="8">
          <BookOutlined style="color: #1890ff" />
          <span>报告大纲</span>
        </a-space>
      </template>
      <a-tree show-line block-node default-expand-all :expanded-keys="expandedReportKeys" :selected-keys="[reportSection]" :tree-data="reportTreeData" @expand="onReportTreeExpand" @select="onReportTreeSelect">
        <template #title="node">
          <div :style="{ fontSize: 13, fontWeight: reportSection === node.key ? 600 : 400, color: reportSection === node.key ? '#1890ff' : 'inherit', padding: '2px 0' }">
            {{ node.title }}
          </div>
        </template>
      </a-tree>
    </a-card>

    <!-- 中间: 报告编辑/预览区 -->
    <a-card style="flex: 1; display: flex; flex-direction: column" :body-style="{ padding: 20, flex: 1, overflowY: 'auto', position: 'relative' }">
      <template #title>
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%">
          <a-space :size="12">
            <FileDoneOutlined style="color: #722ed1" />
            <span>{{ reportSectionTitle }}</span>
            <a-segmented v-model:value="reportEditMode" size="small" :options="[{ label: '预览', value: 'preview' }, { label: '编辑', value: 'edit' }]" />
          </a-space>
          <a-space>
            <a-button type="primary" ghost size="small" @click="exportToDocx"><template #icon><DownloadOutlined /></template>导出 DOCX</a-button>
          </a-space>
        </div>
      </template>
      <div style="max-width: 900px; margin: 0 auto; height: 100%">
        <a-textarea
          v-if="reportEditMode === 'edit'"
          :value="reportContents[reportSection]"
          :style="{ height: '100%', minHeight: 500, fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, border: 'none', boxShadow: 'none', background: '#fafafa', padding: 16, borderRadius: 6, resize: 'none' }"
          placeholder="在此输入 Markdown 内容..."
          @change="(e: Event) => { reportContents[reportSection] = (e.target as HTMLTextAreaElement).value }"
        />
        <div v-else class="report-content">
          <template v-if="reportPreviewParts.length > 1">
            <MessageResponse :content="reportPreviewParts[0]" />
            <div style="height: 320px; margin-top: 24px; margin-bottom: 32px; background: #fff; border-radius: 8px; padding: 16px; border: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: center">
              <svg width="300" height="300" viewBox="0 0 300 300">
                <polygon v-for="level in [20, 40, 60, 80, 100]" :key="level" :points="getRadarPoints([level, level, level, level], 150, 150, 120)" fill="none" stroke="#d9d9d9" stroke-width="0.5" />
                <line v-for="(_, i) in 4" :key="'axis-' + i" :x1="150" :y1="150" :x2="getAxisPoint(i, 4, 150, 150, 120).split(',')[0]" :y2="getAxisPoint(i, 4, 150, 150, 120).split(',')[1]" stroke="#d9d9d9" stroke-width="0.5" />
                <polygon :points="getRadarPoints(radarScores, 150, 150, 120)" fill="rgba(24,144,255,0.3)" stroke="#1890ff" stroke-width="2" />
                <text v-for="(item, i) in radarData" :key="'label-' + i" :x="getAxisPoint(i, 4, 150, 150, 140).split(',')[0]" :y="getAxisPoint(i, 4, 150, 150, 140).split(',')[1]" text-anchor="middle" :dy="i === 0 ? -6 : i === 2 ? 16 : 4" :dx="i === 1 ? 8 : i === 3 ? -8 : 0" style="font-size: 13px; fill: #595959">{{ item.dimension }} ({{ item.score }})</text>
              </svg>
            </div>
            <MessageResponse :content="reportPreviewParts[1]" />
          </template>
          <MessageResponse v-else :content="reportContents[reportSection] || ''" />
        </div>
      </div>
    </a-card>
  </div>
</template>

<style lang="scss" scoped>
.report-content {
  h1 { font-size: 28px; font-weight: 600; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid #f0f0f0; color: #262626; }
  h2 { font-size: 22px; font-weight: 600; margin-top: 32px; margin-bottom: 16px; color: #262626; }
  h3 { font-size: 16px; font-weight: 500; margin-top: 24px; margin-bottom: 12px; color: #595959; }
  p { line-height: 1.8; margin-bottom: 16px; color: #595959; font-size: 14px; }
  strong { font-weight: 600; color: #262626; }
  hr { margin: 24px 0; border: 0; border-top: 1px solid #f0f0f0; }
  ul, ol { margin-bottom: 16px; padding-left: 24px; }
  li { margin-bottom: 8px; line-height: 1.8; color: #595959; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px;
    th { background: #fafafa; padding: 12px; text-align: left; font-weight: 600; border: 1px solid #f0f0f0; color: #262626; }
    td { padding: 10px 12px; border: 1px solid #f0f0f0; color: #595959; }
  }
  code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 13px; color: #d4380d; }
  pre { background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; margin: 16px 0;
    code { background: transparent; padding: 0; color: #262626; }
  }
  input[type='checkbox'] { margin-right: 8px; }
}
</style>
```

- [ ] **Step 2: 验证 tab4 编译**

Run: `cd d:/coding/bidReviewr && pnpm --filter @repo/client exec vue-tsc --noEmit 2>&1 | head -20`

---

## Task 5: 重构父组件 index.vue

**Files:**
- Rewrite: `apps/client/src/views/complianceCheck/index.vue`

**父组件精简为:**
- 页面标题 + 描述
- 步骤条
- Tabs 外壳
- 共享状态管理（complianceData, currentProject, REVIEW_TASKS）
- 导入四个 Tab 子组件

- [ ] **Step 1: 重写 index.vue**

```vue
<script setup lang="ts">
import {
  UploadOutlined,
  FileSearchOutlined,
  SafetyCertificateOutlined,
  FileDoneOutlined,
} from '@ant-design/icons-vue'
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

const activeTab = ref<string>('1')
const complianceData = ref<ComplianceItem[]>([...COMPLIANCE_DATA])
const reviewTasks = ref<ReviewTask[]>([...REVIEW_TASKS])

/* =================== Tab 切换 =================== */

function onStepChange(current: number) {
  activeTab.value = String(current + 1)
}

function onTabChange(key: string | number) {
  activeTab.value = String(key)
}

/* =================== Tab 2 事件处理 =================== */

function handleComplianceDataUpdate(newData: ComplianceItem[]) {
  complianceData.value = newData
}

function handleComplianceRegenerate() {
  complianceData.value = [...COMPLIANCE_DATA]
}
</script>

<template>
  <div style="display: flex; flex-direction: column; height: 100%">
    <!-- 页面标题 -->
    <div style="margin-bottom: 24px; flex-shrink: 0">
      <h1 style="font-size: 22px; font-weight: 600; margin-bottom: 8px">合规检查</h1>
      <p style="color: #666">系统的"主审官"，形式合规检查，跨模态一致性内容逻辑检查，敏感性与排他性检查，以及异常打回管理等。</p>
    </div>

    <!-- 步骤条 -->
    <a-steps :current="parseInt(activeTab) - 1" style="margin-bottom: 24px" @change="onStepChange">
      <a-step title="文档上传"><template #icon><UploadOutlined /></template></a-step>
      <a-step title="检查项解析"><template #icon><FileSearchOutlined /></template></a-step>
      <a-step title="合规检查"><template #icon><SafetyCertificateOutlined /></template></a-step>
      <a-step title="报告生成"><template #icon><FileDoneOutlined /></template></a-step>
    </a-steps>

    <!-- Tabs 内容区 -->
    <a-tabs v-model:activeKey="activeTab" type="card" style="flex: 1; min-height: 0; display: flex; flex-direction: column" @change="onTabChange">
      <a-tab-pane key="1">
        <template #tab><UploadOutlined /> 文档上传</template>
        <Tab1 />
      </a-tab-pane>

      <a-tab-pane key="2">
        <template #tab><FileSearchOutlined /> 检查项解析</template>
        <Tab2 :compliance-data="complianceData" @update:compliance-data="handleComplianceDataUpdate" @regenerate="handleComplianceRegenerate" />
      </a-tab-pane>

      <a-tab-pane key="3">
        <template #tab><SafetyCertificateOutlined /> 合规检查</template>
        <Tab3 :compliance-data="complianceData" :review-tasks="reviewTasks" />
      </a-tab-pane>

      <a-tab-pane key="4">
        <template #tab><FileDoneOutlined /> 报告生成</template>
        <Tab4 :compliance-data="complianceData" :current-project="currentProject" />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>
```

- [ ] **Step 2: 验证完整编译**

Run: `cd d:/coding/bidReviewr && pnpm --filter @repo/client build 2>&1 | tail -20`
Expected: 构建成功

- [ ] **Step 3: 提交**

```bash
git add apps/client/src/views/complianceCheck/
git commit -m "refactor: 将 complianceCheck 四个 tab 抽离为独立组件"
```

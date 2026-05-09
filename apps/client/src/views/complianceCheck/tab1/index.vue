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

function formatFileSize(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2)
}

const bidFiles = ref<UploadedFile[]>([...MOCK_BID_FILES])
const responseFiles = ref<UploadedFile[]>([...MOCK_RESPONSE_FILES])
const checklistFiles = ref<UploadedFile[]>([...MOCK_CHECKLIST_FILES])
const knowledgeFiles = ref<KnowledgeFile[]>([...MOCK_KNOWLEDGE_FILES])
const indexViewVisible = ref(false)
const currentIndexFile = ref<KnowledgeFile | null>(null)
const filePreviewVisible = ref(false)
const currentPreviewFile = ref<KnowledgeFile | null>(null)

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

function onBidOCR(file: UploadedFile) {
  triggerOCR(file, bidFiles)
}
function onBidOCRAll() {
  bidFiles.value.forEach((f) => triggerOCR(f, bidFiles))
}
function onBidDelete(key: string) {
  bidFiles.value = bidFiles.value.filter((f) => f.key !== key)
}
function onResponseOCR(file: UploadedFile) {
  triggerOCR(file, responseFiles)
}
function onResponseOCRAll() {
  responseFiles.value.forEach((f) => triggerOCR(f, responseFiles))
}
function onResponseDelete(key: string) {
  responseFiles.value = responseFiles.value.filter((f) => f.key !== key)
}

function triggerKnowledgeOCR(file: KnowledgeFile | UploadedFile) {
  knowledgeFiles.value = knowledgeFiles.value.map((f) => (f.key === file.key ? { ...f, ocrStatus: 'processing' as OcrStatus, ocrProgress: 0 } : f))
  let progress = 0
  const timer = setInterval(() => {
    progress += Math.random() * 25
    if (progress >= 100) {
      progress = 100
      clearInterval(timer)
      knowledgeFiles.value = knowledgeFiles.value.map((f) => (f.key === file.key ? { ...f, ocrStatus: 'completed' as OcrStatus, ocrProgress: 100 } : f))
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
                {
                  id: `chunk-${file.key}-1`,
                  content: '合规检查规则：投标文件需包含法人授权委托书原件，签署日期不得晚于投标截止日。',
                  metadata: '来源：第1页 | 类别：形式合规 | 向量维度：1536',
                },
                {
                  id: `chunk-${file.key}-2`,
                  content: '技术方案需明确列出性能指标参数，并与招标文件要求逐项对应，偏差需标注说明。',
                  metadata: '来源：第3页 | 类别：内容逻辑 | 向量维度：1536',
                },
                {
                  id: `chunk-${file.key}-3`,
                  content: '敏感信息排查：检查投标文件中是否包含未脱敏的个人身份信息、银行账号、内部项目编号等。',
                  metadata: '来源：第5页 | 类别：敏感排查 | 向量维度：1536',
                },
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
  knowledgeFiles.value.forEach((file) => {
    triggerKnowledgeOCR(file)
  })
}

function handleBatchIndexBuild() {
  const eligible = knowledgeFiles.value.filter((f) => f.ocrStatus === 'completed')
  if (eligible.length === 0) {
    message.warning('没有可构建索引的文件，请先完成OCR识别')
    return
  }
  message.info(`正在对 ${eligible.length} 个文件重构索引...`)
  eligible.forEach((file) => {
    triggerIndexBuild(file)
  })
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
              <div style="margin-bottom: 8px">
                <a-space
                  ><span>{{ file.name }}</span
                  ><a-tag :color="OCR_STATUS_CONFIG[file.ocrStatus].color">{{ OCR_STATUS_CONFIG[file.ocrStatus].text }}</a-tag></a-space
                >
              </div>
              <div style="font-size: 12px; color: #999; margin-bottom: 4px">{{ file.uploadTime }} . {{ formatFileSize(file.size) }} MB</div>
              <a-progress v-if="file.ocrStatus === 'processing'" :percent="file.ocrProgress" size="small" status="active" />
            </div>
            <div style="margin-left: 12px">
              <a-space :size="4">
                <a-button type="link" size="small"
                  ><template #icon><FileSearchOutlined /></template>查看详情</a-button
                >
                <a-button type="link" size="small" :disabled="file.ocrStatus === 'processing'" @click="onBidOCR(file)"
                  ><template #icon><ScanOutlined /></template>重新识别</a-button
                >
                <a-button type="link" size="small" danger @click="onBidDelete(file.key)"
                  ><template #icon><DeleteOutlined /></template>删除</a-button
                >
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
              <div style="margin-bottom: 8px">
                <a-space
                  ><span>{{ file.name }}</span
                  ><a-tag :color="OCR_STATUS_CONFIG[file.ocrStatus].color">{{ OCR_STATUS_CONFIG[file.ocrStatus].text }}</a-tag></a-space
                >
              </div>
              <div style="font-size: 12px; color: #999; margin-bottom: 4px">{{ file.uploadTime }} . {{ formatFileSize(file.size) }} MB</div>
              <a-progress v-if="file.ocrStatus === 'processing'" :percent="file.ocrProgress" size="small" status="active" />
            </div>
            <div style="margin-left: 12px">
              <a-space :size="4">
                <a-button type="link" size="small"
                  ><template #icon><FileSearchOutlined /></template>查看详情</a-button
                >
                <a-button type="link" size="small" :disabled="file.ocrStatus === 'processing'" @click="onResponseOCR(file)"
                  ><template #icon><ScanOutlined /></template>重新识别</a-button
                >
                <a-button type="link" size="small" danger @click="onResponseDelete(file.key)"
                  ><template #icon><DeleteOutlined /></template>删除</a-button
                >
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
            <a-button type="primary" @click="handleBatchKnowledgeOCR"
              ><template #icon><ScanOutlined /></template>全部重新识别</a-button
            >
            <a-button type="primary" @click="handleBatchIndexBuild"
              ><template #icon><RocketOutlined /></template>全部重构索引</a-button
            >
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
                  <a-tag v-if="file.ocrStatus === 'completed'" :color="INDEX_STATUS_CONFIG[file.indexStatus].color"
                    >索引: {{ INDEX_STATUS_CONFIG[file.indexStatus].text }}</a-tag
                  >
                  <a-badge
                    v-if="file.indexStatus === 'completed' && file.indexChunks"
                    :count="file.indexChunks.length"
                    :style="{ backgroundColor: '#722ed1' }"
                    title="知识块数量"
                  />
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
                  <a-button
                    type="link"
                    size="small"
                    @click="
                      currentPreviewFile = file
                      filePreviewVisible = true
                    "
                    ><template #icon><FileSearchOutlined /></template>查看详情</a-button
                  >
                  <a-button type="link" size="small" :disabled="file.ocrStatus === 'processing'" @click="triggerKnowledgeOCR(file)"
                    ><template #icon><ScanOutlined /></template>重新识别</a-button
                  >
                </a-space>
                <a-space :size="4">
                  <a-button
                    type="link"
                    size="small"
                    :disabled="file.ocrStatus !== 'completed' || file.indexStatus === 'processing'"
                    @click="triggerIndexBuild(file)"
                    ><template #icon><RocketOutlined /></template>重构索引</a-button
                  >
                  <a-button
                    v-if="file.indexStatus === 'completed' && file.indexChunks"
                    type="link"
                    size="small"
                    @click="
                      currentIndexFile = file
                      indexViewVisible = true
                    "
                    ><template #icon><BookOutlined /></template>查看索引</a-button
                  >
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

  <a-modal :open="indexViewVisible" :footer="null" width="720" @cancel="indexViewVisible = false">
    <template #title
      ><a-space><BookOutlined style="color: #722ed1" /> 索引知识块 - {{ currentIndexFile?.name }}</a-space></template
    >
    <template v-if="currentIndexFile?.indexChunks?.length">
      <a-card v-for="(chunk, idx) in currentIndexFile.indexChunks" :key="chunk.id" size="small" style="margin-bottom: 12px">
        <template #title
          ><a-space
            ><a-tag color="purple" style="margin: 0">Chunk #{{ idx + 1 }}</a-tag
            ><span style="font-size: 12px; color: #999">{{ chunk.id }}</span></a-space
          ></template
        >
        <div style="font-size: 13px; line-height: 1.8; margin-bottom: 8px">{{ chunk.content }}</div>
        <div style="font-size: 11px; color: #999; padding: 4px 8px; background: #fafafa; border-radius: 4px; border: 1px solid #f0f0f0">
          {{ chunk.metadata }}
        </div>
      </a-card>
    </template>
    <div v-else style="text-align: center; padding: 24px 0; color: #999">暂无索引数据</div>
  </a-modal>

  <a-modal :open="filePreviewVisible" :footer="null" width="640" @cancel="filePreviewVisible = false">
    <template #title
      ><a-space><FileSearchOutlined /> 文件详情 - {{ currentPreviewFile?.name }}</a-space></template
    >
    <template v-if="currentPreviewFile">
      <div>
        <a-row :gutter="[16, 12]">
          <a-col :span="12"
            ><div style="font-size: 12px; color: #999">文件名</div>
            <div style="font-size: 13px; font-weight: 500">{{ currentPreviewFile.name }}</div></a-col
          >
          <a-col :span="12"
            ><div style="font-size: 12px; color: #999">文件大小</div>
            <div style="font-size: 13px">{{ formatFileSize(currentPreviewFile.size) }} MB</div></a-col
          >
          <a-col :span="12"
            ><div style="font-size: 12px; color: #999">上传时间</div>
            <div style="font-size: 13px">{{ currentPreviewFile.uploadTime }}</div></a-col
          >
          <a-col :span="12"
            ><div style="font-size: 12px; color: #999">OCR状态</div>
            <a-tag :color="OCR_STATUS_CONFIG[currentPreviewFile.ocrStatus].color">{{ OCR_STATUS_CONFIG[currentPreviewFile.ocrStatus].text }}</a-tag></a-col
          >
        </a-row>
        <a-divider />
        <div
          style="
            padding: 16px;
            background: #fafafa;
            border-radius: 6px;
            border: 1px solid #f0f0f0;
            font-size: 13px;
            line-height: 1.8;
            color: #333;
            max-height: 400px;
            overflow: auto;
          "
        >
          该文件包含合规检查相关知识数据，OCR识别后可用于构建RAG/OAG索引，增强合规审查Agent的检查精度与召回率。
        </div>
      </div>
    </template>
  </a-modal>
</template>

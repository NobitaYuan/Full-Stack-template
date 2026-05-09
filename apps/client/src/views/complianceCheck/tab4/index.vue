<script setup lang="ts">
import { message } from 'ant-design-vue'
import { BookOutlined, FileDoneOutlined, DownloadOutlined } from '@ant-design/icons-vue'
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
  return values
    .map((v, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const ratio = v / 100
      const x = cx + r * ratio * Math.cos(angle)
      const y = cy + r * ratio * Math.sin(angle)
      return `${x},${y}`
    })
    .join(' ')
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

/* =================== 报告内容辅助 =================== */

function buildDetailsContent(data: ComplianceItem[]): string {
  const cats: ComplianceCategory[] = ['formal', 'response', 'sensitive', 'logic']
  const catLabels = ['形式合规检查', '响应完整性检查', '敏感性与排他性检查', '内容逻辑一致性检查']
  const sections = cats.map((cat, catIdx) => {
    const items = data.filter((i) => i.category === cat)
    const itemLines = items
      .map((item, idx) => {
        const statusLabel = item.status === 'pass' ? '✅ 通过' : item.status === 'fail' ? '❌ 失败' : '⚠️ 警告'
        let text = `### ${idx + 1}. ${item.requirement}\n**状态**：${statusLabel}\n**编号**：${item.key}\n**得分**：${item.score} / ${item.maxScore}`
        if (item.isCritical) text += '\n**标记**：一票否决项'
        text += `\n**AI 审计结果**：${item.aiResponse}\n---`
        return text
      })
      .join('\n\n')
    return `## ${catIdx + 1}. ${catLabels[catIdx]}\n\n${itemLines}`
  })
  return `# 第三部分：维度详述 (Detailed Audit)\n\n${sections.join('\n\n')}`
}

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

    blockers: `# 第二部分：废标项警示 (Blocker Issues)\n\n## 致命风险列表\n\n${failCritical.length === 0 ? '✅ **未发现致命废标项**，所有一票否决项均已通过检查。' : `⚠️ **发现 ${failCritical.length} 项致命风险**，必须立即处理：\n\n${failCritical.map((item, idx) => `### ${idx + 1}. ${item.requirement} [${item.key}]\n\n**检查结果**：${item.aiResponse}\n\n**得分**：${item.score} / ${item.maxScore}\n\n**影响**：触发一票否决，将导致废标\n\n---`).join('\n\n')}`}\n\n## 其他失败项\n\n${
      data.filter((i) => i.status === 'fail' && !i.isCritical).length === 0
        ? '✅ 无其他失败项'
        : data
            .filter((i) => i.status === 'fail' && !i.isCritical)
            .map(
              (item, idx) =>
                `### ${idx + 1}. ${item.requirement} [${item.key}]\n\n**检查结果**：${item.aiResponse}\n\n**得分**：${item.score} / ${item.maxScore}\n\n---`,
            )
            .join('\n\n')
    }`,

    details: buildDetailsContent(data),

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
      if (h2Match) {
        h2Nodes.push({ key: `${sec.key}-h2-${idx}`, title: h2Match[1].trim() })
      }
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

async function exportToPDF() {
  message.info('请先安装依赖以支持导出功能')
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
  <div style="display: flex; gap: 16px">
    <!-- 左侧: 动态大纲 Tree -->
    <a-card style="width: 280px; flex-shrink: 0; display: flex; flex-direction: column" :body-style="{ padding: '12px 0', flex: 1, overflowY: 'auto' }">
      <template #title>
        <a-space :size="8">
          <BookOutlined style="color: #1890ff" />
          <span>报告大纲</span>
        </a-space>
      </template>
      <a-tree
        show-line
        block-node
        default-expand-all
        :expanded-keys="expandedReportKeys"
        :selected-keys="[reportSection]"
        :tree-data="reportTreeData"
        @expand="onReportTreeExpand"
        @select="onReportTreeSelect"
      >
        <template #title="node">
          <div
            :style="{
              fontSize: 13,
              fontWeight: reportSection === node.key ? 600 : 400,
              color: reportSection === node.key ? '#1890ff' : 'inherit',
              padding: '2px 0',
            }"
          >
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
            <a-segmented
              v-model:value="reportEditMode"
              size="small"
              :options="[
                { label: '预览', value: 'preview' },
                { label: '编辑', value: 'edit' },
              ]"
            />
          </a-space>
          <a-space>
            <a-button type="primary" ghost size="small" @click="exportToPDF">
              <template #icon><DownloadOutlined /></template>
              导出 PDF
            </a-button>
          </a-space>
        </div>
      </template>
      <div style="margin: 0 auto; height: 100%">
        <a-textarea
          v-if="reportEditMode === 'edit'"
          :value="reportContents[reportSection]"
          :style="{
            height: '100%',
            minHeight: 500,
            fontFamily: 'monospace',
            fontSize: 13,
            lineHeight: 1.6,
            border: 'none',
            boxShadow: 'none',
            background: '#fafafa',
            padding: 16,
            borderRadius: 6,
            resize: 'none',
          }"
          placeholder="在此输入 Markdown 内容..."
          @change="
            (e: Event) => {
              reportContents[reportSection] = (e.target as HTMLTextAreaElement).value
            }
          "
        />
        <div v-else class="report-content">
          <template v-if="reportPreviewParts.length > 1">
            <MessageResponse :content="reportPreviewParts[0]" />
            <div
              style="
                height: 320px;
                margin-top: 24px;
                margin-bottom: 32px;
                background: #fff;
                border-radius: 8px;
                padding: 16px;
                border: 1px solid #f0f0f0;
                display: flex;
                align-items: center;
                justify-content: center;
              "
            >
              <svg width="300" height="300" viewBox="0 0 300 300">
                <polygon
                  v-for="level in [20, 40, 60, 80, 100]"
                  :key="level"
                  :points="getRadarPoints([level, level, level, level], 150, 150, 120)"
                  fill="none"
                  stroke="#d9d9d9"
                  stroke-width="0.5"
                />
                <line
                  v-for="(_, i) in 4"
                  :key="'axis-' + i"
                  :x1="150"
                  :y1="150"
                  :x2="getAxisPoint(i, 4, 150, 150, 120).split(',')[0]"
                  :y2="getAxisPoint(i, 4, 150, 150, 120).split(',')[1]"
                  stroke="#d9d9d9"
                  stroke-width="0.5"
                />
                <polygon :points="getRadarPoints(radarScores, 150, 150, 120)" fill="rgba(24,144,255,0.3)" stroke="#1890ff" stroke-width="2" />
                <text
                  v-for="(item, i) in radarData"
                  :key="'label-' + i"
                  :x="getAxisPoint(i, 4, 150, 150, 140).split(',')[0]"
                  :y="getAxisPoint(i, 4, 150, 150, 140).split(',')[1]"
                  text-anchor="middle"
                  :dy="i === 0 ? -6 : i === 2 ? 16 : 4"
                  :dx="i === 1 ? 8 : i === 3 ? -8 : 0"
                  style="font-size: 13px; fill: #595959"
                >
                  {{ item.dimension }} ({{ item.score }})
                </text>
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
  h1 {
    font-size: 28px;
    font-weight: 600;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 2px solid #f0f0f0;
    color: #262626;
  }
  h2 {
    font-size: 22px;
    font-weight: 600;
    margin-top: 32px;
    margin-bottom: 16px;
    color: #262626;
  }
  h3 {
    font-size: 16px;
    font-weight: 500;
    margin-top: 24px;
    margin-bottom: 12px;
    color: #595959;
  }
  p {
    line-height: 1.8;
    margin-bottom: 16px;
    color: #595959;
    font-size: 14px;
  }
  strong {
    font-weight: 600;
    color: #262626;
  }
  hr {
    margin: 24px 0;
    border: 0;
    border-top: 1px solid #f0f0f0;
  }
  ul,
  ol {
    margin-bottom: 16px;
    padding-left: 24px;
  }
  li {
    margin-bottom: 8px;
    line-height: 1.8;
    color: #595959;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 13px;
    th {
      background: #fafafa;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      border: 1px solid #f0f0f0;
      color: #262626;
    }
    td {
      padding: 10px 12px;
      border: 1px solid #f0f0f0;
      color: #595959;
    }
  }
  code {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    color: #d4380d;
  }
  pre {
    background: #f5f5f5;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 16px 0;
    code {
      background: transparent;
      padding: 0;
      color: #262626;
    }
  }
  input[type='checkbox'] {
    margin-right: 8px;
  }
}
</style>

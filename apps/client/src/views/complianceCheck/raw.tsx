import React, { useState, useMemo } from 'react'
import { useProject } from '../contexts/ProjectContext'
import {
  Row,
  Col,
  Card,
  Progress,
  Space,
  Tag,
  Divider,
  Button,
  Modal,
  Input,
  Select,
  Collapse,
  Tooltip,
  Alert,
  Steps,
  Tabs,
  Upload,
  Badge,
  Table,
  App,
  Statistic,
  Tree,
  Typography,
  Switch,
  Segmented,
} from 'antd'
import type { UploadProps, TableColumnsType, TreeDataNode, Key } from 'antd'
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
  DeleteOutlined,
  StopOutlined,
  WarningOutlined,
  UserOutlined,
  CheckOutlined,
  UploadOutlined,
  FileTextOutlined,
  ScanOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  DatabaseOutlined,
  BookOutlined,
  RocketOutlined,
  FileDoneOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  LinkOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { saveAs } from 'file-saver'

// ─── 数据类型 ─────────────────────────────────────────────────────
type ComplianceCategory = 'formal' | 'response' | 'sensitive' | 'logic'

interface ComplianceItem {
  key: string
  category: ComplianceCategory
  requirement: string
  aiResponse: string
  status: 'pass' | 'fail' | 'warning'
  score: number
  maxScore: number
  isCritical?: boolean // 一票否决项
}

// ─── 分类配置 ──────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<ComplianceCategory, { label: string; tag: string; color: string; bgColor: string; borderColor: string }> = {
  formal: { label: '形式合规检查', tag: '一票否决', color: '#cf1322', bgColor: '#fff1f0', borderColor: '#ffa39e' },
  response: { label: '响应完整性检查', tag: '完整性', color: '#0958d9', bgColor: '#e6f4ff', borderColor: '#adc6ff' },
  sensitive: { label: '敏感性与排他性检查', tag: '反控标', color: '#d46b08', bgColor: '#fff7e6', borderColor: '#ffd591' },
  logic: { label: '内容逻辑一致性检查', tag: '跨模态一致性', color: '#1890ff', bgColor: '#e6f7ff', borderColor: '#91d5ff' },
}

const CATEGORY_ORDER: ComplianceCategory[] = ['formal', 'response', 'sensitive', 'logic']

// ─── Mock 数据 ────────────────────────────────────────────────────
const COMPLIANCE_DATA: ComplianceItem[] = [
  // ── 一、形式合规检查（一票否决项）──
  {
    key: 'F-01',
    category: 'formal',
    requirement: '营业执照有效期核验',
    aiResponse: '营业执照有效期至 2027-12-31，在有效期内，扫描件清晰，已加盖电子印章。',
    status: 'pass',
    score: 10,
    maxScore: 10,
    isCritical: true,
  },
  {
    key: 'F-02',
    category: 'formal',
    requirement: 'ISO 体系认证有效期核验',
    aiResponse: 'ISO 9001:2015 证书有效期至 2025-06-30，ISO 27001 证书有效期至 2026-03-15，均在有效期内。',
    status: 'pass',
    score: 10,
    maxScore: 10,
    isCritical: true,
  },
  {
    key: 'F-03',
    category: 'formal',
    requirement: '法人/授权代表信息一致性',
    aiResponse: '授权书身份证号、姓名与签字人一致，授权有效期覆盖投标时间。',
    status: 'pass',
    score: 8,
    maxScore: 8,
    isCritical: true,
  },
  {
    key: 'F-04',
    category: 'formal',
    requirement: '投标有效期满足最低要求 (≥90天)',
    aiResponse: '标书中填写有效期为 120 天，满足招标文件要求的 90 天最小值。',
    status: 'pass',
    score: 5,
    maxScore: 5,
    isCritical: true,
  },
  {
    key: 'F-05',
    category: 'formal',
    requirement: '投标保证金缴纳凭证完整性',
    aiResponse: '⚠️ 检测到保证金缴纳凭证未上传银行回执单原件扫描件，仅有截图。',
    status: 'warning',
    score: 3,
    maxScore: 5,
    isCritical: true,
  },
  {
    key: 'F-06',
    category: 'formal',
    requirement: '排版装订 & 页码连续性检查',
    aiResponse: '正/副页标记正确，共 287 页，页码连续，无空白页。',
    status: 'pass',
    score: 5,
    maxScore: 5,
    isCritical: true,
  },
  // ── 二、内容逻辑检查（跨模态一致性）──
  {
    key: 'L-01',
    category: 'logic',
    requirement: '技术参数表与正文描述数值对撞',
    aiResponse: '⚠️ 检测到冲突：技术响应表中"并发用户数"填写 500，但第 4.3 章正文描述为"支持 300 并发"。',
    status: 'fail',
    score: 0,
    maxScore: 12,
  },
  {
    key: 'L-02',
    category: 'logic',
    requirement: '项目名称全文统一性检查',
    aiResponse: '全文共 142 处引用项目名称，其中 3 处使用简称"智慧园区"而非全称"XX市智慧园区综合管理平台"。',
    status: 'warning',
    score: 6,
    maxScore: 8,
  },
  {
    key: 'L-03',
    category: 'logic',
    requirement: '商务标产品型号与技术标配置清单匹配',
    aiResponse: '⚠️ 分项报价表第 7 项型号"H3C S6520-54QF"与配置清单中型号"H3C S6520X-54QF-HI"不一致。',
    status: 'fail',
    score: 0,
    maxScore: 10,
  },
  {
    key: 'L-04',
    category: 'logic',
    requirement: '空项/漏项占位符扫描',
    aiResponse: '检测到 2 处未填充占位符：第 5.1 章 [请填入日期]、第 7.2 章 "XXX公司"。',
    status: 'fail',
    score: 0,
    maxScore: 8,
  },
  // ── 三、敏感性与排他性检查（反控标）──
  {
    key: 'S-01',
    category: 'sensitive',
    requirement: '排他性条款 / 特定品牌私有协议检查',
    aiResponse: '⚠️ 第 6.2 章检测到"华为 iMaster NCE"专有平台名称引用，可能被判定为指向特定供应商。',
    status: 'fail',
    score: 0,
    maxScore: 10,
  },
  {
    key: 'S-02',
    category: 'sensitive',
    requirement: '涉密信息与客户脱敏检查',
    aiResponse: '全文脱敏扫描通过，未检测到其他客户敏感信息或内部代号泄露。',
    status: 'pass',
    score: 8,
    maxScore: 8,
  },
  {
    key: 'S-03',
    category: 'sensitive',
    requirement: '★/▲ 指标负偏离强制检查',
    aiResponse: '共 18 项带 ★ 指标，全部为"无偏离"或"正偏离"；12 项带 ▲ 指标均满足。',
    status: 'pass',
    score: 15,
    maxScore: 15,
  },
  // ── 四、响应完整性检查 ──
  {
    key: 'R-01',
    category: 'response',
    requirement: '技术方案各章节响应完整性',
    aiResponse: '技术方案共 12 章，全部章节均有实质性响应内容，无空章节或模板占位符。',
    status: 'pass',
    score: 10,
    maxScore: 10,
  },
  {
    key: 'R-02',
    category: 'response',
    requirement: '商务响应文件完整性核验',
    aiResponse: '⚠️ 分项报价表第 3 页"运维服务费"填写为"详见附件"，未填具体金额，视为响应不完整。',
    status: 'warning',
    score: 5,
    maxScore: 8,
  },
  {
    key: 'R-03',
    category: 'response',
    requirement: '资质证书齐套性检查',
    aiResponse: '招标要求提供 6 类资质证书，实际提交 6 份，齐套率 100%，有效期均在要求范围内。',
    status: 'pass',
    score: 8,
    maxScore: 8,
  },
]

type ReviewTaskStatus = 'reviewing' | 'waiting' | 'suspended' | 'completed'
interface ReviewTaskLog {
  time: string
  skill: string
  color: string
  message: string
}
interface ReviewTask {
  id: string
  title: string
  status: ReviewTaskStatus
  progress: number
  agent: string
  requiresManual?: boolean
  manualReason?: string
  logs: ReviewTaskLog[]
}

const REVIEW_TASKS: ReviewTask[] = [
  {
    id: 'rt-1',
    title: '数据脱敏技术章节',
    status: 'reviewing',
    progress: 75,
    agent: '合规Agent-A',
    logs: [
      { time: '09:12:04', skill: 'LoadRuleSet', color: 'blue', message: '加载数据脱敏规则集 v2.4，共 38 条规则' },
      { time: '09:12:07', skill: 'ScanKeywords', color: 'purple', message: '关键词扫描完成：检测到 3 处潜在敏感字段' },
      { time: '09:12:11', skill: 'PatternMatch', color: 'orange', message: '正则匹配：身份证号 ×0 · 手机号 ×2 · 银行卡 ×1' },
      { time: '09:12:15', skill: 'ContextAnalyze', color: 'cyan', message: '上下文分析中：判断是否已脱敏处理…' },
    ],
  },
  {
    id: 'rt-2',
    title: '技术负责人资质审查',
    status: 'reviewing',
    progress: 45,
    agent: '合规Agent-B',
    logs: [
      { time: '09:13:01', skill: 'FetchQualDoc', color: 'blue', message: '拉取资质证书文档，共 5 份附件' },
      { time: '09:13:05', skill: 'OCRExtract', color: 'purple', message: 'OCR识别完成：姓名/证书编号/有效期已提取' },
      { time: '09:13:09', skill: 'CrossCheck', color: 'orange', message: '与招标要求比对：PMP证书待核验…' },
    ],
  },
  {
    id: 'rt-3',
    title: '系统并发性能验证',
    status: 'waiting',
    progress: 0,
    agent: '合规Agent-A',
    logs: [],
  },
  {
    id: 'rt-4',
    title: '投标保证金凭证核验',
    status: 'suspended',
    progress: 30,
    agent: '合规Agent-B',
    requiresManual: true,
    manualReason: 'AI无法判定截图是否为银行原件，需人工核查银行回执原件扫描件的真实性及完整性（第 F-05 项）',
    logs: [
      { time: '09:11:22', skill: 'FetchAttachment', color: 'blue', message: '获取保证金附件：发现截图文件（非PDF）' },
      { time: '09:11:26', skill: 'DocAuthenticate', color: 'purple', message: '文档鉴别：无法确认原件真实性，置信度 31%' },
      { time: '09:11:28', skill: 'HumanEscalate', color: 'red', message: '⚠️ 触发人工介入规则：置信度低于阈值（60%）' },
    ],
  },
  {
    id: 'rt-5',
    title: '法人签章盖章确认',
    status: 'suspended',
    progress: 60,
    agent: '合规Agent-A',
    requiresManual: true,
    manualReason: 'AI在第198页未检测��法人签章图层，需人工翻阅原件确认签章真实存在并拍照上传（第 C-02 项）',
    logs: [
      { time: '09:14:03', skill: 'SealDetect', color: 'blue', message: '印章检测：扫描全文 287 页' },
      { time: '09:14:08', skill: 'ImageAnalyze', color: 'purple', message: '第198页图层分析：未检测到印章像素区域' },
      { time: '09:14:10', skill: 'HumanEscalate', color: 'red', message: '⚠️ 触发人工介入：疑似漏章，需人工复核' },
    ],
  },
]

// ─── 统一Card样式常量 ─────────────────────────────────────────────
/** 让 Card 内部 flex-column 撑满父容器高度 */
const CARD_FLEX_STYLE: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
}

/** 让 Card body 自动填充并支持滚动 */
const CARD_BODY_FLEX = (padding = '12px'): React.CSSProperties => ({
  padding,
  flex: 1,
  overflow: 'auto',
  minHeight: 0,
})

// ─── 文档上传相关类型与常量 ──────────────────────────────────────────
type OcrStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface UploadedFile {
  key: string
  name: string
  size: number
  type: 'pdf' | 'word' | 'excel' | 'image'
  uploadTime: string
  ocrStatus: OcrStatus
  ocrProgress: number
}

const FILE_TYPE_ICONS: Record<string, React.ReactNode> = {
  pdf: <FilePdfOutlined style={{ color: '#ff4d4f' }} />,
  word: <FileWordOutlined style={{ color: '#1890ff' }} />,
  excel: <FileExcelOutlined style={{ color: '#52c41a' }} />,
  image: <FileImageOutlined style={{ color: '#722ed1' }} />,
}

const OCR_STATUS_CONFIG: Record<OcrStatus, { text: string; color: string }> = {
  pending: { text: '待识别', color: 'default' },
  processing: { text: '识别中', color: 'processing' },
  completed: { text: '已完成', color: 'success' },
  failed: { text: '识别失败', color: 'error' },
}

// 预置的招标文件mock数据
const MOCK_BID_FILES: UploadedFile[] = [
  { key: 'bf-1', name: '招标文件-XX市智慧园区项目.pdf', size: 5242880, type: 'pdf', uploadTime: '2026-03-05 14:30', ocrStatus: 'completed', ocrProgress: 100 },
  { key: 'bf-2', name: '招标补充公告（一）.pdf', size: 1048576, type: 'pdf', uploadTime: '2026-03-05 14:32', ocrStatus: 'completed', ocrProgress: 100 },
]

// 预置的投标文件mock数据
const MOCK_RESPONSE_FILES: UploadedFile[] = [
  { key: 'rf-1', name: '投标文件-技术标（终版）.pdf', size: 8388608, type: 'pdf', uploadTime: '2026-03-06 09:15', ocrStatus: 'completed', ocrProgress: 100 },
  { key: 'rf-2', name: '商务标-报价清单.xlsx', size: 524288, type: 'excel', uploadTime: '2026-03-06 09:18', ocrStatus: 'completed', ocrProgress: 100 },
  { key: 'rf-3', name: '资质证书汇编.pdf', size: 3145728, type: 'pdf', uploadTime: '2026-03-06 09:20', ocrStatus: 'completed', ocrProgress: 100 },
]

// 预置的检查项文件mock数据
const MOCK_CHECKLIST_FILES: UploadedFile[] = [
  { key: 'cf-1', name: '合规检查项清单-形式审查.docx', size: 204800, type: 'word', uploadTime: '2026-03-06 10:00', ocrStatus: 'completed', ocrProgress: 100 },
  { key: 'cf-2', name: '合规检查项清单-内容逻辑.docx', size: 184320, type: 'word', uploadTime: '2026-03-06 10:02', ocrStatus: 'completed', ocrProgress: 100 },
]

// ─── 知识库相关类型与常量 ────────────────────────────────────────────
type IndexStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface KnowledgeFile extends UploadedFile {
  indexStatus: IndexStatus
  indexProgress: number
  indexChunks?: Array<{
    id: string
    content: string
    metadata: string
  }>
}

const INDEX_STATUS_CONFIG: Record<IndexStatus, { text: string; color: string }> = {
  pending: { text: '待索引', color: 'default' },
  processing: { text: '索引中', color: 'processing' },
  completed: { text: '已索引', color: 'success' },
  failed: { text: '索引失败', color: 'error' },
}

// 预置的合规知识库mock数据
const MOCK_KNOWLEDGE_FILES: KnowledgeFile[] = [
  {
    key: 'kf-1',
    name: '等保2.0合规标准库.pdf',
    size: 6291456,
    type: 'pdf',
    uploadTime: '2026-02-20 09:00',
    ocrStatus: 'completed',
    ocrProgress: 100,
    indexStatus: 'completed',
    indexProgress: 100,
    indexChunks: [
      {
        id: 'kc-1-1',
        content: '等级保护2.0基本要求：三级系统应实施访问控制、安全审计、入侵防范、恶意代码防范等安全措施。',
        metadata: '来源：第12页 | 类别：等保三级 | 向量维度：1536',
      },
      {
        id: 'kc-1-2',
        content: '数据完整性和保密性要求：应采用校验技术或密码技术保证重要数据在传输过程中的完整性和保密性。',
        metadata: '来源：第28页 | 类别：数据安全 | 向量维度：1536',
      },
      {
        id: 'kc-1-3',
        content: '安全管理中心：应��分����������管理区域，对网络、主机和应用的安全策略实施集中管��。',
        metadata: '来源：第35页 | 类别：安全管理 | 向量维度：1536',
      },
    ],
  },
  {
    key: 'kf-2',
    name: '政务标书合规检查模板库.docx',
    size: 3145728,
    type: 'word',
    uploadTime: '2026-02-22 14:30',
    ocrStatus: 'completed',
    ocrProgress: 100,
    indexStatus: 'completed',
    indexProgress: 100,
    indexChunks: [
      {
        id: 'kc-2-1',
        content: '形式合规��查：投标文件签章检查、授权委托书有���性检查、响应偏离表完整性检查。',
        metadata: '��源：第3页 | 类别：形式合规 | 向量维度：1536',
      },
      {
        id: 'kc-2-2',
        content: '内容逻辑检查：技术方案与招标需求映射验证、指标参数一致性校验、交叉引用完整性检查。',
        metadata: '来源：第8页 | 类别：内容逻辑 | 向量维度：1536',
      },
    ],
  },
  {
    key: 'kf-3',
    name: '国密算法合规指南（SM2/SM3/SM4）.pdf',
    size: 2097152,
    type: 'pdf',
    uploadTime: '2026-02-25 11:15',
    ocrStatus: 'completed',
    ocrProgress: 100,
    indexStatus: 'completed',
    indexProgress: 100,
    indexChunks: [
      {
        id: 'kc-3-1',
        content: 'SM2椭圆曲线公钥密码算法，适用于数字签名、密钥交换和公钥加密，替代RSA/ECDSA。',
        metadata: '来源：第5页 | 类别：国密算法 | 向量维度：1536',
      },
      {
        id: 'kc-3-2',
        content: 'SM4分组密码算法，分组长度和密钥长度均为128比特，适用于数据加密，替代AES。',
        metadata: '来源：第12页 | 类别：国密算法 | 向量维度：1536',
      },
    ],
  },
  {
    key: 'kf-4',
    name: '敏感信息排查规则库.xlsx',
    size: 1048576,
    type: 'excel',
    uploadTime: '2026-03-01 16:40',
    ocrStatus: 'completed',
    ocrProgress: 100,
    indexStatus: 'pending',
    indexProgress: 0,
  },
]

// ─── 组件 ─────────────────────────────────────────────────────────
const ComplianceCheck: React.FC = () => {
  const { currentProject } = useProject()
  const { message } = App.useApp()

  // Steps/Tabs 状态
  const [activeTab, setActiveTab] = useState<string>('1')

  // 文档上传状态
  const [bidFiles, setBidFiles] = useState<UploadedFile[]>(MOCK_BID_FILES)
  const [responseFiles, setResponseFiles] = useState<UploadedFile[]>(MOCK_RESPONSE_FILES)
  const [checklistFiles, setChecklistFiles] = useState<UploadedFile[]>(MOCK_CHECKLIST_FILES)

  // 知识库状态
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>(MOCK_KNOWLEDGE_FILES)
  const [indexViewVisible, setIndexViewVisible] = useState(false)
  const [currentIndexFile, setCurrentIndexFile] = useState<KnowledgeFile | null>(null)
  const [filePreviewVisible, setFilePreviewVisible] = useState(false)
  const [currentPreviewFile, setCurrentPreviewFile] = useState<KnowledgeFile | null>(null)

  // 状态
  const [selectedComplianceKey, setSelectedComplianceKey] = useState<string>('L-01')
  const [customRules, setCustomRules] = useState<string[]>(['数据脱敏强制检查', 'SM国密算法验证'])
  const [isQueuePaused, setIsQueuePaused] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<ComplianceCategory>>(new Set())

  // ─── 审查队列状态 ──────────────────────────────────────────────
  const [taskPausedMap, setTaskPausedMap] = useState<Record<string, boolean>>({})
  const [pendingManualTaskId, setPendingManualTaskId] = useState<string | null>(null)
  const [manualConfirmedSet, setManualConfirmedSet] = useState<Set<string>>(new Set())
  const [manualNote, setManualNote] = useState('')

  // ─── Drools规则编辑器状态 ──────────────────────────────────────
  const [droolsModalOpen, setDroolsModalOpen] = useState(false)
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null)
  const [droolsRuleName, setDroolsRuleName] = useState('')
  const [droolsSalience, setDroolsSalience] = useState('100')
  const [droolsFactType, setDroolsFactType] = useState('BidDocument')
  const [droolsCondition, setDroolsCondition] = useState('')
  const [droolsAction, setDroolsAction] = useState('')

  // ─── 检查项解析表格状态 ─────────────────────────────────────────
  const [complianceData, setComplianceData] = useState<ComplianceItem[]>([...COMPLIANCE_DATA])
  const [editingComplianceKey, setEditingComplianceKey] = useState<string>('')
  const [expandedComplianceKeys, setExpandedComplianceKeys] = useState<string[]>([])

  const isComplianceEditing = (record: ComplianceItem) => record.key === editingComplianceKey

  const handleComplianceEdit = (record: ComplianceItem) => {
    setEditingComplianceKey(record.key)
  }

  const handleComplianceSave = () => {
    setEditingComplianceKey('')
    message.success('检查项已保存')
  }

  const handleComplianceCancel = () => {
    setEditingComplianceKey('')
  }

  const handleComplianceDelete = (key: string) => {
    setComplianceData((prev) => prev.filter((item) => item.key !== key))
    message.success('检查项已删除')
  }

  const handleComplianceFieldChange = (key: string, field: keyof ComplianceItem, value: any) => {
    setComplianceData((prev) => prev.map((item) => (item.key === key ? { ...item, [field]: value } : item)))
  }

  const handleComplianceRegenerate = () => {
    message.loading({ content: 'AI 正在重新解析检查项…', key: 'regen' })
    setTimeout(() => {
      setComplianceData([...COMPLIANCE_DATA])
      message.success({ content: '检查项已重新生成', key: 'regen' })
    }, 1500)
  }

  // ─── 报告生成状态 ──────────────────────────────────────────────
  const [reportSection, setReportSection] = useState<string>('summary')
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [reportEditMode, setReportEditMode] = useState<'preview' | 'edit'>('preview')

  // 初始化各章节 Markdown 内容
  const [reportContents, setReportContents] = useState<Record<string, string>>({
    summary: `# 第一部分：审计综述 (Executive Summary)

## 项目基本信息

**项目名称**：${currentProject?.name || '未命名项目'}
**项目编号**：${currentProject?.id || 'N/A'}
**投递截止时间**：${currentProject?.deadline || '未设定'}

---

## 风险雷达图

综合分析四个维度的得分情况：

:::radar-chart

## 结论判定

${
  complianceData.filter((i) => i.status === 'fail' && i.isCritical).length > 0
    ? '🔴 **极高风险** - 发现致命废标项，不建议提交'
    : complianceData.filter((i) => i.status === 'fail').length > 0 || complianceData.filter((i) => i.status === 'warning').length > 3
      ? '🟡 **中危建议** - 发现若干问题，建议修改后提交'
      : '🟢 **准予封标** - 所有检查项均符合要求，可以提交'
}

---

### 总体评估

- **检查项总数**：${complianceData.length} 项
- **通过项**：${complianceData.filter((i) => i.status === 'pass').length} 项
- **失败项**：${complianceData.filter((i) => i.status === 'fail').length} 项
- **警告项**：${complianceData.filter((i) => i.status === 'warning').length} 项
- **一票否决触发**：${complianceData.filter((i) => i.status === 'fail' && i.isCritical).length} 项

### 综合得分

**${Math.round((complianceData.reduce((sum, i) => sum + i.score, 0) / (complianceData.reduce((sum, i) => sum + i.maxScore, 0) || 1)) * 100)}** / 100 分`,

    blockers: `# 第二部分：废标项警示 (Blocker Issues)

## 致命风险列表

${
  complianceData.filter((i) => i.status === 'fail' && i.isCritical).length === 0
    ? '✅ **未发现致命废标项**，所有一票否决项均已通过检查。'
    : `⚠️ **发现 ${complianceData.filter((i) => i.status === 'fail' && i.isCritical).length} 项致命风险**，必须立即处理：\n\n${complianceData
        .filter((i) => i.status === 'fail' && i.isCritical)
        .map(
          (item, idx) =>
            `### ${idx + 1}. ${item.requirement} [${item.key}]\n\n**检查结果**：${item.aiResponse}\n\n**得分**：${item.score} / ${item.maxScore}\n\n**影响**：触发一票否决，将导致废标\n\n---`,
        )
        .join('\n\n')}`
}

## 其他失败项

${
  complianceData.filter((i) => i.status === 'fail' && !i.isCritical).length === 0
    ? '✅ 无其他失败项'
    : complianceData
        .filter((i) => i.status === 'fail' && !i.isCritical)
        .map(
          (item, idx) =>
            `### ${idx + 1}. ${item.requirement} [${item.key}]\n\n**检查结果**：${item.aiResponse}\n\n**得分**：${item.score} / ${item.maxScore}\n\n---`,
        )
        .join('\n\n')
}`,

    details: `# 第三部分：维度详述 (Detailed Audit)

## 1. 形式合规检查

${complianceData
  .filter((i) => i.category === 'formal')
  .map(
    (item, idx) => `### ${idx + 1}. ${item.requirement}
**状态**：${item.status === 'pass' ? '✅ 通过' : item.status === 'fail' ? '❌ 失败' : '⚠️ 警告'}
**编号**：${item.key}
**得分**：${item.score} / ${item.maxScore}
${item.isCritical ? '**标记**：一票否决项\n' : ''}
**AI 审计结果**：${item.aiResponse}
---`,
  )
  .join('\n\n')}

## 2. 响应完整性检查

${complianceData
  .filter((i) => i.category === 'response')
  .map(
    (item, idx) => `### ${idx + 1}. ${item.requirement}
**状态**：${item.status === 'pass' ? '✅ 通过' : item.status === 'fail' ? '❌ 失败' : '⚠️ 警告'}
**编号**：${item.key}
**得分**：${item.score} / ${item.maxScore}
**AI 审计结果**：${item.aiResponse}
---`,
  )
  .join('\n\n')}

## 3. 敏感性与排他性检查

${complianceData
  .filter((i) => i.category === 'sensitive')
  .map(
    (item, idx) => `### ${idx + 1}. ${item.requirement}
**状态**：${item.status === 'pass' ? '✅ 通过' : item.status === 'fail' ? '❌ 失败' : '⚠️ 警告'}
**编号**：${item.key}
**得分**：${item.score} / ${item.maxScore}
**AI 审计结果**：${item.aiResponse}
---`,
  )
  .join('\n\n')}

## 4. 内容逻辑一致性检查

${complianceData
  .filter((i) => i.category === 'logic')
  .map(
    (item, idx) => `### ${idx + 1}. ${item.requirement}
**状态**：${item.status === 'pass' ? '✅ 通过' : item.status === 'fail' ? '❌ 失败' : '⚠️ 警告'}
**编号**：${item.key}
**得分**：${item.score} / ${item.maxScore}
**AI 审计结果**：${item.aiResponse}
---`,
  )
  .join('\n\n')}`,

    checklist: `# 第四部分：封标确认清单 (Final Checklist)

## 签章位置汇总

根据招标文件要求，以下位置需加盖相应印章：

| 序号 | 页码 | 位置说明 | 印章类型 | 状态 |
|------|------|----------|----------|------|
| 1 | P.5 | 投标函 | 公章 | ✅ 已检测 |
| 2 | P.12 | 法定代表人授权书 | 公章 + 法人章 | ✅ 已检测 |
| 3 | P.23 | 商务响应文件封面 | 公章 | ✅ 已检测 |
| 4 | P.156 | 技术响应文件封面 | 公章 | ✅ 已检测 |
| 5 | P.198 | 分项报价表 | 法人章 | ⚠️ 未检测到 |
| 6 | P.245 | 投标保证金缴纳凭证 | 公章 | ✅ 已检测 |

---

## 装订与加密要求

### 📄 文档分册要求

- **正本**：1 册（含原件）
- **副本**：5 册（彩色复印件）
- **电子版**：U 盘 1 个（含 PDF 格式文件）

### 🔒 PDF 命名规范

\`\`\`
[项目编号]_[单位名称]_正本.pdf
[项目编号]_[单位名称]_副本.pdf
\`\`\`

示例：\`2026-GZ-001_XX科技有限公司_正本.pdf\`

### 📦 装订要求

- 采用胶装或线装
- 页码连续编号
- 封面使用 200g 铜版纸
- 封底使用 120g 白卡纸

### 💾 U 盘备份要求

- 容量不小于 8GB
- 格式化为 FAT32 格式
- 文件不加密、不压缩
- 外贴标签注明项目名称

---

## 提交前最终确认

- [ ] 所有资质证照均在有效期内
- [ ] 所有印章位置齐全清晰
- [ ] 页码连续无缺页
- [ ] 电子版与纸质版内容一致
- [ ] 投标文件密封完整
- [ ] 报价金额大小写一致
- [ ] 所有必填项均已填写
- [ ] 未出现其他项目名称或客户信息
- [ ] U 盘已备份并贴标签
- [ ] 投标保证金已缴纳

---

**报告生成时间**：${new Date().toLocaleString('zh-CN')}
**AI 引擎版本**：Baguwen AI v2.0
**检查项版本**：GB/T 2024-001`,
  })

  // 动态生成目录树：解析 Markdown 中的 ## 二级标题
  const reportTreeData = useMemo<TreeDataNode[]>(() => {
    const sections = [
      { key: 'summary', title: '审计综述', icon: <RocketOutlined /> },
      { key: 'blockers', title: '废标项警示', icon: <WarningOutlined /> },
      { key: 'details', title: '维度详述', icon: <FileSearchOutlined /> },
      { key: 'checklist', title: '封标确认清单', icon: <CheckCircleOutlined /> },
    ]

    return sections.map((sec) => {
      const content = reportContents[sec.key] || ''
      const lines = content.split('\n')
      const h2Nodes: TreeDataNode[] = []

      lines.forEach((line, idx) => {
        const h2Match = line.match(/^##\s+(.+)$/)
        const h3Match = line.match(/^###\s+(.+)$/)
        if (h2Match) {
          h2Nodes.push({
            key: `${sec.key}-h2-${idx}`,
            title: h2Match[1].trim(),
            icon: <FileTextOutlined style={{ fontSize: 12 }} />,
          })
        }
      })

      return {
        ...sec,
        children: h2Nodes,
      }
    })
  }, [reportContents])

  const [expandedReportKeys, setExpandedReportKeys] = useState<Key[]>(['summary', 'blockers', 'details', 'checklist'])

  // 报告生成辅助函数
  const generateReport = () => {
    setIsGeneratingReport(true)
    message.loading({ content: 'AI 正在生成审计报告...', key: 'report-gen' })
    setTimeout(() => {
      setIsGeneratingReport(false)
      message.success({ content: '报告生成完成', key: 'report-gen' })
    }, 2000)
  }

  const exportToDocx = async () => {
    try {
      message.loading({ content: '正在导出 Word 文档...', key: 'export-docx' })

      const sections = Object.keys(reportContents).map((key) => {
        const lines = reportContents[key].split('\n')
        return lines.map((line) => {
          const h1Match = line.match(/^#\s+(.+)$/)
          const h2Match = line.match(/^##\s+(.+)$/)
          const h3Match = line.match(/^###\s+(.+)$/)

          if (h1Match) return new Paragraph({ text: h1Match[1], heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 120 } })
          if (h2Match) return new Paragraph({ text: h2Match[1], heading: HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 } })
          if (h3Match) return new Paragraph({ text: h3Match[1], heading: HeadingLevel.HEADING_3, spacing: { before: 120, after: 60 } })

          if (line.includes(':::radar-chart')) {
            return new Paragraph({ text: '[此处包含风险雷达图]', spacing: { before: 100, after: 100 }, alignment: AlignmentType.CENTER })
          }

          return new Paragraph({ text: line, spacing: { after: 100 } })
        })
      })

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: '标书合规性审计报告',
                heading: HeadingLevel.HEADING_1,
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
              }),
              new Paragraph({
                text: `项目名称：${currentProject?.name || '未知项目'}`,
                spacing: { after: 200 },
              }),
              ...sections.flat(),
            ],
          },
        ],
      })

      const blob = await Packer.toBlob(doc)
      saveAs(blob, `审计报告_${currentProject?.name || '������'}_${new Date().toLocaleDateString()}.docx`)
      message.success({ content: 'Word 文档导出成功', key: 'export-docx' })
    } catch (error) {
      message.error({ content: '导出失败，请重试', key: 'export-docx' })
    }
  }

  const { TextArea } = Input

  const complianceColumns: TableColumnsType<ComplianceItem> = [
    {
      title: '序号',
      key: 'index',
      width: 55,
      fixed: 'left',
      align: 'center',
      render: (_: any, __: ComplianceItem, index: number) => <span style={{ fontSize: 11, color: '#8c8c8c', fontFamily: 'monospace' }}>{index + 1}</span>,
    },
    {
      title: '编号',
      dataIndex: 'key',
      key: 'key',
      width: 70,
      render: (text: string) => <span style={{ fontSize: 11, color: '#8c8c8c', fontFamily: 'monospace' }}>{text}</span>,
    },
    {
      title: '检查类别',
      dataIndex: 'category',
      key: 'category',
      width: 150,
      filters: CATEGORY_ORDER.map((cat) => ({ text: CATEGORY_CONFIG[cat].label, value: cat })),
      onFilter: (value, record) => record.category === value,
      render: (cat: ComplianceCategory, record: ComplianceItem) => {
        if (isComplianceEditing(record)) {
          return (
            <Select value={cat} onChange={(value) => handleComplianceFieldChange(record.key, 'category', value)} size="small" style={{ width: '100%' }}>
              {CATEGORY_ORDER.map((c) => (
                <Select.Option key={c} value={c}>
                  {CATEGORY_CONFIG[c].label}
                </Select.Option>
              ))}
            </Select>
          )
        }
        const config = CATEGORY_CONFIG[cat]
        return (
          <Tag
            style={{
              margin: 0,
              fontSize: 11,
              color: config.color,
              background: config.bgColor,
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: config.borderColor,
            }}
          >
            {config.label}
          </Tag>
        )
      },
    },
    {
      title: '检查项要求',
      dataIndex: 'requirement',
      key: 'requirement',
      render: (text: string, record: ComplianceItem) => {
        if (isComplianceEditing(record)) {
          return (
            <TextArea
              value={text}
              onChange={(e) => handleComplianceFieldChange(record.key, 'requirement', e.target.value)}
              size="small"
              autoSize={{ minRows: 2, maxRows: 6 }}
            />
          )
        }
        const isExpanded = expandedComplianceKeys.includes(record.key)
        const isLongText = text.length > 40
        return (
          <div
            style={{
              cursor: isLongText ? 'pointer' : 'default',
              maxHeight: isExpanded ? '200px' : '44px',
              overflow: isExpanded ? 'auto' : 'hidden',
              textOverflow: isExpanded ? 'initial' : 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: isExpanded ? 'unset' : 2,
              WebkitBoxOrient: 'vertical',
              wordBreak: 'break-word',
              transition: 'all 0.3s ease',
              fontSize: 12,
            }}
            onClick={() => {
              if (isLongText) {
                setExpandedComplianceKeys((prev) => (prev.includes(record.key) ? prev.filter((k) => k !== record.key) : [...prev, record.key]))
              }
            }}
          >
            {text}
            {isLongText && !isExpanded && <span style={{ color: '#1890ff' }}> ...展开</span>}
            {isLongText && isExpanded && <span style={{ color: '#1890ff' }}> 收起</span>}
          </div>
        )
      },
    },
    {
      title: '满分',
      dataIndex: 'maxScore',
      key: 'maxScore',
      width: 80,
      align: 'center',
      sorter: (a, b) => a.maxScore - b.maxScore,
      render: (score: number, record: ComplianceItem) => {
        if (isComplianceEditing(record)) {
          return (
            <Input
              value={score}
              onChange={(e) => handleComplianceFieldChange(record.key, 'maxScore', Number(e.target.value))}
              size="small"
              type="number"
              style={{ width: 60 }}
            />
          )
        }
        return <span style={{ fontWeight: 600, color: '#1890ff' }}>{score}</span>
      },
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
      onFilter: (value, record) => record.status === value,
      render: (status: ComplianceItem['status'], record: ComplianceItem) => {
        if (isComplianceEditing(record)) {
          return (
            <Select value={status} onChange={(value) => handleComplianceFieldChange(record.key, 'status', value)} size="small" style={{ width: '100%' }}>
              <Select.Option value="pass">通过</Select.Option>
              <Select.Option value="warning">需人工复核</Select.Option>
              <Select.Option value="fail">存在风险</Select.Option>
            </Select>
          )
        }
        return status === 'pass' ? (
          <Tag icon={<CheckCircleOutlined />} color="success" style={{ margin: 0 }}>
            通过
          </Tag>
        ) : status === 'warning' ? (
          <Tag icon={<ExclamationCircleOutlined />} color="warning" style={{ margin: 0 }}>
            需复核
          </Tag>
        ) : (
          <Tag icon={<CloseCircleOutlined />} color="error" style={{ margin: 0 }}>
            风险
          </Tag>
        )
      },
    },
    {
      title: '一票否决',
      dataIndex: 'isCritical',
      key: 'isCritical',
      width: 90,
      align: 'center',
      filters: [
        { text: '是', value: true },
        { text: '否', value: false },
      ],
      onFilter: (value, record) => (record.isCritical || false) === value,
      render: (isCritical: boolean | undefined, record: ComplianceItem) => {
        if (isComplianceEditing(record)) {
          return (
            <Select
              value={isCritical || false}
              onChange={(value) => handleComplianceFieldChange(record.key, 'isCritical', value)}
              size="small"
              style={{ width: '100%' }}
            >
              <Select.Option value={true}>是</Select.Option>
              <Select.Option value={false}>否</Select.Option>
            </Select>
          )
        }
        return isCritical ? (
          <Tag color="error" style={{ margin: 0, fontSize: 10 }}>
            一票否决
          </Tag>
        ) : (
          <span style={{ color: '#bfbfbf', fontSize: 11 }}>—</span>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right',
      render: (_: any, record: ComplianceItem) => {
        const editable = isComplianceEditing(record)
        return editable ? (
          <Space size="small">
            <Button key="save-btn" type="link" size="small" onClick={handleComplianceSave}>
              保存
            </Button>
            <Button key="cancel-btn" type="link" size="small" onClick={handleComplianceCancel}>
              取消
            </Button>
          </Space>
        ) : (
          <Space size="small">
            <Button
              key="edit-btn"
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleComplianceEdit(record)}
              disabled={editingComplianceKey !== ''}
            >
              编辑
            </Button>
            <Button key="delete-btn" type="link" danger size="small" onClick={() => handleComplianceDelete(record.key)} disabled={editingComplianceKey !== ''}>
              删除
            </Button>
          </Space>
        )
      },
    },
  ]

  const DROOLS_FACT_TYPES = [
    { value: 'BidDocument', label: 'BidDocument (标书文档)' },
    { value: 'TechnicalSpec', label: 'TechnicalSpec (技术规格)' },
    { value: 'PriceItem', label: 'PriceItem (报价项)' },
    { value: 'Qualification', label: 'Qualification (资质证书)' },
    { value: 'SealCheckpoint', label: 'SealCheckpoint (封标检查点)' },
  ]

  const openDroolsEditor = (index: number) => {
    setEditingRuleIndex(index)
    const ruleName = customRules[index]
    setDroolsRuleName(ruleName)
    // 根据规则名称生成预设的 Drools 模板
    if (ruleName === '数据脱敏强制检查') {
      setDroolsSalience('200')
      setDroolsFactType('BidDocument')
      setDroolsCondition('$doc : BidDocument(\n    contentText matches ".*(?:身份证号|手机号|银行账号).*",\n    desensitized == false\n)')
      setDroolsAction(
        '$doc.setStatus("FAIL");\n$doc.addViolation("检测到未脱敏的敏感信息");\ninsert(new ComplianceAlert("CRITICAL", "数据脱敏违规", $doc.getLocation()));',
      )
    } else if (ruleName === 'SM国密算法验证') {
      setDroolsSalience('150')
      setDroolsFactType('TechnicalSpec')
      setDroolsCondition('$spec : TechnicalSpec(\n    category == "加密算法",\n    algorithm not matches "SM[234].*"\n)')
      setDroolsAction(
        '$spec.setStatus("FAIL");\n$spec.addViolation("未使用国密SM系列算法");\ninsert(new ComplianceAlert("WARNING", "国密算法合规", $spec.getSection()));',
      )
    } else {
      setDroolsSalience('100')
      setDroolsFactType('BidDocument')
      setDroolsCondition('$doc : BidDocument(\n    // 在此定义条件\n)')
      setDroolsAction('$doc.setStatus("WARNING");\n$doc.addViolation("自定义规则触发");')
    }
    setDroolsModalOpen(true)
  }

  const handleDroolsSave = () => {
    if (editingRuleIndex !== null && droolsRuleName.trim()) {
      const updated = [...customRules]
      updated[editingRuleIndex] = droolsRuleName.trim()
      setCustomRules(updated)
    }
    setDroolsModalOpen(false)
    setEditingRuleIndex(null)
  }

  const generatedDrl = useMemo(() => {
    return `package com.baguwen.compliance.rules;\n\nimport com.baguwen.model.${droolsFactType};\nimport com.baguwen.model.ComplianceAlert;\n\nrule "${droolsRuleName}"\n    salience ${droolsSalience}\n    when\n        ${droolsCondition.split('\n').join('\n        ')}\n    then\n        ${droolsAction.split('\n').join('\n        ')}\nend`
  }, [droolsRuleName, droolsSalience, droolsFactType, droolsCondition, droolsAction])

  const toggleCategory = (cat: ComplianceCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  // ─── 文档上传处理 ────────────────────────────────────────────────
  const createUploadProps = (setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>, fileType: 'pdf' | 'word' | 'excel' | 'image'): UploadProps => ({
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
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
          .toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
          .replace(/\//g, '-'),
        ocrStatus: 'completed',
        ocrProgress: 100,
      }
      setter((prev) => [...prev, newFile])
      return false
    },
  })

  const bidUploadProps = createUploadProps(setBidFiles, 'pdf')
  const responseUploadProps = createUploadProps(setResponseFiles, 'pdf')
  const checklistUploadProps = createUploadProps(setChecklistFiles, 'word')

  // ─── 知识库上传配置 ─────────────────────────────────────────────
  const knowledgeUploadProps: UploadProps = {
    name: 'file',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      let type: UploadedFile['type'] = 'pdf'
      if (['pdf'].includes(ext)) type = 'pdf'
      else if (['doc', 'docx'].includes(ext)) type = 'word'
      else if (['xls', 'xlsx'].includes(ext)) type = 'excel'
      else if (['jpg', 'jpeg', 'png', 'bmp', 'tiff'].includes(ext)) type = 'image'

      const newFile: KnowledgeFile = {
        key: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        size: file.size,
        type,
        uploadTime: new Date()
          .toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })
          .replace(/\//g, '-'),
        ocrStatus: 'pending',
        ocrProgress: 0,
        indexStatus: 'pending',
        indexProgress: 0,
      }
      setKnowledgeFiles((prev) => [...prev, newFile])
      // 自动触发OCR
      setTimeout(() => triggerKnowledgeOCR(newFile), 300)
      return false
    },
  }

  // 知识库文件OCR识别
  const triggerKnowledgeOCR = (file: KnowledgeFile | UploadedFile) => {
    setKnowledgeFiles((prev) => prev.map((f) => (f.key === file.key ? { ...f, ocrStatus: 'processing' as OcrStatus, ocrProgress: 0 } : f)))
    let progress = 0
    const timer = setInterval(() => {
      progress += Math.random() * 25
      if (progress >= 100) {
        progress = 100
        clearInterval(timer)
        setKnowledgeFiles((prev) =>
          prev.map((f) =>
            f.key === file.key
              ? {
                  ...f,
                  ocrStatus: 'completed' as OcrStatus,
                  ocrProgress: 100,
                }
              : f,
          ),
        )
        message.success(`${file.name} OCR识别完成`)
      } else {
        setKnowledgeFiles((prev) => prev.map((f) => (f.key === file.key ? { ...f, ocrProgress: Math.round(progress) } : f)))
      }
    }, 500)
  }

  // 知识库索引构建
  const triggerIndexBuild = (file: KnowledgeFile) => {
    setKnowledgeFiles((prev) => prev.map((f) => (f.key === file.key ? { ...f, indexStatus: 'processing' as IndexStatus, indexProgress: 0 } : f)))
    let progress = 0
    const timer = setInterval(() => {
      progress += Math.random() * 20
      if (progress >= 100) {
        progress = 100
        clearInterval(timer)
        setKnowledgeFiles((prev) =>
          prev.map((f) =>
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
          ),
        )
        message.success(`${file.name} 索引构建完成`)
      } else {
        setKnowledgeFiles((prev) => prev.map((f) => (f.key === file.key ? { ...f, indexProgress: Math.round(progress) } : f)))
      }
    }, 600)
  }

  // 批量重新识别（知识库）
  const handleBatchKnowledgeOCR = () => {
    message.info(`正在对 ${knowledgeFiles.length} 个知识库文件重新进行OCR识别...`)
    knowledgeFiles.forEach((file) => {
      triggerKnowledgeOCR(file)
    })
  }

  // 批量重构索引
  const handleBatchIndexBuild = () => {
    const eligible = knowledgeFiles.filter((f) => f.ocrStatus === 'completed')
    if (eligible.length === 0) {
      message.warning('没有可构建索引的文件，请先完成OCR识别')
      return
    }
    message.info(`正在对 ${eligible.length} 个文件重构索引...`)
    eligible.forEach((file) => {
      triggerIndexBuild(file)
    })
  }

  // 删除知识库文件
  const handleDeleteKnowledgeFile = (fileKey: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后将同时清除该文件的OCR结果和索引数据，是否继续？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        setKnowledgeFiles((prev) => prev.filter((f) => f.key !== fileKey))
        message.success('文件已删除')
      },
    })
  }

  const triggerOCR = (file: UploadedFile, setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>) => {
    setter((prev) => prev.map((f) => (f.key === file.key ? { ...f, ocrStatus: 'processing' as OcrStatus, ocrProgress: 0 } : f)))
    // 模拟OCR进度
    let progress = 0
    const timer = setInterval(() => {
      progress += Math.random() * 30
      if (progress >= 100) {
        progress = 100
        clearInterval(timer)
        setter((prev) => prev.map((f) => (f.key === file.key ? { ...f, ocrStatus: 'completed' as OcrStatus, ocrProgress: 100 } : f)))
      } else {
        setter((prev) => prev.map((f) => (f.key === file.key ? { ...f, ocrProgress: Math.round(progress) } : f)))
      }
    }, 500)
  }

  const renderFileList = (files: UploadedFile[], setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>) =>
    files.length > 0 && (
      <>
        <Divider />
        <div>
          {files.map((file) => (
            <div
              key={file.key}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: '12px 0',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <div style={{ marginRight: 12, fontSize: 20, marginTop: 2 }}>{FILE_TYPE_ICONS[file.type]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ marginBottom: 8 }}>
                  <Space>
                    <span key="filename">{file.name}</span>
                    <Tag key="status-tag" color={OCR_STATUS_CONFIG[file.ocrStatus].color}>
                      {OCR_STATUS_CONFIG[file.ocrStatus].text}
                    </Tag>
                  </Space>
                </div>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                  {file.uploadTime} · {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
                {file.ocrStatus === 'processing' && <Progress percent={file.ocrProgress} size="small" status="active" />}
              </div>
              <div style={{ marginLeft: 12 }}>
                <Space size="small">
                  <Button key="view-btn" type="link" size="small" icon={<FileSearchOutlined />}>
                    查看详情
                  </Button>
                  <Button
                    key="reocr-btn"
                    type="link"
                    size="small"
                    icon={<ScanOutlined />}
                    onClick={() => triggerOCR(file, setter)}
                    disabled={file.ocrStatus === 'processing'}
                  >
                    重新识别
                  </Button>
                  <Button
                    key="delete-btn"
                    type="link"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => setter((prev) => prev.filter((f) => f.key !== file.key))}
                  >
                    删除
                  </Button>
                </Space>
              </div>
            </div>
          ))}
        </div>
      </>
    )

  // ─── 派生数据（memoize 避免重复计算）─────────────────────────────
  const stats = useMemo(() => {
    const passCount = complianceData.filter((d) => d.status === 'pass').length
    const failCount = complianceData.filter((d) => d.status === 'fail').length
    const warningCount = complianceData.filter((d) => d.status === 'warning').length
    const totalScore = complianceData.reduce((sum, item) => sum + item.score, 0)
    const maxTotalScore = complianceData.reduce((sum, item) => sum + item.maxScore, 0)
    const complianceRate = maxTotalScore > 0 ? totalScore / maxTotalScore : 0
    const total = complianceData.length
    return { passCount, failCount, warningCount, totalScore, maxTotalScore, complianceRate, total }
  }, [complianceData])

  const groupedData = useMemo(
    () =>
      CATEGORY_ORDER.map((cat) => {
        const items = complianceData.filter((d) => d.category === cat)
        const pass = items.filter((d) => d.status === 'pass').length
        const fail = items.filter((d) => d.status === 'fail').length
        const warn = items.filter((d) => d.status === 'warning').length
        return { category: cat, config: CATEGORY_CONFIG[cat], items, pass, fail, warn }
      }),
    [complianceData],
  )

  const scoreColor = stats.complianceRate >= 0.9 ? '#52c41a' : stats.complianceRate >= 0.7 ? '#faad14' : '#f5222d'
  const currentItem = complianceData.find((d) => d.key === selectedComplianceKey) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ═══ 页面标题 ═══ */}
      <div style={{ marginBottom: 24, flexShrink: 0 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>合规检查</h1>
        <p style={{ color: '#666' }}>系统的"主审官"，形式合规检查，跨模态一致性内容逻辑检查，敏感性与排他性检查，以及异常打回管理等。</p>
      </div>

      {/* ═══ 步骤条 ═══ */}
      <Steps
        current={parseInt(activeTab) - 1}
        style={{ marginBottom: 24 }}
        onChange={(current) => setActiveTab(String(current + 1))}
        items={[
          { title: '文档上传', icon: <UploadOutlined /> },
          { title: '检查项解析', icon: <FileSearchOutlined /> },
          { title: '合规检查', icon: <SafetyCertificateOutlined /> },
          { title: '报告生成', icon: <FileDoneOutlined /> },
        ]}
      />

      {/* ═══ Tabs 内容区 ═══ */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        type="card"
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        items={[
          {
            key: '1',
            label: (
              <span>
                <UploadOutlined /> 文档上传
              </span>
            ),
            children: (
              <Row gutter={[16, 16]}>
                {/* 招标文件上传 */}
                <Col key="col-bid" xs={24} lg={12}>
                  <Card
                    title={
                      <>
                        <FileTextOutlined /> 招标文件
                      </>
                    }
                    extra={
                      bidFiles.length > 0 && (
                        <Button type="primary" icon={<ScanOutlined />} onClick={() => bidFiles.forEach((f) => triggerOCR(f, setBidFiles))}>
                          全部重新识别
                        </Button>
                      )
                    }
                  >
                    <Upload.Dragger {...bidUploadProps}>
                      <p className="ant-upload-drag-icon">
                        <FileTextOutlined style={{ fontSize: 48, color: '#1890ff' }} />
                      </p>
                      <p className="ant-upload-text">点击或拖拽上传招标文件</p>
                      <p className="ant-upload-hint">支持 PDF / Word / 图片（自动OCR识别）</p>
                    </Upload.Dragger>
                    {renderFileList(bidFiles, setBidFiles)}
                  </Card>
                </Col>

                {/* 投标文件上传 */}
                <Col key="col-response" xs={24} lg={12}>
                  <Card
                    title={
                      <>
                        <SafetyCertificateOutlined /> 投标响应文件
                      </>
                    }
                    extra={
                      responseFiles.length > 0 && (
                        <Button type="primary" icon={<ScanOutlined />} onClick={() => responseFiles.forEach((f) => triggerOCR(f, setResponseFiles))}>
                          全部重新识别
                        </Button>
                      )
                    }
                  >
                    <Upload.Dragger {...responseUploadProps}>
                      <p className="ant-upload-drag-icon">
                        <SafetyCertificateOutlined style={{ fontSize: 48, color: '#52c41a' }} />
                      </p>
                      <p className="ant-upload-text">点击或拖拽上传投标响应文件</p>
                      <p className="ant-upload-hint">支持 PDF / Word / Excel / 图片（自动OCR识别）</p>
                    </Upload.Dragger>
                    {renderFileList(responseFiles, setResponseFiles)}
                  </Card>
                </Col>

                {/* 知识库文件上传 */}
                <Col xs={24}>
                  <Card
                    title={
                      <>
                        <DatabaseOutlined /> 知识库文件 (RAG/OAG)
                      </>
                    }
                    extra={
                      knowledgeFiles.length > 0 && (
                        <Space>
                          <Button type="primary" icon={<ScanOutlined />} onClick={handleBatchKnowledgeOCR}>
                            全部重新识别
                          </Button>
                          <Button type="primary" icon={<RocketOutlined />} onClick={handleBatchIndexBuild}>
                            全部重构索引
                          </Button>
                        </Space>
                      )
                    }
                  >
                    <Upload.Dragger {...knowledgeUploadProps}>
                      <p className="ant-upload-drag-icon">
                        <DatabaseOutlined style={{ fontSize: 48, color: '#722ed1' }} />
                      </p>
                      <p className="ant-upload-text">点击或拖拽上传知识库文件</p>
                      <p className="ant-upload-hint">支持 Markdown / Word / Excel / PDF / 图片（自动OCR识别）</p>
                    </Upload.Dragger>

                    {knowledgeFiles.length > 0 && (
                      <>
                        <Divider />
                        <div>
                          {knowledgeFiles.map((file) => (
                            <div
                              key={file.key}
                              className="border-b border-solid border-[rgb(240,240,240)]"
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                padding: '12px 0',
                              }}
                            >
                              <div style={{ marginRight: 12, fontSize: 20, marginTop: 2 }}>{FILE_TYPE_ICONS[file.type]}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ marginBottom: 8 }}>
                                  <Space>
                                    <span key="kb-filename">{file.name}</span>
                                    <Tag key="ocr-status-tag" color={OCR_STATUS_CONFIG[file.ocrStatus].color}>
                                      OCR: {OCR_STATUS_CONFIG[file.ocrStatus].text}
                                    </Tag>
                                    {file.ocrStatus === 'completed' && (
                                      <Tag key="index-status-tag" color={INDEX_STATUS_CONFIG[file.indexStatus].color}>
                                        索引: {INDEX_STATUS_CONFIG[file.indexStatus].text}
                                      </Tag>
                                    )}
                                    {file.indexStatus === 'completed' && file.indexChunks && (
                                      <Badge key="chunk-badge" count={file.indexChunks.length} style={{ backgroundColor: '#722ed1' }} title="知识块数量" />
                                    )}
                                  </Space>
                                </div>
                                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                                  {file.uploadTime} · {(file.size / 1024 / 1024).toFixed(2)} MB
                                </div>
                                {file.ocrStatus === 'processing' && (
                                  <div style={{ marginBottom: 4 }}>
                                    <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>OCR识别进度:</div>
                                    <Progress percent={file.ocrProgress} size="small" status="active" />
                                  </div>
                                )}
                                {file.indexStatus === 'processing' && (
                                  <div style={{ marginBottom: 4 }}>
                                    <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>索引构建进度:</div>
                                    <Progress percent={file.indexProgress} size="small" status="active" strokeColor="#722ed1" />
                                  </div>
                                )}
                              </div>
                              <div style={{ marginLeft: 12 }}>
                                <Space size="small" orientation="vertical">
                                  <Space size="small">
                                    <Button
                                      key="view-detail-btn"
                                      type="link"
                                      size="small"
                                      icon={<FileSearchOutlined />}
                                      onClick={() => {
                                        setCurrentPreviewFile(file)
                                        setFilePreviewVisible(true)
                                      }}
                                    >
                                      查看详情
                                    </Button>
                                    <Button
                                      key="re-ocr-btn"
                                      type="link"
                                      size="small"
                                      icon={<ScanOutlined />}
                                      onClick={() => triggerKnowledgeOCR(file)}
                                      disabled={file.ocrStatus === 'processing'}
                                    >
                                      重新识别
                                    </Button>
                                  </Space>
                                  <Space size="small">
                                    <Button
                                      key="rebuild-index-btn"
                                      type="link"
                                      size="small"
                                      icon={<RocketOutlined />}
                                      onClick={() => triggerIndexBuild(file)}
                                      disabled={file.ocrStatus !== 'completed' || file.indexStatus === 'processing'}
                                    >
                                      重构索引
                                    </Button>
                                    {file.indexStatus === 'completed' && file.indexChunks && (
                                      <Button
                                        key="view-index-btn"
                                        type="link"
                                        size="small"
                                        icon={<BookOutlined />}
                                        onClick={() => {
                                          setCurrentIndexFile(file)
                                          setIndexViewVisible(true)
                                        }}
                                      >
                                        查看索引
                                      </Button>
                                    )}
                                    <Button key="delete-file-btn" type="link" danger size="small" onClick={() => handleDeleteKnowledgeFile(file.key)}>
                                      删除
                                    </Button>
                                  </Space>
                                </Space>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    <Divider />
                    <div style={{ color: '#666', fontSize: 13 }}>
                      💡 提示：知识库文件将自动进行OCR识别并构建RAG/OAG索引，用于提升合规检查的准确性和规则匹配能力
                    </div>
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: '2',
            label: (
              <span>
                <FileSearchOutlined /> 检查项解析
              </span>
            ),
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* 顶部提示横幅 */}

                {/* 分类统计卡片 */}
                <Row gutter={[16, 16]} style={{ flexShrink: 0 }}>
                  {CATEGORY_ORDER.map((cat) => {
                    const config = CATEGORY_CONFIG[cat]
                    const catItems = complianceData.filter((d) => d.category === cat)
                    return (
                      <Col key={cat} xs={24} lg={6}>
                        <Card>
                          <Statistic title={config.label} value={catItems.length} suffix="项" styles={{ value: { color: config.color } }} />
                        </Card>
                      </Col>
                    )
                  })}
                </Row>

                {/* 合规检查项统一列表 */}
                <Card
                  title="🔍 合规检查项总表"
                  extra={
                    <Space>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        size="small"
                        onClick={() => {
                          const newKey = `NEW-${Date.now().toString(36).slice(-4).toUpperCase()}`
                          setComplianceData((prev) => [
                            ...prev,
                            {
                              key: newKey,
                              category: 'formal',
                              requirement: '请输入检查项要求',
                              aiResponse: '',
                              status: 'warning',
                              score: 0,
                              maxScore: 0,
                              isCritical: false,
                            },
                          ])
                          setEditingComplianceKey(newKey)
                          message.success('已添加新检查项，请编辑内容')
                        }}
                      >
                        新增检查项
                      </Button>
                      <Button icon={<RobotOutlined />} size="small" onClick={handleComplianceRegenerate}>
                        AI 重新生成
                      </Button>
                    </Space>
                  }
                  size="small"
                >
                  <Table<ComplianceItem>
                    columns={complianceColumns}
                    dataSource={complianceData}
                    rowKey="key"
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 项` }}
                    size="small"
                    scroll={{ x: 1000 }}
                  />
                  <Divider style={{ margin: '12px 0' }} />
                  <div style={{ color: '#666', fontSize: 13 }}>
                    💡 提示：红色「一票否决」标记的检查项为形式合规强制项，必须100%满足，否则直接废标。点击「编辑」可手动修改，点击「AI 重新生成」可重新解析。
                  </div>
                </Card>

                {/* 底部操作区 */}
              </div>
            ),
          },
          {
            key: '3',
            label: (
              <span>
                <SafetyCertificateOutlined /> 合规检查
              </span>
            ),
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                {/* ═══ 指标卡 ═══ */}
                <Row gutter={16} style={{ marginBottom: 16, flexShrink: 0 }}>
                  {/* 整体合规评分 */}
                  <Col key="col-score" xs={24} sm={12} lg={6}>
                    <Card
                      style={{ height: 156, display: 'flex', flexDirection: 'column', textAlign: 'center' }}
                      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' } }}
                    >
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
                        <SafetyCertificateOutlined style={{ marginRight: 6 }} />
                        合规评分
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flex: 1 }}>
                        <Progress
                          type="dashboard"
                          percent={Math.round(stats.complianceRate * 100)}
                          strokeColor={scoreColor}
                          strokeWidth={8}
                          size={70}
                          format={(percent) => (
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor }}>{percent}%</div>
                            </div>
                          )}
                        />
                        <div>
                          <div>
                            <span style={{ fontSize: 32, fontWeight: 700, color: scoreColor }}>{stats.totalScore}</span>
                            <span style={{ fontSize: 14, color: '#8c8c8c', marginLeft: 2 }}>分</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>满分 {stats.maxTotalScore} 分</div>
                        </div>
                      </div>
                    </Card>
                  </Col>

                  {/* 规则项 */}
                  <Col key="col-rules" xs={24} sm={12} lg={6}>
                    <Card
                      style={{ height: 156, display: 'flex', flexDirection: 'column', textAlign: 'center' }}
                      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' } }}
                    >
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
                        <FileSearchOutlined style={{ marginRight: 6 }} />
                        规则项
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div>
                          <span style={{ fontSize: 32, fontWeight: 700, color: '#1890ff' }}>{stats.total}</span>
                          <span style={{ fontSize: 14, color: '#8c8c8c', marginLeft: 2 }}>项</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>规则覆盖率 100%</div>
                      </div>
                    </Card>
                  </Col>

                  {/* 通过项 */}
                  <Col key="col-pass" xs={24} sm={12} lg={6}>
                    <Card
                      style={{ height: 156, display: 'flex', flexDirection: 'column', textAlign: 'center' }}
                      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' } }}
                    >
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
                        <CheckCircleOutlined style={{ marginRight: 6 }} />
                        通过项
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div>
                          <span style={{ fontSize: 32, fontWeight: 700, color: '#52c41a' }}>{stats.passCount}</span>
                          <span style={{ fontSize: 14, color: '#8c8c8c', marginLeft: 2 }}>项</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>占比 {Math.round((stats.passCount / stats.total) * 100)}%</div>
                      </div>
                    </Card>
                  </Col>

                  {/* 负偏离项 */}
                  <Col key="col-fail" xs={24} sm={12} lg={6}>
                    <Card
                      style={{ height: 156, display: 'flex', flexDirection: 'column', textAlign: 'center' }}
                      styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '16px' } }}
                    >
                      <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 8 }}>
                        <CloseCircleOutlined style={{ marginRight: 6 }} />
                        负偏离项
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div>
                          <span style={{ fontSize: 32, fontWeight: 700, color: '#f5222d' }}>{stats.failCount}</span>
                          <span style={{ fontSize: 14, color: '#8c8c8c', marginLeft: 2 }}>项</span>
                        </div>
                        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>占比 {Math.round((stats.failCount / stats.total) * 100)}%</div>
                      </div>
                    </Card>
                  </Col>
                </Row>

                {/* ═══ 三列布局：左列-合规检查项 | 中列-审查工作区 | 右列-AI合规检查+审查队列 ═══ */}
                <Row gutter={12} style={{ flex: 1, minHeight: 0 }}>
                  {/* ── 左列 (lg=6) — 合规检查项列表 ── */}
                  <Col key="col-left" xs={24} lg={6} style={{ display: 'flex', flexDirection: 'column' }}>
                    <Card
                      title={
                        <Space>
                          <FileSearchOutlined key="icon" style={{ color: '#1890ff' }} />
                          <span key="title">合规检查项</span>
                          <Tag key="count-tag" color="blue" style={{ fontSize: 11, margin: 0 }}>
                            {stats.total} 项
                          </Tag>
                        </Space>
                      }
                      size="small"
                      style={CARD_FLEX_STYLE}
                      styles={{ body: CARD_BODY_FLEX('8px 0') }}
                    >
                      {groupedData.map((group, groupIdx) => {
                        const isCollapsed = collapsedCategories.has(group.category)
                        const { config } = group
                        // 计算当前分类在全局中的起始序号
                        const globalOffset = groupedData.slice(0, groupIdx).reduce((sum, g) => sum + g.items.length, 0)
                        return (
                          <div key={group.category} style={{ borderBottom: groupIdx < groupedData.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                            {/* ── 分类标题栏 ── */}
                            <div
                              onClick={() => toggleCategory(group.category)}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                background: config.bgColor,
                                boxShadow: `inset 3px 0 0 0 ${config.color}`,
                                transition: 'all 0.2s',
                                userSelect: 'none',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                  {isCollapsed ? (
                                    <CaretRightOutlined style={{ fontSize: 10, color: config.color, flexShrink: 0 }} />
                                  ) : (
                                    <CaretDownOutlined style={{ fontSize: 10, color: config.color, flexShrink: 0 }} />
                                  )}
                                  <span
                                    style={{
                                      fontSize: 12,
                                      fontWeight: 600,
                                      color: config.color,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {config.label}
                                  </span>
                                  <Tag
                                    style={{
                                      fontSize: 10,
                                      margin: 0,
                                      lineHeight: '16px',
                                      padding: '0 4px',
                                      border: `1px solid ${config.borderColor}`,
                                      color: config.color,
                                      background: 'rgba(255,255,255,0.7)',
                                    }}
                                  >
                                    {config.tag}
                                  </Tag>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                  {group.pass > 0 && (
                                    <span style={{ fontSize: 10, color: '#52c41a' }}>
                                      <CheckCircleOutlined style={{ marginRight: 1 }} />
                                      {group.pass}
                                    </span>
                                  )}
                                  {group.warn > 0 && (
                                    <span style={{ fontSize: 10, color: '#faad14' }}>
                                      <ExclamationCircleOutlined style={{ marginRight: 1 }} />
                                      {group.warn}
                                    </span>
                                  )}
                                  {group.fail > 0 && (
                                    <span style={{ fontSize: 10, color: '#f5222d' }}>
                                      <CloseCircleOutlined style={{ marginRight: 1 }} />
                                      {group.fail}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* ── 分类下检查项列表 ── */}
                            {!isCollapsed &&
                              group.items.map((item, itemIdx) => (
                                <div
                                  key={item.key}
                                  onClick={() => setSelectedComplianceKey(item.key)}
                                  style={{
                                    padding: '8px 12px 8px 18px',
                                    cursor: 'pointer',
                                    background: selectedComplianceKey === item.key ? '#e6f4ff' : 'transparent',
                                    boxShadow: selectedComplianceKey === item.key ? 'inset 3px 0 0 0 #1890ff' : 'none',
                                    transition: 'all 0.15s',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                    {/* 序号 */}
                                    <span
                                      style={{
                                        fontSize: 10,
                                        color: '#8c8c8c',
                                        background: '#f5f5f5',
                                        borderRadius: 3,
                                        padding: '1px 5px',
                                        fontFamily: 'monospace',
                                        flexShrink: 0,
                                        marginTop: 1,
                                      }}
                                    >
                                      {globalOffset + itemIdx + 1}
                                    </span>
                                    {/* 内容 */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                        <span
                                          style={{
                                            fontSize: 12,
                                            fontWeight: 500,
                                            color: '#262626',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          {item.requirement}
                                        </span>
                                        <span style={{ flexShrink: 0 }}>
                                          {item.status === 'pass' ? (
                                            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                                          ) : item.status === 'fail' ? (
                                            <CloseCircleOutlined style={{ color: '#f5222d', fontSize: 14 }} />
                                          ) : (
                                            <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 14 }} />
                                          )}
                                        </span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                                        <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                                          得分:{' '}
                                          <span
                                            style={{
                                              color: item.status === 'pass' ? '#52c41a' : item.status === 'warning' ? '#faad14' : '#f5222d',
                                              fontWeight: 600,
                                            }}
                                          >
                                            {item.score}
                                          </span>
                                          /{item.maxScore}
                                        </span>
                                        {item.isCritical && (
                                          <Tag color="error" style={{ fontSize: 10, lineHeight: '14px', padding: '0 3px', margin: 0 }}>
                                            一票否决
                                          </Tag>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )
                      })}
                    </Card>
                  </Col>

                  {/* ── 中列 (lg=11) — 审查工作区 ─��� */}
                  <Col key="col-mid" xs={24} lg={11} style={{ display: 'flex', flexDirection: 'column' }}>
                    <Card
                      title={
                        <Space>
                          <EditOutlined key="icon" style={{ color: '#722ed1' }} />
                          <span key="title">审查工作区</span>
                          {pendingManualTaskId && (
                            <Tag key="manual-tag" color="error" style={{ fontSize: 10, margin: 0 }}>
                              ⚠ 待人工确认
                            </Tag>
                          )}
                        </Space>
                      }
                      size="small"
                      style={CARD_FLEX_STYLE}
                      styles={{ body: CARD_BODY_FLEX('16px') }}
                    >
                      {/* ── 人工介入确认区（优先展示）── */}
                      {pendingManualTaskId &&
                        (() => {
                          const manualTask = REVIEW_TASKS.find((t) => t.id === pendingManualTaskId)!
                          return (
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#cf1322', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <WarningOutlined />
                                <span>🔴 人工介入确认</span>
                                <Tag color="error" style={{ fontSize: 10, margin: 0 }}>
                                  任务挂起中
                                </Tag>
                              </div>
                              <div
                                style={{
                                  background: '#fff1f0',
                                  border: '1px solid #ffccc7',
                                  borderRadius: 6,
                                  padding: 14,
                                  marginBottom: 12,
                                }}
                              >
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#262626', marginBottom: 6 }}>
                                  <RobotOutlined style={{ color: '#f5222d', marginRight: 6 }} />
                                  {manualTask.title}
                                  <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 8 }}>执行者: {manualTask.agent}</span>
                                </div>
                                <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.6 }}>
                                  <strong>AI挂起原因：</strong>
                                  {manualTask.manualReason}
                                </div>
                              </div>
                              <div style={{ marginBottom: 10 }}>
                                <div style={{ fontSize: 12, color: '#262626', fontWeight: 500, marginBottom: 6 }}>📝 人工核查结果说明</div>
                                <Input.TextArea
                                  value={manualNote}
                                  onChange={(e) => setManualNote(e.target.value)}
                                  rows={3}
                                  placeholder="请填写核查结果，例如：已查阅原件，银行回执单真实有效，签章清晰可见…"
                                  style={{ fontSize: 12 }}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <Button
                                  key="btn-confirm-pass"
                                  type="primary"
                                  icon={<CheckOutlined />}
                                  disabled={!manualNote.trim()}
                                  style={{ flex: 1, background: '#52c41a', borderColor: '#52c41a' }}
                                  onClick={() => {
                                    setManualConfirmedSet((prev) => new Set(prev).add(pendingManualTaskId))
                                    setPendingManualTaskId(null)
                                    setManualNote('')
                                  }}
                                >
                                  确认通���，恢复队列
                                </Button>
                                <Button
                                  key="btn-confirm-cancel"
                                  icon={<StopOutlined />}
                                  danger
                                  style={{ flex: 1 }}
                                  onClick={() => {
                                    setPendingManualTaskId(null)
                                    setManualNote('')
                                  }}
                                >
                                  取消（保持挂起）
                                </Button>
                              </div>
                              <Divider style={{ margin: '14px 0' }} />
                            </div>
                          )
                        })()}
                      {/* 当前问题详情 */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 12 }}>📋 当前问题详情</div>
                        {currentItem && (
                          <div
                            style={{
                              background: currentItem.status === 'fail' ? '#fff1f0' : currentItem.status === 'warning' ? '#fffbe6' : '#f6ffed',
                              border: `1px solid ${currentItem.status === 'fail' ? '#ffccc7' : currentItem.status === 'warning' ? '#ffe58f' : '#b7eb8f'}`,
                              borderRadius: 6,
                              padding: 14,
                            }}
                          >
                            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Tag color={currentItem.status === 'pass' ? 'success' : currentItem.status === 'warning' ? 'warning' : 'error'}>
                                {currentItem.status === 'pass' ? '✓ 通过' : currentItem.status === 'warning' ? '⚠ 警告' : '✗ 负偏离'}
                              </Tag>
                              <Tag
                                style={{
                                  fontSize: 10,
                                  margin: 0,
                                  border: `1px solid ${CATEGORY_CONFIG[currentItem.category].borderColor}`,
                                  color: CATEGORY_CONFIG[currentItem.category].color,
                                  background: CATEGORY_CONFIG[currentItem.category].bgColor,
                                }}
                              >
                                {CATEGORY_CONFIG[currentItem.category].label}
                              </Tag>
                              <span style={{ fontSize: 11, color: '#8c8c8c', fontFamily: 'monospace' }}>{currentItem.key}</span>
                              {currentItem.isCritical && (
                                <Tag color="error" style={{ fontSize: 10, margin: 0 }}>
                                  一票否决
                                </Tag>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 8 }}>
                              <strong>招标要求：</strong> {currentItem.requirement}
                            </div>
                            <Divider style={{ margin: '8px 0' }} />
                            <div style={{ fontSize: 12, color: '#595959' }}>
                              <strong>AI响应：</strong> {currentItem.aiResponse}
                            </div>
                            <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>
                              得分:{' '}
                              <span
                                style={{
                                  color: currentItem.status === 'pass' ? '#52c41a' : currentItem.status === 'warning' ? '#faad14' : '#f5222d',
                                  fontWeight: 600,
                                }}
                              >
                                {currentItem.score}
                              </span>{' '}
                              / {currentItem.maxScore}
                            </div>

                            {/* 问题位置定位 */}
                            {currentItem.status !== 'pass' && (
                              <>
                                <Divider style={{ margin: '12px 0' }} />
                                <div
                                  style={{
                                    background: '#fff',
                                    borderRadius: 4,
                                    padding: 10,
                                    border: '1px solid #ffa39e',
                                  }}
                                >
                                  <div
                                    style={{ fontSize: 11, fontWeight: 600, color: '#cf1322', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}
                                  >
                                    <span>📍</span>
                                    <span>问题位置</span>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: '#595959',
                                      background: '#fff7e6',
                                      padding: '6px 8px',
                                      borderRadius: 3,
                                      border: '1px dashed #ffa940',
                                      marginBottom: 8,
                                    }}
                                  >
                                    <div>
                                      <span style={{ color: '#8c8c8c' }}>定位：</span>
                                      <span style={{ color: '#fa8c16', fontWeight: 500, fontFamily: 'monospace' }}>第2章 2.1节 → 第3段 第2-4行</span>
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: '#262626',
                                      background: '#fffaf0',
                                      padding: '8px 10px',
                                      borderRadius: 3,
                                      border: '1px solid #ffe7ba',
                                      borderLeft: '3px solid #fa8c16',
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    <div style={{ color: '#8c8c8c', fontSize: 10, marginBottom: 4 }}>原文片段：</div>
                                    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                      系统采用微服务架构设计，基于Spring Cloud框架实现
                                      <span style={{ background: '#ffccc7', padding: '1px 3px', borderRadius: 2, color: '#cf1322' }}>服务拆分和治理</span>
                                      ，确保系统的高可用性和可扩展性...
                                    </div>
                                  </div>
                                </div>
                              </>
                            )}

                            {/* 修改建议 */}
                            {currentItem.status !== 'pass' && (
                              <>
                                <Divider style={{ margin: '12px 0' }} />
                                <div
                                  style={{
                                    background: '#fff',
                                    borderRadius: 4,
                                    padding: 10,
                                    border: '1px solid #91d5ff',
                                  }}
                                >
                                  <div
                                    style={{ fontSize: 11, fontWeight: 600, color: '#096dd9', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}
                                  >
                                    <span>💡</span>
                                    <span>AI修改建议</span>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: '#262626',
                                      background: '#e6f7ff',
                                      padding: '8px 10px',
                                      borderRadius: 3,
                                      border: '1px solid #91d5ff',
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    建议在技术方案描述中补充具体的容量规划数据，明确标注系统支持的并发用户数≥300、响应时间≤2秒等关键性能指标，并配合架构图进行说明。
                                  </div>
                                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}></div>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      <Divider />

                      {/* 个性化审查规定义 */}
                      <div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#262626',
                            marginBottom: 12,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>个性化审查规则</span>
                          <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setCustomRules([...customRules, '新规则'])}>
                            添加规则
                          </Button>
                        </div>
                        <div style={{ border: '1px solid #f0f0f0', borderRadius: 6 }}>
                          {customRules.map((rule, index) => (
                            <div
                              key={index}
                              style={{
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                borderBottom: index < customRules.length - 1 ? '1px solid #f0f0f0' : 'none',
                              }}
                            >
                              <Space>
                                <SafetyCertificateOutlined key="rule-icon" style={{ color: '#1890ff' }} />
                                <span key="rule-text" style={{ fontSize: 12 }}>
                                  {rule}
                                </span>
                              </Space>
                              <Button key="edit-rule-btn" type="link" size="small" icon={<EditOutlined />} onClick={() => openDroolsEditor(index)}>
                                编辑
                              </Button>
                            </div>
                          ))}
                        </div>

                        <div
                          style={{
                            marginTop: 12,
                            padding: 10,
                            background: '#f0f5ff',
                            borderRadius: 4,
                            border: '1px solid #adc6ff',
                          }}
                        >
                          <div style={{ fontSize: 11, color: '#1d39c4', lineHeight: 1.6 }}>
                            💡 <strong>提示：</strong>
                            自定义规则将与Drools规则引擎集成，实时监控标书内容。支持正则表达式、关键词匹配、数值范围校验等多种规则类型。
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Col>

                  {/* ── 右列 (lg=7) — AI合规检查 + 审查队列（严格参考 DiagramRenderer 右栏结构） ── */}
                  <Col key="col-right" xs={24} lg={7} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* AI合规检查 Card */}
                    <Card
                      title={
                        <Space>
                          <RobotOutlined key="robot-icon" style={{ color: '#1890ff' }} />
                          <span key="ai-title">AI 检查</span>
                        </Space>
                      }
                      size="small"
                      style={{ flexShrink: 0 }}
                      styles={{ body: { padding: '14px 16px' } }}
                    >
                      {/* 核心指标 */}
                      <Row gutter={12} style={{ marginBottom: 12 }}>
                        <Col span={8}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 600, color: '#52c41a' }}>{stats.passCount}</div>
                            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>已通过</div>
                          </div>
                        </Col>
                        <Col span={8}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 600, color: '#faad14' }}>{REVIEW_TASKS.filter((t) => t.status === 'reviewing').length}</div>
                            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>审查中</div>
                          </div>
                        </Col>
                        <Col span={8}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 600, color: '#f5222d' }}>{REVIEW_TASKS.filter((t) => t.status === 'waiting').length}</div>
                            <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>排队中</div>
                          </div>
                        </Col>
                      </Row>

                      {/* 总进度 */}
                      <div
                        style={{
                          padding: '9px 12px',
                          background: isQueuePaused ? '#fff7e6' : '#f6ffed',
                          borderRadius: 4,
                          border: `1px solid ${isQueuePaused ? '#ffd591' : '#b7eb8f'}`,
                          marginBottom: 12,
                        }}
                      >
                        <div style={{ marginBottom: 6 }}>
                          <div
                            style={{
                              fontSize: 12,
                              color: isQueuePaused ? '#faad14' : '#52c41a',
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            {isQueuePaused ? '⏸ 检查已暂停' : '✓ 2个合规Agent并行工作中'}
                          </div>
                          <Progress
                            percent={Math.round(stats.complianceRate * 100)}
                            size="small"
                            strokeColor={isQueuePaused ? '#faad14' : scoreColor}
                            showInfo={false}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: '#666' }}>
                          共 {stats.total} 项检查 · 合规率 {Math.round(stats.complianceRate * 100)}%
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button
                          size="small"
                          icon={isQueuePaused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
                          onClick={() => setIsQueuePaused(!isQueuePaused)}
                          style={{
                            flex: 1,
                            borderColor: isQueuePaused ? '#52c41a' : '#faad14',
                            color: isQueuePaused ? '#52c41a' : '#faad14',
                          }}
                        >
                          {isQueuePaused ? '全部开始' : '全部暂停'}
                        </Button>
                        <Button size="small" icon={<SyncOutlined />} type="primary" style={{ flex: 1 }}>
                          全部重新检查
                        </Button>
                      </div>
                    </Card>

                    {/* 审查队列 Card */}
                    <Card
                      title={
                        <Space>
                          <SyncOutlined key="sync-icon" spin={!isQueuePaused} />
                          <span key="queue-title">检查队列</span>
                          <Tag key="queue-count" color="blue" style={{ fontSize: 11, margin: 0 }}>
                            {REVIEW_TASKS.length} 项
                          </Tag>
                          {REVIEW_TASKS.some((t) => t.status === 'suspended' && !manualConfirmedSet.has(t.id)) && (
                            <Tag key="pending-tag" color="error" style={{ fontSize: 10, margin: 0, animation: 'pulse 1.5s infinite' }}>
                              ⚠ {REVIEW_TASKS.filter((t) => t.status === 'suspended' && !manualConfirmedSet.has(t.id)).length} 项待介入
                            </Tag>
                          )}
                        </Space>
                      }
                      size="small"
                      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
                      styles={{ body: CARD_BODY_FLEX('8px') }}
                    >
                      <Collapse
                        bordered={false}
                        style={{ background: 'transparent' }}
                        items={REVIEW_TASKS.map((task) => {
                          const isTaskPaused = !!taskPausedMap[task.id]
                          const isConfirmed = manualConfirmedSet.has(task.id)
                          const effectiveStatus: ReviewTaskStatus = isConfirmed && task.status === 'suspended' ? 'completed' : task.status

                          const statusIcon = () => {
                            if (effectiveStatus === 'completed') return <CheckCircleOutlined style={{ color: '#52c41a' }} />
                            if (effectiveStatus === 'suspended') return <WarningOutlined style={{ color: '#f5222d' }} />
                            if (effectiveStatus === 'reviewing') return <SyncOutlined spin style={{ color: '#1890ff' }} />
                            return <ClockCircleOutlined style={{ color: '#bfbfbf' }} />
                          }

                          const progressStatus =
                            effectiveStatus === 'completed'
                              ? 'success'
                              : effectiveStatus === 'suspended'
                                ? 'exception'
                                : isTaskPaused
                                  ? 'normal'
                                  : effectiveStatus === 'reviewing'
                                    ? 'active'
                                    : 'normal'

                          const progressColor =
                            effectiveStatus === 'suspended' ? '#f5222d' : isTaskPaused ? '#faad14' : effectiveStatus === 'reviewing' ? '#1890ff' : undefined

                          return {
                            key: task.id,
                            label: (
                              <div style={{ width: '100%' }}>
                                {/* ── 任务头部行 ── */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <Space size={4} style={{ minWidth: 0, flex: 1 }}>
                                    {statusIcon()}
                                    <span
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 500,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        maxWidth: 110,
                                        display: 'inline-block',
                                      }}
                                      title={task.title}
                                    >
                                      {task.title}
                                    </span>
                                    {effectiveStatus === 'suspended' && (
                                      <Tag color="error" style={{ fontSize: 10, margin: 0, padding: '0 4px', flexShrink: 0 }}>
                                        挂起
                                      </Tag>
                                    )}
                                    {effectiveStatus === 'completed' && (
                                      <Tag color="success" style={{ fontSize: 10, margin: 0, padding: '0 4px', flexShrink: 0 }}>
                                        完成
                                      </Tag>
                                    )}
                                    {effectiveStatus === 'waiting' && (
                                      <Tag style={{ fontSize: 10, margin: 0, padding: '0 4px', flexShrink: 0, border: '1px solid #d9d9d9', color: '#8c8c8c' }}>
                                        排队
                                      </Tag>
                                    )}
                                  </Space>
                                  {/* ── 任务独立操作按钮 ── */}
                                  <Space size={2} onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0, marginLeft: 4 }}>
                                    {effectiveStatus !== 'suspended' && effectiveStatus !== 'completed' && (
                                      <Tooltip key="pause-tooltip" title={isTaskPaused ? '继续检查' : '暂停检查'}>
                                        <Button
                                          key="pause-btn"
                                          type="text"
                                          size="small"
                                          icon={
                                            isTaskPaused ? (
                                              <PlayCircleOutlined style={{ color: '#52c41a' }} />
                                            ) : (
                                              <PauseCircleOutlined style={{ color: '#faad14' }} />
                                            )
                                          }
                                          style={{ padding: '0 3px' }}
                                          onClick={() => setTaskPausedMap((prev) => ({ ...prev, [task.id]: !isTaskPaused }))}
                                        />
                                      </Tooltip>
                                    )}
                                    {effectiveStatus === 'suspended' && !isConfirmed && (
                                      <Tooltip key="manual-tooltip" title="点击前往人工确认区处理">
                                        <Button
                                          key="manual-btn"
                                          type="text"
                                          size="small"
                                          danger
                                          icon={<UserOutlined />}
                                          style={{ padding: '0 3px' }}
                                          onClick={() => {
                                            setPendingManualTaskId(task.id)
                                            setManualNote('')
                                          }}
                                        />
                                      </Tooltip>
                                    )}
                                  </Space>
                                </div>
                                {/* ── 进度条 ── */}
                                <Progress
                                  percent={effectiveStatus === 'completed' ? 100 : task.progress}
                                  size="small"
                                  status={progressStatus}
                                  strokeColor={progressColor}
                                />
                              </div>
                            ),
                            children: (
                              <div style={{ background: '#fafafa', padding: 12, borderRadius: 4, maxHeight: 260, overflow: 'auto' }}>
                                {/* ── Agent 日志标题 ── */}
                                <div
                                  style={{ fontSize: 12, fontWeight: 600, color: '#1890ff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}
                                >
                                  <RobotOutlined />
                                  <span>{task.agent} · 工作日志</span>
                                  <Tag
                                    color={
                                      effectiveStatus === 'completed'
                                        ? 'success'
                                        : effectiveStatus === 'suspended'
                                          ? 'error'
                                          : effectiveStatus === 'reviewing'
                                            ? 'processing'
                                            : 'default'
                                    }
                                    style={{ fontSize: 10, margin: 0 }}
                                  >
                                    {effectiveStatus === 'completed'
                                      ? '已完成'
                                      : effectiveStatus === 'suspended'
                                        ? '⚠ 挂起等待'
                                        : effectiveStatus === 'reviewing'
                                          ? '执行中'
                                          : '等待中'}
                                  </Tag>
                                </div>
                                {/* ── 日志条目 ── */}
                                <div style={{ fontSize: 11, lineHeight: 1.75, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  {task.logs.length === 0 ? (
                                    <div style={{ color: '#8c8c8c', fontStyle: 'italic' }}>等待前序任务完成后自动启动…</div>
                                  ) : (
                                    task.logs.map((log, i) => (
                                      <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                                        <span style={{ color: '#8c8c8c', flexShrink: 0, fontFamily: 'monospace' }}>[{log.time}]</span>
                                        <span style={{ color: '#262626' }}>
                                          <Tag color={log.color} style={{ fontSize: 10, padding: '0 4px', margin: '0 5px 0 0', lineHeight: '16px' }}>
                                            {log.skill}
                                          </Tag>
                                          {log.message}
                                        </span>
                                      </div>
                                    ))
                                  )}
                                  {/* ── 末尾状态条 ── */}
                                  {task.logs.length > 0 && (
                                    <div
                                      style={{
                                        marginTop: 6,
                                        padding: '6px 10px',
                                        borderRadius: 4,
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 6,
                                        background:
                                          effectiveStatus === 'completed'
                                            ? '#f6ffed'
                                            : effectiveStatus === 'suspended'
                                              ? '#fff1f0'
                                              : effectiveStatus === 'reviewing'
                                                ? '#e6f7ff'
                                                : '#fafafa',
                                        border: `1px solid ${effectiveStatus === 'completed' ? '#b7eb8f' : effectiveStatus === 'suspended' ? '#ffccc7' : effectiveStatus === 'reviewing' ? '#91d5ff' : '#e8e8e8'}`,
                                      }}
                                    >
                                      {effectiveStatus === 'completed' ? (
                                        <>
                                          <CheckCircleOutlined style={{ color: '#52c41a', flexShrink: 0, marginTop: 1 }} />
                                          <span style={{ color: '#389e0d', fontWeight: 600 }}>人工确认完成，任务已通过</span>
                                        </>
                                      ) : effectiveStatus === 'suspended' ? (
                                        <>
                                          <WarningOutlined style={{ color: '#f5222d', flexShrink: 0, marginTop: 1 }} />
                                          <span style={{ color: '#cf1322' }}>⚠ 任务挂起 · {isConfirmed ? '已确认' : task.manualReason}</span>
                                        </>
                                      ) : effectiveStatus === 'reviewing' ? (
                                        <>
                                          <SyncOutlined spin style={{ color: '#1890ff', flexShrink: 0, marginTop: 1 }} />
                                          <span style={{ color: '#0958d9' }}>执行中 · 进度 {task.progress}%</span>
                                        </>
                                      ) : (
                                        <>
                                          <ClockCircleOutlined style={{ color: '#bfbfbf', flexShrink: 0, marginTop: 1 }} />
                                          <span style={{ color: '#8c8c8c' }}>等待前序任务完成后自动启动</span>
                                        </>
                                      )}
                                    </div>
                                  )}
                                  {/* ── 挂起任务：内联处理入口 ── */}
                                  {effectiveStatus === 'suspended' && !isConfirmed && (
                                    <Button
                                      type="primary"
                                      danger
                                      size="small"
                                      icon={<UserOutlined />}
                                      style={{ marginTop: 8, width: '100%' }}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setPendingManualTaskId(task.id)
                                        setManualNote('')
                                      }}
                                    >
                                      前往中间区完成人工确认
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ),
                          }
                        })}
                      />
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          },
          {
            key: '4',
            label: (
              <span>
                <FileDoneOutlined /> 报告生成
              </span>
            ),
            children: (
              <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 240px)', minHeight: 600 }}>
                {/* 左侧：动态大纲 Tree */}
                <Card
                  title={
                    <Space size={8}>
                      <BookOutlined key="book-icon" style={{ color: '#1890ff' }} />
                      <span key="outline-title">报告大纲</span>
                    </Space>
                  }
                  style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column' }}
                  styles={{ body: { padding: '12px 0', flex: 1, overflowY: 'auto' } }}
                >
                  <Tree
                    showLine
                    blockNode
                    defaultExpandAll
                    expandedKeys={expandedReportKeys}
                    onExpand={(keys) => setExpandedReportKeys(keys)}
                    selectedKeys={[reportSection]}
                    onSelect={(keys) => {
                      if (keys.length > 0) {
                        const key = keys[0] as string
                        const mainKey = key.split('-')[0]
                        setReportSection(mainKey)
                      }
                    }}
                    treeData={reportTreeData}
                    titleRender={(node) => (
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: reportSection === node.key ? 600 : 400,
                          color: reportSection === node.key ? '#1890ff' : 'inherit',
                          padding: '2px 0',
                        }}
                      >
                        {node.title as React.ReactNode}
                      </div>
                    )}
                  />
                </Card>

                {/* 中间：报告编辑/预览区 */}
                <Card
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <Space size={12}>
                        <FileDoneOutlined key="report-icon" style={{ color: '#722ed1' }} />
                        <span key="report-title">{reportTreeData.find((d) => d.key === reportSection)?.title || '审计报告'}</span>
                        <Segmented
                          key="mode-segmented"
                          size="small"
                          options={[
                            { label: '预览', value: 'preview', icon: <EyeOutlined /> },
                            { label: '编辑', value: 'edit', icon: <EditOutlined /> },
                          ]}
                          value={reportEditMode}
                          onChange={(val) => setReportEditMode(val as 'preview' | 'edit')}
                        />
                      </Space>
                      <Space>
                        <Button key="export-btn" icon={<DownloadOutlined />} onClick={exportToDocx} type="primary" ghost size="small">
                          导出 DOCX
                        </Button>
                      </Space>
                    </div>
                  }
                  style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                  styles={{ body: { padding: 20, flex: 1, overflowY: 'auto', position: 'relative' } }}
                >
                  <div style={{ maxWidth: 900, margin: '0 auto', height: '100%' }}>
                    {reportEditMode === 'edit' ? (
                      <TextArea
                        value={reportContents[reportSection]}
                        onChange={(e) => {
                          const val = e.target.value
                          setReportContents((prev) => ({ ...prev, [reportSection]: val }))
                        }}
                        style={{
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
                        }}
                        placeholder="在此输入 Markdown 内容..."
                      />
                    ) : (
                      <div className="report-content">
                        {(() => {
                          const content = reportContents[reportSection] || ''
                          const parts = content.split(':::radar-chart')

                          if (parts.length > 1) {
                            return (
                              <>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{parts[0]}</ReactMarkdown>
                                <div
                                  style={{
                                    height: 320,
                                    marginTop: 24,
                                    marginBottom: 32,
                                    background: '#fff',
                                    borderRadius: 8,
                                    padding: 16,
                                    border: '1px solid #f0f0f0',
                                  }}
                                >
                                  <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart
                                      data={[
                                        {
                                          dimension: '形式合规',
                                          score:
                                            Math.round(
                                              (complianceData.filter((i) => i.category === 'formal').reduce((sum, i) => sum + i.score, 0) /
                                                complianceData.filter((i) => i.category === 'formal').reduce((sum, i) => sum + i.maxScore, 0)) *
                                                100,
                                            ) || 0,
                                        },
                                        {
                                          dimension: '响应完整性',
                                          score:
                                            Math.round(
                                              (complianceData.filter((i) => i.category === 'response').reduce((sum, i) => sum + i.score, 0) /
                                                complianceData.filter((i) => i.category === 'response').reduce((sum, i) => sum + i.maxScore, 0)) *
                                                100,
                                            ) || 0,
                                        },
                                        {
                                          dimension: '敏感性检查',
                                          score:
                                            Math.round(
                                              (complianceData.filter((i) => i.category === 'sensitive').reduce((sum, i) => sum + i.score, 0) /
                                                complianceData.filter((i) => i.category === 'sensitive').reduce((sum, i) => sum + i.maxScore, 0)) *
                                                100,
                                            ) || 0,
                                        },
                                        {
                                          dimension: '逻辑一致性',
                                          score:
                                            Math.round(
                                              (complianceData.filter((i) => i.category === 'logic').reduce((sum, i) => sum + i.score, 0) /
                                                complianceData.filter((i) => i.category === 'logic').reduce((sum, i) => sum + i.maxScore, 0)) *
                                                100,
                                            ) || 0,
                                        },
                                      ]}
                                    >
                                      <PolarGrid key="polar-grid" stroke="#d9d9d9" />
                                      <PolarAngleAxis key="polar-angle" dataKey="dimension" tick={{ fontSize: 13 }} />
                                      <PolarRadiusAxis key="polar-radius" angle={90} domain={[0, 100]} tick={{ fontSize: 11 }} />
                                      <Radar key="radar-data" name="得分" dataKey="score" stroke="#1890ff" fill="#1890ff" fillOpacity={0.3} />
                                    </RadarChart>
                                  </ResponsiveContainer>
                                </div>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{parts[1]}</ReactMarkdown>
                              </>
                            )
                          }

                          return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        })()}
                      </div>
                    )}
                  </div>
                </Card>

                {/* 右侧：AI生成控制 - 参考正文撰写模块 */}
                <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
                  {/* 上部分：AI生成控制 */}
                  <Card
                    title={
                      <Space>
                        <RobotOutlined style={{ color: '#1890ff' }} />
                        <span>AI生成</span>
                      </Space>
                    }
                    size="small"
                    style={{ marginBottom: 8, flexShrink: 0 }}
                    styles={{
                      body: {
                        padding: '16px',
                      },
                    }}
                  >
                    {/* 第一行：核心指标 */}
                    <Row gutter={12} style={{ marginBottom: 12 }}>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <div
                            style={{
                              fontSize: 24,
                              fontWeight: 600,
                              color: '#52c41a',
                            }}
                          >
                            {Math.round((complianceData.filter((i) => i.status === 'pass').length / complianceData.length) * 100)}%
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#666',
                              marginTop: 4,
                            }}
                          >
                            通过率
                          </div>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <div
                            style={{
                              fontSize: 24,
                              fontWeight: 600,
                              color: '#1890ff',
                            }}
                          >
                            {Math.round(
                              (complianceData.reduce((sum, i) => sum + i.score, 0) / (complianceData.reduce((sum, i) => sum + i.maxScore, 0) || 1)) * 100,
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#666',
                              marginTop: 4,
                            }}
                          >
                            综合分
                          </div>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <div
                            style={{
                              fontSize: 24,
                              fontWeight: 600,
                              color: '#ff4d4f',
                            }}
                          >
                            {complianceData.filter((i) => i.status === 'fail' && i.isCritical).length}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#666',
                              marginTop: 4,
                            }}
                          >
                            致命项
                          </div>
                        </div>
                      </Col>
                    </Row>

                    {/* 第二行：进度条与提示 */}
                    <div
                      style={{
                        padding: '10px 12px',
                        background: isGeneratingReport ? '#fff7e6' : '#f6ffed',
                        borderRadius: '4px',
                        border: `1px solid ${isGeneratingReport ? '#ffd591' : '#b7eb8f'}`,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ marginBottom: 8 }}>
                        <div
                          style={{
                            fontSize: 12,
                            color: isGeneratingReport ? '#faad14' : '#52c41a',
                            fontWeight: 500,
                            marginBottom: 4,
                          }}
                        >
                          {isGeneratingReport ? '⏳ 正在生成报告...' : '✓ 报告已生成完成'}
                        </div>
                        <Progress
                          percent={isGeneratingReport ? 45 : 100}
                          size="small"
                          strokeColor={isGeneratingReport ? '#faad14' : '#52c41a'}
                          showInfo={false}
                        />
                      </div>
                      <div style={{ fontSize: 11, color: '#666' }}>{isGeneratingReport ? '预计 30 秒完成报告生成' : '报告生成已完成，可以查看详情'}</div>
                    </div>

                    {/* 第三行：操作按钮 */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="small"
                        icon={<SyncOutlined />}
                        loading={isGeneratingReport}
                        onClick={generateReport}
                        style={{
                          flex: 1,
                        }}
                      >
                        重新生成报告
                      </Button>
                      <Button
                        size="small"
                        danger={complianceData.filter((i) => i.status === 'fail' && i.isCritical).length > 0}
                        icon={<WarningOutlined />}
                        onClick={() => {
                          if (complianceData.filter((i) => i.status === 'fail' && i.isCritical).length > 0) {
                            setReportSection('blockers')
                            message.info('已跳转到废标风险章节')
                          } else {
                            message.success('无致命风险项')
                          }
                        }}
                        style={{ flex: 1 }}
                      >
                        {complianceData.filter((i) => i.status === 'fail' && i.isCritical).length > 0
                          ? `查看${complianceData.filter((i) => i.status === 'fail' && i.isCritical).length}个风险`
                          : '✓ 无风险'}
                      </Button>
                    </div>
                  </Card>

                  {/* 下部分：AI助手对话 */}
                  <Card
                    title={
                      <Space>
                        <SyncOutlined spin={isGeneratingReport} />
                        <span>AI助手对话</span>
                      </Space>
                    }
                    size="small"
                    style={{
                      flex: 1,
                      minHeight: 0,
                      marginBottom: 0,
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                    styles={{
                      body: {
                        padding: '12px',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        minHeight: 0,
                      },
                    }}
                  >
                    {/* 对话消息区域 */}
                    <div
                      style={{
                        flex: 1,
                        overflow: 'auto',
                        border: '1px solid #f0f0f0',
                        borderRadius: 4,
                        padding: 10,
                        background: '#fafafa',
                        marginBottom: 8,
                        minHeight: 0,
                      }}
                    >
                      <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        {/* 欢迎消息 */}
                        <div style={{ textAlign: 'left' }}>
                          <div
                            style={{
                              display: 'inline-block',
                              maxWidth: '90%',
                              padding: '8px 10px',
                              borderRadius: 6,
                              background: '#fff',
                              fontSize: 11,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                              lineHeight: 1.6,
                            }}
                          >
                            👋 您好！我是合规报告AI助手。
                            <br />
                            我可以帮您：
                            <br />• 调整报告大纲结构
                            <br />• 生成或修改章节内容
                            <br />• 优化风险分析描述
                            <br />
                            请告诉我您的需求！
                          </div>
                        </div>

                        {/* 示例对话 */}
                        <div style={{ textAlign: 'right' }}>
                          <div
                            style={{
                              display: 'inline-block',
                              maxWidth: '90%',
                              padding: '6px 10px',
                              borderRadius: 6,
                              background: '#1890ff',
                              color: '#fff',
                              fontSize: 11,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                            }}
                          >
                            添加一个"合规性建议"章节
                          </div>
                        </div>

                        <div style={{ textAlign: 'left' }}>
                          <div
                            style={{
                              display: 'inline-block',
                              maxWidth: '90%',
                              padding: '8px 10px',
                              borderRadius: 6,
                              background: '#fff',
                              fontSize: 11,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                              lineHeight: 1.6,
                            }}
                          >
                            ✅ 已为您在大纲中添加"合规性建议"章节，包含以下内容：
                            <br />• 改进建议清单
                            <br />• 优先级排序
                            <br />• 实施时间表
                            <br />
                            内容已自动生成到中间编辑区。
                          </div>
                        </div>
                      </Space>
                    </div>

                    {/* 输入框 */}
                    <Input.TextArea placeholder="输入您的需求，例如：添加风险分析章节、优化执行摘要..." rows={2} style={{ marginBottom: 8, fontSize: 11 }} />

                    {/* 发送按钮 */}
                    <Button
                      type="primary"
                      size="small"
                      block
                      icon={<RobotOutlined />}
                      onClick={() => {
                        message.info('AI正在处理您的请求...')
                      }}
                    >
                      发送指令
                    </Button>
                  </Card>
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* ═══ Drools规则编辑器模态框 ═══ */}
      <Modal
        title={
          <Space>
            <CodeOutlined style={{ color: '#722ed1' }} />
            <span>Drools 规则引擎 — 规则配置</span>
          </Space>
        }
        open={droolsModalOpen}
        onCancel={() => {
          setDroolsModalOpen(false)
          setEditingRuleIndex(null)
        }}
        footer={[
          null,
          <Button
            key="cancel"
            onClick={() => {
              setDroolsModalOpen(false)
              setEditingRuleIndex(null)
            }}
          >
            取消
          </Button>,
          <Button key="save" type="primary" onClick={handleDroolsSave}>
            保存规则
          </Button>,
        ]}
        width={820}
        styles={{ body: { padding: '16px 24px' } }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 基本信息 */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>规则名称 (rule name)</div>
              <Input value={droolsRuleName} onChange={(e) => setDroolsRuleName(e.target.value)} placeholder="请输入规则名称" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>优先级 (salience)</div>
              <Input value={droolsSalience} onChange={(e) => setDroolsSalience(e.target.value)} placeholder="100" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>事实类型 (Fact)</div>
              <Select value={droolsFactType} onChange={(value) => setDroolsFactType(value)} style={{ width: '100%' }}>
                {DROOLS_FACT_TYPES.map((item) => (
                  <Select.Option key={item.value} value={item.value}>
                    {item.label}
                  </Select.Option>
                ))}
              </Select>
            </div>
          </div>

          {/* when / then 编辑区 */}
          <Row gutter={12}>
            <Col span={12}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                <Tag color="blue" style={{ fontSize: 10, margin: '0 4px 0 0' }}>
                  when
                </Tag>
                条件 (LHS)
              </div>
              <Input.TextArea
                value={droolsCondition}
                onChange={(e) => setDroolsCondition(e.target.value)}
                placeholder={'$doc : BidDocument(\n    // 条件表达式\n)'}
                rows={6}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </Col>
            <Col span={12}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
                <Tag color="green" style={{ fontSize: 10, margin: '0 4px 0 0' }}>
                  then
                </Tag>
                动作 (RHS)
              </div>
              <Input.TextArea
                value={droolsAction}
                onChange={(e) => setDroolsAction(e.target.value)}
                placeholder={'$doc.setStatus("FAIL");\n$doc.addViolation("...");'}
                rows={6}
                style={{ fontFamily: 'monospace', fontSize: 12 }}
              />
            </Col>
          </Row>

          {/* 生成的 DRL 预览 */}
          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CodeOutlined />
              生成的 .drl 文件预览
            </div>
            <div
              style={{
                background: '#1e1e1e',
                borderRadius: 6,
                padding: 14,
                maxHeight: 220,
                overflow: 'auto',
              }}
            >
              <pre
                style={{
                  margin: 0,
                  fontFamily: 'monospace',
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: '#d4d4d4',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {generatedDrl.split('\n').map((line, i) => {
                  // Drools 语法高亮
                  let color = '#d4d4d4'
                  if (line.startsWith('package') || line.startsWith('import')) color = '#c586c0'
                  else if (line.trimStart().startsWith('rule')) color = '#569cd6'
                  else if (line.trimStart().startsWith('salience')) color = '#b5cea8'
                  else if (line.trimStart().startsWith('when') || line.trimStart().startsWith('then') || line.trimStart().startsWith('end')) color = '#569cd6'
                  else if (line.includes('//')) color = '#6a9955'
                  else if (line.includes('$')) color = '#9cdcfe'
                  return (
                    <div key={i} style={{ display: 'flex' }}>
                      <span style={{ color: '#636363', minWidth: 28, textAlign: 'right', marginRight: 12, userSelect: 'none' }}>{i + 1}</span>
                      <span style={{ color }}>{line}</span>
                    </div>
                  )
                })}
              </pre>
            </div>
          </div>

          {/* 帮助信息 */}
          <div
            style={{
              padding: '8px 12px',
              background: '#f9f0ff',
              borderRadius: 4,
              border: '1px solid #d3adf7',
            }}
          >
            <div style={{ fontSize: 11, color: '#722ed1', lineHeight: 1.6 }}>
              <strong>Drools 语法说明：</strong>
              <code style={{ background: '#f0e6ff', padding: '0 3px', borderRadius: 2, margin: '0 2px' }}>when</code> 块定义匹配条件（LHS），支持
              <code style={{ background: '#f0e6ff', padding: '0 3px', borderRadius: 2, margin: '0 2px' }}>matches</code>正则、
              <code style={{ background: '#f0e6ff', padding: '0 3px', borderRadius: 2, margin: '0 2px' }}>eval()</code>表达式、
              <code style={{ background: '#f0e6ff', padding: '0 3px', borderRadius: 2, margin: '0 2px' }}>not exists</code>否定检查等；
              <code style={{ background: '#f0e6ff', padding: '0 3px', borderRadius: 2, margin: '0 2px' }}>then</code> 块定义触发动作（RHS），支持
              <code style={{ background: '#f0e6ff', padding: '0 3px', borderRadius: 2, margin: '0 2px' }}>insert()</code>、
              <code style={{ background: '#f0e6ff', padding: '0 3px', borderRadius: 2, margin: '0 2px' }}>modify()</code>、
              <code style={{ background: '#f0e6ff', padding: '0 3px', borderRadius: 2, margin: '0 2px' }}>retract()</code> 等工作内存操作。
              <code style={{ background: '#f0e6ff', padding: '0 3px', borderRadius: 2, margin: '0 2px' }}>salience</code> 值越大优先级越高。
            </div>
          </div>
        </div>
      </Modal>

      {/* ─── 知识库索引查看 Modal ──────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <BookOutlined style={{ color: '#722ed1' }} /> 索引知识块 - {currentIndexFile?.name}
          </Space>
        }
        open={indexViewVisible}
        onCancel={() => setIndexViewVisible(false)}
        footer={null}
        width={720}
      >
        {currentIndexFile?.indexChunks?.map((chunk, idx) => (
          <Card
            key={chunk.id}
            size="small"
            style={{ marginBottom: 12 }}
            title={
              <Space>
                <Tag color="purple" style={{ margin: 0 }}>
                  Chunk #{idx + 1}
                </Tag>
                <span style={{ fontSize: 12, color: '#999' }}>{chunk.id}</span>
              </Space>
            }
          >
            <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 8 }}>{chunk.content}</div>
            <div
              style={{
                fontSize: 11,
                color: '#999',
                padding: '4px 8px',
                background: '#fafafa',
                borderRadius: 4,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: '#f0f0f0',
              }}
            >
              {chunk.metadata}
            </div>
          </Card>
        ))}
        {(!currentIndexFile?.indexChunks || currentIndexFile.indexChunks.length === 0) && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>暂无索引数据</div>
        )}
      </Modal>

      {/* ─── 知识库文件预览 Modal ──────────────────────────────────── */}
      <Modal
        title={
          <Space>
            <FileSearchOutlined /> 文件详情 - {currentPreviewFile?.name}
          </Space>
        }
        open={filePreviewVisible}
        onCancel={() => setFilePreviewVisible(false)}
        footer={null}
        width={640}
      >
        {currentPreviewFile && (
          <div>
            <Row gutter={[16, 12]}>
              <Col span={12}>
                <div style={{ fontSize: 12, color: '#999' }}>文件名</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{currentPreviewFile.name}</div>
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 12, color: '#999' }}>文件大小</div>
                <div style={{ fontSize: 13 }}>{(currentPreviewFile.size / 1024 / 1024).toFixed(2)} MB</div>
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 12, color: '#999' }}>上传时间</div>
                <div style={{ fontSize: 13 }}>{currentPreviewFile.uploadTime}</div>
              </Col>
              <Col span={12}>
                <div style={{ fontSize: 12, color: '#999' }}>OCR状态</div>
                <Tag color={OCR_STATUS_CONFIG[currentPreviewFile.ocrStatus].color}>{OCR_STATUS_CONFIG[currentPreviewFile.ocrStatus].text}</Tag>
              </Col>
            </Row>
            <Divider />
            <div
              style={{
                padding: 16,
                background: '#fafafa',
                borderRadius: 6,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: '#f0f0f0',
                fontSize: 13,
                lineHeight: 1.8,
                color: '#333',
                maxHeight: 400,
                overflow: 'auto',
              }}
            >
              该文件包含合规检查相关知识数据，OCR识别后可用于构建RAG/OAG索引，增强合规审查Agent的检查精度与召回率。
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

// 为报告内容添加样式
const reportStyles = `
  .report-content h1 {
    font-size: 28px;
    font-weight: 600;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 2px solid #f0f0f0;
    color: #262626;
  }
  .report-content h2 {
    font-size: 22px;
    font-weight: 600;
    margin-top: 32px;
    margin-bottom: 16px;
    color: #262626;
  }
  .report-content h3 {
    font-size: 16px;
    font-weight: 500;
    margin-top: 24px;
    margin-bottom: 12px;
    color: #595959;
  }
  .report-content p {
    line-height: 1.8;
    margin-bottom: 16px;
    color: #595959;
    font-size: 14px;
  }
  .report-content strong {
    font-weight: 600;
    color: #262626;
  }
  .report-content hr {
    margin: 24px 0;
    border: 0;
    border-top: 1px solid #f0f0f0;
  }
  .report-content ul, .report-content ol {
    margin-bottom: 16px;
    padding-left: 24px;
  }
  .report-content li {
    margin-bottom: 8px;
    line-height: 1.8;
    color: #595959;
  }
  .report-content table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 13px;
  }
  .report-content table th {
    background: #fafafa;
    padding: 12px;
    text-align: left;
    font-weight: 600;
    border: 1px solid #f0f0f0;
    color: #262626;
  }
  .report-content table td {
    padding: 10px 12px;
    border: 1px solid #f0f0f0;
    color: #595959;
  }
  .report-content code {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    color: #d4380d;
  }
  .report-content pre {
    background: #f5f5f5;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 16px 0;
  }
  .report-content pre code {
    background: transparent;
    padding: 0;
    color: #262626;
  }
  .report-content input[type="checkbox"] {
    margin-right: 8px;
  }
`

// 注入样式到页面
if (typeof document !== 'undefined') {
  const styleId = 'compliance-report-styles'
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style')
    styleEl.id = styleId
    styleEl.textContent = reportStyles
    document.head.appendChild(styleEl)
  }
}

export default ComplianceCheck

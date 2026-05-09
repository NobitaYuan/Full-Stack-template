import type { Component } from 'vue'
import { FilePdfOutlined, FileWordOutlined, FileExcelOutlined, FileImageOutlined } from '@ant-design/icons-vue'

/* =================== 类型定义 =================== */

export type ComplianceCategory = 'formal' | 'response' | 'sensitive' | 'logic'

export interface ComplianceItem {
  key: string
  category: ComplianceCategory
  requirement: string
  aiResponse: string
  status: 'pass' | 'fail' | 'warning'
  score: number
  maxScore: number
  isCritical?: boolean
}

export type ReviewTaskStatus = 'reviewing' | 'waiting' | 'suspended' | 'completed'

export interface ReviewTaskLog {
  time: string
  skill: string
  color: string
  message: string
}

export interface ReviewTask {
  id: string
  title: string
  status: ReviewTaskStatus
  progress: number
  agent: string
  requiresManual?: boolean
  manualReason?: string
  logs: ReviewTaskLog[]
}

export type OcrStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface UploadedFile {
  key: string
  name: string
  size: number
  type: 'pdf' | 'word' | 'excel' | 'image'
  uploadTime: string
  ocrStatus: OcrStatus
  ocrProgress: number
}

export type IndexStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface KnowledgeFile extends UploadedFile {
  indexStatus: IndexStatus
  indexProgress: number
  indexChunks?: Array<{
    id: string
    content: string
    metadata: string
  }>
}

/* =================== 分类配置 =================== */

export const CATEGORY_CONFIG: Record<
  ComplianceCategory,
  {
    label: string
    tag: string
    color: string
    bgColor: string
    borderColor: string
  }
> = {
  formal: { label: '形式合规检查', tag: '一票否决', color: '#cf1322', bgColor: '#fff1f0', borderColor: '#ffa39e' },
  response: { label: '响应完整性检查', tag: '完整性', color: '#0958d9', bgColor: '#e6f4ff', borderColor: '#adc6ff' },
  sensitive: { label: '敏感性与排他性检查', tag: '反控标', color: '#d46b08', bgColor: '#fff7e6', borderColor: '#ffd591' },
  logic: { label: '内容逻辑一致性检查', tag: '跨模态一致性', color: '#1890ff', bgColor: '#e6f7ff', borderColor: '#91d5ff' },
}

export const CATEGORY_ORDER: ComplianceCategory[] = ['formal', 'response', 'sensitive', 'logic']

/* =================== 状态配置 =================== */

export const OCR_STATUS_CONFIG: Record<OcrStatus, { text: string; color: string }> = {
  pending: { text: '待识别', color: 'default' },
  processing: { text: '识别中', color: 'processing' },
  completed: { text: '已完成', color: 'success' },
  failed: { text: '识别失败', color: 'error' },
}

export const INDEX_STATUS_CONFIG: Record<IndexStatus, { text: string; color: string }> = {
  pending: { text: '待索引', color: 'default' },
  processing: { text: '索引中', color: 'processing' },
  completed: { text: '已索引', color: 'success' },
  failed: { text: '索引失败', color: 'error' },
}

/** 文件类型对应图标组件 */
export const FILE_TYPE_ICONS: Record<string, Component> = {
  pdf: FilePdfOutlined,
  word: FileWordOutlined,
  excel: FileExcelOutlined,
  image: FileImageOutlined,
}

export const FILE_TYPE_ICON_COLORS: Record<string, string> = {
  pdf: '#ff4d4f',
  word: '#1890ff',
  excel: '#52c41a',
  image: '#722ed1',
}

/* =================== Drools =================== */

export const DROOLS_FACT_TYPES = [
  { value: 'BidDocument', label: 'BidDocument (标书文档)' },
  { value: 'TechnicalSpec', label: 'TechnicalSpec (技术规格)' },
  { value: 'PriceItem', label: 'PriceItem (报价项)' },
  { value: 'Qualification', label: 'Qualification (资质证书)' },
  { value: 'SealCheckpoint', label: 'SealCheckpoint (封标检查点)' },
]

/* =================== Mock 数据 =================== */

export const COMPLIANCE_DATA: ComplianceItem[] = [
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

export const REVIEW_TASKS: ReviewTask[] = [
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
  { id: 'rt-3', title: '系统并发性能验证', status: 'waiting', progress: 0, agent: '合规Agent-A', logs: [] },
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
    manualReason: 'AI在第198页未检测到法人签章图层，需人工翻阅原件确认签章真实存在并拍照上传（第 C-02 项）',
    logs: [
      { time: '09:14:03', skill: 'SealDetect', color: 'blue', message: '印章检测：扫描全文 287 页' },
      { time: '09:14:08', skill: 'ImageAnalyze', color: 'purple', message: '第198页图层分析：未检测到印章像素区域' },
      { time: '09:14:10', skill: 'HumanEscalate', color: 'red', message: '⚠️ 触发人工介入：疑似漏章，需人工复核' },
    ],
  },
]

export const MOCK_BID_FILES: UploadedFile[] = [
  { key: 'bf-1', name: '招标文件-XX市智慧园区项目.pdf', size: 5242880, type: 'pdf', uploadTime: '2026-03-05 14:30', ocrStatus: 'completed', ocrProgress: 100 },
  { key: 'bf-2', name: '招标补充公告（一）.pdf', size: 1048576, type: 'pdf', uploadTime: '2026-03-05 14:32', ocrStatus: 'completed', ocrProgress: 100 },
]

export const MOCK_RESPONSE_FILES: UploadedFile[] = [
  { key: 'rf-1', name: '投标文件-技术标（终版）.pdf', size: 8388608, type: 'pdf', uploadTime: '2026-03-06 09:15', ocrStatus: 'completed', ocrProgress: 100 },
  { key: 'rf-2', name: '商务标-报价清单.xlsx', size: 524288, type: 'excel', uploadTime: '2026-03-06 09:18', ocrStatus: 'completed', ocrProgress: 100 },
  { key: 'rf-3', name: '资质证书汇编.pdf', size: 3145728, type: 'pdf', uploadTime: '2026-03-06 09:20', ocrStatus: 'completed', ocrProgress: 100 },
]

export const MOCK_CHECKLIST_FILES: UploadedFile[] = [
  { key: 'cf-1', name: '合规检查项清单-形式审查.docx', size: 204800, type: 'word', uploadTime: '2026-03-06 10:00', ocrStatus: 'completed', ocrProgress: 100 },
  { key: 'cf-2', name: '合规检查项清单-内容逻辑.docx', size: 184320, type: 'word', uploadTime: '2026-03-06 10:02', ocrStatus: 'completed', ocrProgress: 100 },
]

export const MOCK_KNOWLEDGE_FILES: KnowledgeFile[] = [
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
        content: '安全管理中心：应划分出安全管理区域，对网络、主机和应用的安全策略实施集中管理。',
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
        content: '形式合规审查：投标文件签章检查、授权委托书有效性检查、响应偏离表完整性检查。',
        metadata: '来源：第3页 | 类别：形式合规 | 向量维度：1536',
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

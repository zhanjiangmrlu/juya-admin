/** 后台展示默认值；页面可通过公共组件 props 覆盖，业务配置仍由原接口管理。 */
export const ADMIN_UI_DEFAULTS = {
  panel: { shadow: 'never' as const, heading: 3 as const },
  pagination: { pageSize: 10, pageSizes: [10, 20, 50, 100] as readonly number[] },
  table: { emptyText: '暂无数据', rowKey: 'id' }
} as const

/** 共用卡片标题；复杂标题与操作区使用 header 插槽。 */
export const ADMIN_SECTION_TITLES = {
  analytics: {
    overviewCard: '内容与反馈概览'
  },
  campaignEdit: {
    validationCard: '发布前校验'
  },
  contactCorrection: {
    applicationCard: '更正申请'
  },
  audioVersion: {
    audioTarget: '音频目标',
    versions: '音频版本'
  },
  batchJobs: {
    createJob: '新建批量任务',
    recycleDraft: '草稿移入回收站',
    jobs: '批量任务'
  },
  contentImport: {
    uploadBatch: '上传批次',
    taskQueue: '任务队列',
    ocrNote: 'OCR 安全额度设置'
  },
  discoveryConfig: {
    learningModules: '学习模块'
  },
  publishCheck: {
    validationPanel: '发布校验'
  },
  sceneEditor: {
    entryPanel: '草稿与素材'
  },
  formalAction: {
    detailCard: '正式包权益'
  },
  formalGrant: {
    editorCard: '授予正式包'
  },
  limitedAction: {
    detailCard: '限时权益状态'
  },
  limitedGrant: {
    editorCard: '开通限时权益'
  },
  feedbackDetail: {
    timelineCard: '完整处理时间线',
    supplements: '补充记录',
    replies: '回复记录',
    feedbackInfo: '反馈信息',
    internalNotes: '内部备注'
  },
  feedbackRespond: {
    additionalActions: '补充与其他处理'
  },
  settings: {
    reviewCard: '发布前复核',
    auditCard: '最近审计事件'
  },
  userDetail: {
    identityCard: '基本身份与学习概况'
  },
  sceneAudioPanel: {
    audioSourcePanel: '整段对话音频'
  },
  sceneProofreadPanel: {
    dialogue: '对话与句子',
    vocabulary: '核心词汇',
    chunks: '常用语块'
  }
} as const

export { ADMIN_TABLE_COLUMNS } from './admin-tables.config'

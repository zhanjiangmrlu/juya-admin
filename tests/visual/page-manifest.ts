export interface AcceptanceViewport {
  height: number
  width: number
}

export interface AdminPageManifestItem {
  id: `A${number}`
  path: string
  title: string
  viewports: readonly AcceptanceViewport[]
}

export const ACCEPTANCE_VIEWPORTS: readonly AcceptanceViewport[] = [
  { height: 900, width: 1440 },
  { height: 800, width: 1280 }
]

export const pageManifest: readonly AdminPageManifestItem[] = [
  { id: 'A01', path: '/dashboard', title: '工作台', viewports: ACCEPTANCE_VIEWPORTS },
  { id: 'A02', path: '/users', title: '用户列表', viewports: ACCEPTANCE_VIEWPORTS },
  { id: 'A03', path: '/users/USER-1', title: '用户详情', viewports: ACCEPTANCE_VIEWPORTS },
  {
    id: 'A04',
    path: '/contacts/corrections/COR-1',
    title: '联系资料更正处理',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  { id: 'A05', path: '/entitlements', title: '统一权益中心', viewports: ACCEPTANCE_VIEWPORTS },
  {
    id: 'A06',
    path: '/entitlements/formal/grant',
    title: '开通正式内容',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A07',
    path: '/entitlements/limited/grant',
    title: '开通限时学习权益',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A08',
    path: '/entitlements/formal/FORMAL-1/action',
    title: '正式权益操作',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A09',
    path: '/entitlements/limited/LIMITED-1/action',
    title: '限时权益操作',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  { id: 'A10', path: '/campaigns', title: '限时活动列表', viewports: ACCEPTANCE_VIEWPORTS },
  {
    id: 'A11',
    path: '/campaigns/CAMP-1/edit',
    title: '编辑限时活动',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A12',
    path: '/campaigns/CAMP-1/versions',
    title: '活动规则与容量',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  { id: 'A13', path: '/work-items', title: '消息中心', viewports: ACCEPTANCE_VIEWPORTS },
  { id: 'A14', path: '/feedback', title: '问题反馈列表', viewports: ACCEPTANCE_VIEWPORTS },
  {
    id: 'A15',
    path: '/feedback/FB-1',
    title: '问题反馈详情',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A16',
    path: '/feedback/FB-1/respond',
    title: '问题反馈详情',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  { id: 'A17', path: '/content/scenes', title: '内容生产', viewports: ACCEPTANCE_VIEWPORTS },
  {
    id: 'A18',
    path: '/content/import',
    title: '批量导入内容',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A19',
    path: '/content/ocr/JOB-1/ITEM-1',
    title: 'OCR 功能已取消',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A20',
    path: '/content/scenes/SCENE-1/edit',
    title: '正文对照与配对校对',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A21',
    path: '/content/scenes/SCENE-1/audio',
    title: '整段音频与逐句标时',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A22',
    path: '/content/scenes/REV-1/publish',
    title: '预览与发布检查',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A23',
    path: '/content/discovery-config',
    title: '开放与预览配置',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  { id: 'A24', path: '/content/jobs', title: '批量任务', viewports: ACCEPTANCE_VIEWPORTS },
  { id: 'A25', path: '/analytics', title: '汇总统计', viewports: ACCEPTANCE_VIEWPORTS },
  {
    id: 'A26',
    path: '/settings/learning-modules',
    title: '学习模块配置',
    viewports: ACCEPTANCE_VIEWPORTS
  },
  {
    id: 'A30',
    path: '/content/short-readings/READING-1/edit',
    title: '短文结构化编辑',
    viewports: ACCEPTANCE_VIEWPORTS
  }
]

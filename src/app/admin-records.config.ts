export const ADMIN_RELATED_RECORD_SECTIONS = [
  {
    key: 'formal_entitlements',
    title: '正式权益',
    fields: ['name', 'status', 'term', 'granted_at', 'expires_at'],
    route: 'formal-entitlement-action'
  },
  {
    key: 'limited_entitlements',
    title: '限时权益',
    fields: [
      'name',
      'campaign_version_id',
      'status',
      'start_deadline',
      'activated_at',
      'expires_at'
    ],
    route: 'limited-entitlement-action'
  },
  {
    key: 'feedback',
    title: '反馈记录',
    fields: ['category', 'description', 'status', 'created_at'],
    route: 'feedback-detail'
  },
  {
    key: 'deletions',
    title: '注销记录',
    fields: ['status', 'requested_at', 'effective_at', 'completed_at'],
    route: undefined
  },
  {
    key: 'audit',
    title: '操作审计',
    fields: ['action', 'actor_public_id', 'created_at', 'reason'],
    route: undefined
  }
]
export const ADMIN_RELATED_RECORD_LABELS: Record<string, string> = {
  name: '内容包 / 活动',
  status: '状态',
  term: '期限',
  granted_at: '授予时间',
  expires_at: '到期时间',
  campaign_version_id: '活动版本',
  start_deadline: '启动期限',
  activated_at: '开始时间',
  category: '分类',
  description: '用户说明',
  created_at: '时间',
  requested_at: '申请时间',
  effective_at: '生效时间',
  completed_at: '完成时间',
  action: '操作',
  actor_public_id: '操作人',
  reason: '说明'
}

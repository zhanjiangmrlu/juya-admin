import type { TableColumnConfig } from '@/components/data-table/table-column'

/** 表格结构统一管理；业务展示与权限操作由命名插槽提供。 */
export const ADMIN_TABLE_COLUMNS = {
  analyticsRatios: [
    {
      key: 'day',
      prop: 'day',
      label: '周期起始日',
      width: 120
    },
    {
      key: 'dimension',
      prop: 'dimension',
      label: '模式',
      width: 100
    },
    {
      key: 'metric',
      label: '指标',
      width: 140,
      slot: 'metric'
    },
    {
      key: 'numerator',
      prop: 'numerator',
      label: '分子',
      width: 80
    },
    {
      key: 'denominator',
      prop: 'denominator',
      label: '分母',
      width: 80
    },
    {
      key: 'rate',
      label: '比率',
      width: 110,
      slot: 'rate'
    },
    {
      key: 'basis',
      prop: 'basis',
      label: '口径',
      minWidth: 240
    }
  ],
  campaigns: [
    {
      key: 'name',
      prop: 'name',
      label: '活动',
      minWidth: 200,
      showOverflowTooltip: true
    },
    {
      key: 'id',
      prop: 'id',
      label: '活动编号',
      minWidth: 150,
      showOverflowTooltip: true
    },
    {
      key: 'version',
      label: '版本',
      width: 90,
      slot: 'version'
    },
    {
      key: 'capacity',
      label: '开通人数 / 容量',
      minWidth: 160,
      slot: 'capacity'
    },
    {
      key: 'status',
      prop: 'status',
      label: '状态',
      width: 100,
      slot: 'status'
    },
    {
      key: 'actions',
      label: '操作',
      width: 180,
      slot: 'actions'
    }
  ],
  audioVersions: [
    {
      key: 'version',
      label: '版本',
      prop: 'versionNo',
      width: 72
    },
    {
      key: 'source',
      label: '来源',
      prop: 'source',
      width: 96
    },
    {
      key: 'status',
      label: '状态',
      prop: 'status',
      minWidth: 120
    },
    {
      key: 'asset',
      label: '素材编号',
      prop: 'assetId',
      minWidth: 150
    },
    {
      key: 'actions',
      label: '操作',
      width: 170,
      slot: 'actions'
    }
  ],
  batchItems: [
    {
      key: 'target',
      label: '目标',
      prop: 'targetId',
      minWidth: 130
    },
    {
      key: 'status',
      label: '状态',
      prop: 'status',
      width: 120
    },
    {
      key: 'attempts',
      label: '尝试',
      prop: 'attemptCount',
      width: 72
    },
    {
      key: 'error',
      label: '错误码',
      prop: 'errorCode',
      minWidth: 130
    }
  ],
  scenes: [
    {
      key: 'scene',
      label: '场景',
      minWidth: 260,
      slot: 'scene'
    },
    {
      key: 'series',
      label: '系列',
      minWidth: 150,
      prop: 'seriesTitle'
    },
    {
      key: 'status',
      label: '状态',
      width: 100,
      slot: 'status'
    },
    {
      key: 'updatedAt',
      label: '更新时间',
      minWidth: 180,
      slot: 'updatedAt'
    },
    {
      key: 'actions',
      fixed: 'right',
      label: '操作',
      minWidth: 260,
      slot: 'actions'
    }
  ],
  entitlements: [
    {
      key: 'id',
      prop: 'id',
      label: '权益编号',
      minWidth: 125,
      showOverflowTooltip: true
    },
    {
      key: 'user',
      label: '用户 / 句芽编号',
      minWidth: 145,
      slot: 'user'
    },
    {
      key: 'contact',
      label: '微信号 / 联系状态',
      minWidth: 155,
      slot: 'contact'
    },
    {
      key: 'type',
      label: '权益类型',
      width: 90,
      slot: 'type'
    },
    {
      key: 'package',
      label: '内容包 / 活动版本',
      minWidth: 150,
      slot: 'package'
    },
    {
      key: 'status',
      label: '状态',
      width: 100,
      slot: 'status'
    },
    {
      key: 'expires',
      label: '期限',
      minWidth: 205,
      slot: 'expires'
    },
    {
      key: 'actions',
      label: '操作',
      width: 75,
      fixed: 'right',
      slot: 'actions'
    }
  ],
  feedback: [
    {
      key: 'details',
      type: 'expand',
      width: 40,
      slot: 'details'
    },
    {
      key: 'subject',
      label: '标题与分类',
      minWidth: 240,
      slot: 'subject'
    },
    {
      key: 'user',
      prop: 'userId',
      label: '用户',
      minWidth: 100,
      showOverflowTooltip: true
    },
    {
      key: 'source',
      label: '来源',
      minWidth: 160,
      slot: 'source'
    },
    {
      key: 'screenshot',
      label: '截图状态',
      minWidth: 100,
      slot: 'screenshot'
    },
    {
      key: 'status',
      label: '状态',
      width: 108,
      slot: 'status'
    },
    {
      key: 'sla',
      label: '处理时限',
      width: 108,
      slot: 'sla'
    },
    {
      key: 'actions',
      label: '操作',
      width: 85,
      slot: 'actions'
    }
  ],
  users: [
    {
      key: 'user',
      label: '用户',
      minWidth: 190,
      slot: 'user'
    },
    {
      key: 'account',
      label: '账号状态',
      minWidth: 100,
      slot: 'account'
    },
    {
      key: 'contact',
      label: '完整微信号',
      minWidth: 155,
      slot: 'contact'
    },
    {
      key: 'contactStatus',
      label: '联系状态',
      minWidth: 100,
      slot: 'contactStatus'
    },
    {
      key: 'changePending',
      label: '微信号变更',
      minWidth: 90,
      slot: 'changePending'
    },
    {
      key: 'completed',
      prop: 'open_scene_completed_count',
      label: '开放完成',
      minWidth: 95
    },
    {
      key: 'feedback',
      label: '反馈摘要',
      minWidth: 100,
      slot: 'feedback'
    },
    {
      key: 'entitlements',
      label: '权益摘要',
      minWidth: 130,
      slot: 'entitlements'
    },
    {
      key: 'actions',
      fixed: 'right',
      label: '操作',
      width: 90,
      slot: 'actions'
    }
  ],
  contactCorrections: [
    {
      key: 'id',
      label: '申请编号',
      minWidth: 140,
      prop: 'id'
    },
    {
      key: 'user',
      label: '用户',
      minWidth: 180,
      slot: 'user'
    },
    {
      key: 'wechat',
      label: '当前微信号',
      minWidth: 180,
      prop: 'wechat_id'
    },
    {
      key: 'reason',
      label: '更正原因',
      minWidth: 260,
      showOverflowTooltip: true,
      prop: 'reason'
    },
    {
      key: 'status',
      label: '状态',
      minWidth: 110,
      prop: 'status'
    },
    {
      key: 'createdAt',
      label: '申请时间',
      minWidth: 160,
      slot: 'createdAt'
    },
    {
      key: 'actions',
      fixed: 'right',
      label: '操作',
      width: 90,
      slot: 'actions'
    }
  ],
  sceneHistory: [
    {
      key: 'version',
      label: '版本',
      prop: 'version_no',
      width: 70
    },
    {
      key: 'title',
      label: '英文标题',
      prop: 'title_en',
      minWidth: 180
    },
    {
      key: 'status',
      label: '状态',
      width: 140,
      slot: 'status'
    },
    {
      key: 'createdAt',
      label: '创建时间',
      minWidth: 180,
      slot: 'createdAt'
    },
    {
      key: 'actions',
      label: '操作',
      width: 210,
      slot: 'actions'
    }
  ]
} as const satisfies Record<string, readonly TableColumnConfig[]>

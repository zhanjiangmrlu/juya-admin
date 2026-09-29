import type { WorkItemDto } from './work-item-adapter'

export type WorkItemTone = 'danger' | 'info' | 'warning'

export interface WorkItemGroups {
  informational: WorkItemDto[]
  urgent: WorkItemDto[]
}

export interface WorkItemViewModel {
  actionLabel: string
  description: string
  destination: string
  title: string
  tone: WorkItemTone
}

const itemPresentation: Readonly<Record<string, WorkItemViewModel>> = {
  ACTIVE_ENTITLEMENT_EXPIRING: {
    actionLabel: '查看',
    description: '学习中权益将在近期结束',
    destination: '/entitlements?status=expiring',
    title: '学习中权益即将结束',
    tone: 'info'
  },
  CAMPAIGN_START_EXPIRED: {
    actionLabel: '处理',
    description: '活动启动窗口已过期',
    destination: '/campaigns?status=start-expired',
    title: '活动待重新安排',
    tone: 'warning'
  },
  CAMPAIGN_STARTING: {
    actionLabel: '查看',
    description: '活动将在 24 小时内开始',
    destination: '/campaigns?status=starting',
    title: '限时活动即将开始',
    tone: 'warning'
  },
  FEEDBACK_DUE_SOON: {
    actionLabel: '处理',
    description: '反馈即将超过处理时限',
    destination: '/feedback?status=due-soon',
    title: '反馈即将超时',
    tone: 'warning'
  },
  FEEDBACK_OVERDUE: {
    actionLabel: '处理',
    description: '反馈已超过处理时限',
    destination: '/feedback?status=overdue',
    title: '反馈处理已超时',
    tone: 'danger'
  },
  NEW_FEEDBACK: {
    actionLabel: '处理',
    description: '有新的用户反馈等待处理',
    destination: '/feedback?status=pending',
    title: '收到新反馈',
    tone: 'warning'
  },
  USER_SUPPLIED: {
    actionLabel: '查看',
    description: '用户已按要求补充资料',
    destination: '/feedback?status=user-supplied',
    title: '用户已补充反馈资料',
    tone: 'warning'
  }
}

/**
 * 按展示区域分组待办，并保持服务端返回顺序
 *
 * @param items - 服务端已排序的待办数组
 * @returns 紧急待办和普通信息提醒分组
 */
export function groupWorkItems(items: WorkItemDto[]): WorkItemGroups {
  return {
    informational: items.filter((item) => item.kind === 'ACTIVE_ENTITLEMENT_EXPIRING'),
    urgent: items.filter((item) => item.kind !== 'ACTIVE_ENTITLEMENT_EXPIRING')
  }
}

/**
 * 将服务端待办转换为页面展示文案和目标地址
 *
 * @param item - 单条服务端待办
 * @returns 稳定的页面展示模型
 */
export function toWorkItemViewModel(item: WorkItemDto): WorkItemViewModel {
  return (
    itemPresentation[item.kind] ?? {
      actionLabel: '查看',
      description: '请打开消息中心查看详情',
      destination: '/work-items',
      title: '待处理事项',
      tone: 'info'
    }
  )
}

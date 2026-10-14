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
    destination: '/entitlements?type=LIMITED&status=ACTIVE',
    title: '学习中权益即将结束',
    tone: 'info'
  },
  CAMPAIGN_START_EXPIRED: {
    actionLabel: '处理',
    description: '限时权益未在启动截止时间前开始',
    destination: '/entitlements?type=LIMITED&status=START_EXPIRED',
    title: '未开始权益已失效',
    tone: 'warning'
  },
  CAMPAIGN_STARTING: {
    actionLabel: '查看',
    description: '待开始权益不足24小时失效',
    destination: '/entitlements?type=LIMITED&status=PENDING',
    title: '待开始权益即将失效',
    tone: 'warning'
  },
  FEEDBACK_DUE_SOON: {
    actionLabel: '立即处理',
    description: '反馈即将超过处理时限',
    destination: '/feedback?sla=DUE_SOON',
    title: '反馈即将超时',
    tone: 'warning'
  },
  FEEDBACK_OVERDUE: {
    actionLabel: '立即处理',
    description: '反馈已超过处理时限',
    destination: '/feedback?sla=OVERDUE',
    title: '反馈处理已超时',
    tone: 'danger'
  },
  NEW_FEEDBACK: {
    actionLabel: '处理',
    description: '有新的用户反馈等待处理',
    destination: '/feedback?status=PENDING',
    title: '收到新反馈',
    tone: 'warning'
  },
  USER_SUPPLIED: {
    actionLabel: '重新查看',
    description: '用户已按要求补充资料',
    destination: '/feedback?status=USER_SUPPLIED',
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

export const /**
   * 将服务端待办转换为页面展示文案和目标地址
   *
   * @param item - 单条服务端待办
   * @returns 稳定的页面展示模型
   */ toWorkItemViewModel = (item: WorkItemDto): WorkItemViewModel => {
    return (
      (Object.prototype.hasOwnProperty.call(itemPresentation, item.kind)
        ? itemPresentation[item.kind]
        : undefined) ?? {
        actionLabel: '查看',
        description: '请打开消息中心查看详情',
        destination: '/work-items',
        title: '待处理事项',
        tone: 'info'
      }
    )
  }

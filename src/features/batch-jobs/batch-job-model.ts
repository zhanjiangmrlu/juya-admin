export interface BatchValidationResult {
  code: 'BATCH_TOO_LARGE' | 'BATCH_EMPTY' | null
  message: string
  valid: boolean
}

export interface DraftState {
  referenced: boolean
}

/**
 * 校验批量任务项数
 *
 * @param itemCount - 任务项数
 * @returns 批量任务校验结果
 */
export function validateBatchJobSize(itemCount: number): BatchValidationResult {
  if (itemCount < 1) return { code: 'BATCH_EMPTY', message: '至少需要一个任务项', valid: false }
  if (itemCount > 500)
    return { code: 'BATCH_TOO_LARGE', message: '批量任务最多 500 项', valid: false }
  return { code: null, message: '校验通过', valid: true }
}

/**
 * 返回草稿可执行的回收站操作
 *
 * @param draft - 草稿引用状态
 * @returns 可执行操作数组
 */
export function getDraftOperations(draft: DraftState): readonly ('CLEANUP' | 'RESTORE')[] {
  return draft.referenced ? ['RESTORE'] : ['RESTORE', 'CLEANUP']
}

export interface BatchJobItem {
  attemptCount: number
  errorCode: null | string
  id: string
  resultVersion: null | number
  status: string
  targetId: string
}

export interface BatchJob {
  inputPayload?: Record<string, unknown>
  resultPayload?: Record<string, unknown>
  failureCount: number
  id: string
  items: BatchJobItem[]
  jobType: string
  status: string
  successCount: number
  totalCount: number
  updatedAt: string
}

export interface BatchJobPage {
  items: BatchJob[]
  page: number
  pageSize: number
  total: number
}

export interface TrashEntry {
  id: string
  retentionUntil: string
  revisionId: string
  sceneId: string
  status: string
}

export type SceneStatus = 'DRAFT' | 'OFFLINE' | 'PUBLISHED'
export type SceneOperation = 'CREATE_REVISION' | 'EDIT' | 'OFFLINE' | 'PUBLISH_CHECK'

export interface SceneSummary {
  coverObjectKey: null | string
  draftRevisionId: null | string
  id: string
  publishedRevisionId: null | string
  seriesId: string
  seriesTitle: string
  status: SceneStatus
  summary: null | string
  title: string
  updatedAt: null | string
}

export interface ScenePage {
  items: SceneSummary[]
  page: number
  pageSize: number
  total: number
}

export interface SceneFilters {
  page: number
  pageSize: number
  query: string
  seriesId: string
  status: '' | SceneStatus
}

export interface SceneRevision {
  content: Record<string, unknown>
  createdAt: null | string
  createdBy: string
  id: string
  sceneId: string
  sourceRevisionId: null | string
  stableEntryIds: string[]
  stableSentenceIds: string[]
  status: string
  version: number
}

/**
 * 根据场景状态返回安全的版本操作
 *
 * @param scene - 场景摘要
 * @returns 当前允许的操作数组
 */
export function getSceneOperations(
  scene: Pick<SceneSummary, 'id' | 'status'>
): readonly SceneOperation[] {
  if (scene.status === 'PUBLISHED') return ['CREATE_REVISION', 'OFFLINE']
  if (scene.status === 'DRAFT') return ['EDIT', 'PUBLISH_CHECK']
  return ['CREATE_REVISION']
}

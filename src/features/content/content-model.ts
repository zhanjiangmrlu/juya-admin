export type SceneStatus = 'DRAFT' | 'OFFLINE' | 'PUBLISHED'
export type SceneOperation = 'CREATE_REVISION' | 'EDIT' | 'OFFLINE' | 'PUBLISH_CHECK'

export interface SceneSummary {
  id: string
  status: SceneStatus
}

/**
 * 根据场景状态返回安全的版本操作
 *
 * @param scene - 场景摘要
 * @returns 当前允许的操作数组
 */
export function getSceneOperations(scene: SceneSummary): readonly SceneOperation[] {
  if (scene.status === 'PUBLISHED') return ['CREATE_REVISION', 'OFFLINE']
  if (scene.status === 'DRAFT') return ['EDIT', 'PUBLISH_CHECK']
  return ['CREATE_REVISION']
}

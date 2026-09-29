export interface ValidationResult {
  code: string | null
  message: string
  valid: boolean
}

export interface LearningModuleConfig {
  enabled: boolean
  type: string
}

/**
 * 校验 V1.3 学习模块开放范围
 *
 * @param modules - 学习模块配置
 * @returns 配置校验结果
 */
export function validateLearningModules(
  modules: readonly LearningModuleConfig[]
): ValidationResult {
  if (modules.some((module) => module.enabled && module.type !== 'scene_learning'))
    return invalid('MODULE_NOT_ALLOWED', 'V1.3 仅允许启用场景学习')
  return valid()
}

/**
 * 校验三个不重复的开放场景
 *
 * @param sceneIds - 开放场景编号
 * @returns 配置校验结果
 */
export function validateOpenScenes(sceneIds: readonly string[]): ValidationResult {
  if (sceneIds.length !== 3 || new Set(sceneIds).size !== 3)
    return invalid('OPEN_SCENES_INVALID', '开放场景必须恰好为三个不同场景')
  return valid()
}

/**
 * 校验系列预览数量、唯一性和开放场景排斥关系
 *
 * @param sceneIds - 系列预览场景编号
 * @param openSceneIds - 当前开放场景编号
 * @returns 配置校验结果
 */
export function validatePreviewScenes(
  sceneIds: readonly string[],
  openSceneIds: readonly string[]
): ValidationResult {
  if (sceneIds.length < 3 || sceneIds.length > 6 || new Set(sceneIds).size !== sceneIds.length)
    return invalid('PREVIEW_SCENES_INVALID', '系列预览必须包含 3 到 6 个不同场景')
  if (sceneIds.some((id) => openSceneIds.includes(id)))
    return invalid('PREVIEW_SCENE_IS_OPEN', '系列预览不能包含开放场景')
  return valid()
}

/** 创建通过的配置校验结果
 * @returns 通过结果
 */
function valid(): ValidationResult {
  return { code: null, message: '校验通过', valid: true }
}

/**
 * 创建失败的配置校验结果
 *
 * @param code - 稳定错误码
 * @param message - 管理端提示文案
 * @returns 失败结果
 */
function invalid(code: string, message: string): ValidationResult {
  return { code, message, valid: false }
}

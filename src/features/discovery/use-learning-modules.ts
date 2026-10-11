import { ref } from 'vue'

import { createIdempotencyKey } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

import type { LearningModuleRow, LearningModulesAdapter } from './learning-modules-adapter'

export const /**
   * 管理四模块独立版本、输入、真实就绪与冲突恢复
   * @param adapter - 模块元信息权威接口
   * @returns 可独立保存的模块表单
   */ useLearningModules = (adapter: LearningModulesAdapter) => {
    const rows = ref<LearningModuleRow[]>([])
    const busy = ref(false)
    const error = ref('')
    const conflicts = ref<string[]>([])
    const commands = new Map<string, { signature: string; key: string }>()
    let generation = 0
    let disposed = false
    const /** 明确重新读取模块并放弃未保存的模块输入 */ load = async (): Promise<void> => {
        if (busy.value || disposed) return
        const token = ++generation
        busy.value = true
        error.value = ''
        try {
          const result = await adapter.load()
          if (disposed || token !== generation) return
          rows.value = result
          conflicts.value = []
          commands.clear()
        } catch (failure) {
          if (!disposed && token === generation)
            error.value = failure instanceof Error ? failure.message : '模块读取失败'
        } finally {
          if (token === generation) busy.value = false
        }
      }
    const /**
       * 保存一项明确输入；丢响应保留命令，版本冲突保留本地编辑
       * @param type - 管理员选择的固定模块类型
       * @returns 已保存的新配置或空值
       */ save = async (type: string): Promise<LearningModuleRow | null> => {
        const row = rows.value.find((item) => item.type === type)
        if (!row || busy.value || disposed || conflicts.value.includes(type)) return null
        if (
          !row.name.trim() ||
          row.name.trim().length > 80 ||
          !Number.isInteger(row.order) ||
          row.order < 0 ||
          row.order > 65535
        ) {
          error.value = '模块名称需为 1–80 字，排序需为 0–65535 的整数'
          return null
        }
        if (row.enabled && !row.ready) {
          error.value = '模块尚未准备就绪，无法开启'
          return null
        }
        const frozen = { ...row }
        const signature = JSON.stringify([
          frozen.version,
          frozen.name.trim(),
          frozen.order,
          frozen.enabled
        ])
        if (commands.get(type)?.signature !== signature)
          commands.set(type, { signature, key: createIdempotencyKey() })
        const token = ++generation
        busy.value = true
        error.value = ''
        try {
          const saved = await adapter.save(frozen, commands.get(type)!.key)
          if (disposed || token !== generation) return null
          rows.value = rows.value
            .map((item) => (item.type === type ? saved : item))
            .sort((left, right) => left.order - right.order || left.type.localeCompare(right.type))
          commands.delete(type)
          return saved
        } catch (failure) {
          if (!disposed && token === generation) {
            error.value = failure instanceof Error ? failure.message : '模块保存失败'
            if (
              failure instanceof ApiError &&
              failure.status === 409 &&
              failure.code === 'CONFIG_VERSION_CONFLICT'
            )
              conflicts.value = [...conflicts.value, type]
          }
          return null
        } finally {
          if (token === generation) busy.value = false
        }
      }
    const /** 离页撤销旧返回并清理本地输入 */ dispose = (): void => {
        disposed = true
        generation++
        rows.value = []
        commands.clear()
        busy.value = false
      }
    return { rows, busy, error, conflicts, load, save, dispose }
  }

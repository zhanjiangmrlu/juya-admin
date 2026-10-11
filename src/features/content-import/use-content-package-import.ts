import { computed, ref, shallowRef } from 'vue'

import { createIdempotencyKey } from '@/services/api/api-client'
import { ApiError } from '@/shared/errors/api-error'

import type {
  ContentPackageAdapter,
  ImportBatch,
  ImportConfirmation,
  ImportPhase,
  ImportPreview,
  PackageUploadContext
} from './content-package-model'

export const /**
   * 管理四阶段导入、逐行选择、冲突恢复与失败重试
   * @param adapter - 已核对服务契约的导入适配器
   * @returns 当前操作结果或完成状态
   */ useContentPackageImport = (adapter: ContentPackageAdapter) => {
    const batch = shallowRef<ImportBatch | null>(null)
    const previewResult = shallowRef<ImportPreview | null>(null)
    const phase = ref<ImportPhase>('upload')
    const busy = ref(false)
    const error = ref('')
    const stale = ref(false)
    const uploadProgress = ref(0)
    const excluded = ref<string[]>([])
    const selected = ref<string[]>([])
    const defaultConfirmations = ref<string[]>([])
    const diffConfirmations = ref<string[]>([])
    let generation = 0
    let disposed = false
    let confirmationSignature = ''
    let confirmationKey = ''
    let uploadFile: globalThis.File | null = null
    let uploadSignature = ''
    let uploadKey = ''
    const eligible = computed(
      () =>
        previewResult.value?.items.filter(
          (item) =>
            selected.value.includes(item.id) &&
            !excluded.value.includes(item.id) &&
            item.action !== 'SKIP'
        ) ?? []
    )
    const canConfirm = computed(
      () =>
        !busy.value &&
        !stale.value &&
        eligible.value.length > 0 &&
        eligible.value.length === selected.value.length &&
        eligible.value.every(
          (item) =>
            (item.action !== 'UPDATE' || diffConfirmations.value.includes(item.id)) &&
            item.requiredDefaults.every((value) =>
              defaultConfirmations.value.includes(`${item.id}:${value}`)
            )
        )
    )
    const /**
       * 串行执行请求并忽略已离开页面的返回
       * @param action - 本次服务调用
       * @param accept - 仍有效时应用结果
       * @returns 当前操作结果或完成状态
       */ run = async <T>(action: () => Promise<T>, accept: (result: T) => void): Promise<void> => {
        if (busy.value || disposed) return
        const current = ++generation
        busy.value = true
        error.value = ''
        try {
          const result = await action()
          if (!disposed && current === generation) accept(result)
        } catch (failure) {
          if (!disposed && current === generation) {
            error.value = failure instanceof Error ? failure.message : '导入失败，请重试'
            if (failure instanceof ApiError && failure.status === 409) {
              stale.value = true
              previewResult.value = null
              defaultConfirmations.value = []
              diffConfirmations.value = []
            }
          }
        } finally {
          if (current === generation) busy.value = false
        }
      }
    const /**
       * 恢复服务端保存的批次，不恢复敏感正文缓存
       * @param id - 已保存的导入批次编号
       * @returns 当前操作结果或完成状态
       */ restore = async (id: string): Promise<void> =>
        run(
          () => adapter.load(id),
          (result) => {
            batch.value = result
            phase.value = ['COMPLETED', 'CONFIRMED', 'PARTIAL', 'CANCELLED'].includes(result.status)
              ? 'result'
              : 'validation'
          }
        )
    const /**
       * 上传固定分类与模板的包，失败复用上传命令
       * @param file - 管理员选择的完整文件
       * @param context - 本次分类、类型与导入来源
       * @returns 当前操作结果或完成状态
       */ upload = async (file: globalThis.File, context: PackageUploadContext): Promise<void> => {
        const signature = JSON.stringify(context)
        if (file !== uploadFile || signature !== uploadSignature) {
          uploadFile = file
          uploadSignature = signature
          uploadKey = createIdempotencyKey()
        }
        await run(
          () =>
            adapter.upload(file, context, uploadKey, (percent) => {
              uploadProgress.value = percent
            }),
          (result) => {
            batch.value = result
            phase.value = 'validation'
          }
        )
      }
    const /** 校验选中范围，排除项交给服务端重新计算
       * @returns 当前操作结果或完成状态
       */ validate = async (): Promise<void> => {
        if (!batch.value) return
        await run(
          () => adapter.validate(batch.value!.id, [...excluded.value]),
          (result) => {
            batch.value = result
          }
        )
      }
    const /** 读取新的完整绑定与差异，旧确认不能沿用
       * @returns 当前操作结果或完成状态
       */ preview = async (): Promise<void> => {
        if (!batch.value) return
        await run(
          () => adapter.preview(batch.value!.id, [...excluded.value]),
          (result) => {
            previewResult.value = result
            stale.value = false
            defaultConfirmations.value = []
            diffConfirmations.value = []
            selected.value = selected.value.filter((id) =>
              result.items.some((item) => item.id === id && item.action !== 'SKIP')
            )
            phase.value = 'preview'
          }
        )
      }
    const /** 提交明确选中范围、缺省确认与对象版本
       * @returns 当前操作结果或完成状态
       */ confirm = async (): Promise<void> => {
        if (!batch.value || !previewResult.value || !canConfirm.value) return
        const confirmation: ImportConfirmation = {
          selectedItems: [...selected.value],
          previewVersion: previewResult.value.version,
          expectedVersions: Object.fromEntries(
            eligible.value.map((item) => [item.id, item.expectedVersion])
          ),
          defaultConfirmations: [...defaultConfirmations.value],
          diffConfirmations: [...diffConfirmations.value]
        }
        const signature = JSON.stringify(confirmation)
        if (signature !== confirmationSignature) {
          confirmationSignature = signature
          confirmationKey = createIdempotencyKey()
        }
        await run(
          () => adapter.confirm(batch.value!.id, confirmation, confirmationKey),
          (result) => {
            batch.value = result
            phase.value = 'result'
          }
        )
      }
    const /** 只重试失败项，保留已成功阶段
       * @returns 当前操作结果或完成状态
       */ retryFailed = async (): Promise<void> => {
        if (!batch.value) return
        const ids = batch.value.items
          .filter((item) => item.status === 'FAILED')
          .map((item) => item.id)
        if (!ids.length) return
        await run(
          () => adapter.retry(batch.value!.id, ids, createIdempotencyKey()),
          (result) => {
            batch.value = result
          }
        )
      }
    const /** 取消服务端尚未开始项
       * @returns 当前操作结果或完成状态
       */ cancel = async (): Promise<void> => {
        if (!batch.value) return
        await run(
          () => adapter.cancel(batch.value!.id, createIdempotencyKey()),
          (result) => {
            batch.value = result
          }
        )
      }
    const /** 离页撤销请求回写并释放正文
       * @returns 当前操作结果或完成状态
       */ dispose = (): void => {
        disposed = true
        generation++
        batch.value = null
        previewResult.value = null
        uploadFile = null
      }
    return {
      batch,
      previewResult,
      phase,
      busy,
      error,
      stale,
      uploadProgress,
      excluded,
      selected,
      defaultConfirmations,
      diffConfirmations,
      canConfirm,
      restore,
      upload,
      validate,
      preview,
      confirm,
      retryFailed,
      cancel,
      dispose
    }
  }

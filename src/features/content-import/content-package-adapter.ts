import { createContentAdapter } from '@/features/content/content-adapter'
import { hasAdminOperation } from '@/shared/contracts/contract-capabilities'

import type {
  ContentPackageAdapter,
  ImportBatch,
  ImportContentType,
  ImportPreview,
  ImportPreviewItem
} from './content-package-model'
import type { ApiClient } from '@/services/api/api-client'

const base = '/api/v1/admin/content-imports'
type Row = Record<string, unknown>
const /**
   * 读取服务端结构对象
   * @param value - 真实接口中的候选对象
   * @returns 对象或空结构
   */ record = (value: unknown): Row =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}
const /**
   * 映射持久化批次与逐行结果
   * @param raw - 服务端完整批次
   * @returns 页面批次状态
   */ mapBatch = (raw: Row): ImportBatch => {
    const manifest = record(raw.manifest)
    const items = (Array.isArray(raw.items) ? raw.items : []).map((value) => {
      const row = record(value),
        candidate = record(row.candidate),
        result = record(row.result),
        mapping = record(row.mapping)
      return {
        id: String(row.item_id),
        title: String(
          candidate.title_zh || candidate.title_en || row.import_content_id || '待解析内容'
        ),
        contentType: String(
          manifest.content_type || candidate.content_type || 'dialogue'
        ) as ImportContentType,
        file: String(candidate.document_path || row.document_path || ''),
        sheet: String(row.sheet || 'articles'),
        row: Number(row.row_no || 0),
        importId: String(row.import_content_id || ''),
        status: String(row.status || 'PENDING'),
        contentId: String(result.content_id || mapping.content_id || '') || undefined,
        revisionId: String(result.revision_id || '') || undefined,
        stage: String(result.stage || ''),
        error: String(result.error_code || ''),
        issues: (Array.isArray(row.issues) ? row.issues : []).map((value) => {
          const issue = record(value)
          return {
            code: String(issue.code || ''),
            message: String(issue.message || issue.code || ''),
            severity:
              issue.severity === 'ERROR'
                ? ('error' as const)
                : issue.severity === 'CONFIRM'
                  ? ('warning' as const)
                  : ('optional' as const),
            path: String(issue.path || issue.field || ''),
            role: String(issue.role || '')
          }
        })
      }
    })
    return {
      id: String(raw.batch_id),
      status: String(raw.status),
      items,
      unreferencedFiles: Array.isArray(manifest.unreferenced_files)
        ? manifest.unreferenced_files.map(String)
        : [],
      counts: {
        success: items.filter((item) => item.status === 'SUCCESS').length,
        failed: items.filter((item) => item.status === 'FAILED').length,
        skipped: items.filter((item) => item.status === 'SKIPPED').length,
        excluded: items.filter((item) => item.status === 'EXCLUDED').length
      }
    }
  }
export const /**
   * 接入真实统一导入契约，确认范围绑定服务端预览哈希
   * @param client - 当前认证管理客户端
   * @returns 导入接口适配器
   */ createContentPackageAdapter = (client: ApiClient): ContentPackageAdapter => {
    const previews = new Map<string, { raw: Row; view: ImportPreview }>()
    const content = createContentAdapter(client)
    const /**
       * 读取持久化批次
       * @param id - 导入批次编号
       * @returns 真实服务端批次
       */ get = (id: string): Promise<Row> =>
        client.request({ method: 'GET', path: `${base}/${encodeURIComponent(id)}` })
    const /**
       * 读取完整候选、明确路径和已有草稿差异
       * @param id - 导入批次编号
       * @param excluded - 管理员排除的逐行编号
       * @returns 固定哈希绑定的预览
       */ preview = async (id: string, excluded: string[]): Promise<ImportPreview> => {
        const raw = await get(id)
        if (!Number(raw.preview_version) || !Array.isArray(raw.items) || !raw.items.length)
          throw new Error('后台仍在解析导入包，请刷新逐行校验')
        const items: ImportPreviewItem[] = await Promise.all(
          raw.items
            .filter((value) => !excluded.includes(String(record(value).item_id)))
            .map(async (value) => {
              const row = record(value),
                candidate = record(row.candidate),
                mapping = record(row.mapping)
              const item: ImportPreviewItem = {
                id: String(row.item_id),
                title: String(candidate.title_zh || candidate.title_en || row.import_content_id),
                action:
                  row.operation === 'UPDATE_DRAFT'
                    ? 'UPDATE'
                    : row.operation === 'SKIP'
                      ? 'SKIP'
                      : 'CREATE',
                expectedVersion: Number(mapping.current_version || 0),
                content: { ...candidate, entries: row.entries },
                bindings: Object.entries(record(row.resources)).map(([role, value]) => ({
                  path: String(record(value).path || ''),
                  role: role.replace(/_path$/, ''),
                  target: String(row.import_content_id)
                })),
                requiredDefaults: Array.isArray(row.defaults) ? row.defaults.map(String) : []
              }
              if (item.action === 'UPDATE' && mapping.draft_revision_id) {
                if (
                  candidate.content_type === 'short_reading' ||
                  record(raw.manifest).content_type === 'short_reading'
                ) {
                  const previous = await client.request<Row>({
                    method: 'GET',
                    path: `/api/v1/admin/content/short-readings/${encodeURIComponent(String(mapping.content_id))}/revisions/${encodeURIComponent(String(mapping.draft_revision_id))}`
                  })
                  item.previous = record(previous.content_snapshot)
                } else
                  item.previous = (
                    await content.getRevision(String(mapping.draft_revision_id))
                  ).content
              }
              return item
            })
        )
        const view = { version: `${raw.preview_version}:${raw.preview_hash}`, items }
        previews.set(id, { raw, view })
        return view
      }
    return {
      available: hasAdminOperation(base, 'post'),
      /** 返回尚未公开的动态规模策略，上传仍由服务端严格校验
       * @returns 当前操作结果或完成状态
       */ limits: async () => null,
      /**
       * 上传真实文件，上传完成不等同于解析完成
       * @param file - 完整原始导入文件
       * @param context - 固定分类和模板
       * @param key - 同一上传复用的命令键
       * @param progress - 仅请求完成时报告上传已提交
       * @returns 持久化导入批次
       */ upload: async (file, context, key, progress) => {
        if (context.kind === 'word_images')
          throw new Error('服务暂未提供词汇图片包独立导入模式，请使用下方原图片入口')
        const body = new FormData()
        body.append('file', file)
        body.append('series_id', context.seriesId)
        body.append('content_type', context.contentType)
        body.append('mode', context.kind === 'zip' ? 'ZIP' : 'DOCX')
        const result = await client.request<Row>({
          method: 'POST',
          path: base,
          headers: { 'Idempotency-Key': key },
          body
        })
        progress(100)
        return mapBatch(result)
      },
      /**
       * 恢复批次状态与逐行结果
       * @param id - 可恢复导入编号
       * @returns 持久化批次
       */ load: async (id) => mapBatch(await get(id)),
      /**
       * 刷新后台解析校验结果，排除范围在明确确认时提交
       * @param id - 当前批次
       * @returns 最新逐行校验
       */ validate: async (id) => mapBatch(await get(id)),
      preview,
      /**
       * 提交明确选中项与预览哈希，不额外猜测请求字段
       * @param id - 当前导入批次
       * @param confirmation - 管理员核对的集合与缺省
       * @param key - 同一确认复用的命令键
       * @returns 后台异步导入状态
       */ confirm: async (id, confirmation, key) => {
        const saved = previews.get(id)
        if (!saved || saved.view.version !== confirmation.previewVersion)
          throw new Error('请重新读取对应预览')
        const selected = new Set(confirmation.selectedItems)
        const rows = (saved.raw.items as Row[]).filter((row) => selected.has(String(row.item_id)))
        if (
          rows.some((row) =>
            (Array.isArray(row.issues) ? row.issues : []).some(
              (value) => record(value).severity === 'ERROR'
            )
          )
        )
          throw new Error('选中内容仍有阻断错误，请返回校验')
        const defaults = confirmation.defaultConfirmations
          .filter((value) => rows.some((row) => value.startsWith(`${row.item_id}:`)))
          .map((value) => value.slice(value.indexOf(':') + 1))
        const conflicts = rows
          .filter((row) => confirmation.diffConfirmations.includes(String(row.item_id)))
          .flatMap((row) =>
            (Array.isArray(row.issues) ? row.issues : [])
              .filter((value) => record(value).severity === 'CONFIRM')
              .map((value) => `${row.item_id}:${record(value).field}`)
          )
        await client.request({
          method: 'POST',
          path: `${base}/${encodeURIComponent(id)}/confirm`,
          headers: { 'Idempotency-Key': key },
          body: {
            preview_hash: saved.raw.preview_hash,
            preview_version: saved.raw.preview_version,
            selected: [...selected],
            acknowledged_defaults: [...new Set(defaults)],
            confirmed_conflicts: conflicts
          }
        })
        return mapBatch(await get(id))
      },
      /** 明确告知局部重试契约仍待装配
       * @returns 当前操作结果或完成状态
       */ retry: async () => {
        throw new Error('服务暂未提供失败阶段局部重试接口，成功草稿已保留；请刷新结果并继续编辑')
      },
      /**
       * 取消尚未开始的导入项并重新读取结果
       * @param id - 当前导入批次
       * @returns 最新持久化结果
       */ cancel: async (id) => {
        await client.request({ method: 'POST', path: `${base}/${encodeURIComponent(id)}/cancel` })
        return mapBatch(await get(id))
      }
    }
  }

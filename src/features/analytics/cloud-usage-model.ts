export interface CloudUsageRow {
  name: string
  attempts: number | null
  reserved: string
  actual: string
  unknown: number | null
}
/**
 * 读取匿名用量数值，缺失或未核验数据保留为空
 * @param value - 服务端匿名派生数值
 * @returns 当前操作结果或完成状态
 */
const numeric = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
/**
 * 映射已记录云端用量，保留预留与实测口径
 * @param source - 真实按日匿名汇总响应
 * @returns 当前操作结果或完成状态
 */
export const mapCloudUsage = (
  source: Record<string, unknown>
): { rows: CloudUsageRow[]; importBatches: number | null } => {
  const rows: CloudUsageRow[] = []
  for (const raw of Array.isArray(source.measured_cloud) ? source.measured_cloud : []) {
    const item = raw as Record<string, unknown>
    if (!['AI_TOKENS', 'ASR_MILLISECONDS'].includes(String(item.kind))) continue
    const asr = item.kind === 'ASR_MILLISECONDS'
    /**
     * 格式化供应商实测单位，不补出不存在的费用
     * @param value - 已记录或预留单位
     * @returns 当前操作结果或完成状态
     */
    const units = (value: unknown): string =>
      numeric(value) === null
        ? '—'
        : asr
          ? `${numeric(value)! / 1000} 秒`
          : `${numeric(value)} token`
    rows.push({
      name: asr ? '转录音频' : 'AI token',
      attempts: numeric(item.attempts),
      reserved: units(item.reserved_units),
      actual: units(item.actual_units),
      unknown: numeric(item.unknown_attempts)
    })
  }
  const tts = source.tts as Record<string, unknown> | undefined
  if (tts)
    rows.push({
      name: '词语TTS字符',
      attempts: numeric(tts.attempts),
      reserved: numeric(tts.reserved_characters) === null ? '—' : `${tts.reserved_characters} 字符`,
      actual: numeric(tts.actual_characters) === null ? '—' : `${tts.actual_characters} 字符`,
      unknown: numeric(tts.unknown_attempts)
    })
  const imports = Array.isArray(source.import_batches)
    ? (source.import_batches as Record<string, unknown>[])
    : null
  return {
    rows,
    importBatches: imports
      ? imports.reduce((sum, item) => sum + (numeric(item.count) ?? 0), 0)
      : null
  }
}

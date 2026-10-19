/** 展示接口已确认的联系来源，未知历史值不提升为已验证
 * @param source 服务端返回的原始来源标记
 * @returns 管理员可读的来源说明
 */
export const contactSourceText = (source?: string | null) =>
  source === 'user_entered_unverified' ? '用户填写／未验证' : '历史来源未核实'

/** 展示北京时间，value 为服务端 ISO 时间
 * @param value 已确认的时间或空值
 * @returns 友好的北京时间文本
 */
export const dateText = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      })
        .format(new Date(value))
        .replaceAll('/', '-')
    : '未开始'
/** 为受控素材生成管理端地址
 * @param id 已上传素材标识
 * @returns 需要管理员 Cookie 的资源地址
 */
export const mediaURL = (id?: string | null) =>
  id
    ? `${(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')}/api/admin/v1/media/${encodeURIComponent(id)}`
    : ''
/** 构造经过编码的列表条件，values 为当前筛选
 * @param path 接口路径
 * @param values 业务查询条件
 * @returns 带查询串的地址
 */
export const queryURL = (path: string, values: Record<string, unknown>) =>
  `${path}?${new URLSearchParams(
    Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  )}`

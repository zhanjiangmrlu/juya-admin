/** 展示配置不包含 API、权限或业务回调；特殊单元格由页面插槽提供。 */
export interface TableColumnConfig {
  key: string
  label?: string
  prop?: string
  slot?: string
  type?: 'default' | 'selection' | 'expand' | 'index'
  width?: number | string
  minWidth?: number | string
  fixed?: boolean | 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  sortable?: boolean | 'custom'
  showOverflowTooltip?: boolean
  hidden?: boolean
}

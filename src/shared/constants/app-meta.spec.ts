import { describe, expect, it } from 'vitest'

import { APP_META } from './app-meta'

describe('APP_META', () => {
  it('提供管理后台应用壳使用的产品标识', () => {
    expect(APP_META).toEqual({
      description: '内容与体验运营后台',
      name: '句芽英语管理后台'
    })
  })
})

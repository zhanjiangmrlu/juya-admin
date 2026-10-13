import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { setImmediate } from 'node:timers/promises'

import { chromium } from '@playwright/test'

import { editableTitle, settleResponseReads } from './real-admin-browser-actions.mjs'

describe('真实管理浏览器验收的页面操作契约', () => {
  let browser
  before(async () => {
    browser = await chromium.launch({ headless: true })
  })
  after(async () => {
    await browser.close()
  })

  for (const open of [false, true]) {
    it(`编辑短文标题时${open ? '保留已展开' : '打开闭合'}的元信息`, async () => {
      const page = await browser.newPage()
      try {
        await page.setContent(`<div class="short-reading-fields"><details ${open ? 'open' : ''}>
          <summary>编辑元信息</summary><input aria-label="英文标题" value="Admin Reading">
          </details></div>`)
        const field = await editableTitle(page, true)
        await field.fill('QA reading', { timeout: 1000 })
        assert.equal(await field.inputValue(), 'QA reading')
        assert.notEqual(await page.locator('details').getAttribute('open'), null)
      } finally {
        await page.close()
      }
    })
  }

  it('场景标题无需等待不存在的短文元信息', async () => {
    const page = await browser.newPage()
    try {
      await page.setContent('<input aria-label="英文标题" value="Scene">')
      const field = await editableTitle(page, false)
      await field.fill('QA scene', { timeout: 1000 })
      assert.equal(await field.inputValue(), 'QA scene')
    } finally {
      await page.close()
    }
  })

  it('导航前等待已捕获的错误正文并保留其真实错误码', async () => {
    let finishBody
    let errorCode
    const bodyRead = new Promise((resolve) => {
      finishBody = resolve
    }).then(() => {
      errorCode = 'CANDIDATE_TEXT_REQUIRED'
    })
    const states = []
    const page = { waitForLoadState: async (state) => states.push(state) }
    let settled = false
    const completed = settleResponseReads(page, [bodyRead]).then(() => {
      settled = true
    })
    try {
      await setImmediate()
      assert.equal(settled, false)
      assert.equal(errorCode, undefined)
      finishBody()
      await completed
      assert.equal(errorCode, 'CANDIDATE_TEXT_REQUIRED')
      assert.deepEqual(states, ['networkidle'])
    } finally {
      finishBody()
      await completed
    }
  })
})

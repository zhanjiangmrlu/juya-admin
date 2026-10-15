/**
 * 打开短文折叠元信息后返回实际可编辑的标题字段
 * @param page - 当前真实浏览器页面
 * @param shortReading - 当前标题操作是否属于短文页面
 * @returns 可见的英文标题字段
 */
export const editableTitle = async (page, shortReading) => {
  const field = page.getByLabel('英文标题', { exact: true })
  if (shortReading) {
    const metadata = page.locator('.short-reading-fields details').filter({ has: field })
    await metadata.waitFor({ state: 'visible' })
    if ((await metadata.getAttribute('open')) === null) await metadata.locator('summary').click()
  }
  await field.waitFor({ state: 'visible' })
  return field
}

/**
 * 在刷新或切换页面前等待实际请求和错误响应正文读取完成
 * @param page - 当前真实浏览器页面
 * @param responseReads - 已捕获响应的安全错误码读取任务
 * @returns 当前页面请求与响应读取完成状态
 */
export const settleResponseReads = async (page, responseReads) => {
  await page.waitForLoadState('networkidle')
  await Promise.allSettled(responseReads)
}

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const { network, upload } = vi.hoisted(() => ({ network: vi.fn(), upload: vi.fn() }))
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return {
    ...module,
    api: { ...module.createHttpClient('https://admin-api.example', network), upload }
  }
})
import ListeningImportPage from '@/pages/listening/listening-import-page.vue'

/** 构造本次上传已持久化的服务端批次
 * @param revision 最新批次并发版本
 * @returns 已暂存批次
 */
const batch = (revision: number) => ({
  id: 'batch',
  mode: 'zip',
  revision,
  status: 'review',
  packages: [],
  candidates: [],
  counts: {}
})

/** 打开听读上传页
 * @param mode ZIP或DOCX配套资料入口
 * @returns 已挂载的听读上传页面
 */
const openPage = async (mode = 'zip') => {
  network.mockImplementation(async (request: Request) =>
    Response.json(request.method === 'POST' ? { ...batch(1), mode } : { items: [], total: 0 })
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/listening-imports', component: ListeningImportPage },
      { path: '/listening', component: { template: '<div />' } }
    ]
  })
  await router.push(`/listening-imports?mode=${mode}`)
  const page = mount(
    { template: '<RouterView />' },
    { global: { plugins: [router], stubs: { ElDialog: true } } }
  )
  await flushPromises()
  return page
}

afterEach(() => {
  upload.mockReset()
  network.mockReset()
})

it.each([2, 30])(
  'sends %i ZIP packages one at a time using each persisted batch revision',
  async (count) => {
    let finishFirst!: (value: ReturnType<typeof batch>) => void
    upload
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockImplementation(async () => batch(upload.mock.calls.length + 1))
    const page = await openPage()
    try {
      const files = Array.from({ length: count }, (_, i) => new File(['zip'], `${i + 1}.zip`))
      const input = page.get('input[type="file"]')
      Object.defineProperty(input.element, 'files', { value: files })
      await input.trigger('change')
      await flushPromises()
      expect(upload).toHaveBeenCalledTimes(1)
      expect(upload.mock.calls[0]![1].getAll('files')).toEqual([files[0]])
      finishFirst(batch(2))
      await flushPromises()
      expect(upload).toHaveBeenCalledTimes(count)
      for (const [index, call] of upload.mock.calls.entries()) {
        expect(call[0]).toContain(`revision=${index + 1}`)
        expect(call[1].getAll('files')).toEqual([files[index]])
      }
      expect(new Set(upload.mock.calls.map((call) => call[2])).size).toBe(count)
      expect(page.find('.package-queue').exists()).toBe(false)
      expect(page.text()).toContain('资料已在服务端暂存')
    } finally {
      page.unmount()
    }
  }
)

it('retries only the uncertain ZIP with its original form, key and revision before continuing', async () => {
  upload
    .mockResolvedValueOnce(batch(2))
    .mockRejectedValueOnce(new Error('上传响应未知'))
    .mockResolvedValueOnce(batch(3))
    .mockResolvedValueOnce(batch(4))
  const page = await openPage()
  try {
    const files = ['first.zip', 'second.zip', 'third.zip'].map((name) => new File(['zip'], name))
    const input = page.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: files })
    await input.trigger('change')
    await flushPromises()
    expect(upload).toHaveBeenCalledTimes(2)
    expect(page.text()).toContain('上传响应未知')
    const uncertain = upload.mock.calls[1]!
    await page
      .findAll('button')
      .find((item) => item.text() === '以原操作重试上传')!
      .trigger('click')
    await flushPromises()
    expect(upload).toHaveBeenCalledTimes(4)
    expect(upload.mock.calls[2]!.slice(0, 3)).toEqual(uncertain.slice(0, 3))
    expect(upload.mock.calls[3]![1].getAll('files')).toEqual([files[2]])
    expect(upload.mock.calls[3]![0]).toContain('revision=3')
  } finally {
    page.unmount()
  }
})

it('keeps DOCX and its companion media together in one upload', async () => {
  upload.mockResolvedValueOnce({ ...batch(2), mode: 'docx' })
  const page = await openPage('docx')
  try {
    const files = [new File(['docx'], 'content.docx'), new File(['audio'], 'audio.mp3')]
    const input = page.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: files })
    await input.trigger('change')
    await flushPromises()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload.mock.calls[0]![1].getAll('files')).toEqual(files)
  } finally {
    page.unmount()
  }
})

it('keeps the unfinished queue available after querying a partially uploaded batch', async () => {
  const accepted = {
    ...batch(2),
    candidates: [{ id: 'candidate', removed: false, state: 'incomplete' }]
  }
  upload.mockResolvedValueOnce(accepted).mockRejectedValueOnce(new Error('上传响应未知'))
  const page = await openPage()
  try {
    const input = page.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: ['first.zip', 'second.zip', 'third.zip'].map((name) => new File(['zip'], name))
    })
    await input.trigger('change')
    await flushPromises()
    expect(page.get('.package-queue').text()).toContain('second.zip')
    const review = page.findAll('button').find((item) => item.text().startsWith('继续核对'))!
    expect(review.attributes('disabled')).toBeDefined()
    expect(page.get('input[type="file"]').attributes('disabled')).toBeDefined()
    network.mockResolvedValue(Response.json(accepted))
    await page
      .findAll('button')
      .find((item) => item.text() === '查询实际批次')!
      .trigger('click')
    await flushPromises()
    expect(page.get('.package-queue').text()).toContain('second.zip')
    expect(page.text()).toContain('另有 1 组等待上传')
    expect(page.findAll('button').some((item) => item.text() === '以原操作重试上传')).toBe(true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    try {
      await page.get('a[href="/listening"]').trigger('click')
      await flushPromises()
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('仍有资料尚未确认上传'))
      expect(page.get('.package-queue').text()).toContain('second.zip')
    } finally {
      confirm.mockRestore()
    }
  } finally {
    page.unmount()
  }
})

it('stops unsent ZIPs and preserves the destination page after confirming navigation away', async () => {
  let finishFirst!: (value: ReturnType<typeof batch>) => void
  upload.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
  const page = await openPage()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  try {
    const input = page.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: ['first.zip', 'second.zip'].map((name) => new File(['zip'], name))
    })
    await input.trigger('change')
    await flushPromises()
    const router = page.vm.$router
    await page.get('a[href="/listening"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/listening')
    finishFirst(batch(2))
    await flushPromises()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/listening')
    expect(router.currentRoute.value.query).toEqual({})
  } finally {
    confirm.mockRestore()
    page.unmount()
  }
})

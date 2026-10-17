import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
const network = vi.hoisted(() => vi.fn())
vi.mock('@/services/http-client', async (original) => {
  const module = await original<typeof import('@/services/http-client')>()
  return { ...module, api: module.createHttpClient('https://admin-api.example', network) }
})
import LoginPage from './login-page.vue'

describe('administrator login screen', () => {
  it('waits for actual authentication and keeps failures visible', async () => {
    let finish!: (value: Response) => void
    network.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        })
    )
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', component: LoginPage },
        { path: '/cards', component: { template: '<p>卡片管理</p>' } }
      ]
    })
    await router.push('/login')
    const page = mount(LoginPage, { global: { plugins: [createPinia(), router] } })
    await page.get('input[autocomplete="username"]').setValue('admin')
    await page.get('input[type="password"]').setValue('wrong-password')
    await page.get('form').trigger('submit')
    expect(page.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(router.currentRoute.value.path).toBe('/login')
    finish(
      Response.json(
        { error: { code: 'invalid_credentials', message: '账号或密码不正确，请重试' } },
        { status: 401 }
      )
    )
    await flushPromises()
    expect(page.text()).toContain('账号或密码不正确')
    expect(router.currentRoute.value.path).toBe('/login')
    network.mockResolvedValueOnce(
      Response.json({ administrator: { id: 'admin-1', username: 'admin' }, csrf_token: 'csrf' })
    )
    await page.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/cards')
  })
})

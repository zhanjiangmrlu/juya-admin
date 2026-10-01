import { mount } from '@vue/test-utils'
import ElementPlus, { ElFormItem, ElInput, ElSelect, ElUpload } from 'element-plus'
import { afterEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'

import { normalizeSceneContent } from '@/features/content-editor/scene-form'

import SceneDraftPanel from './scene-draft-panel.vue'

const wrappers: ReturnType<typeof mount>[] = []

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount()
})

function mountPanel() {
  const form = reactive(
    normalizeSceneContent({ tags: ['日常'], original_image_asset_id: 'IMAGE-1' })
  )
  const wrapper = mount(SceneDraftPanel, {
    props: { form, seriesTitle: '日常英语', imageUrl: '/original.webp', mediaBusy: false },
    global: { plugins: [ElementPlus] }
  })
  wrappers.push(wrapper)
  return { form, wrapper }
}

describe('scene draft panel', () => {
  it('edits the parent draft fields and keeps the series read-only', async () => {
    const { form, wrapper } = mountPanel()
    await wrapper.get('input[aria-label="英文标题"]').setValue('Coffee time')
    await wrapper.get('input[aria-label="中文标题"]').setValue('咖啡时间')

    for (const [label, value] of [
      ['场景说明', '在咖啡店点单'],
      ['封面素材编号', 'COVER-2'],
      ['版权声明', '已授权'],
      ['内容来源', '内部素材']
    ]) {
      const item = wrapper
        .findAllComponents(ElFormItem)
        .find((item) => item.props('label') === label)!
      await item.get('input, textarea').setValue(value)
    }
    wrapper.getComponent(ElSelect).vm.$emit('update:modelValue', ['日常', '咖啡'])
    expect(form).toMatchObject({
      title_en: 'Coffee time',
      title_zh: '咖啡时间',
      summary: '在咖啡店点单',
      tags: ['日常', '咖啡'],
      cover_asset_id: 'COVER-2',
      copyright: '已授权',
      source: '内部素材'
    })
    const series = wrapper
      .findAllComponents(ElFormItem)
      .find((item) => item.props('label') === '所属系列')!
    expect(series.get('input').element.value).toBe('日常英语')
    expect(series.get('input').attributes('disabled')).toBeDefined()
  })

  it('updates the original asset reference and asks the parent to refresh its image', async () => {
    const { form, wrapper } = mountPanel()
    const original = wrapper
      .findAllComponents(ElFormItem)
      .find((item) => item.props('label') === '学习原图素材编号')!
    await original.get('input').setValue('IMAGE-2')
    expect(form.original_image_asset_id).toBe('IMAGE-2')
    expect(wrapper.emitted('refreshImage')).toHaveLength(1)
    expect(wrapper.get('img[alt="学习原图"]').attributes('src')).toBe('/original.webp')
    await wrapper.setProps({ imageUrl: '' })
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('passes the chosen image to the parent without automatic upload', async () => {
    const { wrapper } = mountPanel()
    const raw = new File(['image'], 'original.webp', { type: 'image/webp' })
    const fileInput = wrapper.get('input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', { value: [raw] })
    await fileInput.trigger('change')
    const upload = wrapper.emitted('upload')![0]![0]
    expect(upload).toMatchObject({ name: 'original.webp', status: 'ready', raw })
    expect(wrapper.getComponent(ElUpload).props('autoUpload')).toBe(false)
  })

  it('blocks image selection while the parent is processing media', async () => {
    const { wrapper } = mountPanel()
    await wrapper.setProps({ mediaBusy: true })
    expect(wrapper.getComponent(ElUpload).props('disabled')).toBe(true)
    expect(wrapper.get('input[type="file"]').attributes('disabled')).toBeDefined()
    expect(
      wrapper.findAllComponents(ElInput).filter((input) => input.props('disabled'))
    ).toHaveLength(1)
  })
})

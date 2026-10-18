import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'

import type { ImportBatch, ImportFile } from '@/shared/types/import'

import ImportAssetPicker from './import-asset-picker.vue'

/** 构造同名文件在各来源中的独立引用
 * @param id 文件在本批次的唯一引用
 * @param name 包内完整路径
 * @param parentId 来源ZIP引用
 * @param kind 资料用途
 * @returns 带来源归属的资料状态
 */
const file = (id: string, name: string, parentId: string, kind: string): ImportFile => ({
  id,
  name,
  parent_id: parentId,
  kind,
  state: 'ready',
  size: 1,
  media_id: kind === 'image' ? id : null,
  job_id: null,
  error_code: null
})

it('only offers media in the current ZIP and exact card folder', () => {
  const batch = {
    id: 'batch',
    mode: 'zip',
    files: [
      file('source', 'outer/one/内容.docx', 'zip-one', 'docx'),
      file('own', 'outer/one/正确图片.png', 'zip-one', 'image'),
      file('neighbor', 'outer/two/同包其他卡.png', 'zip-one', 'image'),
      file('other', 'outer/one/别包同名卡.png', 'zip-two', 'image')
    ],
    items: [{ id: 'item', source_file_id: 'source', content: { name: '卡片' } }]
  } as ImportBatch
  const page = mount(ImportAssetPicker, {
    props: {
      batch,
      itemId: 'item',
      modelValue: {
        name: '卡片',
        title_en: '',
        image_id: null,
        audio_id: null,
        dialogue: [],
        vocabulary: [],
        chunks: []
      }
    }
  })
  expect(page.text()).toContain('正确图片.png')
  expect(page.text()).not.toContain('同包其他卡.png')
  expect(page.text()).not.toContain('别包同名卡.png')
  page.unmount()
})

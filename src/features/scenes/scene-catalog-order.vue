<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'

import AppState from '@/components/app-state/app-state.vue'
import { mediaURL } from '@/services/display'
import { api, ApiError } from '@/services/http-client'
import { registerLogoutGuard } from '@/services/logout-guard'

import type { components } from '@/shared/contracts/generated/admin-api'

import SceneTitle from './scene-title.vue'
const page = ref(1),
  positions = ref<Record<string, number>>({})
const emit = defineEmits<{ close: [] }>()
const items = ref<components['schemas']['OrderedCard'][]>([]),
  version = ref(''),
  baseline = ref<string[]>([])
const loading = ref(true),
  saving = ref(false),
  error = ref(''),
  notice = ref(''),
  unknown = ref(false),
  leaveOpen = ref(false)
const pageCount = computed(() => Math.ceil(items.value.length / 10))
const visibleItems = computed(() => items.value.slice((page.value - 1) * 10, page.value * 10))
/** 将页内索引换算成完整已发布集合的位置
 * @param index 当前页内从零开始的位置
 * @returns 全局从零开始的位置
 */
const globalIndex = (index: number) => (page.value - 1) * 10 + index
/** 按管理员明确填写的全局位置移动
 * @param id 当前移动的稳定卡片
 */
const moveTo = (id: string) => {
  const target = positions.value[id]
  if (!Number.isInteger(target) || target! < 1 || target! > items.value.length) {
    error.value = `请输入1至${items.value.length}的全局位置`
    return
  }
  error.value = ''
  move(id, target! - 1)
}
const dirty = computed(
  () => JSON.stringify(items.value.map((item) => item.id)) !== JSON.stringify(baseline.value)
)
let alive = true,
  dragging = '',
  releaseGuard: (() => void) | null = null,
  resolveLeave: ((allow: boolean) => void) | null = null
let pending: {
  key: string
  body: { version: string; card_ids: string[] }
  signature: string
} | null = null
/** 接收服务器顺序，刷新冲突时保留仍有效的临时顺序并追加新卡片
 * @param value 最新完整已发布集合
 * @param preserve 是否保留当前排列
 */
const accept = (value: components['schemas']['CatalogOrder'], preserve: boolean) => {
  const byId = new Map(value.items.map((item) => [item.id, item]))
  const retained = preserve
    ? items.value.filter((item) => byId.has(item.id)).map((item) => byId.get(item.id)!)
    : []
  const retainedIds = new Set(retained.map((item) => item.id))
  items.value = preserve
    ? [...retained, ...value.items.filter((item) => !retainedIds.has(item.id))]
    : value.items
  page.value = Math.min(page.value, Math.max(1, Math.ceil(items.value.length / 10)))
  positions.value = {}
  baseline.value = value.items.map((item) => item.id)
  version.value = value.version
  pending = null
  unknown.value = false
}
/** 首次载入或明确刷新最新集合
 * @param preserve 保留本次仍适用的临时排序
 */
const load = async (preserve = true) => {
  if (saving.value || unknown.value) return
  const keepOrder = preserve && dirty.value
  loading.value = true
  error.value = ''
  try {
    const value = await api.request<components['schemas']['CatalogOrder']>(
      '/api/admin/v1/catalog-order'
    )
    if (!alive) return
    accept(value, keepOrder)
    notice.value = keepOrder ? '已保留仍可用卡片的临时顺序，新卡片追加在末尾，请核对后再保存' : ''
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '顺序暂未获取'
  } finally {
    if (alive) loading.value = false
  }
}
/** 拖动或键盘按钮只调整本地排列
 * @param id 移动卡片的稳定编号
 * @param target 目标位置
 */
const move = (id: string, target: number) => {
  if (saving.value || unknown.value || target < 0 || target >= items.value.length) return
  const next = [...items.value],
    index = next.findIndex((item) => item.id === id)
  if (index < 0 || index === target) return
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item!)
  items.value = next
  notice.value = ''
}
/** 原生拖动句柄只传递稳定编号
 * @param event 浏览器拖动事件
 * @param id 当前拖动卡片编号
 */
const startDrag = (event: DragEvent, id: string) => {
  dragging = id
  event.dataTransfer?.setData('text/plain', id)
}
/** 保存失败保留排列；未知结果复用原键且暂时停止编辑
 * @param closeAfter 手动保存成功后是否返回卡片列表
 * @returns 本次保存是否真实成功
 */
const save = async (closeAfter = true): Promise<boolean> => {
  if (saving.value || loading.value) return false
  if (!dirty.value) {
    if (closeAfter) emit('close')
    return true
  }
  saving.value = true
  error.value = ''
  const body = { version: version.value, card_ids: items.value.map((item) => item.id) },
    signature = JSON.stringify(body)
  if (!pending || pending.signature !== signature)
    pending = { key: crypto.randomUUID(), body, signature }
  try {
    const result = await api.request<components['schemas']['CatalogOrder']>(
      '/api/admin/v1/catalog-order',
      { method: 'PUT', body: pending.body, key: pending.key }
    )
    if (!alive) return false
    accept(result, false)
    notice.value = '排序已保存'
    if (closeAfter) emit('close')
    return true
  } catch (reason) {
    if (alive) {
      error.value = reason instanceof Error ? reason.message : '保存失败，请重试'
      unknown.value =
        reason instanceof ApiError &&
        (reason.status >= 500 || ['network_unknown', 'response_unknown'].includes(reason.code))
    }
    return false
  } finally {
    if (alive) saving.value = false
  }
}
/** 查询已接受的保存，并重新核对当前最新顺序 */
const recover = async () => {
  if (!pending || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const result = await api.request<components['schemas']['OperationResponse']>(
      `/api/admin/v1/operations/${pending.key}`
    )
    const value = await api.request<components['schemas']['CatalogOrder']>(
      '/api/admin/v1/catalog-order'
    )
    if (!alive) return
    const changed =
      value.version !== (result.result as components['schemas']['CatalogOrder']).version
    accept(value, changed)
    notice.value = changed
      ? '该次保存已成功，此后列表又有变化；已保留临时顺序，请核对后再保存'
      : '已确认保存成功'
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '结果尚未确认，可重试原操作'
  } finally {
    if (alive) saving.value = false
  }
}
/** 导航与退出登录共用同一个未保存决定
 * @returns 是否可以离开
 */
const permission = async (): Promise<boolean> => {
  if (saving.value) {
    ElMessage.info('请等待当前保存完成')
    return false
  }
  if (!dirty.value) return true
  if (resolveLeave) return false
  leaveOpen.value = true
  return new Promise((resolve) => {
    resolveLeave = resolve
  })
}
/** 明确保存、放弃或继续调整
 * @param choice 管理员的离开决定
 */
const choose = async (choice: 'continue' | 'discard' | 'save') => {
  if (choice === 'save' && !(await save(false))) return
  if (choice === 'discard')
    items.value = baseline.value
      .map((id) => items.value.find((item) => item.id === id)!)
      .filter(Boolean)
  leaveOpen.value = false
  const resolve = resolveLeave
  resolveLeave = null
  resolve?.(choice !== 'continue')
}
/** 允许离开后关闭原页排序模式
 * @returns 是否允许当前导航或注销
 */
const close = async () => {
  const allow = await permission()
  if (allow) emit('close')
  return allow
}
/** 只为当前激活页面安装注销保护 */
const activate = () => {
  if (!releaseGuard) releaseGuard = registerLogoutGuard(close)
}
/** 缓存页面停用时移除注销保护 */
const deactivate = () => {
  releaseGuard?.()
  releaseGuard = null
}
/** 浏览器关闭时保留平台允许的未保存提醒
 * @param event 浏览器离开事件
 */
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onBeforeRouteLeave((to) => (to.path === '/login' ? true : close()))
onBeforeRouteUpdate(() => close())
onActivated(activate)
onDeactivated(deactivate)
onMounted(() => {
  activate()
  window.addEventListener('beforeunload', beforeUnload)
  void load(false)
})
onBeforeUnmount(() => {
  alive = false
  deactivate()
  window.removeEventListener('beforeunload', beforeUnload)
  resolveLeave?.(false)
})
</script>
<template>
  <section class="catalog-order">
    <div class="between">
      <div>
        <h1>卡片管理</h1>
        <p class="muted small">调整全部已发布卡片顺序，仅影响学习列表展示。</p>
      </div>
      <div class="row">
        <button type="button" :disabled="saving" @click="close">取消排序</button
        ><button
          type="button"
          class="primary"
          data-action="save-order"
          :disabled="!dirty || saving || loading"
          @click="save(true)"
        >
          {{ saving ? '正在保存…' : unknown ? '重试原保存' : '保存顺序' }}
        </button>
      </div>
    </div>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <p v-if="error" class="notice error" role="alert">
      {{ error
      }}<button v-if="unknown" type="button" class="text" @click="recover">查询保存结果</button>
    </p>
    <AppState :busy="loading" :empty="!loading && !items.length" empty-title="暂无已发布卡片" />
    <div v-if="items.length" class="table-wrap catalog-list">
      <table>
        <thead>
          <tr>
            <th>顺序</th>
            <th>场景卡片</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(item, index) in visibleItems"
            :key="item.id"
            @dragover.prevent
            @drop.prevent="move(dragging, globalIndex(index))"
          >
            <td>
              <button
                type="button"
                class="handle"
                :draggable="!saving && !loading && !unknown"
                :aria-label="`拖动 ${item.name}`"
                @dragstart="startDrag($event, item.id)"
                @dragend="dragging = ''"
              >
                ⠿</button
              ><span class="rank">{{ globalIndex(index) + 1 }}</span>
            </td>
            <td>
              <div class="catalog-card">
                <img
                  v-if="item.thumbnail_id"
                  :src="mediaURL(item.thumbnail_id)"
                  alt=""
                  loading="lazy"
                /><strong class="catalog-name"
                  ><SceneTitle :name="item.name" :title-en="item.title_en"
                /></strong>
              </div>
            </td>
            <td><span class="badge">已发布</span></td>
            <td>
              <div class="row">
                <button
                  type="button"
                  class="text small"
                  :disabled="globalIndex(index) === 0 || saving || loading || unknown"
                  :aria-label="`上移 ${item.name}`"
                  @click="move(item.id, globalIndex(index) - 1)"
                >
                  ↑ 上移</button
                ><button
                  type="button"
                  class="text small"
                  :disabled="
                    globalIndex(index) === items.length - 1 || saving || loading || unknown
                  "
                  :aria-label="`下移 ${item.name}`"
                  @click="move(item.id, globalIndex(index) + 1)"
                >
                  ↓ 下移
                </button>
              </div>
              <details class="position-tools">
                <summary>指定位置</summary>
                <div class="row">
                  <input
                    v-model.number="positions[item.id]"
                    type="number"
                    min="1"
                    :max="items.length"
                    :placeholder="String(globalIndex(index) + 1)"
                    :aria-label="`${item.name} 移动到全局位置`"
                    :disabled="saving || loading || unknown"
                  /><button
                    :data-move="item.id"
                    :disabled="saving || loading || unknown"
                    @click="moveTo(item.id)"
                  >
                    移动到第N位
                  </button>
                </div>
              </details>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="row">
      <button :disabled="page <= 1 || saving || loading || unknown" @click="page--">上一页</button
      ><span v-if="pageCount">第{{ page }}/{{ pageCount }}页</span
      ><button
        data-action="next-order-page"
        :disabled="page >= pageCount || saving || loading || unknown"
        @click="page++"
      >
        下一页
      </button>
    </div>
    <footer class="between">
      <span class="small muted"
        >共 {{ items.length }} 张 · {{ dirty ? '有未保存顺序' : '当前已保存顺序' }}</span
      >
      <div class="row">
        <button
          type="button"
          data-action="refresh-order"
          :disabled="saving || loading || unknown"
          @click="load(true)"
        >
          获取最新列表
        </button>
      </div>
    </footer>
    <ElDialog
      v-if="leaveOpen"
      :model-value="true"
      title="排序尚未保存"
      width="560px"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      ><p>
        {{
          unknown
            ? '保存结果尚未确认。离开只关闭本页，不能撤销服务器已接收的保存；可以先继续查询或重试原保存。'
            : '可以继续调整、保存后离开，或放弃本次临时顺序。'
        }}
      </p>
      <p v-if="error" class="notice error">{{ error }}</p>
      <template #footer
        ><button :disabled="saving" @click="choose('continue')">继续调整</button
        ><button :disabled="saving" @click="choose('discard')">放弃本次顺序</button
        ><button class="primary" :disabled="saving" @click="choose('save')">
          保存后离开
        </button></template
      ></ElDialog
    >
  </section>
</template>
<style scoped lang="scss">
.catalog-order {
  .between {
    align-items: flex-start;
  }

  h1 {
    margin-bottom: 6px;
  }

  .catalog-list {
    margin: 28px 0 0;
  }

  table {
    table-layout: fixed;

    th:first-child {
      width: 12%;
    }

    th:nth-child(2) {
      width: 44%;
    }

    th:nth-child(3) {
      width: 18%;
    }

    th:last-child {
      width: 26%;
    }

    td {
      height: 123px;
    }
  }

  .catalog-card {
    display: flex;
    align-items: center;
    gap: 12px;

    img {
      width: 48px;
      height: 72px;
      object-fit: contain;
    }
  }

  .catalog-name {
    font-size: 14px;
    font-weight: 500;
  }

  .handle {
    cursor: grab;
    border: 0;
    background: none;
    font-size: 24px;
    padding: 2px 8px;
  }

  .rank {
    color: var(--muted);
    font-size: 12px;
  }

  input[type='number'] {
    width: 75px;
  }

  .position-tools {
    color: var(--muted);
    font-size: 12px;

    summary {
      cursor: pointer;
    }

    > div {
      margin-top: 8px;
    }
  }

  > .row {
    padding: 16px 20px;
    border: 1px solid var(--line);
    border-top: 0;
    border-radius: 0 0 12px 12px;
    background: var(--paper);
  }

  footer {
    margin-top: 20px;
    align-items: center;
  }
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AppState from '@/components/app-state/app-state.vue'
import SceneReader from '@/features/scenes/scene-reader.vue'
import { api, ApiError } from '@/services/http-client'
import { publicationErrors } from '@/shared/constants/publication'

import type { components } from '@/shared/contracts/generated/admin-api'
import type { BatchPublicationProps, PublicationCheck } from '@/shared/types/publication'
const props = withDefaults(defineProps<BatchPublicationProps>(), { cardIds: () => [] })
const emit = defineEmits<{ close: [batchId: string | null] }>()
const checks = ref<PublicationCheck[]>([]),
  checking = ref(false),
  checkedCount = ref(0),
  activeId = ref(''),
  reviewed = ref(false)
const result = ref<components['schemas']['BatchView'] | null>(null),
  accepting = ref(false),
  polling = ref(false),
  error = ref(''),
  notice = ref(''),
  rejected = ref(false),
  unknown = ref(false)
const eligible = computed(() =>
  checks.value.filter((check) => check.category === 'ready' && check.preview && check.card)
)
const blocked = computed(() =>
  checks.value.filter((check) => check.category === 'incomplete' || check.category === 'error')
)
const unchanged = computed(() => checks.value.filter((check) => check.category === 'unchanged'))
const preview = computed(
  () => eligible.value.find((check) => check.id === activeId.value) || eligible.value[0]
)
const succeeded = computed(
  () => result.value?.items.filter((item) => item.state === 'succeeded').length || 0
)
const failed = computed(() => result.value?.items.filter((item) => item.state === 'failed') || [])
const pendingCount = computed(
  () =>
    result.value?.items.filter((item) => !['succeeded', 'failed'].includes(item.state)).length || 0
)
let alive = true,
  pollGeneration = 0,
  publishKey = '',
  retryKey = '',
  submission: components['schemas']['CreateBatch'] | null = null
/** 有限查询持久结果；关闭覆盖层不取消已接收的服务端任务 */
const poll = async () => {
  if (!result.value || polling.value) return
  const batchId = result.value.id,
    run = ++pollGeneration
  polling.value = true
  try {
    for (let count = 0; count < 20 && alive && run === pollGeneration; count++) {
      const value = await api.request<components['schemas']['BatchView']>(
        `/api/admin/v1/publication-batches/${batchId}`
      )
      if (!alive || run !== pollGeneration) return
      result.value = value
      if (value.items.every((item) => ['succeeded', 'failed'].includes(item.state))) return
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (alive && pendingCount.value) notice.value = '已接收的卡片仍在后台处理，可关闭后稍后查看结果'
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '发布结果暂未获取'
  } finally {
    if (alive && run === pollGeneration) polling.value = false
  }
}
/** 读取原来已接受的批量发布
 * @param id 历史批量发布编号
 */
const restore = async (id: string) => {
  checking.value = true
  error.value = ''
  try {
    const value = await api.request<components['schemas']['BatchView']>(
      `/api/admin/v1/publication-batches/${id}`
    )
    if (alive) result.value = value
  } catch (reason) {
    if (alive) error.value = reason instanceof Error ? reason.message : '暂未获取这次发布'
  } finally {
    if (alive) checking.value = false
  }
  if (alive && result.value) void poll()
}
/** 逐卡获取最新候选并形成绑定修订的预览
 * @param ids 明确选择的稳定卡片集合
 */
const inspect = async (ids: string[]) => {
  pollGeneration++
  polling.value = false
  result.value = null
  checks.value = []
  reviewed.value = false
  publishKey = ''
  retryKey = ''
  submission = null
  unknown.value = false
  rejected.value = false
  checkedCount.value = 0
  error.value = ''
  notice.value = ''
  checking.value = true
  try {
    for (const id of [...new Set(ids)]) {
      if (!alive) return
      try {
        const card = await api.request<components['schemas']['CardView']>(
          `/api/admin/v1/cards/${encodeURIComponent(id)}`
        )
        if (!alive) return
        if (card.status === 'published' && !card.has_unpublished_changes) {
          checks.value.push({
            id,
            name: card.display_name || card.content.name,
            category: 'unchanged',
            reason: '当前发布内容与候选一致',
            card
          })
          continue
        }
        if (card.issues.length) {
          checks.value.push({
            id,
            name: card.content.name || '未命名草稿',
            category: 'incomplete',
            reason: card.issues.map((issue) => issue.message).join('；'),
            card
          })
          continue
        }
        const value = await api.request<components['schemas']['CardPreview']>(
          `/api/admin/v1/cards/${encodeURIComponent(id)}/preview`,
          { method: 'POST', body: { revision: card.draft_revision } }
        )
        if (alive)
          checks.value.push({
            id,
            name: value.content.name,
            category: 'ready',
            reason: '已获取最新候选预览',
            card,
            preview: value
          })
      } catch (reason) {
        if (alive)
          checks.value.push({
            id,
            name: '资料暂不可读取',
            category: 'error',
            reason: reason instanceof Error ? reason.message : '请重新获取后核对'
          })
      } finally {
        if (alive) checkedCount.value++
      }
    }
  } finally {
    if (alive) checking.value = false
  }
  activeId.value = eligible.value[0]?.id || ''
}
/** 只提交已预览且管理员明确确认的合格集合 */
const publish = async () => {
  if (
    accepting.value ||
    checking.value ||
    rejected.value ||
    !reviewed.value ||
    !eligible.value.length
  )
    return
  accepting.value = true
  error.value = ''
  if (!submission) {
    submission = {
      confirmed: true,
      items: eligible.value.map((check) => ({
        card_id: check.id,
        revision: check.preview!.revision,
        preview_id: check.preview!.preview_id
      }))
    }
    publishKey = crypto.randomUUID()
  }
  try {
    const value = await api.request<components['schemas']['BatchView']>(
      '/api/admin/v1/publication-batches',
      { method: 'POST', body: submission, key: publishKey }
    )
    if (alive) {
      result.value = value
      unknown.value = false
      void poll()
    }
  } catch (reason) {
    if (alive) {
      error.value = reason instanceof Error ? reason.message : '发布接收结果待确认'
      unknown.value =
        !(reason instanceof ApiError) ||
        !reason.status ||
        reason.status >= 500 ||
        [408, 429].includes(reason.status) ||
        reason.code === 'response_unknown'
      rejected.value = !unknown.value
    }
  } finally {
    if (alive) accepting.value = false
  }
}
/** 原响应丢失后查询同一接收结果，不重新创建批次 */
const recover = async () => {
  if (!publishKey || accepting.value) return
  accepting.value = true
  error.value = ''
  try {
    const value = await api.request<components['schemas']['OperationResponse']>(
      `/api/admin/v1/operations/${publishKey}`
    )
    if (alive) {
      result.value = value.result as components['schemas']['BatchView']
      unknown.value = false
      void poll()
    }
  } catch (reason) {
    if (alive)
      error.value = reason instanceof Error ? reason.message : '尚未确认接收结果，可重试原发布'
  } finally {
    if (alive) accepting.value = false
  }
}
/** 重试时服务器只接收仍然合格的失败项 */
const retry = async () => {
  if (!result.value || accepting.value || polling.value) return
  accepting.value = true
  error.value = ''
  retryKey ||= crypto.randomUUID()
  try {
    const value = await api.request<components['schemas']['BatchView']>(
      `/api/admin/v1/publication-batches/${result.value.id}/retry`,
      { method: 'POST', key: retryKey }
    )
    if (alive) {
      result.value = value
      retryKey = ''
      notice.value = '资料有变化的项目需重新核对，已经成功的项目不会重复发布'
      void poll()
    }
  } catch (reason) {
    if (alive)
      error.value =
        reason instanceof Error ? reason.message : '重试接收结果待确认，可继续重试同一操作'
  } finally {
    if (alive) accepting.value = false
  }
}
/** 仅重新检查失败集合，之后仍须逐卡预览与确认 */
const recheck = () => {
  void inspect(failed.value.map((item) => item.card_id))
}
/** 关闭仅停止本地查询，不撤销已经接收的任务 */
const close = () => {
  emit('close', result.value?.id || null)
}
onMounted(() => {
  if (props.batchId) void restore(props.batchId)
  else void inspect(props.cardIds)
})
onBeforeUnmount(() => {
  alive = false
  pollGeneration++
})
</script>
<template>
  <ElDialog
    :model-value="true"
    :title="result ? '批量发布结果' : '逐卡核对并批量发布'"
    width="min(1100px, 95vw)"
    :close-on-click-modal="false"
    @close="close"
  >
    <AppState :busy="checking" />
    <p v-if="checking" class="small muted">正在核对 {{ checkedCount }}／{{ cardIds.length }} 张</p>
    <p v-if="error" class="notice error" role="alert">
      {{ error
      }}<button v-if="unknown" type="button" class="text" :disabled="accepting" @click="recover">
        查询接收结果
      </button>
      <button
        v-if="rejected"
        type="button"
        class="text"
        data-action="refresh-review"
        @click="inspect(cardIds)"
      >
        重新获取核对资料
      </button>
    </p>
    <p v-if="notice" class="notice">{{ notice }}</p>
    <template v-if="result">
      <div class="result-totals">
        <strong>成功 {{ succeeded }} 张</strong><span>处理中 {{ pendingCount }} 张</span
        ><span>失败 {{ failed.length }} 张</span>
      </div>
      <p class="muted small">关闭后仍会继续处理，结果可从卡片管理再次查看。</p>
      <table class="result-table">
        <thead>
          <tr>
            <th>卡片</th>
            <th>状态</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in result.items" :key="item.id">
            <td>{{ item.name }}</td>
            <td>
              {{
                item.state === 'succeeded'
                  ? '已发布'
                  : item.state === 'failed'
                    ? '未成功'
                    : '处理中'
              }}
            </td>
            <td>
              {{
                item.state === 'failed'
                  ? publicationErrors[item.error_code || ''] || '发布未成功，请重新核对或稍后重试'
                  : item.state === 'succeeded'
                    ? '本项已保存发布结果'
                    : '正在后台处理'
              }}
            </td>
          </tr>
        </tbody>
      </table>
      <div class="row result-actions">
        <button type="button" :disabled="polling" @click="poll">
          {{ polling ? '正在获取…' : '刷新结果' }}</button
        ><button v-if="failed.length" type="button" :disabled="accepting || polling" @click="retry">
          重试失败项</button
        ><button
          v-if="failed.length"
          type="button"
          :disabled="accepting || polling"
          @click="recheck"
        >
          重新核对失败项
        </button>
      </div>
    </template>
    <template v-else-if="!checking">
      <p class="review-totals">
        可发布 {{ eligible.length }} 张 · 待补充 {{ blocked.length }} 张 · 无需发布
        {{ unchanged.length }} 张
      </p>
      <div class="batch-review">
        <div class="review-list">
          <button
            v-for="check in eligible"
            :key="check.id"
            type="button"
            :class="{ active: preview?.id === check.id }"
            @click="activeId = check.id"
          >
            {{ check.name }}
          </button>
          <div v-for="check in blocked" :key="check.id" class="blocked-card">
            <strong>{{ check.name }}</strong>
            <p>{{ check.reason }}</p>
            <RouterLink :to="`/cards/${check.id}`">补充资料</RouterLink>
          </div>
          <p v-for="check in unchanged" :key="check.id" class="unchanged-card">
            {{ check.name }} · 无需重复发布
          </p>
        </div>
        <div class="review-preview">
          <SceneReader
            v-if="preview?.preview && preview.card"
            :key="preview.preview.preview_id"
            :content="preview.preview.content"
            :pronunciation="{
              cardId: preview.id,
              reference: { revision: preview.preview.revision }
            }"
          />
          <p v-else class="muted">没有可以发布的候选，请先补充资料。</p>
        </div>
      </div>
      <label class="review-confirm"
        ><input
          v-model="reviewed"
          type="checkbox"
          data-action="confirm-reviewed"
          :disabled="!eligible.length || accepting"
        />我已逐卡核对本次选中的 {{ eligible.length }} 张合格资料</label
      >
    </template>
    <template #footer
      ><button type="button" @click="close">{{ result ? '关闭结果' : '取消' }}</button
      ><button
        v-if="!result"
        type="button"
        class="primary"
        data-action="publish-reviewed"
        :disabled="checking || accepting || rejected || !reviewed || !eligible.length"
        @click="publish"
      >
        {{ accepting ? '正在接收…' : unknown ? '重试原发布' : `确认发布${eligible.length}张` }}
      </button></template
    >
  </ElDialog>
</template>
<style scoped lang="scss">
.review-totals {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 20px;
}

.batch-review {
  display: grid;
  grid-template-columns: minmax(190px, 1fr) minmax(375px, 2fr);
  gap: 24px;
  max-height: 60vh;
}

.review-list {
  overflow: auto;
  border-right: 1px solid var(--line);
  padding-right: 18px;

  > button {
    display: block;
    width: 100%;
    text-align: left;
    margin-bottom: 10px;
  }

  .active {
    color: var(--green);
    background: var(--soft);
    border-color: var(--green);
  }
}

.review-preview {
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.blocked-card,
.unchanged-card {
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  line-height: 1.8;

  p {
    color: var(--muted);
    margin: 5px 0;
  }
}

.review-confirm {
  display: flex;
  gap: 9px;
  align-items: center;
  margin-top: 24px;
  font-size: 13px;
}

.result-totals {
  display: flex;
  gap: 28px;
  font-size: 16px;
  margin: 12px 0;
}

.result-table {
  margin: 20px 0;
}

.result-actions {
  margin-top: 20px;
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AdminPanel from '@/components/admin-panel/admin-panel.vue'
import { createContentAdapter } from '@/features/content/content-adapter'
import ContentEntryConfirmationPanel from '@/features/proofreading/content-entry-confirmation-panel.vue'
import ProofreadingSetPanel from '@/features/proofreading/proofreading-set-panel.vue'
import PublicationRangePanel from '@/features/publishing/publication-range-panel.vue'
import { createShortReadingAdapter } from '@/features/short-reading/short-reading-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'

import type {
  ProofreadingCandidate,
  ProofreadingSet
} from '@/features/proofreading/proofreading-adapter'
interface CandidateRow {
  contentType: ProofreadingCandidate['content_type']
  contentId: string
  revisionId: string
  title: string
  content: Record<string, unknown>
  contentHash?: string
  version?: number
}
const client = useAdminApiClient()
const content = createContentAdapter(client)
const readings = createShortReadingAdapter(client)
const router = useRouter()
const route = useRoute()
const rows = ref<CandidateRow[]>([])
const selected = ref<string[]>([])
const prepared = computed(() => rows.value.filter((row) => selected.value.includes(row.revisionId)))
const approved = ref<ProofreadingSet | null>(null)
const page = ref(1)
const query = ref('')
const busy = ref(false)
const error = ref('')
let generation = 0
let disposed = false
const /** 加载当前页真实草稿，已发布快照不加入候选集合 */ load = async (): Promise<void> => {
    if (busy.value) return
    const sequence = ++generation
    busy.value = true
    error.value = ''
    try {
      const result = await content.listScenes({
        page: page.value,
        pageSize: 20,
        query: query.value,
        seriesId: '',
        status: 'DRAFT'
      })
      const scenes = await Promise.all(
        result.items
          .filter((scene) => scene.draftRevisionId)
          .map(async (scene) => {
            const revision = await content.getRevision(scene.draftRevisionId!)
            return {
              contentType:
                scene.templateType === 'word_card' || scene.templateType === 'vocabulary'
                  ? ('word_card' as const)
                  : ('dialogue' as const),
              contentId: scene.id,
              revisionId: revision.id,
              version: revision.version,
              title:
                [revision.content.title_zh, revision.content.title_en, scene.title]
                  .find(
                    (title): title is string => typeof title === 'string' && Boolean(title.trim())
                  )
                  ?.trim() || '未命名场景',
              content: revision.content
            }
          })
      )
      let shortRows: CandidateRow[] = []
      if (readings.available) {
        const list = await client.request<{
          items: { public_id: string; draft_revision_id: string | null }[]
        }>({
          method: 'GET',
          path: '/api/v1/admin/content/short-readings',
          query: { page: page.value, page_size: 20 }
        })
        shortRows = await Promise.all(
          list.items
            .filter((item) => item.draft_revision_id)
            .map(async (item) => {
              const snapshot = await readings.load(item.public_id)
              return {
                contentType: 'short_reading' as const,
                contentId: snapshot.id,
                revisionId: snapshot.revisionId,
                title: snapshot.content.title_zh || snapshot.content.title_en || '未命名短文',
                content: { ...snapshot.content },
                contentHash: snapshot.contentHash
              }
            })
        )
      }
      if (disposed || sequence !== generation) return
      const kept = rows.value.filter((row) => selected.value.includes(row.revisionId))
      rows.value = [
        ...new Map([...kept, ...scenes, ...shortRows].map((row) => [row.revisionId, row])).values()
      ]
      approved.value = null
    } catch (failure) {
      if (!disposed && sequence === generation)
        error.value = failure instanceof Error ? failure.message : '候选集合加载失败'
    } finally {
      if (sequence === generation) busy.value = false
    }
  }
const /**
   * 记录服务端明确已完成的固定集合
   * @param set - 服务端持久化校对结果
   */ accept = (set: ProofreadingSet): void => {
    approved.value = set
  }
watch(selected, () => {
  approved.value = null
})
onMounted(load)
onBeforeUnmount(() => {
  disposed = true
  generation++
  rows.value = []
  approved.value = null
})
</script>
<template>
  <section class="content-proofreading-page">
    <div class="heading">
      <div>
        <h2>{{ approved ? '确认发布范围' : '正常内容抽样' }}</h2>
        <p>先明确选择候选集合，再按服务端样本核对；异常组可逐项处理或明确保留草稿。</p>
      </div>
      <ElButton @click="router.push({ name: 'content-scenes' })">返回内容列表</ElButton>
    </div>
    <details v-if="!approved" class="candidate-selection" :open="!prepared.length">
      <summary>选择本次候选集合 · 已选 {{ prepared.length }} 篇</summary>
      <AdminPanel title="明确选择待校对候选"
        ><ElAlert v-if="error" :title="error" type="error" :closable="false" />
        <div class="actions">
          <ElInput
            v-model="query"
            placeholder="场景标题关键词"
            aria-label="候选关键词"
          /><ElInputNumber v-model="page" :min="1" :precision="0" aria-label="候选页码" /><ElButton
            :loading="busy"
            @click="load"
            >加载本页真实草稿</ElButton
          >
        </div>
        <ElCheckboxGroup v-model="selected"
          ><div v-for="row in rows" :key="row.revisionId" class="candidate">
            <ElCheckbox :value="row.revisionId" :disabled="busy">{{ row.title }}</ElCheckbox
            ><span>{{
              row.contentType === 'short_reading'
                ? '短文阅读'
                : row.contentType === 'word_card'
                  ? '原词汇卡'
                  : '场景对话'
            }}</span
            ><small>{{ row.contentId }} · {{ row.revisionId }}</small>
          </div></ElCheckboxGroup
        >
        <p>
          当前明确选中 {{ prepared.length }} 篇。跨页已选候选保留；重新加载仍以服务端当前草稿为准。
        </p></AdminPanel
      >
    </details>
    <ContentEntryConfirmationPanel
      v-if="!approved && prepared.length"
      :candidates="prepared"
      @saved="load"
    />
    <ProofreadingSetPanel
      v-if="prepared.length && !approved"
      :footer="true"
      :candidates="prepared"
      @confirmed="accept"
    />
    <details v-if="approved" class="approved-list">
      <summary>查看已批准集合 · 返回单篇检查</summary>
      <AdminPanel title="已批准集合与发布范围"
        ><p>仅以下服务端已确认候选可以继续发布。未批准异常仍为草稿；发布前重新核对该候选版本。</p>
        <div
          v-for="row in approved.candidates.filter((item) =>
            approved!.confirmed_ids.includes(item.revision_id)
          )"
          :key="row.revision_id"
          class="candidate"
        >
          <strong>{{
            prepared.find((item) => item.revisionId === row.revision_id)?.title || row.content_id
          }}</strong
          ><small>{{ row.candidate_hash }}</small
          ><ElButton
            type="primary"
            @click="
              router.push(
                row.content_type === 'short_reading'
                  ? { name: 'content-short-reading-edit', params: { id: row.content_id } }
                  : { name: 'content-scene-publish', params: { id: row.revision_id } }
              )
            "
            >检查并明确发布这一候选</ElButton
          >
        </div>
      </AdminPanel>
    </details>
    <PublicationRangePanel
      v-if="approved || route.query.range_token"
      :candidates="
        approved?.candidates.filter((candidate) =>
          approved!.confirmed_ids.includes(candidate.revision_id)
        ) || []
      "
    />
  </section>
</template>
<style scoped lang="scss">
.content-proofreading-page {
  display: grid;
  gap: 18px;
  min-width: 0;

  .candidate-selection,
  .approved-list {
    summary {
      margin-bottom: 16px;
      color: var(--el-color-primary);
      cursor: pointer;
    }
  }

  .heading,
  .actions,
  .candidate {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
  }

  .heading {
    justify-content: space-between;
  }

  .actions {
    margin-bottom: 16px;

    :deep(.el-input) {
      max-width: 320px;
    }
  }

  .candidate {
    padding: 12px 0;
    border-bottom: 1px solid var(--el-border-color-light);

    // 复选框组默认字号和行高为 0，候选元数据需要恢复可读文本
    font-size: var(--el-font-size-base);
    line-height: 1.5;
  }

  small {
    overflow-wrap: anywhere;
    color: var(--juya-color-text-secondary);
  }

  p {
    line-height: 1.7;
    color: var(--juya-color-text-secondary);
  }
}
</style>

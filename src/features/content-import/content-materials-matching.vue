<script setup lang="ts">
import AdminPanel from '@/components/admin-panel/admin-panel.vue'

defineProps<{
  statistics: {
    clearAudio: number | null
    ambiguous: number | null
    missingAudio: number | null
    optionalImageErrors: number | null
  }
  batchId: string
  revisionId?: string
  issues: { path: string; title: string; problem: string }[]
}>()
</script>
<template>
  <section class="content-materials-matching">
    <div class="metrics" aria-label="实际素材匹配统计">
      <article>
        <strong>{{ statistics.clearAudio ?? '待校验' }}</strong
        ><span>音频匹配明确</span><small>本包音频文件的单一标题候选，尚需采纳</small>
      </article>
      <article>
        <strong>{{ statistics.ambiguous ?? '待校验' }}</strong
        ><span>重名 / 多候选</span><small>本包重名 / 多候选文件数，包含截断候选</small>
      </article>
      <article>
        <strong>{{ statistics.missingAudio ?? '待核对' }}</strong
        ><span>缺必需音频</span
        ><small>{{
          revisionId ? `仅当前草稿 ${revisionId}` : '先明确读取目标草稿，不按分类分页推断'
        }}</small>
      </article>
      <article>
        <strong>{{ statistics.optionalImageErrors ?? '待核对' }}</strong
        ><span>缺少选填图片异常</span
        ><small>仅选填缺省造成的异常；错误路径 / 解码另列，不计入本卡</small>
      </article>
    </div>
    <AdminPanel title="需要核对的素材">
      <p class="scope">
        {{ batchId ? `素材批次 ${batchId}` : '上传或恢复素材批次后查看真实清单' }} ·
        保留未匹配文件，不自动绑定
      </p>
      <ElTable :data="issues" empty-text="暂无可核对的实际素材记录">
        <ElTableColumn label="原文件名" prop="path" min-width="220" />
        <ElTableColumn label="内容标题" prop="title" min-width="220" />
        <ElTableColumn label="时长 / 问题" prop="problem" min-width="260" />
        <ElTableColumn label="处理" width="200"
          ><template #default>在下方明确选择篇目 / 保留未匹配</template></ElTableColumn
        >
      </ElTable>
    </AdminPanel>
    <ElAlert title="匹配依据" type="info" :closable="false"
      >统一内容 ZIP 按 ID、角色和包内路径绑定；仅旧 DOCX
      与独立素材可按规范化文件名、英文标题提出候选，管理员核对后采纳。短文无音频、封面和选填图片缺省均不算异常；填写错误路径仍需修正。</ElAlert
    >
  </section>
</template>
<style scoped lang="scss">
.content-materials-matching {
  display: grid;
  gap: 20px;

  .metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;

    article {
      display: grid;
      gap: 8px;
      padding: 12px 20px;
      border-radius: 18px;
      background: var(--juya-color-surface);
    }

    strong {
      font-size: 26px;
      line-height: 39px;
    }

    span,
    small {
      color: var(--juya-color-text-secondary);
      font-size: 11px;
      line-height: 18px;
    }

    small {
      overflow-wrap: anywhere;
    }
  }

  .scope {
    font-size: 12px;
    color: var(--juya-color-text-secondary);
  }

  @media (width <= 900px) {
    .metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
</style>

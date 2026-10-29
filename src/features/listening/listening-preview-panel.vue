<script setup lang="ts">
import { computed } from 'vue'

import type { Article } from './listening-types'

import { statusLabels } from './listening-model'
import ListeningReader from './listening-reader.vue'

const props = withDefaults(
  defineProps<{
    article: Pick<Article, 'id' | 'payload' | 'timeline'> &
      Omit<Partial<Article>, 'topic_id'> & {
        topic_id?: string | null
        category_name?: string
        topic_name?: string
      }
    mediaBase?: string
    sourceLabel?: string
    readonly?: boolean
  }>(),
  { mediaBase: undefined, sourceLabel: '当前编辑稿', readonly: true }
)
const completeExpressions = computed(
  () =>
    props.article.payload.expressions.filter(
      (item) => item.english.trim() && item.chinese.trim() && item.example.trim()
    ).length
)
</script>
<template>
  <div class="listening-preview-panel">
    <p class="notice preview-notice">管理员只读预览，不写入用户学习、收藏或打卡记录</p>
    <section class="panel reading-panel">
      <ListeningReader :article="article" :media-base="mediaBase" />
    </section>
    <aside class="panel preview-metadata">
      <h2>预览资料</h2>
      <dl>
        <div>
          <dt>预览来源</dt>
          <dd>{{ sourceLabel }}</dd>
        </div>
        <div v-if="article.category_name || article.topic_name">
          <dt>分类 / 主题</dt>
          <dd>{{ [article.category_name, article.topic_name].filter(Boolean).join(' / ') }}</dd>
        </div>
        <div v-if="article.status">
          <dt>文章状态</dt>
          <dd>{{ statusLabels[article.status] || article.status }}</dd>
        </div>
        <div>
          <dt>英文正文</dt>
          <dd>
            {{
              article.word_count === undefined ? '保存后由服务端计算' : `${article.word_count}词`
            }}
          </dd>
        </div>
        <div>
          <dt>表达与例句</dt>
          <dd>{{ completeExpressions }}组完整</dd>
        </div>
        <div>
          <dt>全文音频</dt>
          <dd>{{ article.payload.audio_id ? '已选择，可试听核对' : '待上传' }}</dd>
        </div>
        <div>
          <dt>本篇原图</dt>
          <dd>{{ article.payload.image_id ? '已上传，可选' : '未上传，选填' }}</dd>
        </div>
      </dl>
      <p v-if="readonly" class="muted small">用户完成与收藏操作在此预览中禁用</p>
      <section class="timeline-summary">
        <div class="between">
          <h3>词级时间轴 · 自动生成</h3>
          <span class="badge">{{ statusLabels[article.timeline?.state || 'missing'] }}</span>
        </div>
        <p class="muted small">
          {{
            article.timeline?.state === 'ready'
              ? '自动校验已通过，可使用逐字高亮'
              : '时间轴暂不可用，仍可阅读和播放完整音频'
          }}。管理员试听可选，未试听不影响发布
        </p>
      </section>
    </aside>
  </div>
</template>
<style scoped lang="scss">
.listening-preview-panel {
  display: grid;
  grid-template-columns: minmax(360px, 0.864fr) minmax(0, 1fr);
  gap: 30px;
  align-items: start;

  .preview-notice {
    grid-column: 1 / -1;
    margin: 0;
  }

  .reading-panel {
    padding: 30px;
    margin: 0;
    min-width: 0;
  }

  .preview-metadata {
    padding: 24px;
    margin: 0;

    h2 {
      font-size: 18px;
      margin-bottom: 20px;
    }

    dl {
      margin-bottom: 20px;
    }

    dl > div {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      padding: 12px 0;
      border-bottom: 1px solid var(--line);
      font-size: 12px;
    }

    dt {
      flex-shrink: 0;
    }

    dd {
      margin: 0;
      color: var(--muted);
      text-align: right;
      overflow-wrap: anywhere;
    }
  }

  .timeline-summary {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--line);

    h3 {
      font-size: 14px;
    }

    p {
      margin-top: 12px;
    }
  }

  @media (width <= 1000px) {
    grid-template-columns: 1fr;
  }
}
</style>

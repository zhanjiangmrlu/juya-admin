<script setup lang="ts">
import { ref } from 'vue'

import FeedbackImagePreview from '@/features/feedback/feedback-image-preview.vue'
import { dateText } from '@/services/display'
import { feedbackImageURL } from '@/services/feedback-service'
import { api } from '@/services/http-client'
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_STATUS_LABELS } from '@/shared/constants/feedback'

import type { FeedbackDetail, FeedbackImage } from '@/shared/types/feedback'
defineProps<{ detail: FeedbackDetail }>()
const preview = ref<FeedbackImage | null>(null),
  images = ref<Record<string, FeedbackImage>>({}),
  failed = ref<Record<string, boolean>>({}),
  renewing = ref(''),
  imageError = ref('')
/** 续签失败截图，原有沟通记录继续显示
 * @param image 当前事件引用的私有截图
 */
const renewImage = async (image: FeedbackImage) => {
  if (renewing.value) return
  renewing.value = image.id
  imageError.value = ''
  try {
    images.value[image.id] = await api.request<FeedbackImage>(
      `/api/admin/v1/feedback/images/${encodeURIComponent(image.id)}/url`
    )
    failed.value[image.id] = false
  } catch (reason) {
    imageError.value = reason instanceof Error ? reason.message : '截图暂不可用'
  } finally {
    renewing.value = ''
  }
}
</script>
<template>
  <section class="panel feedback-history">
    <h2>{{ detail.id }} · {{ detail.user_code }}</h2>
    <div class="between">
      <strong>{{ FEEDBACK_CATEGORY_LABELS[detail.category] }}</strong
      ><span
        class="badge"
        :class="{ draft: ['pending', 'needs_info'].includes(detail.status) }"
        data-current-status
        >{{ FEEDBACK_STATUS_LABELS[detail.status] }}</span
      >
    </div>
    <div class="feedback-source">
      <img src="@/assets/icons/feedback-source.svg" width="16" height="20" alt="" /><span
        >{{ detail.source_title || '账号资料 · 通用反馈'
        }}<template v-if="detail.card_id && !detail.source_available">
          ·
          {{
            detail.source_unavailable_reason === 'deleted' ? '来源已删除' : '来源不可用'
          }}</template
        ><small v-if="detail.source_title_en">{{ detail.source_title_en }}</small></span
      >
    </div>
    <div class="feedback-thread">
      <article
        v-for="event in detail.events"
        :key="event.id"
        class="feedback-message"
        :class="{ admin: event.actor === 'admin' }"
        :data-event-id="event.id"
      >
        <div class="between">
          <strong>{{ event.actor === 'admin' ? '句芽英语 · 管理员' : '用户' }}</strong
          ><time :datetime="event.created_at">{{ dateText(event.created_at) }}</time>
        </div>
        <p v-if="event.text">{{ event.text }}</p>
        <p v-if="event.status" class="small muted">
          状态更新为{{ FEEDBACK_STATUS_LABELS[event.status] }}
        </p>
        <div v-if="event.images.length" class="feedback-screenshots">
          <div v-for="image in event.images" :key="image.id">
            <button
              v-if="failed[image.id]"
              type="button"
              :disabled="Boolean(renewing)"
              @click="renewImage(image)"
            >
              {{ renewing === image.id ? '重新获取中…' : '截图加载失败，点击重试' }}
            </button>
            <button
              v-else
              type="button"
              class="screenshot-button"
              @click="preview = images[image.id] || image"
            >
              <img
                :src="feedbackImageURL((images[image.id] || image).url)"
                :width="image.width"
                :height="image.height"
                alt="查看反馈截图"
                @error="failed[image.id] = true"
              />
            </button>
          </div>
        </div>
      </article>
    </div>
    <p v-if="imageError" class="notice error" role="alert">{{ imageError }}</p>
    <FeedbackImagePreview v-if="preview" :image="preview" @close="preview = null" />
  </section>
</template>
<style scoped lang="scss">
.feedback-history {
  min-width: 0;
  align-self: start;

  h2 {
    font-weight: 700;
    line-height: 28px;
  }

  .feedback-source {
    display: flex;
    gap: 8px;
    padding: 14px 0 18px;
    color: var(--muted);
    font-size: 13px;
  }

  .feedback-source small {
    display: block;
  }

  .feedback-message {
    padding: 18px 0;
    border-bottom: 1px solid var(--line);
  }

  .feedback-message.admin {
    padding: 18px 14px;
    margin-top: 14px;
    border: 0;
    border-radius: 10px;
    background: var(--soft);
  }

  time {
    color: var(--muted);
    font-size: 11px;
  }

  article > p {
    margin-top: 12px;
    font-size: 15px;
    line-height: 1.75;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .feedback-screenshots {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 12px;
  }

  .screenshot-button {
    display: block;
    padding: 0;
    overflow: hidden;
  }

  .screenshot-button img {
    display: block;
    width: auto;
    height: 100px;
    max-width: 160px;
    object-fit: contain;
  }
}
</style>

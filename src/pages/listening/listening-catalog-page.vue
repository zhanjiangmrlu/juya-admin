<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import ListeningSettings from '@/features/listening/listening-settings.vue'

const route = useRoute(),
  panel = ref<InstanceType<typeof ListeningSettings> | null>(null),
  topicName = ref('')
const surface = computed(
  () => route.meta.listeningSurface as 'categories' | 'topics' | 'topic-order' | 'global-order'
)
const title = computed(
  () =>
    ({
      categories: '分类管理',
      topics: '主题管理',
      'topic-order': topicName.value ? `${topicName.value} · 篇目顺序` : '主题内篇目顺序',
      'global-order': '全局免费顺序'
    })[surface.value]
)
const description = computed(
  () =>
    ({
      categories: '组织听读内容的第一层入口。',
      topics: '一个主题可以包含多篇短文，主题内进度独立展示。',
      'topic-order': '此顺序用于用户端主题篇目列表及同主题“下一篇”。',
      'global-order': '按全部有效已发布文章的全局顺序确定免费前M篇。'
    })[surface.value]
)
</script>
<template>
  <div class="catalog-page">
    <div class="page-heading between">
      <div>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <button
        v-if="surface === 'categories' || surface === 'topics'"
        class="primary"
        @click="panel?.openEdit(surface === 'categories' ? 'category' : 'topic')"
      >
        <AppIcon name="plus" />{{ surface === 'categories' ? '新增分类' : '新增主题' }}</button
      ><RouterLink
        v-else
        class="button-link"
        :to="surface === 'topic-order' ? '/listening/topics' : '/listening'"
        >{{ surface === 'topic-order' ? '返回主题' : '返回文章列表' }}</RouterLink
      >
    </div>
    <nav
      v-if="surface === 'categories' || surface === 'topics'"
      class="tabs"
      aria-label="听读内容管理"
    >
      <RouterLink to="/listening">文章管理</RouterLink
      ><RouterLink to="/listening/categories" :class="{ active: surface === 'categories' }"
        >分类管理</RouterLink
      ><RouterLink to="/listening/topics" :class="{ active: surface === 'topics' }"
        >主题管理</RouterLink
      >
    </nav>
    <ListeningSettings
      :key="surface"
      ref="panel"
      :initial="surface === 'categories' || surface === 'topics' ? 'hierarchy' : 'order'"
      :surface="surface"
      :topic-id="String(route.query.topic_id || '')"
      @topic-name="topicName = $event"
    />
  </div>
</template>
<style scoped lang="scss">
.catalog-page {
  .tabs {
    margin-bottom: 24px;

    a {
      display: block;
      padding: 12px 4px;
      margin-right: 28px;

      &:where(.active) {
        border-bottom: 2px solid var(--ink);
        font-weight: 600;
      }
    }
  }
}
</style>

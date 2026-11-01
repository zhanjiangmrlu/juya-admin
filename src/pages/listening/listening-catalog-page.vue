<script setup lang="ts">
import { ElButton, ElTabPane, ElTabs } from 'element-plus'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppIcon from '@/components/app-icon/app-icon.vue'
import ListeningSettings from '@/features/listening/listening-settings.vue'

const route = useRoute(),
  panel = ref<InstanceType<typeof ListeningSettings> | null>(null),
  categoryName = ref('')
const surface = computed(() => route.meta.listeningSurface as 'categories' | 'category-order')
const title = computed(() =>
  surface.value === 'categories' ? '分类管理' : `${categoryName.value || '分类内文章'} · 篇目顺序`
)
const description = computed(() =>
  surface.value === 'categories'
    ? '分类直接组织听读文章，引用分类须先迁移归属后删除。'
    : '此顺序用于分类文章列表及同类下一篇。'
)
</script>
<template>
  <div class="catalog-page">
    <div class="page-heading between">
      <div>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <ElButton v-if="surface === 'categories'" type="primary" @click="panel?.openEdit('category')"
        ><AppIcon name="plus" />新增分类</ElButton
      ><RouterLink v-else class="button-link" to="/listening/categories">返回分类管理</RouterLink>
    </div>
    <ElTabs
      v-if="surface === 'categories'"
      model-value="categories"
      @tab-change="$event === 'articles' && $router.push('/listening')"
      ><ElTabPane name="articles" label="文章管理" /><ElTabPane name="categories" label="分类管理"
    /></ElTabs>
    <ListeningSettings
      :key="surface"
      ref="panel"
      :initial="surface === 'categories' ? 'hierarchy' : 'order'"
      :surface="surface"
      :category-id="String(route.query.category_id || '')"
      @category-name="categoryName = $event"
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

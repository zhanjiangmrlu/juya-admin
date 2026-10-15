<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { createPublishAdapter } from '@/features/publishing/publish-adapter'
import { useAdminApiClient } from '@/services/api/use-admin-api-client'
const route = useRoute(),
  router = useRouter()
const adapter = createPublishAdapter(useAdminApiClient())
const error = ref('')
/** 从旧版本发布深链恢复真实内容，再由单篇入口恢复工作单 */
const restore = async (): Promise<void> => {
  error.value = ''
  try {
    const preview = await adapter.preview(String(route.params.id))
    if (!preview.sceneId) throw new Error('未找到此版本所属内容，请从内容列表恢复')
    await router.replace({
      name: 'content-scene-edit',
      params: { id: preview.sceneId },
      query: { stage: 'publish' }
    })
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '恢复失败，请重新加载'
  }
}
onMounted(restore)
</script>
<template>
  <section>
    <ElAlert v-if="error" :title="error" type="error" :closable="false"
      ><ElButton @click="restore">重新恢复</ElButton
      ><ElButton @click="router.push({ name: 'content-scenes' })">返回内容列表</ElButton></ElAlert
    >
    <ElSkeleton v-else :rows="4" animated />
  </section>
</template>

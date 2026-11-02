<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter(),
  destination = ref(''),
  recovering = ref(false)
/** 判断本次导航是否因页面资源失效而无法完成
 * @param error 路由加载或预加载返回的异常
 * @returns 是否可通过重新加载页面恢复
 */
const isResourceError = (error: unknown) =>
  error instanceof Error &&
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    error.message
  )
// 路由守卫通过后，旧标签页仍可能无法加载发布后已替换的页面资源
const removeErrorHandler = router.onError((error, to) => {
  if (isResourceError(error)) destination.value = to.fullPath
})
/** 重新检查当前离页保护，仅在守卫放行且资源仍失效时整页加载 */
const recover = async () => {
  if (recovering.value || !destination.value) return
  const target = destination.value
  recovering.value = true
  try {
    await router.push(target)
  } catch (error) {
    if (isResourceError(error) && destination.value === target)
      window.location.assign(router.resolve(target).href)
  } finally {
    recovering.value = false
  }
}
const removeAfterEach = router.afterEach((_to, _from, failure) => {
  if (!failure) destination.value = ''
})
onBeforeUnmount(() => {
  removeErrorHandler()
  removeAfterEach()
})
</script>
<template>
  <p v-if="destination" class="notice error route-load-error" role="alert">
    页面资源加载失败，请刷新后继续。
    <a :href="destination" :aria-disabled="recovering" @click.prevent="recover">刷新页面并继续</a>
  </p>
</template>
<style scoped lang="scss">
.route-load-error {
  position: sticky;
  top: var(--topbar-height);
  z-index: 14;
  margin: 16px var(--page-gutter);

  a {
    margin-left: 12px;
    text-decoration: underline;
  }
}
</style>

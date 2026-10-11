<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { createSegmentPlayer } from '@/features/audio/segment-player'

const props = defineProps<{ src: string }>()
const audio = ref<globalThis.HTMLAudioElement | null>(null)
let player: ReturnType<typeof createSegmentPlayer> | null = null
onMounted(() => {
  if (audio.value) {
    player = createSegmentPlayer(audio.value)
    player.load(props.src)
  }
})
watch(
  () => props.src,
  (src) => player?.load(src)
)
onBeforeUnmount(() => player?.dispose())
</script>
<template><audio ref="audio" controls preload="none" class="app-audio-player" /></template>
<style scoped lang="scss">
.app-audio-player {
  width: 100%;
  max-width: 420px;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'

import arrow from '@/assets/icons/arrow.svg'
import back from '@/assets/icons/back.svg'
import cards from '@/assets/icons/cards.svg'
import chart from '@/assets/icons/chart.svg'
import close from '@/assets/icons/close.svg'
import heart from '@/assets/icons/heart.svg'
import info from '@/assets/icons/info.svg'
import play from '@/assets/icons/play.svg'
import plus from '@/assets/icons/plus.svg'
import refresh from '@/assets/icons/refresh.svg'
import speaker from '@/assets/icons/speaker.svg'
import upload from '@/assets/icons/upload.svg'
import user from '@/assets/icons/user.svg'
import users from '@/assets/icons/users.svg'

const props = withDefaults(defineProps<{ name?: string; size?: number }>(), {
  name: 'user',
  size: 20
})
const icons: Record<string, string> = {
  arrow,
  back,
  cards,
  chart,
  close,
  heart,
  info,
  play,
  plus,
  refresh,
  speaker,
  upload,
  user,
  users
}
const asset = computed(() => icons[props.name] || user)
</script>
<template>
  <img class="app-icon" :src="asset" :width="size" :height="size" alt="" aria-hidden="true" />
</template>
<style scoped lang="scss">
.app-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
  object-fit: contain;
}
</style>

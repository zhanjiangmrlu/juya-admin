<script setup lang="ts">
withDefaults(defineProps<{ name?: string; size?: number }>(), { name: 'leaf', size: 20 })
const paths: Record<string, string> = {
  leaf: 'M20 4C9 1 1 10 6 17c5 5 14-2 14-13ZM6 18 16 8M11 13l-1-5m1 5 5 1',
  cards: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  users:
    'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m7-11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m11 11v-3a4 4 0 0 0-3-4m-1-11a4 4 0 0 1 0 8',
  chart: 'M4 20h16M7 17v-5m5 5V5m5 12V9',
  back: 'M15 18l-6-6 6-6',
  close: 'm6 6 12 12M6 18 18 6',
  play: 'm8 4 12 8-12 8z',
  pause: 'M8 4v16M16 4v16',
  image: 'M3 3h18v18H3zM3 16l5-5 5 5 4-4 4 4M15 7h.01',
  check: 'm5 12 4 4L19 6',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  refresh: 'M20 8a8 8 0 1 0 1 6M20 3v5h-5',
  search: 'm21 21-5-5m2-6a8 8 0 1 0-16 0 8 8 0 0 0 16 0',
  star: 'm12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z'
}
</script>
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.leaf" />
  </svg>
</template>

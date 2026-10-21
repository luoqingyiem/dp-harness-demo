<script setup lang="ts">
import { computed } from 'vue'
import { ElIcon, ElProgress, ElTooltip } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import type { BookMeta, Progress } from '@shared/types'

const props = defineProps<{
  book: BookMeta
  progress: Progress | null
}>()

const emit = defineEmits<{
  open: []
  remove: []
}>()

const coverStyle = computed(() => {
  const hue = ((props.book.coverHue % 360) + 360) % 360
  const from = `hsl(${hue}, 58%, 62%)`
  const to = `hsl(${(hue + 38) % 360}, 52%, 42%)`
  return { backgroundImage: `linear-gradient(145deg, ${from} 0%, ${to} 100%)` }
})

const initial = computed(() => props.book.title.trim().slice(0, 1) || '书')

const percent = computed(() => {
  if (!props.progress) return 0
  const total = props.book.chapterCount > 0 ? props.book.chapterCount : 1
  return Math.min(100, Math.round((props.progress.chapterIndex / total) * 100))
})

const readAt = computed(() => {
  const stamp = props.book.lastReadAt || props.book.addedAt
  if (!stamp) return '尚未阅读'
  const date = new Date(stamp)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `上次阅读 ${month}-${day}`
})
</script>

<template>
  <article class="card" role="button" tabindex="0" @click="emit('open')" @keydown.enter="emit('open')">
    <div class="card__cover" :style="coverStyle">
      <span class="card__initial">{{ initial }}</span>
    </div>

    <div class="card__body">
      <h3 class="card__title" :title="book.title">{{ book.title }}</h3>
      <p class="card__meta">{{ book.chapterCount }} 章 · {{ readAt }}</p>
      <ElProgress :percentage="percent" :stroke-width="4" :show-text="false" />
    </div>

    <ElTooltip content="删除这本书" placement="top" :show-after="300">
      <button type="button" class="card__remove" aria-label="删除" @click.stop="emit('remove')">
        <ElIcon><Delete /></ElIcon>
      </button>
    </ElTooltip>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-panel);
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.card:hover,
.card:focus-visible {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--app-border));
  box-shadow: var(--app-shadow);
  outline: none;
}

.card__cover {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 3 / 4;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.92);
  overflow: hidden;
}

.card__cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(200deg, rgba(255, 255, 255, 0.28), transparent 55%);
}

.card__initial {
  font-family: var(--font-serif);
  font-size: 40px;
  letter-spacing: 2px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.card__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--app-fg);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card__meta {
  margin: 0;
  font-size: 12px;
  color: var(--app-fg-muted);
}

.card__remove {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.16s ease, background 0.16s ease;
}

.card:hover .card__remove,
.card:focus-within .card__remove {
  opacity: 1;
}

.card__remove:hover {
  background: rgba(196, 54, 54, 0.9);
}
</style>

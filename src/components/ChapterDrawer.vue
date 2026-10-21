<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElDrawer } from 'element-plus'
import type { Chapter } from '@shared/types'

const props = defineProps<{
  chapters: Chapter[]
  currentIndex: number
}>()

const emit = defineEmits<{
  select: [index: number]
}>()

const visible = defineModel<boolean>({ required: true })
const listEl = ref<HTMLElement | null>(null)

async function centerActive(): Promise<void> {
  await nextTick()
  const root = listEl.value
  if (!root) return
  const active = root.querySelector<HTMLElement>('.chapters__item.is-active')
  active?.scrollIntoView({ block: 'center' })
}

watch(visible, (open) => {
  if (open) void centerActive()
})

watch(
  () => props.currentIndex,
  () => {
    if (visible.value) void centerActive()
  }
)
</script>

<template>
  <ElDrawer v-model="visible" direction="rtl" size="360px" title="目录">
    <!-- 性能考虑：纯 div + button 列表，不套 ElScrollbar -->
    <div ref="listEl" class="chapters">
      <button
        v-for="(chapter, index) in chapters"
        :key="chapter.index"
        type="button"
        class="chapters__item"
        :class="{ 'is-active': index === currentIndex }"
        @click="emit('select', index)"
      >
        <span class="chapters__no">{{ index + 1 }}</span>
        <span class="chapters__title">{{ chapter.title }}</span>
      </button>
      <p v-if="chapters.length === 0" class="chapters__empty">暂无目录</p>
    </div>
  </ElDrawer>
</template>

<style scoped>
.chapters {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chapters__item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--app-fg);
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}

.chapters__item:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.chapters__item.is-active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  font-weight: 600;
}

.chapters__no {
  flex: 0 0 34px;
  color: var(--app-fg-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.chapters__item.is-active .chapters__no {
  color: var(--accent);
}

.chapters__title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapters__empty {
  margin: 24px 0;
  color: var(--app-fg-muted);
  text-align: center;
}
</style>

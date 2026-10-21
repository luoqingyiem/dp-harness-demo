<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElButton } from 'element-plus'
import ChapterDrawer from '@/components/ChapterDrawer.vue'
import ReaderPaper from '@/components/ReaderPaper.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import { useReaderKeys } from '@/composables/useReaderKeys'
import { useReaderScroll } from '@/composables/useReaderScroll'
import { useReaderStore } from '@/stores/reader'
import { useSettingsStore } from '@/stores/settings'
import type { ReaderSettings } from '@shared/types'

const route = useRoute()
const router = useRouter()
const reader = useReaderStore()
const settingsStore = useSettingsStore()
const settings = computed<ReaderSettings>(() => settingsStore.settings)

const scrollEl = ref<HTMLElement | null>(null)
const scroll = useReaderScroll(scrollEl, reader)

const drawerOpen = ref(false)
const settingsOpen = ref(false)
const toolbarVisible = ref(true)

/** 工具栏无操作自动隐藏 */
const TOOLBAR_HIDE_DELAY = 3000
const TURN_COOLDOWN = 800

let hideTimer: number | null = null
let lastTurnAt = 0

const percent = computed(() => Math.round(reader.bookPercent(scroll.ratio.value)))

function backToShelf(): void {
  void router.push('/')
}

function scheduleHide(): void {
  if (hideTimer !== null) window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    hideTimer = null
    toolbarVisible.value = false
  }, TOOLBAR_HIDE_DELAY)
}

function showToolbar(): void {
  toolbarVisible.value = true
  scheduleHide()
}

function toggleToolbar(): void {
  if (!toolbarVisible.value) {
    showToolbar()
    return
  }
  toolbarVisible.value = false
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scrollToTop(): void {
  const el = scrollEl.value
  if (el) el.scrollTop = 0
  scroll.ratio.value = 0
}

async function stepChapter(delta: -1 | 1): Promise<void> {
  await scroll.flush()
  const changed = delta > 0 ? await reader.nextChapter() : await reader.prevChapter()
  if (!changed) return
  scroll.ratio.value = 0
  await nextTick()
  scrollToTop()
}

async function goToChapter(index: number): Promise<void> {
  await scroll.flush()
  if (index !== reader.currentIndex) {
    const loaded = await reader.loadChapter(index)
    if (!loaded) return
  }
  scroll.ratio.value = 0
  await nextTick()
  scrollToTop()
}

function onSelectChapter(index: number): void {
  drawerOpen.value = false
  void goToChapter(index)
}

function onSettingsUpdate(patch: Partial<ReaderSettings>): void {
  settingsStore.update(patch)
}

function onWheel(event: WheelEvent): void {
  if (!settings.value.autoNextChapter || event.deltaY <= 0) return
  if (!scroll.isAtBottom()) return
  const now = Date.now()
  if (now - lastTurnAt < TURN_COOLDOWN) return
  lastTurnAt = now
  void stepChapter(1)
}

function onKeyEscape(): void {
  if (drawerOpen.value) {
    drawerOpen.value = false
    return
  }
  if (settingsOpen.value) {
    settingsOpen.value = false
    return
  }
  backToShelf()
}

useReaderKeys({
  chapter: (delta) => {
    void stepChapter(delta)
  },
  page: (screens) => {
    scroll.page(screens)
  },
  activity: showToolbar,
  toggleToolbar,
  escape: onKeyEscape
})

// 字号 / 行高 / 宽度变化会重排：记住当前 ratio，下一帧再恢复
// flush: 'sync' 保证在 store 把 CSS 变量写进 DOM 之前先量出旧排版下的位置；
// 用字符串聚合比较，避免设置回写时对象换新导致误触发
watch(
  () =>
    [
      settings.value.fontSize,
      settings.value.lineHeight,
      settings.value.paragraphSpacing,
      settings.value.maxWidth,
      settings.value.fontFamily
    ].join('|'),
  async () => {
    const ratio = scroll.measure()
    await nextTick()
    scroll.restore(ratio)
  },
  { flush: 'sync' }
)

onMounted(async () => {
  const id = typeof route.params.id === 'string' ? route.params.id : ''
  const opened = await reader.open(id)
  if (!opened) {
    await router.push('/')
    return
  }
  scroll.attach()
  scroll.restore(reader.initialRatio)
  window.addEventListener('mousemove', showToolbar)
  showToolbar()
})

onUnmounted(() => {
  window.removeEventListener('mousemove', showToolbar)
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer)
    hideTimer = null
  }
  scroll.detach()
})
</script>

<template>
  <div class="reader">
    <header class="reader__bar" :class="{ 'is-hidden': !toolbarVisible }">
      <div class="reader__side">
        <ElButton text class="reader__back" @click="backToShelf">← 返回</ElButton>
        <span class="reader__name" :title="reader.meta?.title">{{ reader.meta?.title ?? '阅读中' }}</span>
      </div>
      <div class="reader__side">
        <ElButton text @click="drawerOpen = true">目录</ElButton>
        <ElButton text @click="settingsOpen = true">Aa</ElButton>
      </div>
    </header>

    <main ref="scrollEl" class="reader__scroll" @wheel="onWheel">
      <ReaderPaper v-if="reader.content" :content="reader.content" />
      <p v-else class="reader__hint">{{ reader.loading ? '正在加载…' : '暂无内容' }}</p>
    </main>

    <footer class="reader__status">
      第 {{ reader.currentIndex + 1 }}/{{ reader.total }} 章 · 全书 {{ percent }}%
    </footer>

    <ChapterDrawer
      v-model="drawerOpen"
      :chapters="reader.chapters"
      :current-index="reader.currentIndex"
      @select="onSelectChapter"
    />
    <SettingsPanel v-model="settingsOpen" :settings="settings" @update="onSettingsUpdate" />
  </div>
</template>

<style scoped>
.reader {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  background: var(--reader-bg);
  color: var(--reader-fg);
}

.reader__bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 52px;
  padding: 0 14px;
  background: color-mix(in srgb, var(--reader-bg) 92%, var(--app-panel));
  border-bottom: 1px solid var(--app-border);
  opacity: 1;
  transition: opacity 0.24s ease;
}

.reader__bar.is-hidden {
  opacity: 0;
  pointer-events: none;
}

.reader__side {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.reader__back {
  flex: 0 0 auto;
}

.reader__name {
  max-width: 46vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-serif);
  font-size: 14px;
  color: var(--reader-fg);
}

.reader__scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 74px 24px 60px;
  scroll-behavior: auto;
}

.reader__hint {
  margin: 40px 0;
  text-align: center;
  color: var(--app-fg-muted);
  font-family: var(--font-sans);
  font-size: 14px;
}

.reader__status {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--app-fg-muted);
  background: color-mix(in srgb, var(--reader-bg) 92%, var(--app-panel));
  border-top: 1px solid var(--app-border);
}
</style>

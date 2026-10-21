<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElEmpty, ElMessage } from 'element-plus'
import BookCard from '@/components/BookCard.vue'
import { useShelfStore } from '@/stores/shelf'
import { toastError } from '@/lib/api'

const router = useRouter()
const shelf = useShelfStore()

const importing = ref(false)
const dragging = ref(false)

async function onImport(): Promise<void> {
  importing.value = true
  try {
    await shelf.importByDialog()
  } finally {
    importing.value = false
  }
}

function openBook(id: string): void {
  void router.push(`/reader/${id}`)
}

function onDragOver(event: DragEvent): void {
  event.preventDefault()
  dragging.value = true
}

function onDragLeave(event: DragEvent): void {
  if (event.relatedTarget === null) dragging.value = false
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  dragging.value = false
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  const paths: string[] = []
  for (const file of Array.from(files)) {
    if (!/\.txt$/i.test(file.name)) continue
    try {
      // Electron 32+ 已移除 File.path，必须走 preload 的 webUtils 包装
      const target = window.api.app.getPathForFile(file)
      if (target) paths.push(target)
    } catch (error) {
      toastError(error, `无法读取文件路径：${file.name}`)
    }
  }

  if (paths.length === 0) {
    ElMessage.warning('只支持拖入 .txt 文件')
    return
  }
  void shelf.importPaths(paths)
}

onMounted(() => {
  void shelf.refresh()
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
})

onUnmounted(() => {
  window.removeEventListener('dragover', onDragOver)
  window.removeEventListener('dragleave', onDragLeave)
  window.removeEventListener('drop', onDrop)
})
</script>

<template>
  <div class="shelf" :class="{ 'is-dragging': dragging }">
    <header class="shelf__head">
      <div class="shelf__titles">
        <h1 class="shelf__title">我的书架</h1>
        <span class="shelf__count">{{ shelf.books.length }} 本</span>
      </div>
      <ElButton type="primary" :loading="importing" @click="onImport">导入 TXT</ElButton>
    </header>

    <div v-if="shelf.books.length === 0" class="shelf__empty">
      <ElEmpty description="书架还是空的，导入一本 .txt 开始阅读">
        <ElButton type="primary" :loading="importing" @click="onImport">选择 TXT 文件</ElButton>
      </ElEmpty>
    </div>

    <div v-else class="shelf__grid" :class="{ 'is-loading': shelf.loading }">
      <BookCard
        v-for="book in shelf.sortedBooks"
        :key="book.id"
        :book="book"
        :progress="shelf.progressMap[book.id] ?? null"
        @open="openBook(book.id)"
        @remove="shelf.remove(book.id)"
      />
    </div>

    <footer class="shelf__hint">也可以把 .txt 文件直接拖进窗口</footer>

    <div v-if="dragging" class="shelf__veil">
      <div class="shelf__veil-box">松手即导入 .txt 文件</div>
    </div>
  </div>
</template>

<style scoped>
.shelf {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 100%;
  padding: 26px 32px 30px;
  background: var(--app-bg);
  color: var(--app-fg);
  overflow-y: auto;
}

.shelf__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.shelf__titles {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.shelf__title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 22px;
  font-weight: 600;
}

.shelf__count {
  font-size: 13px;
  color: var(--app-fg-muted);
}

.shelf__empty {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 40px 0;
}

.shelf__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 18px;
  transition: opacity 0.15s ease;
}

.shelf__grid.is-loading {
  opacity: 0.6;
}

.shelf__hint {
  margin-top: auto;
  padding-top: 10px;
  font-size: 12px;
  color: var(--app-fg-muted);
  text-align: center;
}

.shelf__veil {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--app-bg) 72%, transparent);
  border: 2px dashed var(--accent);
  pointer-events: none;
  z-index: 20;
}

.shelf__veil-box {
  padding: 16px 26px;
  border-radius: 12px;
  background: var(--app-panel);
  color: var(--accent);
  font-size: 14px;
  box-shadow: var(--app-shadow);
}
</style>

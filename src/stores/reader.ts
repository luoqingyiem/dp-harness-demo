import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import type { BookMeta, Chapter, ChapterPayload, Progress } from '@shared/types'
import { toastError, unwrap } from '@/lib/api'

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function isIndexInRange(index: number, length: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < length
}

export const useReaderStore = defineStore('reader', () => {
  const meta = ref<BookMeta | null>(null)
  const chapters = ref<Chapter[]>([])
  const currentIndex = ref(0)
  const content = ref<ChapterPayload | null>(null)
  const total = ref(0)
  const loading = ref(false)
  const ready = ref(false)
  /** 只在 open() 时设置，用于首次恢复滚动位置 */
  const initialRatio = ref(0)

  /** 全书百分比：章起点 + 章内偏移，再除以总字符数 */
  function bookPercent(ratio: number): number {
    const book = meta.value
    const list = chapters.value
    if (!book || book.charCount <= 0 || list.length === 0) return 0
    const chapter = list[currentIndex.value]
    if (!chapter) return 0
    const span = Math.max(0, chapter.end - chapter.start)
    const offset = chapter.start + span * clamp01(ratio)
    return Math.min(100, Math.max(0, (offset / book.charCount) * 100))
  }

  async function loadChapter(index: number): Promise<boolean> {
    const book = meta.value
    if (!book || !isIndexInRange(index, chapters.value.length)) return false
    loading.value = true
    try {
      const payload = await unwrap(window.api.book.content(book.id, index))
      content.value = payload
      currentIndex.value = payload.index
      if (payload.total > 0) total.value = payload.total
      return true
    } catch (error) {
      toastError(error, '加载章节失败')
      return false
    } finally {
      loading.value = false
    }
  }

  async function open(id: string): Promise<boolean> {
    loading.value = true
    ready.value = false
    content.value = null
    meta.value = null
    chapters.value = []
    total.value = 0
    initialRatio.value = 0
    currentIndex.value = 0
    try {
      if (!id) {
        ElMessage.error('缺少书籍 ID，无法打开')
        return false
      }
      const book = await unwrap(window.api.library.get(id))
      if (!book) {
        ElMessage.error('这本书不存在或已被删除')
        return false
      }
      const list = await unwrap(window.api.book.chapters(id))
      if (list.length === 0) {
        ElMessage.error('章节数据缺失，无法打开这本书')
        return false
      }
      meta.value = book
      chapters.value = list
      total.value = book.chapterCount > 0 ? book.chapterCount : list.length

      let progress: Progress | null = null
      try {
        progress = await unwrap(window.api.progress.get(id))
      } catch (error) {
        toastError(error, '读取阅读进度失败，将从第一章开始')
      }
      const saved = progress?.chapterIndex ?? 0
      const index = isIndexInRange(saved, list.length) ? saved : 0
      initialRatio.value = clamp01(progress?.scrollRatio ?? 0)
      const loaded = await loadChapter(index)
      ready.value = loaded
      return loaded
    } catch (error) {
      toastError(error, '打开书籍失败')
      return false
    } finally {
      loading.value = false
    }
  }

  async function prevChapter(): Promise<boolean> {
    if (currentIndex.value <= 0) return false
    return await loadChapter(currentIndex.value - 1)
  }

  async function nextChapter(): Promise<boolean> {
    if (currentIndex.value >= chapters.value.length - 1) return false
    return await loadChapter(currentIndex.value + 1)
  }

  return {
    meta,
    chapters,
    currentIndex,
    content,
    total,
    loading,
    ready,
    initialRatio,
    bookPercent,
    open,
    loadChapter,
    prevChapter,
    nextChapter
  }
})

import { nextTick, ref, type Ref } from 'vue'
import type { Progress } from '@shared/types'
import { toastError, unwrap } from '@/lib/api'
import type { useReaderStore } from '@/stores/reader'

type ReaderStore = ReturnType<typeof useReaderStore>

/** 滚动写盘节流间隔（ms），设计文档 5.4 */
const SAVE_INTERVAL = 500

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

export interface ReaderScroll {
  /** 当前章内滚动百分比 0~1 */
  ratio: Ref<number>
  attach: () => void
  detach: () => void
  restore: (ratio: number) => void
  flush: () => Promise<void>
  /** 读一次 DOM 得到最新 ratio（排版变化前用） */
  measure: () => number
  /** 按屏翻动，screens 为正=向下 */
  page: (screens: number) => void
  isAtBottom: () => boolean
  isAtTop: () => boolean
}

/**
 * 把阅读页的滚动 / 进度逻辑抽离出来：
 * - scroll 节流 500ms 写 progress
 * - 切章、卸载、beforeunload、blur 立即 flush
 * - restore 在 nextTick + rAF 之后按比例定位
 */
export function useReaderScroll(container: Ref<HTMLElement | null>, store: ReaderStore): ReaderScroll {
  const ratio = ref(0)

  let saveTimer: number | null = null
  let rafId = 0
  let attached = false
  let saving = false
  let queued = false
  let warned = false

  function scroller(): HTMLElement | null {
    return container.value
  }

  function measure(): number {
    const el = scroller()
    if (!el) return ratio.value
    const max = el.scrollHeight - el.clientHeight
    ratio.value = max > 0 ? clamp01(el.scrollTop / max) : 0
    return ratio.value
  }

  function isAtBottom(): boolean {
    const el = scroller()
    if (!el) return false
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 2
  }

  // 与 isAtBottom 对称留 2px 容差，抵消缩放后的亚像素误差
  function isAtTop(): boolean {
    const el = scroller()
    if (!el) return false
    return el.scrollTop <= 2
  }

  function onScroll(): void {
    measure()
    if (saveTimer !== null) return
    saveTimer = window.setTimeout(() => {
      saveTimer = null
      void save()
    }, SAVE_INTERVAL)
  }

  async function save(): Promise<void> {
    const bookId = store.meta?.id
    if (!bookId) return
    if (saving) {
      // 上一次写盘还没回来，标记一下，回来后补写最新的进度
      queued = true
      return
    }
    saving = true
    const payload: Progress = {
      bookId,
      chapterIndex: store.currentIndex,
      scrollRatio: clamp01(ratio.value),
      updatedAt: Date.now()
    }
    try {
      await unwrap(window.api.progress.save(payload))
    } catch (error) {
      // 进度写失败不打断阅读，只提示一次，避免滚动时刷屏
      if (!warned) {
        warned = true
        toastError(error, '保存阅读进度失败')
      }
    } finally {
      saving = false
      if (queued) {
        queued = false
        void save()
      }
    }
  }

  async function flush(): Promise<void> {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer)
      saveTimer = null
    }
    measure()
    await save()
  }

  function restore(value: number): void {
    const target = clamp01(value)
    ratio.value = target
    void nextTick(() => {
      if (rafId !== 0) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        rafId = 0
        const el = scroller()
        if (!el) return
        const max = el.scrollHeight - el.clientHeight
        el.scrollTop = max > 0 ? target * max : 0
        measure()
      })
    })
  }

  function page(screens: number): void {
    const el = scroller()
    if (!el) return
    el.scrollBy({ top: screens * el.clientHeight, behavior: 'auto' })
  }

  function onBeforeUnload(): void {
    void flush()
  }

  function attach(): void {
    const el = scroller()
    if (attached || !el) return
    attached = true
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('blur', onBeforeUnload)
  }

  function detach(): void {
    const el = scroller()
    if (el) el.removeEventListener('scroll', onScroll)
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('blur', onBeforeUnload)
    attached = false
    if (rafId !== 0) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    // 卸载时最后落一次盘
    void flush()
  }

  return { ratio, attach, detach, restore, flush, measure, page, isAtBottom, isAtTop }
}

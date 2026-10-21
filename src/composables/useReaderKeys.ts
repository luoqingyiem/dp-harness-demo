import { onMounted, onUnmounted } from 'vue'

export interface ReaderKeyHandlers {
  /** 上一章(-1) / 下一章(1) */
  chapter: (delta: -1 | 1) => void
  /** 翻屏：screens > 0 向下 */
  page: (screens: number) => void
  /** 任意导航按键触发，用来点亮工具栏 */
  activity: () => void
  /** T 键：切换工具栏 */
  toggleToolbar: () => void
  /** Esc：关闭抽屉，或在都没有打开时返回书架 */
  escape: () => void
}

/**
 * 阅读页全局快捷键：
 * ← / PageUp 上翻 0.9 屏；→ / PageDown / 空格 下翻 0.9 屏；
 * [ 或 Ctrl/Cmd+← 上一章；] 或 Ctrl/Cmd+→ 下一章；Esc 关闭/返回；T 切换工具栏。
 */
export function useReaderKeys(handlers: ReaderKeyHandlers): void {
  function isEditable(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null
    if (!el) return false
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
  }

  function onKeydown(event: KeyboardEvent): void {
    if (isEditable(event.target)) return

    if (event.key === 'Escape') {
      handlers.escape()
      return
    }
    if (event.key === 't' || event.key === 'T') {
      handlers.toggleToolbar()
      return
    }

    handlers.activity()
    const mod = event.ctrlKey || event.metaKey

    if (event.key === '[' || (mod && event.key === 'ArrowLeft')) {
      event.preventDefault()
      handlers.chapter(-1)
      return
    }
    if (event.key === ']' || (mod && event.key === 'ArrowRight')) {
      event.preventDefault()
      handlers.chapter(1)
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      handlers.page(-0.9)
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      handlers.page(0.9)
      return
    }
    if (event.key === ' ') {
      event.preventDefault()
      handlers.page(0.9)
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))
}

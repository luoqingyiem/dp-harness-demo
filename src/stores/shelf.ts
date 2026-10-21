import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { BookMeta, Progress } from '@shared/types'
import { toastError, unwrap } from '@/lib/api'

/** 拖拽进来的路径只接受 .txt（大小写不敏感） */
const TXT_PATTERN = /\.txt$/i

export const useShelfStore = defineStore('shelf', () => {
  const books = ref<BookMeta[]>([])
  const progressMap = ref<Record<string, Progress>>({})
  const loading = ref(false)

  /** 书架默认按最近阅读倒序 */
  const sortedBooks = computed<BookMeta[]>(() =>
    [...books.value].sort((a, b) => (b.lastReadAt || b.addedAt) - (a.lastReadAt || a.addedAt))
  )

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      const [list, progress] = await Promise.all([
        unwrap(window.api.library.list()),
        unwrap(window.api.progress.list())
      ])
      books.value = list
      progressMap.value = progress
    } catch (error) {
      toastError(error, '加载书架失败')
    } finally {
      loading.value = false
    }
  }

  async function importByDialog(): Promise<void> {
    try {
      const outcome = await unwrap(window.api.library.import())
      if (!outcome) return
      if (outcome.failure) {
        ElMessage.error(`${outcome.failure.fileName}：${outcome.failure.message}`)
        return
      }
      if (outcome.book) ElMessage.success(`已导入《${outcome.book.title}》`)
      await refresh()
    } catch (error) {
      toastError(error, '导入失败')
    }
  }

  async function importPaths(paths: string[]): Promise<void> {
    const targets = paths.filter((item) => TXT_PATTERN.test(item))
    if (targets.length === 0) {
      ElMessage.warning('只支持导入 .txt 文件')
      return
    }
    try {
      const outcomes = await unwrap(window.api.library.importPaths(targets))
      const failures = outcomes.filter((item) => item.failure !== undefined)
      const succeeded = outcomes.length - failures.length
      for (const item of failures) {
        const reason = item.failure?.message ?? '未知原因'
        const name = item.failure?.fileName ?? '文件'
        ElMessage.error(`${name}：${reason}`)
      }
      if (succeeded > 0) ElMessage.success(`已导入 ${succeeded} 本`)
      if (succeeded > 0 || failures.length > 0) await refresh()
    } catch (error) {
      toastError(error, '导入失败')
    }
  }

  async function remove(id: string): Promise<void> {
    const target = books.value.find((item) => item.id === id)
    const title = target?.title ?? '这本书'
    try {
      await ElMessageBox.confirm(`确定删除《${title}》吗？磁盘上的正文文件也会一并删除。`, '删除书籍', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger'
      })
    } catch {
      // 用户取消，静默返回
      return
    }
    try {
      await unwrap(window.api.library.remove(id))
      ElMessage.success('已删除')
      await refresh()
    } catch (error) {
      toastError(error, '删除失败')
    }
  }

  return { books, progressMap, loading, sortedBooks, refresh, importByDialog, importPaths, remove }
})

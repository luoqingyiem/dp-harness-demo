import type { Progress } from '@shared/types'
import { assertBookId, dataFile } from './paths'
import { JsonFile } from './storage'

type ProgressMap = Record<string, Progress>

const store = new JsonFile<ProgressMap>(() => dataFile('progress.json'), () => ({}))

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function normalizeProgress(value: unknown, bookId: string): Progress | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  const chapterIndex = typeof item.chapterIndex === 'number' && Number.isFinite(item.chapterIndex) ? Math.max(0, Math.trunc(item.chapterIndex)) : 0
  const scrollRatio = typeof item.scrollRatio === 'number' ? clampRatio(item.scrollRatio) : 0
  const updatedAt = typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : 0
  const progress: Progress = {
    bookId: typeof item.bookId === 'string' ? item.bookId : bookId,
    chapterIndex,
    scrollRatio,
    updatedAt
  }
  if (typeof item.pageIndex === 'number' && Number.isFinite(item.pageIndex)) {
    progress.pageIndex = Math.trunc(item.pageIndex)
  }
  return progress
}

function readAll(): ProgressMap {
  const raw = store.read()
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const out: ProgressMap = {}
  for (const [bookId, value] of Object.entries(raw as Record<string, unknown>)) {
    const progress = normalizeProgress(value, bookId)
    if (progress) out[bookId] = progress
  }
  return out
}

/** 全部进度，形状与 Progress 的磁盘格式一致（Record<bookId, Progress>） */
export function listProgress(): ProgressMap {
  return readAll()
}

export function getProgress(bookId: string): Progress | null {
  const id = assertBookId(bookId)
  return readAll()[id] ?? null
}

/** 写入前统一 clamp：chapterIndex ≥ 0、scrollRatio ∈ [0,1] */
export function saveProgress(input: Progress): Progress {
  const bookId = assertBookId(input?.bookId)
  const progress: Progress = {
    bookId,
    chapterIndex: typeof input.chapterIndex === 'number' ? Math.max(0, Math.trunc(input.chapterIndex)) : 0,
    scrollRatio: clampRatio(input.scrollRatio),
    updatedAt: typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt) ? input.updatedAt : Date.now()
  }
  if (typeof input.pageIndex === 'number' && Number.isFinite(input.pageIndex)) {
    progress.pageIndex = Math.trunc(input.pageIndex)
  }
  const all = readAll()
  all[bookId] = progress
  store.write(all)
  return progress
}

export function removeProgress(bookId: string): void {
  const all = readAll()
  if (!(bookId in all)) return
  delete all[bookId]
  store.write(all)
}

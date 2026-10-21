import fs from 'node:fs'
import path from 'node:path'
import type { Chapter, ChapterPayload } from '@shared/types'
import { bookDir } from './paths'
import { codedError, errorMessage, readJsonFile } from './storage'

export interface LoadedBook {
  id: string
  text: string
  chapters: Chapter[]
}

/** 最多缓存 2 本书的完整正文（LRU） */
const CACHE_LIMIT = 2
const cache = new Map<string, LoadedBook>()

function touch(id: string, book: LoadedBook): LoadedBook {
  cache.delete(id)
  cache.set(id, book)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
  return book
}

function sanitizeChapters(raw: unknown, textLength: number): Chapter[] {
  if (!Array.isArray(raw) || raw.length === 0) throw codedError('E_IO', '章节目录缺失或为空，请重新导入本书')
  const chapters: Chapter[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const value = item as Record<string, unknown>
    const rawStart = value['start']
    const rawEnd = value['end']
    if (typeof rawStart !== 'number' || typeof rawEnd !== 'number') continue
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue
    const start = Math.max(0, Math.min(textLength, Math.trunc(rawStart)))
    const end = Math.max(start, Math.min(textLength, Math.trunc(rawEnd)))
    if (end <= start) continue
    const title = typeof value['title'] === 'string' && value['title'].trim().length > 0 ? value['title'] : `第 ${chapters.length + 1} 章`
    chapters.push({ index: chapters.length, title, start, end })
  }
  if (chapters.length === 0) throw codedError('E_IO', '章节目录损坏，请重新导入本书')
  return chapters
}

function readText(file: string, label: string): string {
  if (!fs.existsSync(file)) throw codedError('E_NOT_FOUND', `${label}不存在，请重新导入本书`)
  try {
    return fs.readFileSync(file, 'utf8')
  } catch (err) {
    throw codedError('E_IO', `读取${label}失败：${errorMessage(err)}`)
  }
}

/** 读入一本书的正文与章节（命中缓存则复用） */
export function loadBook(id: string): LoadedBook {
  const cached = cache.get(id)
  if (cached) return touch(id, cached)

  const dir = bookDir(id)
  const text = readText(path.join(dir, 'content.txt'), '正文文件')
  const chaptersFile = path.join(dir, 'chapters.json')
  if (!fs.existsSync(chaptersFile)) throw codedError('E_NOT_FOUND', '章节目录不存在，请重新导入本书')
  const chapters = sanitizeChapters(readJsonFile<unknown>(chaptersFile, []), text.length)
  return touch(id, { id, text, chapters })
}

export function getChapters(id: string): Chapter[] {
  return loadBook(id).chapters
}

/** 首行 trim 后等于章标题时剥掉，避免标题重复显示 */
export function stripTitleLine(raw: string, title: string): string {
  const newline = raw.indexOf('\n')
  const head = newline === -1 ? raw : raw.slice(0, newline)
  const isTitle = title.trim().length > 0 && head.trim() === title.trim()
  const body = isTitle ? (newline === -1 ? '' : raw.slice(newline + 1)) : raw
  return body.replace(/^\n+/, '').trim()
}

/** 取一章正文；index 越界时 clamp 到合法范围 */
export function getChapter(id: string, chapterIndex: number): ChapterPayload {
  const book = loadBook(id)
  const total = book.chapters.length
  const requested = Number.isFinite(chapterIndex) ? Math.trunc(chapterIndex) : 0
  const index = Math.min(total - 1, Math.max(0, requested))
  const chapter = book.chapters[index]
  const raw = book.text.slice(chapter.start, chapter.end)
  return {
    index,
    total,
    title: chapter.title,
    text: stripTitleLine(raw, chapter.title)
  }
}

export function dropBook(id: string): void {
  cache.delete(id)
}

export function clearCache(): void {
  cache.clear()
}

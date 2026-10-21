import type { BookMeta } from '@shared/types'
import { dataFile } from './paths'
import { JsonFile } from './storage'

const BOOK_ID_RE = /^[a-z0-9]{10,32}$/

const store = new JsonFile<BookMeta[]>(() => dataFile('library.json'), () => [])

function isBookMeta(value: unknown): value is BookMeta {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    BOOK_ID_RE.test(item.id) &&
    typeof item.title === 'string' &&
    typeof item.fileName === 'string' &&
    typeof item.encoding === 'string' &&
    typeof item.charCount === 'number' &&
    typeof item.chapterCount === 'number' &&
    typeof item.addedAt === 'number' &&
    typeof item.lastReadAt === 'number' &&
    typeof item.coverHue === 'number'
  )
}

/** 读全部书目（已校验、已去重，未排序） */
function readAll(): BookMeta[] {
  const raw = store.read()
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const books: BookMeta[] = []
  for (const item of raw) {
    if (!isBookMeta(item) || seen.has(item.id)) continue
    seen.add(item.id)
    books.push(item)
  }
  return books
}

/** 书架数据：lastReadAt 倒序 */
export function listBooks(): BookMeta[] {
  return readAll().sort((a, b) => b.lastReadAt - a.lastReadAt || b.addedAt - a.addedAt)
}

export function getBook(id: string): BookMeta | null {
  return readAll().find((book) => book.id === id) ?? null
}

export function addBook(meta: BookMeta): BookMeta {
  const books = readAll().filter((book) => book.id !== meta.id)
  books.push(meta)
  store.write(books)
  return meta
}

/** 局部更新，id 不可被覆盖 */
export function patchBook(id: string, patch: Partial<BookMeta>): BookMeta | null {
  const books = readAll()
  const index = books.findIndex((book) => book.id === id)
  if (index < 0) return null
  const { id: _ignored, ...rest } = patch
  const next: BookMeta = { ...books[index], ...rest, id: books[index].id }
  books[index] = next
  store.write(books)
  return next
}

export function touchBook(id: string, at = Date.now()): BookMeta | null {
  return patchBook(id, { lastReadAt: at })
}

export function removeMeta(id: string): void {
  const books = readAll()
  const next = books.filter((book) => book.id !== id)
  if (next.length !== books.length) store.write(next)
}

/** 判重口径：原始文件名 + 归一化正文字符数 */
export function findDuplicate(fileName: string, charCount: number): BookMeta | null {
  return readAll().find((book) => book.fileName === fileName && book.charCount === charCount) ?? null
}

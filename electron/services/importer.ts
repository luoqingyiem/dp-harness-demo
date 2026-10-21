import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { BookMeta, ImportOutcome } from '@shared/types'
import { normalizeText, splitChapters } from './chapter'
import { decodeBuffer } from './encoding'
import { addBook, findDuplicate, removeMeta } from './library'
import { bookDir, booksDir } from './paths'
import { removeProgress } from './progress'
import { codedError, errorCode, errorMessage, writeFileAtomic, writeJsonFile } from './storage'
import { dropBook } from './textCache'

const MAX_BYTES = 80 * 1024 * 1024
const SLOW_IMPORT_BYTES = 20 * 1024 * 1024

export function titleFromFileName(fileName: string): string {
  const base = path.basename(fileName, path.extname(fileName)).trim()
  return base.length > 0 ? base : fileName
}

/** 由 id 派生 0-359 的封面色相，稳定不变 */
export function hueFromBookId(id: string): number {
  const value = Number.parseInt(id.slice(0, 6), 16)
  if (!Number.isFinite(value)) return 0
  return Math.abs(value) % 360
}

function failure(fileName: string, err: unknown): ImportOutcome {
  return { failure: { fileName, code: errorCode(err), message: errorMessage(err) } }
}

function statSource(filePath: string): fs.Stats {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw codedError('E_BAD_ARGS', '导入路径无效')
  }
  try {
    return fs.statSync(filePath)
  } catch {
    throw codedError('E_NOT_FOUND', '文件不存在或无法访问')
  }
}

function removeDirQuietly(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // 清理失败不覆盖原始错误
  }
}

/**
 * 导入一本 txt：校验 → 解码 → 归一化 → 判重 → 切章 → 落盘 → 写书目。
 * 任何失败都返回 ImportOutcome.failure，不抛异常。
 */
export function importTxtFile(filePath: string): ImportOutcome {
  const fileName = typeof filePath === 'string' && filePath.length > 0 ? path.basename(filePath) : String(filePath)
  try {
    if (path.extname(fileName).toLowerCase() !== '.txt') {
      throw codedError('E_BAD_FILE_TYPE', '只支持导入 .txt 文件')
    }
    const stat = statSource(filePath)
    if (!stat.isFile()) throw codedError('E_IO', '只能导入普通文件')
    if (stat.size === 0) throw codedError('E_EMPTY_FILE', '文件内容为空')
    if (stat.size > MAX_BYTES) {
      throw codedError('E_FILE_TOO_LARGE', `文件超过 ${Math.floor(MAX_BYTES / 1024 / 1024)}MB，暂不支持导入`)
    }
    if (stat.size > SLOW_IMPORT_BYTES) {
      console.warn(`[importer] 大文件导入（${(stat.size / 1024 / 1024).toFixed(1)}MB），可能需要数秒：${fileName}`)
    }

    const buffer = fs.readFileSync(filePath)
    const decoded = decodeBuffer(buffer)
    const text = normalizeText(decoded.text)
    if (text.trim().length === 0) throw codedError('E_EMPTY_FILE', '文件没有可阅读的正文')

    const charCount = text.length
    const duplicate = findDuplicate(fileName, charCount)
    if (duplicate) {
      throw codedError('E_DUPLICATE', `《${duplicate.title}》已存在，无需重复导入`)
    }

    const chapters = splitChapters(text)
    if (chapters.length === 0) throw codedError('E_DECODE_FAILED', '正文解析失败，未识别到任何内容')

    const id = crypto.randomBytes(10).toString('hex')
    const now = Date.now()
    const meta: BookMeta = {
      id,
      title: titleFromFileName(fileName),
      fileName,
      encoding: decoded.encoding,
      charCount,
      chapterCount: chapters.length,
      addedAt: now,
      lastReadAt: now,
      coverHue: hueFromBookId(id)
    }

    const dir = bookDir(id)
    try {
      fs.mkdirSync(dir, { recursive: true })
      writeFileAtomic(path.join(dir, 'content.txt'), text)
      writeJsonFile(path.join(dir, 'chapters.json'), chapters)
      addBook(meta)
    } catch (err) {
      removeDirQuietly(dir)
      throw codedError('E_IO', `写入书籍文件失败：${errorMessage(err)}`)
    }
    return { book: meta }
  } catch (err) {
    return failure(fileName, err)
  }
}

/** 删除书目：书目记录 + 进度 + 磁盘目录（先校验路径落在 books 目录内） */
export function removeBook(id: string): void {
  const dir = path.resolve(bookDir(id))
  const root = path.resolve(booksDir())
  if (dir !== root && !dir.startsWith(root + path.sep)) {
    throw codedError('E_BAD_ARGS', `非法的书目路径：${dir}`)
  }
  removeMeta(id)
  removeProgress(id)
  dropBook(id)
  if (!fs.existsSync(dir)) return
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    throw codedError('E_IO', `删除书籍文件失败：${errorMessage(err)}`)
  }
}

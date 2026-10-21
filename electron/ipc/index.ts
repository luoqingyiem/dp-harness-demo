import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { ImportOutcome, Progress } from '@shared/types'
import { getChapter, getChapters } from '../services/textCache'
import { importTxtFile, removeBook } from '../services/importer'
import { getBook, listBooks } from '../services/library'
import { assertBookId, getDataDir } from '../services/paths'
import { getProgress, listProgress, saveProgress } from '../services/progress'
import { getSettings, saveSettings } from '../services/settings'
import { codedError, errorCode, errorMessage } from '../services/storage'

type Handler = (...args: unknown[]) => unknown

let registered = false

function register(channel: string, handler: Handler): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      const data = await handler(...args)
      return { ok: true as const, data }
    } catch (err) {
      return { ok: false as const, code: errorCode(err), message: errorMessage(err) }
    }
  })
}

function asObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw codedError('E_BAD_ARGS', `参数 ${name} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function asFiniteNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw codedError('E_BAD_ARGS', `参数 ${name} 必须是合法数字`)
  }
  return value
}

function asPathList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw codedError('E_BAD_ARGS', '导入路径列表为空')
  const list = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  if (list.length === 0) throw codedError('E_BAD_ARGS', '导入路径列表无效')
  return list.slice(0, 200)
}

function asProgress(value: unknown): Progress {
  const raw = asObject(value, 'progress')
  const progress: Progress = {
    bookId: assertBookId(raw['bookId']),
    chapterIndex: asFiniteNumber(raw['chapterIndex'], 'chapterIndex'),
    scrollRatio: asFiniteNumber(raw['scrollRatio'], 'scrollRatio'),
    updatedAt: typeof raw['updatedAt'] === 'number' && Number.isFinite(raw['updatedAt']) ? raw['updatedAt'] : Date.now()
  }
  if (typeof raw['pageIndex'] === 'number' && Number.isFinite(raw['pageIndex'])) {
    progress.pageIndex = raw['pageIndex']
  }
  return progress
}

async function openImportDialog(): Promise<ImportOutcome | null> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const options = {
    title: '导入 TXT 电子书',
    properties: ['openFile' as const],
    filters: [{ name: 'TXT 文本文件', extensions: ['txt'] }]
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return importTxtFile(result.filePaths[0])
}

export function registerIpcHandlers(): void {
  if (registered) return
  registered = true

  register('app:dataDir', () => getDataDir())
  register('app:openDataDir', async () => {
    const info = getDataDir()
    const message = await shell.openPath(info.dir)
    if (message) throw codedError('E_IO', `无法打开数据目录：${message}`)
  })
  register('app:version', () => app.getVersion())

  register('library:list', () => listBooks())
  register('library:get', (id) => getBook(assertBookId(id)))
  register('library:import', () => openImportDialog())
  register('library:importPaths', (value) => asPathList(value).map((filePath) => importTxtFile(filePath)))
  register('library:remove', (id) => {
    removeBook(assertBookId(id))
  })

  register('book:chapters', (id) => getChapters(assertBookId(id)))
  register('book:content', (id, index) => getChapter(assertBookId(id), asFiniteNumber(index, 'chapterIndex')))

  register('progress:list', () => listProgress())
  register('progress:get', (id) => getProgress(assertBookId(id)))
  register('progress:save', (value) => {
    saveProgress(asProgress(value))
  })

  register('settings:get', () => getSettings())
  register('settings:save', (value) => saveSettings(asObject(value, 'settings')))
}

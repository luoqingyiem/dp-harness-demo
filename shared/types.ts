/** 主进程与渲染进程共用的类型定义，禁止引入任何运行时依赖（除本文件内的常量） */

export type ThemeName = 'light' | 'sepia' | 'dark'
export type FontFamilyName = 'serif' | 'sans'

export interface BookMeta {
  id: string
  /** 展示名，取自文件名去扩展名 */
  title: string
  /** 原始文件名，仅用于展示与判重 */
  fileName: string
  /** 导入时实际采用的编码，便于排查乱码 */
  encoding: string
  /** 归一化后正文的字符数（UTF-16 code unit） */
  charCount: number
  chapterCount: number
  addedAt: number
  lastReadAt: number
  /** 0-359，占位封面用 */
  coverHue: number
}

export interface Chapter {
  index: number
  title: string
  /** 归一化正文中的字符偏移，含 */
  start: number
  /** 不含 */
  end: number
}

export interface Progress {
  bookId: string
  chapterIndex: number
  /** 章内滚动百分比 0~1 */
  scrollRatio: number
  /** 预留：真分页模式的页码 */
  pageIndex?: number
  updatedAt: number
}

export interface ReaderSettings {
  schemaVersion: number
  fontSize: number
  lineHeight: number
  paragraphSpacing: number
  maxWidth: number
  theme: ThemeName
  fontFamily: FontFamilyName
  /** 滚到章末自动进入下一章 */
  autoNextChapter: boolean
  /** 实际生效的数据目录，只读回填，由主进程写入 */
  dataDir: string
}

export const SETTINGS_LIMITS = {
  fontSize: [14, 32],
  lineHeight: [1.4, 2.4],
  paragraphSpacing: [0, 2],
  maxWidth: [560, 1200]
} as const

export const SCHEMA_VERSION = 1

export const DEFAULT_SETTINGS: ReaderSettings = {
  schemaVersion: SCHEMA_VERSION,
  fontSize: 19,
  lineHeight: 1.85,
  paragraphSpacing: 0.9,
  maxWidth: 760,
  theme: 'light',
  fontFamily: 'serif',
  autoNextChapter: false,
  dataDir: ''
}

export interface ChapterPayload {
  index: number
  total: number
  title: string
  text: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

export interface ImportFailure {
  fileName: string
  code: string
  message: string
}

export interface ImportOutcome {
  book?: BookMeta
  failure?: ImportFailure
}

export interface DataDirInfo {
  dir: string
  source: 'exe' | 'portable' | 'development' | 'localappdata' | 'userdata'
  degraded: boolean
  reason: string
}

/** preload 通过 contextBridge 暴露到 window.api 的完整接口 */
export interface TxtReaderApi {
  app: {
    dataDir(): Promise<IpcResult<DataDirInfo>>
    openDataDir(): Promise<IpcResult<void>>
    version(): Promise<IpcResult<string>>
    /** Electron 32+ 已移除 File.path，必须走 webUtils */
    getPathForFile(file: File): string
  }
  library: {
    list(): Promise<IpcResult<BookMeta[]>>
    get(id: string): Promise<IpcResult<BookMeta | null>>
    import(): Promise<IpcResult<ImportOutcome | null>>
    importPaths(paths: string[]): Promise<IpcResult<ImportOutcome[]>>
    remove(id: string): Promise<IpcResult<void>>
  }
  book: {
    chapters(id: string): Promise<IpcResult<Chapter[]>>
    content(id: string, chapterIndex: number): Promise<IpcResult<ChapterPayload>>
  }
  progress: {
    list(): Promise<IpcResult<Record<string, Progress>>>
    get(id: string): Promise<IpcResult<Progress | null>>
    save(progress: Progress): Promise<IpcResult<void>>
  }
  settings: {
    get(): Promise<IpcResult<ReaderSettings>>
    save(patch: Partial<ReaderSettings>): Promise<IpcResult<ReaderSettings>>
  }
}

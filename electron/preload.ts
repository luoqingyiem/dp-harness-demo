import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  BookMeta,
  Chapter,
  ChapterPayload,
  DataDirInfo,
  ImportOutcome,
  IpcResult,
  Progress,
  ReaderSettings,
  TxtReaderApi
} from '@shared/types'

function invoke<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>
}

const api: TxtReaderApi = {
  app: {
    dataDir: () => invoke<DataDirInfo>('app:dataDir'),
    openDataDir: () => invoke<void>('app:openDataDir'),
    version: () => invoke<string>('app:version'),
    getPathForFile: (file: File) => webUtils.getPathForFile(file)
  },
  library: {
    list: () => invoke<BookMeta[]>('library:list'),
    get: (id: string) => invoke<BookMeta | null>('library:get', id),
    import: () => invoke<ImportOutcome | null>('library:import'),
    importPaths: (paths: string[]) => invoke<ImportOutcome[]>('library:importPaths', paths),
    remove: (id: string) => invoke<void>('library:remove', id)
  },
  book: {
    chapters: (id: string) => invoke<Chapter[]>('book:chapters', id),
    content: (id: string, chapterIndex: number) => invoke<ChapterPayload>('book:content', id, chapterIndex)
  },
  progress: {
    list: () => invoke<Record<string, Progress>>('progress:list'),
    get: (id: string) => invoke<Progress | null>('progress:get', id),
    save: (progress: Progress) => invoke<void>('progress:save', progress)
  },
  settings: {
    get: () => invoke<ReaderSettings>('settings:get'),
    save: (patch: Partial<ReaderSettings>) => invoke<ReaderSettings>('settings:save', patch)
  }
}

contextBridge.exposeInMainWorld('api', api)

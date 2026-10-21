import fs from 'node:fs'
import path from 'node:path'

/** 带错误码的 Error，IPC 层据此回填 IpcResult.code */
export interface CodedError extends Error {
  code: string
}

export function codedError(code: string, message: string): CodedError {
  const err = new Error(message) as CodedError
  err.code = code
  return err
}

export function errorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code
    if (typeof code === 'string' && code.length > 0) return code
  }
  return 'E_IO'
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err.length > 0) return err
  return '未知错误'
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

/** 写 tmp → fsync → rename，避免断电留下半截文件 */
export function writeFileAtomic(file: string, data: string | Buffer): void {
  ensureDir(path.dirname(file))
  const tmp = `${file}.tmp`
  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeFileSync(fd, data)
    try {
      fs.fsyncSync(fd)
    } catch {
      // 部分文件系统（网络盘/ramdisk）不支持 fsync，忽略即可
    }
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, file)
}

/** 读 JSON，任何异常（文件缺失、半截内容、非法 JSON）都降级到 fallback */
export function readJsonFile<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    if (raw.trim().length === 0) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJsonFile(file: string, value: unknown): void {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`)
}

/** 文件路径可以在调用时才解析（数据目录要等 app ready 之后才确定） */
export type FilePathLike = string | (() => string)

export class JsonFile<T> {
  private readonly resolvePath: () => string
  private readonly fallback: () => T

  constructor(file: FilePathLike, fallback: () => T) {
    this.resolvePath = typeof file === 'function' ? file : () => file
    this.fallback = fallback
  }

  get filePath(): string {
    return this.resolvePath()
  }

  read(): T {
    return readJsonFile<T>(this.filePath, this.fallback())
  }

  write(value: T): T {
    writeJsonFile(this.filePath, value)
    return value
  }

  update(fn: (current: T) => T): T {
    return this.write(fn(this.read()))
  }
}

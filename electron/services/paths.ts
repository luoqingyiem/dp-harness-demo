import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { DataDirInfo } from '@shared/types'
import { codedError } from './storage'

const DATA_ROOT_NAME = 'data'
const PROBE_FILE = '.write-test'
const BOOK_ID_RE = /^[a-z0-9]{10,32}$/

let current: DataDirInfo | null = null

interface Candidate {
  dir: string
  source: DataDirInfo['source']
  label: string
}

/** mkdir + 写探测文件 + 删除，任一环节失败即视为不可写 */
function probeWritable(dir: string): { ok: boolean; reason: string } {
  const probe = path.join(dir, PROBE_FILE)
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(probe, 'ok', 'utf8')
    fs.rmSync(probe, { force: true })
    return { ok: true, reason: '' }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

/** portable 环境变量 → 打包后 exe 同级 → 开发模式项目目录 → LOCALAPPDATA → userData */
function buildCandidates(): Candidate[] {
  const list: Candidate[] = []
  const portableDir = process.env['PORTABLE_EXECUTABLE_DIR']
  if (portableDir) {
    list.push({ dir: path.join(portableDir, DATA_ROOT_NAME), source: 'portable', label: '便携版所在目录' })
  }
  if (app.isPackaged) {
    list.push({ dir: path.join(path.dirname(app.getPath('exe')), DATA_ROOT_NAME), source: 'exe', label: '程序所在目录' })
  } else {
    list.push({ dir: path.join(app.getAppPath(), DATA_ROOT_NAME), source: 'development', label: '开发项目目录' })
  }
  const localAppData = process.env['LOCALAPPDATA']
  if (localAppData) {
    list.push({ dir: path.join(localAppData, 'txt-reader', DATA_ROOT_NAME), source: 'localappdata', label: '用户本地应用数据目录' })
  }
  list.push({ dir: app.getPath('userData'), source: 'userdata', label: 'Electron 用户数据目录' })
  return list
}

/** 逐级探测，第一个可写目录生效；必须在 app ready 之后调用 */
export function initDataDir(force = false): DataDirInfo {
  if (current && !force) return current
  const candidates = buildCandidates()
  const reasons: string[] = []
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i]
    const probe = probeWritable(candidate.dir)
    if (!probe.ok) {
      reasons.push(`${candidate.label}（${candidate.dir}）不可写：${probe.reason}`)
      continue
    }
    current = {
      dir: path.resolve(candidate.dir),
      source: candidate.source,
      degraded: i > 0,
      reason: i > 0 ? `${reasons.join('；')}` : ''
    }
    return current
  }
  throw codedError('E_IO', `没有任何可写的数据目录：${reasons.join('；')}`)
}

export function getDataDir(): DataDirInfo {
  return current ?? initDataDir()
}

export function booksDir(): string {
  return path.join(getDataDir().dir, 'books')
}

export function dataFile(name: string): string {
  return path.join(getDataDir().dir, name)
}

/** 书目录名只允许小写字母数字，长度 10~32；非法直接抛错 */
export function assertBookId(id: unknown): string {
  if (typeof id !== 'string' || !BOOK_ID_RE.test(id)) {
    throw codedError('E_BAD_ARGS', `非法的书目标识：${String(id)}`)
  }
  return id
}

/** 路径穿越防护：最终路径必须落在 books 目录内 */
export function bookDir(id: string): string {
  const validId = assertBookId(id)
  const root = path.resolve(booksDir())
  const target = path.resolve(path.join(root, validId))
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw codedError('E_BAD_ARGS', `非法的书目路径：${target}`)
  }
  return target
}

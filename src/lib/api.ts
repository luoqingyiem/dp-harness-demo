import { ElMessage } from 'element-plus'
import type { IpcResult } from '@shared/types'

/** 带业务错误码的异常，调用方可按 code 分支处理 */
export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** 拆 IPC 信封：ok 取 data，失败抛 ApiError */
export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise
  if (result.ok) return result.data
  throw new ApiError(result.code, result.message)
}

/** 从任意异常里取出可展示的文案 */
export function errorMessage(error: unknown, fallback = '操作失败'): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

/** 统一错误提示：用户只看到一句话，细节进控制台 */
export function toastError(error: unknown, fallback = '操作失败'): string {
  const message = errorMessage(error, fallback)
  ElMessage.error(message)
  console.error('[txt-reader]', error)
  return message
}

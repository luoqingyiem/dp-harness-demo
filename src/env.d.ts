/// <reference types="vite/client" />

import type { TxtReaderApi } from '@shared/types'

declare global {
  interface Window {
    /** preload 通过 contextBridge 暴露的白名单接口 */
    api: TxtReaderApi
  }
}

export {}

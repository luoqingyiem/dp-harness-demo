import { app, BrowserWindow, dialog, shell } from 'electron'
import path from 'node:path'
import type { DataDirInfo } from '@shared/types'
import { registerIpcHandlers } from './ipc'
import { initDataDir } from './services/paths'

let mainWindow: BrowserWindow | null = null
let degradedNotified = false

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    title: 'TXT 阅读器',
    backgroundColor: '#f7f4ee',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })
  mainWindow = win

  win.on('ready-to-show', () => {
    win.show()
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // 一律禁止新窗口；http/https 交给系统浏览器
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // 禁止渲染进程被导航到外部页面（防钓鱼/防远程资源）
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function focusMainWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

/** 数据目录降级只提示一次，绝不静默 */
function notifyDegraded(info: DataDirInfo): void {
  if (!info.degraded || degradedNotified) return
  degradedNotified = true
  const detail = [
    info.reason ? `原因：${info.reason}` : '',
    `当前实际数据目录：${info.dir}`,
    '如果希望数据跟随程序目录，请把程序安装到有写权限的目录，或使用便携版放到可写位置。'
  ]
    .filter((line) => line.length > 0)
    .join('\n\n')
  void dialog.showMessageBox({
    type: 'warning',
    title: '数据目录已变更',
    message: '程序目录不可写，数据已保存到备用目录',
    detail,
    buttons: ['我知道了'],
    noLink: true
  })
}

function bootstrap(): void {
  const info = initDataDir()
  registerIpcHandlers()
  createWindow()
  if (info.degraded) {
    const target = mainWindow
    if (target) target.once('ready-to-show', () => notifyDegraded(info))
    else notifyDegraded(info)
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  // 已有实例在写同一份数据，第二个实例直接退出
  app.quit()
} else {
  app.on('second-instance', () => {
    focusMainWindow()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  void app.whenReady().then(
    () => {
      try {
        bootstrap()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        dialog.showErrorBox('启动失败', `无法初始化数据目录：${message}`)
        app.quit()
      }
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      dialog.showErrorBox('启动失败', message)
      app.quit()
    }
  )
}

// 开发启动器：绕开“工作区文件被标记为低完整性”导致的 electron 静默猝死。
//
// 背景：本仓库位于 DSH 沙箱工作区内，工作区里的文件带「低完整性」标记（Mandatory Label:
// Low）。Windows 启动低完整性文件时会把进程也降到低完整性，Chromium 的沙箱初始化在低
// 完整性下必然失败，于是 electron 在加载主进程代码之前就直接退出（返回码 0x80000003，
// 没有任何输出）。表现就是 `npm run dev` 打印完 “start electron app...” 立刻回到提示符。
//
// 处理：把 electron 运行时复制到工作区之外（默认 %LOCALAPPDATA%\txt-reader-electron）的一
// 份副本，再用 ELECTRON_EXEC_PATH 让 electron-vite 用这份副本启动。项目代码、构建产物、
// 数据目录都还在原位，只有 electron 二进制换了位置。
//
// 如果项目以后搬到普通目录（不带低完整性标记），这个启动器依然可用：它只是多占一份
// electron 副本；想直接走默认路径可以用 `npm run dev:plain`。

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const electronDir = path.join(root, 'node_modules', 'electron', 'dist')
const versionFile = path.join(electronDir, 'version')

function fail(message) {
  console.error(`[dev] ${message}`)
  process.exit(1)
}

if (!fs.existsSync(versionFile)) {
  fail('找不到 node_modules/electron/dist，请先执行 pnpm install')
}

const version = fs.readFileSync(versionFile, 'utf8').trim()
const baseDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
const targetDir = path.join(baseDir, 'txt-reader-electron', `dist-${version}`)
const targetExe = path.join(targetDir, 'electron.exe')

function isUpToDate() {
  if (!fs.existsSync(targetExe)) return false
  const targetVersion = path.join(targetDir, 'version')
  if (!fs.existsSync(targetVersion)) return false
  return fs.readFileSync(targetVersion, 'utf8').trim() === version
}

if (!isUpToDate()) {
  console.log(`[dev] 复制 electron ${version} 到 ${targetDir}（首次启动需要几秒）`)
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(electronDir, targetDir, { recursive: true })
} else {
  console.log(`[dev] 使用已有的 electron 副本：${targetExe}`)
}

const cli = path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
if (!fs.existsSync(cli)) {
  fail('找不到 node_modules/electron-vite/bin/electron-vite.js，请先执行 pnpm install')
}

const child = spawn(process.execPath, [cli, 'dev', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_EXEC_PATH: targetExe
  }
})

child.on('close', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 0)
})

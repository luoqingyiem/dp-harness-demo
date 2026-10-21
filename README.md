# TXT 阅读器（离线电子书 MVP）

基于 **Electron + electron-vite + Vue 3 + Element Plus** 的桌面端离线 TXT 阅读器。只支持 `.txt`，全程不联网、不登录、不上传内容。

设计文档见 [docs/design-txt-reader.md](docs/design-txt-reader.md)。

## 功能（MVP）

- **导入**：系统文件框或把 `.txt` 直接拖进窗口；自动识别 UTF-8 / UTF-8 BOM / GBK / GB18030 / UTF-16，不乱码
- **分章**：自动识别「第X章」等标题生成目录，剔除开头目录页造成的空章节；无章节标记的文本按长度兜底分节
- **书架**：渐变占位封面、章节数、阅读进度、按最近阅读排序、删除
- **阅读**：章节内滚动、目录抽屉跳转、字号/行高/段间距/内容宽度/字体可调、亮色/护眼/夜间三主题
- **进度**：滚动 500ms 节流落盘，关窗重开回到原位（章内百分比，改字号不失效）
- **快捷键**：`←/→`/`PageUp/Down`/`空格` 翻屏，`[`/`]` 切章，`T` 显隐工具栏，`Esc` 返回

## 快速开始

```bash
pnpm install     # 首次安装；若 electron 二进制下载失败，见下方"常见问题"
pnpm dev         # 开发模式，热更新
pnpm build       # 生产构建到 out/
pnpm test        # 单元测试（vitest）
pnpm typecheck   # vue-tsc 类型检查
pnpm dist        # 打 Windows 安装包 + 便携版到 release/
```

### 验收用样书

```bash
node scripts/gen-samples.mjs
```

会在 `samples/` 生成三个文件（不进版本库）：带目录页的 UTF-8、同内容的 GBK 版、无章节标记版。

## 数据存放位置

数据默认放在**可执行文件同级的 `data/` 目录**（便携，可整目录拷走）。

开发模式下即项目根的 `./data/`；打包后是 exe 同级目录；便携版通过 `PORTABLE_EXECUTABLE_DIR` 定位真实位置。程序目录不可写时按 `%LOCALAPPDATA%\txt-reader\data` → `userData` 逐级降级，**并在启动时弹窗明确告知实际路径**（不静默降级）。

```
data/
├─ library.json      # 书目
├─ progress.json     # 阅读进度
├─ settings.json     # 阅读设置
└─ books/<id>/
   ├─ content.txt    # 归一化后的 UTF-8 正文
   └─ chapters.json  # 章节索引（字符偏移）
```

删掉 `data/` 等于清空书架和进度；删除单本书请在书架里操作。

## 常见问题

- **`pnpm dev` 打印完 `start electron app...` 就回到提示符，没有窗口也没有报错**：说明 electron 进程在加载主进程代码之前就退出了（典型返回码 `0x80000003`）。最常见的原因是**项目所在的目录被标记为「低完整性」**（本项目放在 DSH 沙箱工作区内时就是这种情况）：Windows 启动低完整性文件时会把进程一起降到低完整性，Chromium 的沙箱初始化必然失败，于是静默退出。

  本仓库的 `pnpm dev` 因此走 `scripts/dev.mjs`：它把 electron 运行时复制到 `%LOCALAPPDATA%\txt-reader-electron\dist-<版本>\`，再用 `ELECTRON_EXEC_PATH` 让 electron-vite 从这份工作区之外的副本启动（项目代码、构建产物、`data/` 都还在原位）。想直接走默认路径用 `pnpm dev:plain`。

  注意：`pnpm dist` 的产物会落在本目录并继承低完整性标记，便携版 / `release/win-unpacked` 里的 exe 在本机同样起不来；要出可用的安装包，请在普通目录（不带低完整性标记）里构建，或把产物复制到普通目录后再分发。

- **`pnpm install` 时 electron 二进制没下载下来**：设置镜像后重装，或手动把 `electron-v*.*.*-win32-x64.zip` 解压到 `node_modules/electron/dist/` 并写 `path.txt`（内容为 `electron.exe`）。

  ```bash
  ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install
  ```

- **`Cannot find package 'cac'` / `vue-tsc` 启动失败**：本机 pnpm 的隔离式 node_modules 布局在 Windows 上会让 Node 解析不到包内依赖。仓库已通过 `.npmrc` + `pnpm-workspace.yaml` 固定 `nodeLinker: hoisted`，删掉 `node_modules` 重装即可。

## 已知限制

- 只支持 `.txt`（EPUB/PDF 未做，解析层已按可扩展方式拆分）
- 长章节靠 `content-visibility` 优化，不是虚拟列表；单章超过百万字仍可能卡
- 被识别为目录的文字会留在第一章正文开头（保证章节偏移覆盖全文、不丢内容）
- 不支持书签、批注、全文搜索、云同步

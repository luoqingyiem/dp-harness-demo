# TXT 离线阅读器 — MVP 设计文档

> 状态：**已确认，实施中**　｜　版本：v1.0　｜　平台：仅 Windows　｜　范围：仅本地 `.txt`，单机离线，零网络依赖
> 技术栈：Electron + electron-vite + Vue 3 + TypeScript + Pinia + Element Plus

---

## 1. 背景与目标

做一个桌面端离线电子书阅读器。用户把本地 `.txt` 文件导入应用，书架统一管理，打开后按章节阅读，退出后下次自动回到上次读到的位置。全程不联网、不登录、不上传内容。

**MVP 要回答的核心问题：** 一个 10MB 的 GBK 编码中文 txt，能不能在 2 秒内导入、打开流畅、进度不丢。其它都是加分项。

### 1.1 目标（Goals）

| # | 目标 | 可验证的指标 |
|---|---|---|
| G1 | 导入任意常见编码的中文 txt 不乱码 | UTF-8 / UTF-8 BOM / GBK / GB18030 / UTF-16 全通过 |
| G2 | 自动切分章节并生成目录 | 标准 `第X章` 文本识别率 ≥ 95%，可点击跳转 |
| G3 | 阅读体验可调到舒适 | 字号、行高、三种主题（亮/暗/护眼）、内容区最大宽度可调 |
| G4 | 进度永不丢失 | 关窗后重开，停在同一章同一屏（误差 ≤ 1 屏） |
| G5 | 书架可用 | 导入、删除、按最近阅读排序 |
| G6 | 大文件不卡死 | 10MB 文件：导入 < 2s，打开 < 300ms，滚动 60fps |

### 1.2 非目标（Non-Goals，MVP 明确不做）

- EPUB / PDF / MOBI / AZW3（架构上为多格式预留，实现不做）
- 全文搜索、书签、批注、划线
- 阅读时长统计、云同步、多设备
- 字体文件导入、TTS 朗读、翻译查词
- 图片内嵌（TXT 本身无图）、脚注、竖排
- 自动更新、代码签名（先出免装压缩包，签名放后续）

---

## 2. 阅读模式：章节内滚动（已确认）

不做真分页（CSS 多栏切页）。阅读页 = 一次渲染当前一章的流式滚动容器，进度用「章索引 + 章内百分比」表达。

**由此确定的三条实现约束：**

1. 进度不存页码。改字号、拉窗口、切主题都不会让进度失效——这是选滚动模式最大的收益。
2. 章节切换必须是**整章替换**，不能用滚动连续加载（否则"当前第几章"的判定会和进度模型打架）。滚到章末停下，由用户点击/快捷键进下一章；`滚到底自动续章` 默认关闭，可在设置里开启。
3. `Progress.pageIndex` 字段保留但恒为 `undefined`，为 v1.1 的真分页留迁移位。加翻页时只需在 `scrollRatio` 与页码之间做一次映射，磁盘格式不用变。

**滚动模式的已知代价**（接受）：没有纸张翻页感；在超大章节（> 20 万字）里"章内百分比"对用户的方位感弱，靠底部状态条的「第 N/M 章 · 全书 P%」补偿。

---

## 3. 总体架构

Electron 三进程模型，所有文件 I/O 与解析都在主进程，渲染进程只负责画 UI。

```
┌─────────────────────────────────────────────────────────────┐
│ Main Process (Node)                                         │
│  ┌───────────┐  ┌──────────┐  ┌───────────────────────────┐  │
│  │ ipc/      │→ │ services │→ │ storage (userData/)       │  │
│  │ handlers  │  │ importer │  │  library.json             │  │
│  │           │  │ chapter  │  │  progress.json            │  │
│  │           │  │ library  │  │  settings.json            │  │
│  │           │  │ reader   │  │  books/<id>/content.txt   │  │
│  └───────────┘  └──────────┘  │  books/<id>/chapters.json │  │
│        ↑        字符串缓存(最多2本)                          │  │
└────────┼────────────────────────────────────────────────────┘
         │ ipcRenderer.invoke / 结构化克隆
┌────────┼────────────────────────────────────────────────────┐
│ Preload │ contextBridge.exposeInMainWorld('api', {...})     │
│         │ 白名单方法，无 node 能力外泄                        │
└────────┼────────────────────────────────────────────────────┘
┌────────┼────────────────────────────────────────────────────┐
│ Renderer (Vue 3 + Pinia + vue-router, hash 模式)            │
│  ShelfView   —— 书架                                        │
│  ReaderView  —— 阅读页（目录抽屉 / 工具栏 / 设置面板）        │
└─────────────────────────────────────────────────────────────┘
```

**安全基线（硬性要求）**

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: false`（preload 需要 Node 内置模块则设 false，其余保持默认）
- 渲染进程无 `fs`，只能调 preload 白名单方法
- `webSecurity: true`，不加载任何远程资源；字体用系统字体栈，禁止 CDN
- 主进程对 `bookId` 做格式校验（`/^[a-z0-9]{10,32}$/`），所有路径用 `path.join(booksDir, id)` 后再断言 `startsWith(booksDir)`，防路径穿越
- `setWindowOpenHandler` 一律 deny

**为什么解析放主进程：** 避免把几 MB 的 Buffer 通过 IPC 传两次；主进程用 `iconv-lite` 解码后只把"按章切片后的字符串"按需返给渲染进程。

---

## 4. 数据结构

### 4.1 类型定义（`shared/types.ts`，主/渲染共用）

```ts
export interface BookMeta {
  id: string;            // nanoid(16)
  title: string;         // 文件名去扩展名
  fileName: string;      // 原始文件名，仅展示
  encoding: string;      // 'UTF-8' | 'GB18030' | 'UTF-16LE' ...
  charCount: number;     // 正文字符数（UTF-16 code unit）
  chapterCount: number;
  addedAt: number;       // epoch ms
  lastReadAt: number;
  coverHue: number;      // 0-359，由 id 派生，用于占位封面渐变
}

export interface Chapter {
  index: number;         // 0-based
  title: string;
  start: number;         // 归一化文本中的字符偏移，含
  end: number;           // 不含
}

export interface Progress {
  bookId: string;
  chapterIndex: number;
  scrollRatio: number;   // 章内滚动百分比 0~1
  pageIndex?: number;    // 预留：翻页模式
  updatedAt: number;
}

export interface ReaderSettings {
  fontSize: number;      // 16~32，默认 19
  lineHeight: number;    // 1.5~2.2，默认 1.85
  theme: 'light' | 'sepia' | 'dark';
  fontFamily: 'serif' | 'sans';
  maxWidth: number;      // 内容区最大宽度 px，600~1200，默认 760
  paragraphSpacing: number; // 段间距 em，0~1.5，默认 0.9
}
```

### 4.2 数据目录：可执行文件同级（已确认）

数据放在 exe 同级的 `data/` 目录，便携、可整目录拷走。**但"同级目录"在三种运行形态下指向不同位置，必须分支解析**，否则装到 `Program Files` 或跑 portable 版时数据会写错地方。

```ts
// electron/services/paths.ts
export function resolveDataDir(): string {
  // ① portable 版：electron-builder 会把 exe 解压到 %TEMP% 下运行，
  //    app.getPath('exe') 指向临时目录！真实所在目录由这个环境变量给出
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  if (portableDir) return path.join(portableDir, 'data')

  // ② 已打包（安装版/绿色版）：exe 同级
  if (app.isPackaged) return path.join(path.dirname(app.getPath('exe')), 'data')

  // ③ 开发模式：项目根 ./data（app.getAppPath() 返回 package.json 所在目录）
  return path.join(app.getAppPath(), 'data')
}
```

**可写性探测 + 兜底（必须做）**：Windows 下若用户把程序装进 `C:\Program Files\`，普通用户对该目录**无写权限**，UAC 虚拟化在新清单下也不生效。启动时按下面顺序探测，第一个写成功的目录生效：

1. `resolveDataDir()`
2. 失败 → `path.join(process.env.LOCALAPPDATA!, 'txt-reader', 'data')`
3. 再失败 → `app.getPath('userData')`

探测方式：尝试 `mkdir -p` + 写一个 `.write-test` 文件再删除。发生降级时用一次性 toast 明确告知实际数据位置（**不允许静默降级**——用户以为数据在 U 盘上，实际在 C 盘，这是数据丢失投诉的头号来源）。实际路径记在 `settings.json` 的 `dataDir` 字段并显示在"关于"里。

**由此衍生的三条约束**

- **单实例锁**（`app.requestSingleInstanceLock()`）：两个实例同时写同一份 `progress.json` 会互相覆盖。
- `data/` 加入 `.gitignore`；安装版卸载时 electron-builder 默认**不删**该目录（数据保留，符合预期）。
- 目录名带 `.` 前缀的隐藏文件一律不读，避免把系统生成的 `Thumbs.db`、`desktop.ini` 当书目。

### 4.3 磁盘布局

```
<数据根目录>/
├─ library.json                  # BookMeta[]
├─ progress.json                 # Record<bookId, Progress>
├─ settings.json                 # ReaderSettings
├─ .write-test                   # 启动探测用，写完即删
└─ books/
   └─ <bookId>/
      ├─ content.txt             # 解码+归一化后的 UTF-8 正文（\n 换行，去 BOM）
      └─ chapters.json           # Chapter[]
```

**设计取舍**

- **正文单独存归一化后的 UTF-8 拷贝**，而不是每次打开重新读原文件 + 重新解码。理由：① 原文件可能被移动/删除/改名；② 避免每次打开都做一次 GBK 解码和正则切章；③ 归一化保证 `Chapter.start/end` 偏移永久有效。
- **`library.json` 与 `progress.json` 分离**：进度写入极频繁（滚动节流后约 2 次/秒），必须避免每次都重写整份书目。`library.json` 只在导入/删除时写。
- **原子写**：所有 JSON 写入走 `write tmp → fsync → rename`，防断电产生半截文件；读失败按"用默认值重建"降级，不阻塞启动。
- 空间代价：一本 10MB GBK 书 → 归一化后约 13MB UTF-8。可接受；删除书目时 `rm -rf books/<id>`。

### 4.4 字符串偏移的坑（必须遵守）

`start/end` 是 JS 字符串的**字符下标**（UTF-16 code unit），不是字节偏移。因此：

- 切章必须在**同一份归一化字符串**上做，`slice(start, end)` 的语义才稳定
- 主进程按 `bookId` 缓存最近 2 本书的完整正文（`Map<string, string>`，LRU），避免每次翻章重读磁盘
- 极端情况（surrogate pair / emoji）不需要特殊处理，因为始终用同一字符串切片，不会错位

---

## 5. 核心模块设计

### 5.1 导入流水线（`services/importer.ts`）

```
用户点「导入」或拖入文件
  ↓ ipc: library.import()  （主进程弹 dialog.showOpenDialog，filters: txt）
readFile → Buffer
  ↓ ① 编码探测
  UTF-8 BOM? → 剥 BOM，=UTF-8
  UTF-16 BOM (FF FE / FE FF)? → 对应解码
  buffer.isUtf8(buf)? → UTF-8
  否则 → 在 GB18030 / BIG5 / UTF-16LE 候选中做乱码打分，取最低者
  ↓ ② 解码（iconv-lite）
  ↓ ③ 归一化：去 BOM、\r\n|\r → \n、全角空格保留、连续 3+ 空行压成 2
  ↓ ④ 章节切分（5.2）
  ↓ ⑤ 落盘：content.txt + chapters.json，append 到 library.json
  ↓ 返回 BookMeta（不返回正文）
```

**乱码兜底指标**：解码后统计 `U+FFFD` 数量 + 常见乱码片段（`锟斤拷`、`烫烫烫`、`Ã`/`â€` 序列）占比，最低者胜出。探测结果与最终采用编码都记进 `BookMeta.encoding` 便于排查。

**大文件策略**

| 文件大小 | 策略 |
|---|---|
| < 20MB | 全程主进程同步 + 导入时显示 loading，简单可靠 |
| 20~80MB | `readFile` + 解码仍在主进程，但切章用 `worker_threads`，UI 不冻结 |
| > 80MB | MVP 直接拒绝并提示"文件过大"，写入 roadmap |

> 命中 20MB 以上分支时，主进程保留 worker 池的抽象接口，MVP 可先只实现同步版本，用 `> 20MB` 的 toast 提示"导入较慢"。

**重复导入**：按 `fileName + charCount` 判重，命中则提示"已存在，是否覆盖进度/重新导入"。

### 5.2 章节切分（`services/chapter.ts`，纯函数 + 单测）

按优先级依次尝试：

1. **强标题行**（独立成行、长度 ≤ 40、行内无句号）
   ```
   /^[ \t　]*(第[0-9零一二三四五六七八九十百千万两〇]{1,10}[章节回卷篇部集][^\n]{0,30})[ \t　]*$/gm
   ```
2. **补充标题**：`序章|楔子|前言|序言|引言|后记|尾声|番外` 开头行；英文 `Chapter\s+\d+`
3. **编号标题**：`^\s*[0-9]{1,3}[、.．]\s*\S` （网文常见 `1、xxx`）
4. **兜底**：一个都没匹配到 → 按每 ~3000 字符在最近段落处切块，标题 `第 N 节`；若文件 < 5000 字符则整本一章，标题 `全文`

**必须处理的两个真实问题**

- **开头目录页**：很多 txt 前 20~200 行是"第一章 xx / 第二章 xx ..."目录，会导致生成一堆空章节。实现采用两层识别（`dropDuplicateTitles` + `detectToc`），再加一层兜底合并：
  1. **重复标题**（主规则）：目录里的标题通常会在正文里再出现一次。位于文件前 15%（且不超过前 3000 字符）的重复项判为目录并剔除；正文里靠后的同名标题保留。这一条能处理"目录与正文之间隔着一大段说明文字"的情况。
  2. **连续空标题**（兜底）：连续 ≥5 个标题、彼此间距 < 60 字符、整块长度 < 全文 30%、且块起点在前 2000 字符或前 5% 内。判定某个标题是否属于目录，看的是它**后面还有没有正文**，而不是前面的间距 —— 否则目录最后一行会顺着"小间距"把真正的第 1 章一起吞掉（这是实现时踩到的真实 bug）。
  3. **短章合并**：正文 trim 后 < 60 字符的章节向后合并、末章向前合并；但若一次合并把整本书压成 1~2 章，说明这些短章是真实内容（诗集/短篇集），此时放弃合并。
- **前置内容**：第一个标题之前的内容（书名、作者、目录残留）≥ 200 字符时单独成"序"章，否则直接并进第一章，避免出现只有两行字的"序"。
- **假标题**：正文中一句"他翻到第三章"会误命中。约束"整行匹配 + 无标点 + 行首无缩进超 2 空格"，准确率足够 MVP 用；不做 NLP。

> 已知取舍：被识别为目录并剔除的那段文字仍然物理存在于第一章正文开头（因为 `Chapter.start/end` 必须覆盖全文、保证不丢内容）。用户看到的是"第 1 章正文最前面多了一段目录"，可接受。

**产物**：`Chapter[]`，且强制 `chapters[0].start === 0`、`chapters[n].end === text.length`，保证全书无缝覆盖无空洞。第一个匹配点若 > 0，把之前的内容作为 `序` 章（无标题则并入第 0 章）。

### 5.3 阅读页（`ReaderView.vue`）

```
┌──────────────────────────────────────────────┐
│ ← 书名                    目录   Aa   主题    │ 工具栏（自动隐藏，鼠标移到顶部/按 T 显示）
├──────────────────────────────────────────────┤
│                                              │
│          第一章 标题（居中）                    │
│                                              │
│   正文段落 …… （max-width: 760px，居中）       │
│   正文段落 ……                                 │
│                                              │
│                          ┌────────────────┐  │
│                          │ 目录           │  │ 右侧抽屉
│                          │ 第1章 …   ●    │  │ 当前章高亮
│                          │ 第2章 …        │  │ 点击跳转
│                          └────────────────┘  │
├──────────────────────────────────────────────┤
│ 第 3/128 章 · 全书 42%                        │ 底部状态条
└──────────────────────────────────────────────┘
```

**渲染要点**

- 一次只渲染**当前一章**，按 `\n` 切段 → `<p>` 列表。不要整本渲染。
- 长章节（> 300 段）给 `<p>` 加 `content-visibility: auto; contain-intrinsic-size: auto 3em;`，滚动不卡、不跳。
- 章节切换时 `scrollTop = 0` 或恢复到 `progress.scrollRatio * scrollHeight`。
- 主题与字号全部走 CSS 变量（`--reader-bg / --reader-fg / --reader-font-size`），切换零重排成本低。
- 字体栈：`Georgia, "Songti SC", "SimSun", serif` / `-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`，**不打包字体**。

**交互（MVP 必做）**

| 操作 | 响应 |
|---|---|
| 鼠标移到顶部 20px / 按 `T` | 显示/隐藏工具栏 |
| 滚轮到底部 && 再滚一次 | 自动进入下一章（可选，默认关，避免误触） |
| `←` / `PageUp` / `↑` | 上翻 |
| `→` / `PageDown` / `空格` / `↓` | 下翻 |
| `Ctrl/⌘ + ←/→` 或 `[` `]` | 上一章 / 下一章 |
| `Esc` | 关闭抽屉/返回书架 |
| 双击正文 | 全屏沉浸（隐藏工具栏），再双击退出 |

### 5.4 进度持久化

- 监听阅读容器的 `scroll`，**节流 500ms** 后写 `progress.json`；同时在以下时机强制 flush：切章、`beforeunload`、窗口 `blur`、`will-quit`。
- 写入内容：`{ bookId, chapterIndex, scrollRatio, updatedAt }`，同时更新 `library.json` 的 `lastReadAt`（书架排序用，写入频率低、可延后到切章/退出时）。
- 恢复：打开书 → 取 progress → 加载该章 → `nextTick` 后 `scrollTop = scrollRatio * (scrollHeight - clientHeight)`。
- 边界保护：`chapterIndex` 超出范围（书被替换过）→ 归零；`scrollRatio` clamp 到 `[0,1]`。

### 5.5 书架

- 卡片网格，每行自适应（min 160px），卡片含：渐变占位封面（`coverHue` 派生 `hsl`）+ 书名 + 章节数 + 进度条 + 上次阅读时间。
- 排序：默认 `lastReadAt` 倒序；空位显示"导入 TXT 开始阅读"引导。
- 操作：点击打开；右键/悬停菜单「删除」（二次确认，连磁盘文件一起删）。
- 拖拽 `.txt` 到窗口任意位置即可导入（`webContents` 的 `dragover/drop` + `webUtils.getPathForFile`，注意 Electron 32+ 已移除 `File.path`）。

### 5.6 设置面板

字号（A- / A+ / 滑块）、行高、段间距、字体（衬线/无衬线）、主题（亮/暖/暗）、内容宽度。改动实时生效并立即写 `settings.json`（节流 300ms）。设置是全局的，不分书。

---

## 6. IPC 接口契约

全部用 `ipcMain.handle` / `ipcRenderer.invoke`，返回 `{ ok: true, data } | { ok: false, code, message }` 统一信封。

| 方法 | 入参 | 返回 | 说明 |
|---|---|---|---|
| `library:list` | – | `BookMeta[]` | 书架数据 |
| `library:import` | – | `BookMeta \| null` | 弹系统文件框，取消返回 null |
| `library:importPaths` | `paths: string[]` | `ImportResult[]` | 拖拽导入，逐个返回成功/失败原因 |
| `library:remove` | `bookId` | `void` | 删记录 + 删磁盘目录 |
| `book:chapters` | `bookId` | `Chapter[]` | 目录抽屉 |
| `book:content` | `bookId, chapterIndex` | `{ title, text, index, total }` | 按需取一章正文 |
| `book:meta` | `bookId` | `BookMeta` | |
| `progress:get` | `bookId` | `Progress \| null` | |
| `progress:save` | `Progress` | `void` | 节流调用 |
| `settings:get` | – | `ReaderSettings` | |
| `settings:save` | `Partial<ReaderSettings>` | `ReaderSettings` | 返回合并后结果 |

**preload 暴露形态**

```ts
// preload.ts
contextBridge.exposeInMainWorld('api', {
  library: { list, import: _import, importPaths, remove },
  book:    { chapters, content, meta },
  progress:{ get, save },
  settings:{ get, save },
})
```

**错误码**：`E_FILE_TOO_LARGE`、`E_DECODE_FAILED`、`E_NOT_FOUND`、`E_DUPLICATE`、`E_IO`。渲染层统一 toast，不向用户暴露堆栈。

---

## 7. 工程结构与依赖

```
ds-harness-demo/
├─ electron.vite.config.ts     # 三端构建入口（main / preload / renderer）
├─ package.json
├─ electron-builder.yml        # 仅 Windows：nsis + portable
├─ .npmrc / pnpm-workspace.yaml# nodeLinker=hoisted（见下方"环境注意"）
├─ shared/
│  └─ types.ts                 # 主/渲染共用类型与常量、TxtReaderApi 契约
├─ electron/
│  ├─ main.ts                  # 生命周期、BrowserWindow、单实例锁
│  ├─ preload.ts               # contextBridge 白名单 + getPathForFile
│  ├─ ipc/
│  │  └─ index.ts              # registerIpcHandlers()，统一 IpcResult 信封
│  └─ services/
│     ├─ paths.ts              # 数据目录解析 + 三级可写性探测
│     ├─ storage.ts            # 原子写 JSON、JsonFile<T>、codedError
│     ├─ encoding.ts           # BOM / isUtf8 / 候选编码打分
│     ├─ chapter.ts            # 切分纯函数（无 electron 依赖，可单测）
│     ├─ importer.ts           # 导入流水线 + 删除书目
│     ├─ library.ts            # 书目 CRUD
│     ├─ progress.ts           # 进度读写
│     ├─ settings.ts           # 阅读设置读写
│     └─ textCache.ts          # 正文 LRU（2 本）+ 按章切片
├─ src/
│  ├─ index.html
│  ├─ main.ts                  # createApp + pinia + router + EP 样式
│  ├─ App.vue                  # ElConfigProvider(zh-cn) + router-view
│  ├─ router/index.ts          # hash 路由：/ → 书架，/reader/:id → 阅读页
│  ├─ lib/api.ts               # unwrap / toastError
│  ├─ stores/{shelf,reader,settings}.ts
│  ├─ composables/
│  │  ├─ useReaderScroll.ts    # 滚动、ratio、500ms 节流写盘、restore
│  │  └─ useReaderKeys.ts      # 快捷键
│  ├─ views/{ShelfView,ReaderView}.vue
│  ├─ components/{BookCard,ChapterDrawer,ReaderPaper,SettingsPanel,SettingsAbout}.vue
│  ├─ styles/theme.css         # 三主题变量 + EP 变量覆盖
│  ├─ env.d.ts / shims-vue.d.ts
├─ tests/
│  ├─ chapter.spec.ts          # 切章：标准/无章节/目录页/假标题/超短章/序
│  ├─ encoding.spec.ts         # 编码探测：utf8/gbk/bom/utf16
│  └─ samples.smoke.spec.ts    # 样书冒烟（samples/ 不存在时跳过）
└─ scripts/gen-samples.mjs     # 生成样书（UTF-8 / GBK / 无章节）
```

**环境注意（本机实测）**：pnpm 默认的隔离式 `node_modules`（junction）布局在这台机器上会让 Node 的模块解析找不到包内依赖，`electron-vite`、`vue-tsc` 都会启动失败。因此仓库内固定 `nodeLinker: hoisted`（`.npmrc` + `pnpm-workspace.yaml`）。这是本机通用问题，不是本项目特例；换机器时若出现 `Cannot find package 'cac'` 之类的报错，先检查这一项。

**依赖（全部离线可用，无 CDN）**

| 用途 | 包 |
|---|---|
| 构建 | `electron`, `electron-vite`, `electron-builder`, `vite`, `typescript`, `vue`, `@vitejs/plugin-vue`, `vue-tsc` |
| UI 状态/路由 | `vue-router`, `pinia` |
| **UI 组件库** | `element-plus`, `@element-plus/icons-vue` |
| 编码 | `iconv-lite` |
| 测试 | `vitest` |

> 弃用了两个原方案里的包：`chardet`（v2 为双模块，主进程 CJS 下加载有风险，改为 `node:buffer` 的 `isUtf8` + 候选编码打分，对中文 txt 足够）和 `nanoid`（v5 是 ESM-only，主进程用 `crypto.randomBytes(10).toString('hex')` 替代）。

**Element Plus 使用边界（重要）**

- **显式按组件引入**：`import { ElDrawer, ElSlider } from 'element-plus'`，禁止 `app.use(ElementPlus)` 全量注册（首屏会多背 ~700KB JS），也不引入 `unplugin-auto-import`/`unplugin-vue-components`（多两个构建依赖，收益只是省 import 语句）。CSS 全量引入一次 `element-plus/dist/index.css`（gzip 约 40KB，可接受）。
- **主题对齐**：`<html>` 上挂 `class="dark"` 时引入 `element-plus/theme-chalk/dark/css-vars.css`；三套主题到 EP 的映射为 —— `light` → 无 dark 类；`sepia` → 无 dark 类 + 覆盖 `--el-bg-color`/`--el-text-color-primary` 为暖色；`dark` → `dark` 类。所有自定义色以 CSS 变量表达，**不要**给 EP 组件写 `style` 覆盖。
- **中文文案**：`ElConfigProvider` + `zh-cn` locale。
- **阅读正文区不引入任何 EP 组件**。正文是纯 `<p>` 流，EP 的 `ElScrollbar`/`ElCard` 会带额外的 DOM 层级和 `overflow` 处理，直接拖慢长章节滚动。EP 只出现在：`ElDrawer`（目录）、`ElDialog`（删除确认）、`ElSlider`/`ElSwitch`/`ElRadioGroup`（设置）、`ElProgress`（书架进度）、`ElEmpty`（空态）、`ElMessage`/`ElMessageBox`（提示）。

不引入除 Element Plus 以外的 UI 库；不打包字体文件（用系统字体栈）。

**打包（仅 Windows）**

- `electron-builder` 出两个 target：`nsis`（安装版）+ `portable`（绿色单文件版）。
- 不需要 mac/Linux 配置、不配签名、不配自动更新。
- 无自定义 `icon.ico` 时先打默认图标，M4 再补。
- 产物目录 `release/`，加入 `.gitignore`。

---

## 8. 里程碑与任务拆分

| 里程碑 | 内容 | 交付物 | 预估 |
|---|---|---|---|
| **M1 骨架** | 工程初始化、窗口、preload/IPC 骨架、storage 层、导入弹框、书架列表 | 能导入 txt 并在书架看到卡片 | 0.5d |
| **M2 阅读** | 编码探测、切章、`ReaderView`、目录抽屉、进度读写、快捷键 | 能完整读一本书，重开回到原位 | 1d |
| **M3 打磨** | 设置面板、三主题、拖拽导入、删除确认、空状态、错误 toast | 可交付的 MVP | 0.5d |
| **M4 验收** | 单测补全、打包、验收清单过一遍 | 免装 zip + 安装包 | 0.5d |

合计约 **2.5 人日**（不含翻页模式）。

---

## 9. 验收清单（评审通过后按此验收）

**导入**
- [ ] 导入 UTF-8 无 BOM、UTF-8 BOM、GBK、GB18030、UTF-16LE 各一本，均不乱码
- [ ] 导入 10MB 网文，2 秒内出现在书架，期间界面可响应
- [ ] 重复导入同一文件有提示，不产生两份
- [ ] 导入非 txt / 空文件 / 二进制改后缀，给出友好错误而非崩溃
- [ ] 拖拽 txt 到窗口可导入

**章节**
- [ ] 标准 `第X章` 文本目录条目数 = 肉眼可见章节数
- [ ] 带目录页的文本不产生空章节
- [ ] 无章节标记的文本自动兜底分节，目录可点
- [ ] 首章从 0 开始、末章到文件末尾，无内容丢失

**阅读**
- [ ] 字号 16→32、行高、三主题切换即时生效且设置持久化
- [ ] 目录高亮当前章，点击跳转正确
- [ ] 长章节（5 万字）滚动流畅，无白屏
- [ ] 窗口从 1920×1080 拖到 800×600，内容正常重排不截断
- [ ] 快捷键全部生效（需在文档内列出清单）

**进度**
- [ ] 读到第 37 章某位置，关闭应用重开，回到同一位置（误差 ≤ 1 屏）
- [ ] 书架卡片进度条与阅读进度一致
- [ ] 读完最后一章后进度显示 100% 不越界

**健壮性**
- [ ] 手动删除 `books/<id>/content.txt` 后打开该书 → 报错可恢复，不白屏
- [ ] 手动写坏 `library.json` → 启动不崩，回退空书架
- [ ] 删除书后磁盘目录同步清除，空间释放

---

## 10. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 编码误判（chardet 对短文本不准） | 乱码 | 多候选打分 + 记录采用编码；设置里给「重新以指定编码导入」逃生口（P1） |
| 章节正则误判/漏判 | 目录难用 | 纯函数 + 单测覆盖 5 类真实样本；兜底分节保证永远可用 |
| 超大文件阻塞主进程 | 假死 | 20MB 阈值 + worker；>80MB 拒绝并提示 |
| 中文 Windows 下 GBK 文件名/路径 | 导入失败 | 全程用 `Buffer`/`fs` 原生接口，不手拼路径 |
| Electron 版本差异（`File.path` 已移除） | 拖拽失效 | 用 `webUtils.getPathForFile`，锁定 Electron 版本 |
| 打包体积大（~150MB） | 分发不便 | 接受；后续可换 Tauri（架构已隔离 io 层，迁移成本可控） |
| **程序目录不可写**（装进 `Program Files`） | 导入直接失败 | 三级可写性探测 + 降级到 `LOCALAPPDATA` + 明确告知 |
| **portable 版 exe 在 `%TEMP%` 运行** | 数据写进临时目录，重启即丢 | 优先读 `PORTABLE_EXECUTABLE_DIR`，见 4.2 |
| 用户整目录删除/挪动 | 数据一起没了 | 便携本来就是预期行为；"关于"页显示数据路径，P1 加导出备份 |
| 同一 data 目录被两个版本共用 | 数据结构不兼容 | `settings.json` 存 `schemaVersion`，读到更高版本拒绝启动并提示 |

---

## 11. 后续演进（不在本次范围）

v1.1：翻页模式（`paged`）、阅读模式切换、书签、全文搜索
v1.2：EPUB 支持（解析层抽象为 `BookParser` 接口，`TxtParser` / `EpubParser` 双实现）
v1.3：自定义字体、朗读、窗口位置记忆、多语言

---

## 12. 决策记录（已确认）

| # | 决策项 | 结论 |
|---|---|---|
| 1 | 阅读模式 | **章节内滚动**，不做真分页（见第 2 节） |
| 2 | UI 组件库 | **Element Plus**，按需引入；正文区不使用 EP 组件 |
| 3 | 打包目标 | **仅 Windows**：`nsis` + `portable` |
| 4 | 脚手架 | **electron-vite**（主/预加载/渲染三端一体化） |
| 5 | 数据位置 | **可执行文件同级 `data/`**，三级可写性探测 + 降级兜底（见 4.2） |

### 因决策 5 新增的实现要求（施工前必读）

- `app.requestSingleInstanceLock()`；第二实例直接 focus 主窗口并退出
- 启动时探测可写性，降级必须 toast 告知实际路径
- `settings.json` 增加 `schemaVersion: 1` 与 `dataDir` 字段
- `.gitignore` 增加 `data/`、`release/`
- "关于"面板（设置面板内一节）显示：数据目录绝对路径 + 打开目录按钮

### 待实现中确认的小项（不阻塞开工）

- 书封面占位色是否要按书名 hash 稳定生成（当前设计：按 `bookId` 派生，稳定但更换后不变）
- 是否需要"重新以指定编码导入"逃生口 → 列为 v1.1

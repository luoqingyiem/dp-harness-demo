const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const iconv = require('iconv-lite')

const root = path.join(os.tmpdir(), 'txt-reader-harness')
fs.rmSync(root, { recursive: true, force: true })
fs.mkdirSync(root, { recursive: true })

const services = path.join(__dirname, 'out')
const { decodeBuffer, scoreDecodedText } = require(path.join(services, 'encoding.js'))
const { initDataDir, getDataDir, booksDir, bookDir, assertBookId } = require(path.join(services, 'paths.js'))
const library = require(path.join(services, 'library.js'))
const progress = require(path.join(services, 'progress.js'))
const settings = require(path.join(services, 'settings.js'))
const textCache = require(path.join(services, 'textCache.js'))
const importer = require(path.join(services, 'importer.js'))

let count = 0
function ok(name, fn) {
  fn()
  count += 1
  console.log('ok -', name)
}

const BODY = '这是一段足够长的正文内容，用来验证切章与读取功能是否正常工作。'.repeat(3)
const chaptersText = `第一章 开端\n${BODY}\n\n第二章 波折\n${BODY}\n\n第三章 终局\n${BODY}`

const srcDir = path.join(root, 'src')
fs.mkdirSync(srcDir, { recursive: true })

function makeFile(name, buffer) {
  const file = path.join(srcDir, name)
  fs.writeFileSync(file, buffer)
  return file
}

const info = initDataDir()

ok('数据目录初始化', () => {
  assert.strictEqual(info.dir, path.join(root, 'data'))
  assert.strictEqual(info.source, 'development')
  assert.strictEqual(info.degraded, false)
  assert.strictEqual(getDataDir().dir, info.dir)
  assert.ok(fs.existsSync(info.dir))
  assert.strictEqual(fs.existsSync(path.join(info.dir, '.write-test')), false)
})

ok('assertBookId 校验', () => {
  assert.strictEqual(assertBookId('0123456789abcdef0123'), '0123456789abcdef0123')
  assert.throws(() => assertBookId('../evil'))
  assert.throws(() => assertBookId('SHORT'))
  assert.throws(() => assertBookId(12))
  assert.throws(() => bookDir('../../etc'))
})

ok('decodeBuffer utf8 / utf8 bom / gbk / utf16le', () => {
  const sample = '第一章 开端\n中文内容测试'
  assert.strictEqual(decodeBuffer(Buffer.from(sample, 'utf8')).encoding, 'UTF-8')
  assert.strictEqual(decodeBuffer(Buffer.from(sample, 'utf8')).text, sample)

  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(sample, 'utf8')])
  const bomResult = decodeBuffer(bom)
  assert.strictEqual(bomResult.encoding, 'UTF-8')
  assert.strictEqual(bomResult.text, sample)

  const gbk = iconv.encode(sample + BODY, 'gbk')
  const gbkResult = decodeBuffer(gbk)
  assert.strictEqual(gbkResult.encoding, 'GB18030')
  assert.strictEqual(gbkResult.text, sample + BODY)

  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(sample, 'utf16le')])
  const leResult = decodeBuffer(le)
  assert.strictEqual(leResult.encoding, 'UTF-16LE')
  assert.strictEqual(leResult.text, sample)
})

ok('乱码打分：正确解码分数最低', () => {
  const sample = '第一章 开端\n中文内容测试，' + BODY
  const gbk = iconv.encode(sample, 'gbk')
  const good = scoreDecodedText(iconv.decode(gbk, 'gb18030'))
  const bad = scoreDecodedText(iconv.decode(gbk, 'big5'))
  assert.ok(good < bad, `good=${good} bad=${bad}`)
})

const gbkFile = makeFile('三国测试.txt', iconv.encode(chaptersText, 'gbk'))
let book = null

ok('导入 GBK 文件', () => {
  const outcome = importer.importTxtFile(gbkFile)
  assert.ok(outcome.book, JSON.stringify(outcome.failure))
  book = outcome.book
  assert.match(book.id, /^[a-z0-9]{10,32}$/)
  assert.strictEqual(book.id.length, 20)
  assert.strictEqual(book.title, '三国测试')
  assert.strictEqual(book.fileName, '三国测试.txt')
  assert.strictEqual(book.encoding, 'GB18030')
  assert.strictEqual(book.chapterCount, 3)
  assert.strictEqual(book.charCount, chaptersText.length)
  assert.ok(book.coverHue >= 0 && book.coverHue < 360)
  assert.strictEqual(book.lastReadAt, book.addedAt)
  assert.ok(fs.existsSync(path.join(bookDir(book.id), 'content.txt')))
  assert.ok(fs.existsSync(path.join(bookDir(book.id), 'chapters.json')))
})

ok('书目列表 / get', () => {
  assert.strictEqual(library.listBooks().length, 1)
  assert.deepStrictEqual(library.getBook(book.id), book)
  assert.strictEqual(library.getBook('ffffffffffffffffffff'), null)
})

ok('重复导入返回 E_DUPLICATE', () => {
  const outcome = importer.importTxtFile(gbkFile)
  assert.ok(outcome.failure)
  assert.strictEqual(outcome.failure.code, 'E_DUPLICATE')
  assert.strictEqual(library.listBooks().length, 1)
})

ok('非法 / 缺失 / 空文件返回 failure 而非抛异常', () => {
  const bad = makeFile('二进制.bin', Buffer.from([0x01, 0x02]))
  assert.strictEqual(importer.importTxtFile(bad).failure.code, 'E_BAD_FILE_TYPE')
  assert.strictEqual(importer.importTxtFile(path.join(srcDir, 'nope.txt')).failure.code, 'E_NOT_FOUND')
  const empty = makeFile('空.txt', Buffer.alloc(0))
  assert.strictEqual(importer.importTxtFile(empty).failure.code, 'E_EMPTY_FILE')
  const blank = makeFile('空白.txt', Buffer.from('   \n\n \t ', 'utf8'))
  assert.strictEqual(importer.importTxtFile(blank).failure.code, 'E_EMPTY_FILE')
})

ok('章节与正文读取', () => {
  const chapters = textCache.getChapters(book.id)
  assert.strictEqual(chapters.length, 3)
  assert.deepStrictEqual(chapters.map((c) => c.title), ['第一章 开端', '第二章 波折', '第三章 终局'])

  const first = textCache.getChapter(book.id, 0)
  assert.strictEqual(first.index, 0)
  assert.strictEqual(first.total, 3)
  assert.strictEqual(first.title, '第一章 开端')
  assert.ok(!first.text.startsWith('第一章'), '标题行已剥离：' + first.text.slice(0, 20))
  assert.ok(first.text.startsWith(BODY.slice(0, 5)))

  const clampedHigh = textCache.getChapter(book.id, 99)
  assert.strictEqual(clampedHigh.index, 2)
  const clampedLow = textCache.getChapter(book.id, -7)
  assert.strictEqual(clampedLow.index, 0)
  const nanIndex = textCache.getChapter(book.id, Number.NaN)
  assert.strictEqual(nanIndex.index, 0)
})

ok('LRU 只缓存 2 本', () => {
  const other = makeFile('第二本.txt', Buffer.from('第一章 甲\n' + BODY + '\n\n第二章 乙\n' + BODY, 'utf8'))
  const third = makeFile('第三本.txt', Buffer.from('第一章 丙\n' + BODY + '\n\n第二章 丁\n' + BODY, 'utf8'))
  const a = importer.importTxtFile(other).book
  const b = importer.importTxtFile(third).book
  assert.ok(a && b)
  textCache.getChapters(book.id)
  textCache.getChapters(a.id)
  textCache.getChapters(b.id)
  assert.strictEqual(textCache.getChapters(book.id).length, 3)
  importer.removeBook(a.id)
  importer.removeBook(b.id)
})

ok('正文文件缺失时抛可读错误', () => {
  const meta = importer.importTxtFile(makeFile('损坏.txt', Buffer.from('第一章 x\n' + BODY, 'utf8'))).book
  textCache.getChapters(meta.id)
  fs.rmSync(path.join(bookDir(meta.id), 'content.txt'))
  textCache.dropBook(meta.id)
  assert.throws(() => textCache.getChapters(meta.id), /正文文件不存在/)
  importer.removeBook(meta.id)
})

ok('进度读写与 clamp', () => {
  const saved = progress.saveProgress({
    bookId: book.id,
    chapterIndex: 1.7,
    scrollRatio: 2,
    updatedAt: 123,
    pageIndex: 3
  })
  assert.strictEqual(saved.chapterIndex, 1)
  assert.strictEqual(saved.scrollRatio, 1)
  assert.strictEqual(progress.getProgress(book.id).updatedAt, 123)
  assert.strictEqual(Object.keys(progress.listProgress()).length, 1)
  progress.saveProgress({ bookId: book.id, chapterIndex: -3, scrollRatio: -1, updatedAt: 5 })
  assert.strictEqual(progress.getProgress(book.id).chapterIndex, 0)
  assert.strictEqual(progress.getProgress(book.id).scrollRatio, 0)
  progress.removeProgress(book.id)
  assert.strictEqual(progress.getProgress(book.id), null)
})

ok('设置读写：clamp + dataDir 回填 + 高版本回退', () => {
  const defaults = settings.getSettings()
  assert.strictEqual(defaults.fontSize, 19)
  assert.strictEqual(defaults.dataDir, info.dir)
  assert.strictEqual(defaults.schemaVersion, 1)

  const saved = settings.saveSettings({ fontSize: 999, lineHeight: 0.1, theme: 'dark', dataDir: 'C:/hack' })
  assert.strictEqual(saved.fontSize, 32)
  assert.strictEqual(saved.lineHeight, 1.4)
  assert.strictEqual(saved.theme, 'dark')
  assert.strictEqual(saved.dataDir, info.dir)
  assert.strictEqual(settings.getSettings().fontSize, 32)

  // 写入更高 schemaVersion 的设置文件：不崩溃，回退默认值
  fs.writeFileSync(
    path.join(info.dir, 'settings.json'),
    JSON.stringify({ schemaVersion: 99, fontSize: 30, theme: 'sepia' }),
    'utf8'
  )
  const fallback = settings.getSettings()
  assert.strictEqual(fallback.schemaVersion, 1)
  assert.strictEqual(fallback.fontSize, 19)
  assert.strictEqual(fallback.theme, 'light')
  assert.strictEqual(fallback.dataDir, info.dir)
})

ok('删除书目：记录 + 进度 + 目录', () => {
  progress.saveProgress({ bookId: book.id, chapterIndex: 1, scrollRatio: 0.5, updatedAt: Date.now() })
  const dir = bookDir(book.id)
  importer.removeBook(book.id)
  assert.strictEqual(library.getBook(book.id), null)
  assert.strictEqual(progress.getProgress(book.id), null)
  assert.strictEqual(fs.existsSync(dir), false)
})

ok('library.json 损坏时回退空书架', () => {
  fs.writeFileSync(path.join(info.dir, 'library.json'), '{ 坏掉的 json', 'utf8')
  assert.deepStrictEqual(library.listBooks(), [])
  fs.writeFileSync(path.join(info.dir, 'library.json'), '[]', 'utf8')
})

console.log('\nall groups passed:', count)
fs.rmSync(root, { recursive: true, force: true })

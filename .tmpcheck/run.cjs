const assert = require('node:assert')
const { splitChapters, normalizeText } = require('./chapter.js')

let passed = 0
function ok(name, fn) {
  fn()
  passed += 1
  console.log('ok -', name)
}

function expectCoverage(text, chapters) {
  assert.ok(chapters.length > 0, 'chapters not empty')
  assert.strictEqual(chapters[0].start, 0, 'first start 0')
  assert.strictEqual(chapters[chapters.length - 1].end, text.length, 'last end = length')
  chapters.forEach((c, i) => {
    assert.strictEqual(c.index, i, 'index continuous')
    assert.ok(c.end > c.start, 'non-empty range')
    assert.ok(text.slice(c.start, c.end).trim().length > 0, 'non-empty body')
    if (i > 0) assert.strictEqual(c.start, chapters[i - 1].end, 'contiguous')
    assert.ok(typeof c.title === 'string' && c.title.length > 0, 'has title')
  })
}

const BODY = '这是一段用于测试的正文内容，需要足够长以避免被合并掉。'.repeat(4)
const LONG = '这是一段足够长的正文内容，不会被合并。'.repeat(4)

ok('normalizeText CRLF + 空行压缩', () => {
  assert.strictEqual(normalizeText('a\r\nb\rc\r\n\r\n\r\n\r\n\r\nd'), 'a\nb\nc\n\n\nd')
})

ok('normalizeText BOM + 全角空格', () => {
  assert.strictEqual(normalizeText('\uFEFF第一章 开端\r\n　缩进正文'), '第一章 开端\n　缩进正文')
})

ok('normalizeText empty', () => {
  assert.strictEqual(normalizeText(''), '')
})

ok('标准第X章', () => {
  const text = `第一章 开端\n${BODY}\n\n第二章 波折\n${BODY}\n\n第三章 终局\n${BODY}`
  const chapters = splitChapters(text)
  assert.deepStrictEqual(chapters.map((c) => c.title), ['第一章 开端', '第二章 波折', '第三章 终局'])
  expectCoverage(text, chapters)
})

ok('假标题不误判', () => {
  const text = `第一章 开端\n${BODY}\n他翻到第三章，发现内容不见了。\n${BODY}`
  const chapters = splitChapters(text)
  assert.strictEqual(chapters.length, 1)
  expectCoverage(text, chapters)
})

ok('无标记兜底切块', () => {
  const paragraph = '这是一个没有任何章节标记的长段落。'.repeat(20)
  const text = Array.from({ length: 45 }, () => paragraph).join('\n\n')
  assert.ok(text.length > 5000)
  const chapters = splitChapters(text)
  assert.ok(chapters.length >= 3, 'chunks >= 3, got ' + chapters.length)
  assert.strictEqual(chapters[0].title, '第 1 节')
  expectCoverage(text, chapters)
  console.log('   chunks =', chapters.length, 'first chunk =', chapters[0].end - chapters[0].start)
})

ok('短文本整本一章', () => {
  const text = '很短的一段文字，没有任何章节标记。'
  const chapters = splitChapters(text)
  assert.strictEqual(chapters.length, 1)
  assert.strictEqual(chapters[0].title, '全文')
  expectCoverage(text, chapters)
})

ok('目录页剔除', () => {
  const titles = ['第一章 开端', '第二章 波折', '第三章 终局', '第四章 转折', '第五章 尾声']
  const bodies = ['开端', '波折', '终局', '转折', '尾声'].map((w) => `这是${w}的正文。`.repeat(12))
  const between =
    '下面是正文部分，前面是目录页，这一段用来把目录与正文隔开，长度超过六十个字符以免目录与正文的首个标题被判定为同一个连续块，从而影响目录识别。'
  const real = titles.map((t, i) => `${t}\n${bodies[i]}`).join('\n\n')
  const text = `《测试小说》\n作者：无名氏\n\n${titles.join('\n')}\n${between}\n${real}`
  const chapters = splitChapters(text)
  console.log('   titles =', JSON.stringify(chapters.map((c) => c.title)))
  assert.strictEqual(chapters.length, 6)
  assert.strictEqual(chapters[0].title, '序')
  assert.strictEqual(chapters.filter((c) => c.title === '第一章 开端').length, 1)
  expectCoverage(text, chapters)
})

ok('超短章合并', () => {
  const text = `第一章 一\n${LONG}\n\n第二章 二\n短\n\n第三章 三\n${LONG}`
  const chapters = splitChapters(text)
  assert.strictEqual(chapters.length, 2)
  assert.deepStrictEqual(chapters.map((c) => c.title), ['第一章 一', '第三章 三'])
  assert.ok(text.slice(chapters[1].start, chapters[1].end).includes('短'))
  expectCoverage(text, chapters)
})

ok('编号标题兜底', () => {
  const text = Array.from({ length: 6 }, (_, i) => `${i + 1}、第${i + 1}小段\n${LONG}`).join('\n\n')
  const chapters = splitChapters(text)
  assert.strictEqual(chapters.length, 6)
  assert.strictEqual(chapters[0].title, '1、第1小段')
  expectCoverage(text, chapters)
})

ok('补充标题（序章/后记）', () => {
  const text = `序章 开始\n${BODY}\n\n第一章 一\n${BODY}\n\n后记 说明\n${BODY}`
  const chapters = splitChapters(text)
  assert.deepStrictEqual(chapters.map((c) => c.title), ['序章 开始', '第一章 一', '后记 说明'])
  expectCoverage(text, chapters)
})

ok('空文本返回空数组', () => {
  assert.deepStrictEqual(splitChapters(''), [])
})

console.log('\npassed assertions groups:', passed)

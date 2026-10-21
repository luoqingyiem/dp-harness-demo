import { describe, expect, it } from 'vitest'
import { normalizeText, splitChapters } from '../electron/services/chapter'

interface ChapterLike {
  index: number
  title: string
  start: number
  end: number
}

const BODY = '这是一段用于测试的正文内容，需要足够长以避免被合并掉。'.repeat(4)
const LONG = '这是一段足够长的正文内容，不会被合并。'.repeat(4)

/** 每条硬性不变量：首章从 0 开始、末章到文件末尾、index 连续、无缝无空章 */
function expectCoverage(text: string, chapters: ChapterLike[]): void {
  expect(chapters.length).toBeGreaterThan(0)
  expect(chapters[0].start).toBe(0)
  expect(chapters[chapters.length - 1].end).toBe(text.length)
  chapters.forEach((chapter, i) => {
    expect(chapter.index).toBe(i)
    expect(chapter.end).toBeGreaterThan(chapter.start)
    expect(text.slice(chapter.start, chapter.end).trim().length).toBeGreaterThan(0)
    if (i > 0) expect(chapter.start).toBe(chapters[i - 1].end)
  })
}

describe('normalizeText', () => {
  it('CRLF / CR 统一成 LF，连续 3+ 空行压成 2 个空行', () => {
    expect(normalizeText('a\r\nb\rc\r\n\r\n\r\n\r\n\r\nd')).toBe('a\nb\nc\n\n\nd')
  })

  it('去掉 BOM 并保留全角空格缩进', () => {
    expect(normalizeText('\uFEFF第一章 开端\r\n　缩进正文')).toBe('第一章 开端\n　缩进正文')
  })

  it('空输入返回空串', () => {
    expect(normalizeText('')).toBe('')
  })
})

describe('splitChapters', () => {
  it('标准“第X章”文本按标题切分', () => {
    const text = `第一章 开端\n${BODY}\n\n第二章 波折\n${BODY}\n\n第三章 终局\n${BODY}`
    const chapters = splitChapters(text)
    expect(chapters.map((c) => c.title)).toEqual(['第一章 开端', '第二章 波折', '第三章 终局'])
    expectCoverage(text, chapters)
  })

  it('正文里提到“第三章”不算标题', () => {
    const text = `第一章 开端\n${BODY}\n他翻到第三章，发现内容不见了。\n${BODY}`
    const chapters = splitChapters(text)
    expect(chapters.length).toBe(1)
    expectCoverage(text, chapters)
  })

  it('没有章节标记时按段落兜底切块', () => {
    const paragraph = '这是一个没有任何章节标记的长段落。'.repeat(20)
    const text = Array.from({ length: 45 }, () => paragraph).join('\n\n')
    expect(text.length).toBeGreaterThan(5000)
    const chapters = splitChapters(text)
    expect(chapters.length).toBeGreaterThanOrEqual(3)
    expect(chapters[0].title).toBe('第 1 节')
    expectCoverage(text, chapters)
  })

  it('短文本无标记时整本一章，标题为“全文”', () => {
    const text = '很短的一段文字，没有任何章节标记。'
    const chapters = splitChapters(text)
    expect(chapters).toHaveLength(1)
    expect(chapters[0].title).toBe('全文')
    expectCoverage(text, chapters)
  })

  it('开头目录页不会被当成章节（不产生大量空章）', () => {
    const titles = ['第一章 开端', '第二章 波折', '第三章 终局', '第四章 转折', '第五章 尾声']
    const bodies = ['开端', '波折', '终局', '转折', '尾声'].map((word) => `这是${word}的正文。`.repeat(12))
    const between =
      '下面是正文部分，前面是目录页，这一段用来把目录与正文隔开，长度超过六十个字符以免目录与正文的首个标题被判定为同一个连续块，从而影响目录识别。'
    const real = titles.map((title, i) => `${title}\n${bodies[i]}`).join('\n\n')
    const text = `《测试小说》\n作者：无名氏\n\n${titles.join('\n')}\n${between}\n${real}`

    const chapters = splitChapters(text)
    // 目录页 5 条假标题被剔除；前置内容不足 200 字符，不单独成"序"，并入第一章
    expect(chapters).toHaveLength(5)
    expect(chapters[0].title).toBe('第一章 开端')
    expect(chapters.filter((c) => c.title === '第一章 开端')).toHaveLength(1)
    expectCoverage(text, chapters)
  })

  it('前置内容足够长时单独成"序"章', () => {
    const preface = '　　'.concat('这是作者写在正文之前的一段很长的话，用来占位。'.repeat(12))
    const text = `${preface}\n\n第一章 开端\n${LONG}\n\n第二章 波折\n${LONG}`
    const chapters = splitChapters(text)
    expect(chapters[0].title).toBe('序')
    expect(chapters[1].title).toBe('第一章 开端')
    expectCoverage(text, chapters)
  })

  it('超短章节向后合并，标题丢弃但内容保留', () => {
    const text = `第一章 一\n${LONG}\n\n第二章 二\n短\n\n第三章 三\n${LONG}`
    const chapters = splitChapters(text)
    expect(chapters).toHaveLength(2)
    expect(chapters.map((c) => c.title)).toEqual(['第一章 一', '第三章 三'])
    expect(text.slice(chapters[1].start, chapters[1].end)).toContain('短')
    expectCoverage(text, chapters)
  })

  it('编号标题在强标题不足时兜底生效', () => {
    const text = Array.from({ length: 6 }, (_, i) => `${i + 1}、第${i + 1}小段\n${LONG}`).join('\n\n')
    const chapters = splitChapters(text)
    expect(chapters).toHaveLength(6)
    expect(chapters[0].title).toBe('1、第1小段')
    expectCoverage(text, chapters)
  })
})

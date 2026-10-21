import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { decodeBuffer } from '../electron/services/encoding'
import { normalizeText, splitChapters } from '../electron/services/chapter'

/**
 * 样书冒烟测试：samples/ 由 scripts/gen-samples.mjs 生成且不进版本库，
 * 不存在时整组跳过，不阻塞 CI。
 */
const sampleDir = path.resolve('samples')
const available = fs.existsSync(sampleDir)
const readSample = (name: string): Buffer => fs.readFileSync(path.join(sampleDir, name))

describe.skipIf(!available)('样书冒烟', () => {
  it('UTF-8 样书：开头目录页不产生大量空章节', () => {
    const { text, encoding } = decodeBuffer(readSample('示例-UTF8.txt'))
    expect(encoding).toBe('UTF-8')
    const normalized = normalizeText(text)
    const chapters = splitChapters(normalized)

    expect(chapters.length).toBeGreaterThanOrEqual(10)
    const empty = chapters.filter((c) => normalized.slice(c.start, c.end).trim().length < 60)
    expect(empty).toHaveLength(0)
    expect(chapters[0].start).toBe(0)
    expect(chapters[chapters.length - 1].end).toBe(normalized.length)
  })

  it('GBK 样书：解码后与 UTF-8 版内容一致', () => {
    const gbk = decodeBuffer(readSample('示例-GBK.txt'))
    const utf8 = decodeBuffer(readSample('示例-UTF8.txt'))
    expect(['GB18030', 'GBK']).toContain(gbk.encoding)
    expect(gbk.text).toBe(utf8.text)
  })

  it('无章节标记的样书：兜底切块仍然可读', () => {
    const { text } = decodeBuffer(readSample('示例-无章节标记.txt'))
    const chapters = splitChapters(normalizeText(text))
    expect(chapters.length).toBeGreaterThan(1)
    expect(chapters.every((c) => c.end > c.start)).toBe(true)
  })

  it('章节标题里不含目录页残留', () => {
    const { text } = decodeBuffer(readSample('示例-UTF8.txt'))
    const chapters = splitChapters(normalizeText(text))
    const titles = chapters.map((c) => c.title)
    expect(new Set(titles).size).toBe(titles.length)
    expect(titles.some((t) => t.includes('风起'))).toBe(true)
  })
})

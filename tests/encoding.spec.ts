import { describe, expect, it } from 'vitest'
import iconv from 'iconv-lite'
import { decodeBuffer, scoreDecodedText } from '../electron/services/encoding'
import { splitChapters } from '../electron/services/chapter'

const SAMPLE = [
  '第一章 风起',
  '　　这是一段中文正文，用来测试编码探测是否正确。',
  '',
  '第二章 云涌',
  '　　第二段正文，包含标点符号、数字 123 与英文 words。',
  '',
  '第三章 雨落',
  '　　第三段正文，收尾。'
].join('\r\n')

describe('decodeBuffer', () => {
  it('识别 UTF-8 BOM 并去掉 BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(SAMPLE, 'utf8')])
    const { text, encoding } = decodeBuffer(buf)
    expect(encoding).toBe('UTF-8')
    expect(text.charCodeAt(0)).not.toBe(0xfeff)
    expect(text).toContain('第一章 风起')
  })

  it('识别无 BOM 的 UTF-8', () => {
    const { text, encoding } = decodeBuffer(Buffer.from(SAMPLE, 'utf8'))
    expect(encoding).toBe('UTF-8')
    expect(text).toContain('第二章 云涌')
  })

  it('识别 GBK 编码的中文，不产生乱码', () => {
    const buf = iconv.encode(SAMPLE, 'gbk')
    const { text, encoding } = decodeBuffer(buf)
    expect(['GB18030', 'GBK']).toContain(encoding)
    expect(text).toContain('第三章 雨落')
    expect(text).not.toContain('\uFFFD')
    expect(text).not.toContain('锟斤拷')
  })

  it('识别 UTF-16LE BOM', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(SAMPLE, 'utf16le')])
    const { text, encoding } = decodeBuffer(buf)
    expect(encoding).toBe('UTF-16LE')
    expect(text).toContain('第一章 风起')
  })

  it('纯 ASCII 走 UTF-8', () => {
    const { text, encoding } = decodeBuffer(Buffer.from('hello world\nline 2', 'utf8'))
    expect(encoding).toBe('UTF-8')
    expect(text).toBe('hello world\nline 2')
  })

  it('空 buffer 不抛错', () => {
    expect(decodeBuffer(Buffer.alloc(0)).text).toBe('')
  })
})

describe('scoreDecodedText', () => {
  it('正确文本得分明显低于乱码文本', () => {
    const good = scoreDecodedText('第一章 风起，这是一段正常的中文正文。'.repeat(50))
    const bad = scoreDecodedText('锟斤拷' + '\uFFFD'.repeat(20) + '\u0001'.repeat(20))
    expect(good).toBeLessThan(bad)
  })
})

describe('GBK 全链路', () => {
  it('GBK 文件解码后仍能正确切章', () => {
    const buf = iconv.encode(SAMPLE, 'gbk')
    const { text } = decodeBuffer(buf)
    const chapters = splitChapters(text)
    expect(chapters.length).toBe(3)
    expect(chapters[0].title).toContain('第一章')
    expect(chapters[0].start).toBe(0)
    expect(chapters[chapters.length - 1].end).toBe(text.length)
  })
})

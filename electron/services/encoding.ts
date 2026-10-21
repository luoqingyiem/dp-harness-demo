import { isUtf8 } from 'node:buffer'
import * as iconv from 'iconv-lite'

export interface DecodeResult {
  text: string
  encoding: string
}

/** 常见乱码片段：命中一次就说明这次解码基本是错的 */
const MOJIBAKE_FRAGMENTS: readonly string[] = [
  '锟斤拷',
  '烫烫烫',
  '屯屯屯',
  'Ã¤',
  'Ã©',
  'Ã¨',
  'Ã¼',
  'â€',
  'ï¼',
  'å¤',
  'ã€',
  '€œ'
]

const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
const REPLACEMENT_RE = /\uFFFD/g
const PRIVATE_USE_RE = /[\uE000-\uF8FF]/g
const RARE_CJK_RE = /[\u3400-\u4DBF\uF900-\uFAFF]/g

function countOf(text: string, re: RegExp): number {
  re.lastIndex = 0
  let count = 0
  while (re.exec(text) !== null) count += 1
  return count
}

/** 乱码打分：越小越像正确解码。按每千字符归一化，便于不同长度候选之间比较 */
export function scoreDecodedText(text: string): number {
  if (text.length === 0) return Number.POSITIVE_INFINITY
  let score = 0
  score += countOf(text, REPLACEMENT_RE) * 60
  score += countOf(text, CTRL_RE) * 40
  score += countOf(text, PRIVATE_USE_RE) * 25
  score += countOf(text, RARE_CJK_RE) * 8
  for (const fragment of MOJIBAKE_FRAGMENTS) {
    let index = text.indexOf(fragment)
    while (index !== -1) {
      score += 30
      index = text.indexOf(fragment, index + fragment.length)
    }
  }
  return (score / text.length) * 1000
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function hasBom(buf: Buffer, bytes: readonly number[]): boolean {
  if (buf.length < bytes.length) return false
  return bytes.every((byte, index) => buf[index] === byte)
}

/**
 * 编码探测 + 解码。优先级：UTF-8 BOM → UTF-16 BOM → 合法 UTF-8 → GB18030/BIG5/UTF-16LE 打分取最低
 * 不使用 chardet（未安装且是 ESM-only）
 */
export function decodeBuffer(buf: Buffer): DecodeResult {
  if (!buf || buf.length === 0) return { text: '', encoding: 'UTF-8' }

  if (hasBom(buf, [0xef, 0xbb, 0xbf])) {
    return { text: buf.subarray(3).toString('utf8'), encoding: 'UTF-8' }
  }
  if (hasBom(buf, [0xff, 0xfe])) {
    return { text: stripBom(iconv.decode(buf, 'utf16le')), encoding: 'UTF-16LE' }
  }
  if (hasBom(buf, [0xfe, 0xff])) {
    return { text: stripBom(iconv.decode(buf, 'utf16be')), encoding: 'UTF-16BE' }
  }

  if (isUtf8(buf)) {
    const utf8Text = buf.toString('utf8')
    // 无 BOM 的 UTF-16LE 里 ASCII 会带 NUL，也能骗过 isUtf8，这里再比一次分
    if (!utf8Text.includes('\u0000')) return { text: utf8Text, encoding: 'UTF-8' }
    const utf16Text = stripBom(iconv.decode(buf, 'utf16le'))
    const useUtf16 = scoreDecodedText(utf16Text) < scoreDecodedText(utf8Text)
    return useUtf16
      ? { text: utf16Text, encoding: 'UTF-16LE' }
      : { text: utf8Text, encoding: 'UTF-8' }
  }

  const candidates: DecodeResult[] = [
    { text: iconv.decode(buf, 'gb18030'), encoding: 'GB18030' },
    { text: iconv.decode(buf, 'big5'), encoding: 'BIG5' },
    { text: stripBom(iconv.decode(buf, 'utf16le')), encoding: 'UTF-16LE' }
  ]
  let best = candidates[0]
  let bestScore = scoreDecodedText(best.text)
  for (const candidate of candidates.slice(1)) {
    const score = scoreDecodedText(candidate.text)
    if (score < bestScore) {
      best = candidate
      bestScore = score
    }
  }
  return best
}

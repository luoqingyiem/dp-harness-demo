import type { Chapter } from '@shared/types'

export interface SplitOptions {
  /** 正文 trim 后短于此长度的章节会被合并，默认 60 */
  minChapterChars?: number
  /** 无章节标记时的兜底切块长度，默认 3000 */
  chunkChars?: number
}

interface Heading {
  start: number
  title: string
}

interface Segment {
  title: string
  start: number
  end: number
}

const DEFAULT_MIN_CHAPTER_CHARS = 60
const DEFAULT_CHUNK_CHARS = 3000
const TOC_GAP_LIMIT = 60
const TOC_MIN_TITLES = 5
const TOC_FRONT_CHARS = 2000
const TOC_FRONT_RATIO = 0.05
/** 目录块本身占全文的比例上限：超过这个比例的"连续标题"更可能是短章正文（诗集）而不是目录 */
const TOC_MAX_SPAN_RATIO = 0.3
/** 重复标题去重时，只有位于文件前这么多字符（或前 15%）的重复项才当作目录 */
const DUPLICATE_FRONT_CHARS = 3000
const DUPLICATE_FRONT_RATIO = 0.15
/** 前置内容短于这个长度就不单独成"序"章，直接并进第一章 */
const FRONT_MATTER_MIN_CHARS = 200

const STRONG_RE = /^[ \t\u3000]*(第[0-9零一二三四五六七八九十百千万两〇]{1,10}[章节回卷篇部集][^\n]{0,30})[ \t\u3000]*$/gm
const SUPPLEMENT_RE = /^[ \t\u3000]*((?:序章|楔子|序言|前言|引言|后记|尾声|番外)[^\n]{0,30})[ \t\u3000]*$/gm
const ENGLISH_RE = /^[ \t\u3000]*(chapter[ \t]+\d+[^\n]{0,40})[ \t\u3000]*$/gim
const NUMBERED_RE = /^[ \t\u3000]*([0-9]{1,3}[、.．][ \t\u3000]*\S[^\n]{0,30})[ \t\u3000]*$/gm

/** 去 BOM、换行统一成 \n、去 NUL、连续 3+ 空行压成 2 个空行 */
export function normalizeText(text: string): string {
  if (!text) return ''
  let out = text
  if (out.charCodeAt(0) === 0xfeff) out = out.slice(1)
  out = out.replace(/\r\n?/g, '\n')
  out = out.replace(/\u0000/g, '')
  out = out.replace(/\n{4,}/g, '\n\n\n')
  return out
}

function collect(text: string, re: RegExp, accept: (title: string) => boolean): Heading[] {
  const out: Heading[] = []
  re.lastIndex = 0
  let match = re.exec(text)
  while (match !== null) {
    const title = (match[1] ?? match[0]).trim()
    if (accept(title)) out.push({ start: match.index, title })
    match = re.exec(text)
  }
  return out
}

function dedupe(list: Heading[]): Heading[] {
  const sorted = [...list].sort((a, b) => a.start - b.start)
  const out: Heading[] = []
  for (const heading of sorted) {
    const prev = out[out.length - 1]
    if (prev && prev.start === heading.start) continue
    out.push(heading)
  }
  return out
}

/**
 * 目录页最可靠的信号：目录里的标题会在正文里**再出现一次**。
 * 只丢弃位于文件前部（前 15% 或前 3000 字符）的重复标题，正文里靠后的同名标题一律保留。
 */
function dropDuplicateTitles(headings: Heading[], text: string): Heading[] {
  if (headings.length < 2) return headings
  const frontLimit = Math.max(DUPLICATE_FRONT_CHARS, text.length * DUPLICATE_FRONT_RATIO)
  const lastIndex = new Map<string, number>()
  headings.forEach((heading, index) => lastIndex.set(heading.title, index))
  return headings.filter((heading, index) => {
    const last = lastIndex.get(heading.title)
    if (last === undefined || last === index) return true
    return heading.start >= frontLimit
  })
}

/**
 * 兜底：开头目录页里若有被截断的标题（正文标题更长，重复匹配不到），
 * 用"连续 ≥5 个标题且彼此间距 <60 字符"来识别。判断是否属于目录看的是它**后面**
 * 还有没有正文，否则目录最后一行会顺着小间距把真正的第 1 章一起吞进来。
 */
function detectToc(headings: Heading[], text: string): { from: number; to: number } | null {
  const frontLimit = Math.max(TOC_FRONT_CHARS, text.length * TOC_FRONT_RATIO)
  const spanLimit = text.length * TOC_MAX_SPAN_RATIO
  for (let i = 0; i < headings.length; i += 1) {
    let end = i
    while (end < headings.length - 1 && headings[end + 1].start - headings[end].start < TOC_GAP_LIMIT) {
      end += 1
    }
    // [i, end) 之间每个标题后面都紧跟下一个标题，说明它们没有正文，是目录行
    const count = end - i
    const span = end > i ? headings[end - 1].start - headings[i].start : 0
    if (count >= TOC_MIN_TITLES && span < spanLimit && headings[i].start < frontLimit) {
      return { from: i, to: end - 1 }
    }
    i = end
  }
  return null
}

function findHeadings(text: string): Heading[] {
  const primary: Heading[] = [
    ...collect(text, STRONG_RE, (t) => t.length <= 40 && !t.includes('。')),
    ...collect(text, SUPPLEMENT_RE, (t) => t.length <= 40 && !t.includes('。')),
    ...collect(text, ENGLISH_RE, (t) => t.length > 0 && t.length <= 60 && !t.includes('。'))
  ]
  let headings = dedupe(primary)
  headings = dropDuplicateTitles(headings, text)

  const toc = detectToc(headings, text)
  if (toc) {
    const kept = headings.filter((_, index) => index < toc.from || index > toc.to)
    if (kept.length >= 3) headings = kept
  }

  if (headings.length < 3) {
    const numbered = collect(text, NUMBERED_RE, (t) => t.length > 0 && t.length <= 40 && !t.includes('。'))
    if (numbered.length >= 5) headings = dedupe([...headings, ...numbered])
  }
  return headings
}

function bodyLength(text: string, segment: Segment): number {
  return text.slice(segment.start, segment.end).trim().length
}

/** 正文太短的章节向后合并（标题丢弃），最后一章向前合并 */
function mergeShort(segments: Segment[], text: string, minChars: number): Segment[] {
  const list = segments.map((segment) => ({ ...segment }))
  let index = 0
  while (index < list.length - 1) {
    if (bodyLength(text, list[index]) < minChars) {
      list[index + 1].start = list[index].start
      list.splice(index, 1)
    } else {
      index += 1
    }
  }
  while (list.length > 1 && bodyLength(text, list[list.length - 1]) < minChars) {
    const last = list.pop()
    if (!last) break
    list[list.length - 1].end = last.end
  }
  return list
}

function finalize(text: string, segments: Segment[]): Chapter[] {
  const chapters: Chapter[] = []
  let cursor = 0
  for (let i = 0; i < segments.length; i += 1) {
    const isLast = i === segments.length - 1
    const start = cursor
    const end = isLast ? text.length : Math.max(cursor, Math.min(text.length, segments[i].end))
    if (end <= start) continue
    const title = segments[i].title.trim() || `第 ${chapters.length + 1} 节`
    chapters.push({ index: chapters.length, title, start, end })
    cursor = end
  }
  return chapters
}

function buildFromHeadings(text: string, headings: Heading[], minChars: number): Segment[] {
  const segments: Segment[] = []
  const first = headings[0]
  // 前置内容（书名、作者、目录页残留）太短就不单独成章，直接并进第一章
  const frontLength = first ? text.slice(0, first.start).trim().length : 0
  if (first && first.start > 0 && frontLength >= Math.max(minChars, FRONT_MATTER_MIN_CHARS)) {
    segments.push({ title: '序', start: 0, end: first.start })
  }
  for (let i = 0; i < headings.length; i += 1) {
    const start = headings[i].start
    const end = i + 1 < headings.length ? headings[i + 1].start : text.length
    if (end <= start) continue
    segments.push({ title: headings[i].title, start, end })
  }
  return segments
}

/** 兜底：按 chunkChars 在段落边界切块 */
function buildChunks(text: string, chunkChars: number): Segment[] {
  if (text.length < 5000) return [{ title: '全文', start: 0, end: text.length }]
  const segments: Segment[] = []
  let start = 0
  let ordinal = 1
  while (start < text.length) {
    let end = Math.min(text.length, start + chunkChars)
    if (end < text.length) {
      const before = text.lastIndexOf('\n', end - 1)
      if (before > start + Math.floor(chunkChars / 2)) {
        end = before + 1
      } else {
        const after = text.indexOf('\n', end)
        if (after > start) end = after + 1
      }
    }
    segments.push({ title: `第 ${ordinal} 节`, start, end })
    start = end
    ordinal += 1
  }
  return segments
}

/**
 * 切分章节。纯函数：只依赖传入文本，返回的 start/end 均相对同一份 text。
 * 保证：chapters[0].start === 0、末章 end === text.length、index 连续、无空章节。
 */
export function splitChapters(text: string, opts: SplitOptions = {}): Chapter[] {
  if (!text || text.trim().length === 0) return []
  const minChars = opts.minChapterChars ?? DEFAULT_MIN_CHAPTER_CHARS
  const chunkChars = opts.chunkChars ?? DEFAULT_CHUNK_CHARS

  const headings = findHeadings(text)
  const segments = headings.length > 0 ? buildFromHeadings(text, headings, minChars) : buildChunks(text, chunkChars)
  const merged = mergeShort(segments, text, minChars)
  // 合并碎章是为了消灭"开头目录页"造成的空章节；但如果一次合并把整本书压成 1~2 章，
  // 说明这些短章是真实内容（诗集、短篇集），此时保留未合并的结果。
  const collapsed = segments.length - merged.length > 1 && merged.length < 3
  const kept = collapsed ? segments : merged
  return finalize(text, kept)
}

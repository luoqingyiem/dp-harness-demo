"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeText = normalizeText;
exports.splitChapters = splitChapters;
const DEFAULT_MIN_CHAPTER_CHARS = 60;
const DEFAULT_CHUNK_CHARS = 3000;
const TOC_GAP_LIMIT = 60;
const TOC_MIN_TITLES = 5;
const TOC_FRONT_CHARS = 2000;
const TOC_FRONT_RATIO = 0.05;
const STRONG_RE = /^[ \t\u3000]*(第[0-9零一二三四五六七八九十百千万两〇]{1,10}[章节回卷篇部集][^\n]{0,30})[ \t\u3000]*$/gm;
const SUPPLEMENT_RE = /^[ \t\u3000]*((?:序章|楔子|序言|前言|引言|后记|尾声|番外)[^\n]{0,30})[ \t\u3000]*$/gm;
const ENGLISH_RE = /^[ \t\u3000]*(chapter[ \t]+\d+[^\n]{0,40})[ \t\u3000]*$/gim;
const NUMBERED_RE = /^[ \t\u3000]*([0-9]{1,3}[、.．][ \t\u3000]*\S[^\n]{0,30})[ \t\u3000]*$/gm;
/** 去 BOM、换行统一成 \n、去 NUL、连续 3+ 空行压成 2 个空行 */
function normalizeText(text) {
    if (!text)
        return '';
    let out = text;
    if (out.charCodeAt(0) === 0xfeff)
        out = out.slice(1);
    out = out.replace(/\r\n?/g, '\n');
    out = out.replace(/\u0000/g, '');
    out = out.replace(/\n{4,}/g, '\n\n\n');
    return out;
}
function collect(text, re, accept) {
    const out = [];
    re.lastIndex = 0;
    let match = re.exec(text);
    while (match !== null) {
        const title = (match[1] ?? match[0]).trim();
        if (accept(title))
            out.push({ start: match.index, title });
        match = re.exec(text);
    }
    return out;
}
function dedupe(list) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    const out = [];
    for (const heading of sorted) {
        const prev = out[out.length - 1];
        if (prev && prev.start === heading.start)
            continue;
        out.push(heading);
    }
    return out;
}
/** 开头目录页：≥5 个标题、相邻间隔都 < 60 字符、且起始位置在文件前 2000 字符或前 5% 内 */
function detectToc(headings, text) {
    const frontLimit = Math.max(TOC_FRONT_CHARS, text.length * TOC_FRONT_RATIO);
    for (let i = 0; i < headings.length; i += 1) {
        let j = i;
        while (j + 1 < headings.length && headings[j + 1].start - headings[j].start < TOC_GAP_LIMIT)
            j += 1;
        const count = j - i + 1;
        if (count >= TOC_MIN_TITLES && headings[i].start < frontLimit)
            return { from: i, to: j };
        i = j;
    }
    return null;
}
function findHeadings(text) {
    const primary = [
        ...collect(text, STRONG_RE, (t) => t.length <= 40 && !t.includes('。')),
        ...collect(text, SUPPLEMENT_RE, (t) => t.length <= 40 && !t.includes('。')),
        ...collect(text, ENGLISH_RE, (t) => t.length > 0 && t.length <= 60 && !t.includes('。'))
    ];
    let headings = dedupe(primary);
    const toc = detectToc(headings, text);
    if (toc) {
        const kept = headings.filter((_, index) => index < toc.from || index > toc.to);
        if (kept.length >= 3)
            headings = kept;
    }
    if (headings.length < 3) {
        const numbered = collect(text, NUMBERED_RE, (t) => t.length > 0 && t.length <= 40 && !t.includes('。'));
        if (numbered.length >= 5)
            headings = dedupe([...headings, ...numbered]);
    }
    return headings;
}
function bodyLength(text, segment) {
    return text.slice(segment.start, segment.end).trim().length;
}
/** 正文太短的章节向后合并（标题丢弃），最后一章向前合并 */
function mergeShort(segments, text, minChars) {
    const list = segments.map((segment) => ({ ...segment }));
    let index = 0;
    while (index < list.length - 1) {
        if (bodyLength(text, list[index]) < minChars) {
            list[index + 1].start = list[index].start;
            list.splice(index, 1);
        }
        else {
            index += 1;
        }
    }
    while (list.length > 1 && bodyLength(text, list[list.length - 1]) < minChars) {
        const last = list.pop();
        if (!last)
            break;
        list[list.length - 1].end = last.end;
    }
    return list;
}
function finalize(text, segments) {
    const chapters = [];
    let cursor = 0;
    for (let i = 0; i < segments.length; i += 1) {
        const isLast = i === segments.length - 1;
        const start = cursor;
        const end = isLast ? text.length : Math.max(cursor, Math.min(text.length, segments[i].end));
        if (end <= start)
            continue;
        const title = segments[i].title.trim() || `第 ${chapters.length + 1} 节`;
        chapters.push({ index: chapters.length, title, start, end });
        cursor = end;
    }
    return chapters;
}
function buildFromHeadings(text, headings, minChars) {
    const segments = [];
    const first = headings[0];
    if (first && first.start > 0 && text.slice(0, first.start).trim().length >= minChars) {
        segments.push({ title: '序', start: 0, end: first.start });
    }
    for (let i = 0; i < headings.length; i += 1) {
        const start = headings[i].start;
        const end = i + 1 < headings.length ? headings[i + 1].start : text.length;
        if (end <= start)
            continue;
        segments.push({ title: headings[i].title, start, end });
    }
    return segments;
}
/** 兜底：按 chunkChars 在段落边界切块 */
function buildChunks(text, chunkChars) {
    if (text.length < 5000)
        return [{ title: '全文', start: 0, end: text.length }];
    const segments = [];
    let start = 0;
    let ordinal = 1;
    while (start < text.length) {
        let end = Math.min(text.length, start + chunkChars);
        if (end < text.length) {
            const before = text.lastIndexOf('\n', end - 1);
            if (before > start + Math.floor(chunkChars / 2)) {
                end = before + 1;
            }
            else {
                const after = text.indexOf('\n', end);
                if (after > start)
                    end = after + 1;
            }
        }
        segments.push({ title: `第 ${ordinal} 节`, start, end });
        start = end;
        ordinal += 1;
    }
    return segments;
}
/**
 * 切分章节。纯函数：只依赖传入文本，返回的 start/end 均相对同一份 text。
 * 保证：chapters[0].start === 0、末章 end === text.length、index 连续、无空章节。
 */
function splitChapters(text, opts = {}) {
    if (!text || text.trim().length === 0)
        return [];
    const minChars = opts.minChapterChars ?? DEFAULT_MIN_CHAPTER_CHARS;
    const chunkChars = opts.chunkChars ?? DEFAULT_CHUNK_CHARS;
    const headings = findHeadings(text);
    const segments = headings.length > 0 ? buildFromHeadings(text, headings, minChars) : buildChunks(text, chunkChars);
    const merged = mergeShort(segments, text, minChars);
    return finalize(text, merged);
}

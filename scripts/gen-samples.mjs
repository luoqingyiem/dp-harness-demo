/**
 * 生成用于手工验收的样书（不做提交，samples/ 已在 .gitignore 中）。
 * 用法：node scripts/gen-samples.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import iconv from 'iconv-lite'

const outDir = path.resolve('samples')
fs.mkdirSync(outDir, { recursive: true })

const body = [
  '　　清晨的风从山谷里涌上来，带着草木和湿土的气味。他站在崖边，看着远处层层叠叠的青色山脊，忽然觉得这许多年里所有的奔波都有了着落。',
  '　　远处传来钟声，一下，又一下，慢慢地散进云里。',
  '　　他把手里的信纸折好，塞回怀里，转身朝山下走去。'
].join('\n')

function chapter(n, title) {
  const paragraphs = Array.from({ length: 12 }, () => body).join('\n\n')
  return `第${n}章 ${title}\n\n${paragraphs}\n`
}

const heads = ['风起', '入山', '旧信', '夜雨', '故人', '长路', '归途', '灯火', '远行', '重逢', '落幕', '尾声']
const chapters = heads.map((h, i) => chapter(i + 1, h)).join('\n')
const toc = heads.map((h, i) => `第${i + 1}章 ${h}`).join('\n')
// 故意在开头放一份目录页，用来验收"目录页不产生空章节"
const withToc = `山野纪事\n\n目录\n${toc}\n\n${chapters}`

fs.writeFileSync(path.join(outDir, '示例-UTF8.txt'), withToc, 'utf8')
fs.writeFileSync(path.join(outDir, '示例-GBK.txt'), iconv.encode(withToc, 'gbk'))
fs.writeFileSync(
  path.join(outDir, '示例-无章节标记.txt'),
  `一段没有章节标记的长文本。\n\n${body}\n\n`.repeat(120),
  'utf8'
)

for (const file of fs.readdirSync(outDir)) {
  console.log(file, fs.statSync(path.join(outDir, file)).size, 'bytes')
}

<script setup lang="ts">
import { computed } from 'vue'
import type { ChapterPayload } from '@shared/types'

const props = defineProps<{
  content: ChapterPayload
}>()

/** 标题行：强匹配且不长，用来免掉首行缩进 */
const HEADING_RE = /^第[0-9零一二三四五六七八九十百千万两〇]{1,10}[章节回卷篇部集]/

const title = computed(() => props.content.title.trim())

const lines = computed<string[]>(() => {
  const text = props.content.text
  if (!text) return []
  const list = text
    .split('\n')
    .map((line) => line.replace(/^[\s\u3000]+/, '').trimEnd())
    .filter((line) => line.length > 0)
  // 正文首行常常就是章节标题，已经在 <h2> 里显示过，这里去重
  if (title.value && list[0] === title.value) list.shift()
  return list
})

function isHeading(line: string): boolean {
  if (title.value && line === title.value) return true
  return line.length <= 40 && HEADING_RE.test(line)
}
</script>

<template>
  <!-- 性能：正文区不使用任何 Element Plus 组件，只有纯 <p> 流 -->
  <article class="paper">
    <h2 class="paper__chapter">{{ title }}</h2>
    <p
      v-for="(line, index) in lines"
      :key="index"
      class="paper__p"
      :class="{ 'paper__p--head': isHeading(line) }"
    >{{ line }}</p>
  </article>
</template>

<style scoped>
.paper {
  max-width: var(--reader-max-width);
  margin: 0 auto;
  font-family: var(--reader-font-family);
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  color: var(--reader-fg);
}

.paper__chapter {
  margin: 0 0 1.4em;
  font-size: 1.22em;
  font-weight: 600;
  line-height: 1.5;
  text-align: center;
  letter-spacing: 0.02em;
}

.paper__p {
  margin: 0 0 var(--reader-paragraph-gap);
  text-indent: 2em;
  text-align: justify;
  word-break: break-word;
  content-visibility: auto;
  contain-intrinsic-size: auto 3.2em;
}

.paper__p--head {
  text-indent: 0;
  font-weight: 600;
  margin-bottom: calc(var(--reader-paragraph-gap) * 0.6);
}
</style>

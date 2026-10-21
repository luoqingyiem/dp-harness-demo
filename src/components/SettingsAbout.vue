<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElButton } from 'element-plus'
import { toastError, unwrap } from '@/lib/api'

defineProps<{
  dataDir: string
}>()

const version = ref('—')
const opening = ref(false)

async function openDataDir(): Promise<void> {
  opening.value = true
  try {
    await unwrap(window.api.app.openDataDir())
  } catch (error) {
    toastError(error, '打开数据目录失败')
  } finally {
    opening.value = false
  }
}

onMounted(async () => {
  try {
    version.value = await unwrap(window.api.app.version())
  } catch {
    // 版本号只用于展示，取不到就显示占位符，不打扰用户
    version.value = '—'
  }
})
</script>

<template>
  <section class="about">
    <h4 class="about__title">关于</h4>
    <p class="about__line">
      <span class="about__key">数据目录</span>
      <span class="about__val" :title="dataDir">{{ dataDir || '正在探测…' }}</span>
    </p>
    <p class="about__line">
      <span class="about__key">版本</span>
      <span class="about__val">{{ version }}</span>
    </p>
    <ElButton size="small" :loading="opening" @click="openDataDir">打开数据目录</ElButton>
  </section>
</template>

<style scoped>
.about {
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.about__title {
  margin: 0;
  font-size: 13px;
  color: var(--app-fg);
}

.about__line {
  margin: 0;
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.about__key {
  flex: 0 0 64px;
  color: var(--app-fg-muted);
}

.about__val {
  flex: 1;
  word-break: break-all;
  color: var(--app-fg);
}
</style>

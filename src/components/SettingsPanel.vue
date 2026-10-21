<script setup lang="ts">
import { ElDrawer, ElRadioButton, ElRadioGroup, ElSlider, ElSwitch } from "element-plus";
import { SETTINGS_LIMITS, type ReaderSettings, type ThemeName } from "@shared/types";
import SettingsAbout from "@/components/SettingsAbout.vue";

const props = defineProps<{
  settings: ReaderSettings;
}>();

const emit = defineEmits<{
  update: [patch: Partial<ReaderSettings>];
}>();

const visible = defineModel<boolean>({ required: true });

const [FONT_MIN, FONT_MAX] = SETTINGS_LIMITS.fontSize;
const [LINE_MIN, LINE_MAX] = SETTINGS_LIMITS.lineHeight;
const [GAP_MIN, GAP_MAX] = SETTINGS_LIMITS.paragraphSpacing;
const [WIDTH_MIN, WIDTH_MAX] = SETTINGS_LIMITS.maxWidth;

const THEMES: { value: ThemeName; label: string }[] = [
  { value: "light", label: "亮色" },
  { value: "sepia", label: "暖色" },
  { value: "dark", label: "暗色" },
];

function pick(value: number | number[]): number | null {
  const next = Array.isArray(value) ? value[0] : value;
  return typeof next === "number" ? next : null;
}

function onFontSize(value: number | number[]): void {
  const next = pick(value);
  if (next !== null) emit("update", { fontSize: next });
}

function onLineHeight(value: number | number[]): void {
  const next = pick(value);
  if (next !== null) emit("update", { lineHeight: next });
}

function onParagraphSpacing(value: number | number[]): void {
  const next = pick(value);
  if (next !== null) emit("update", { paragraphSpacing: next });
}

function onMaxWidth(value: number | number[]): void {
  const next = pick(value);
  if (next !== null) emit("update", { maxWidth: next });
}

function onFontFamily(value: string | number | boolean | undefined): void {
  if (value === "serif" || value === "sans") emit("update", { fontFamily: value });
}

function onAutoNext(value: string | number | boolean): void {
  emit("update", { autoNextChapter: Boolean(value) });
}

function onTheme(value: ThemeName): void {
  emit("update", { theme: value });
}
</script>

<template>
  <ElDrawer v-model="visible" direction="rtl" size="340px" title="阅读设置">
    <div class="panel">
      <section class="row">
        <div class="row__head">
          <span class="row__label">字号</span>
          <span class="row__value">{{ props.settings.fontSize }} px</span>
        </div>
        <ElSlider :model-value="props.settings.fontSize" :min="FONT_MIN" :max="FONT_MAX" :step="1" @update:model-value="onFontSize" />
      </section>

      <section class="row">
        <div class="row__head">
          <span class="row__label">行高</span>
          <span class="row__value">{{ props.settings.lineHeight.toFixed(2) }}</span>
        </div>
        <ElSlider :model-value="props.settings.lineHeight" :min="LINE_MIN" :max="LINE_MAX" :step="0.05" @update:model-value="onLineHeight" />
      </section>

      <section class="row">
        <div class="row__head">
          <span class="row__label">段间距</span>
          <span class="row__value">{{ props.settings.paragraphSpacing.toFixed(1) }} em</span>
        </div>
        <ElSlider :model-value="props.settings.paragraphSpacing" :min="GAP_MIN" :max="GAP_MAX" :step="0.1" @update:model-value="onParagraphSpacing" />
      </section>

      <section class="row">
        <div class="row__head">
          <span class="row__label">内容宽度</span>
          <span class="row__value">{{ props.settings.maxWidth }} px</span>
        </div>
        <ElSlider :model-value="props.settings.maxWidth" :min="WIDTH_MIN" :max="WIDTH_MAX" :step="20" @update:model-value="onMaxWidth" />
      </section>

      <section class="row">
        <div class="row__head">
          <span class="row__label">字体</span>
        </div>
        <ElRadioGroup :model-value="props.settings.fontFamily" @update:model-value="onFontFamily">
          <ElRadioButton value="serif">衬线</ElRadioButton>
          <ElRadioButton value="sans">无衬线</ElRadioButton>
        </ElRadioGroup>
      </section>

      <section class="row">
        <div class="row__head">
          <span class="row__label">主题</span>
        </div>
        <div class="themes">
          <button
            v-for="item in THEMES"
            :key="item.value"
            type="button"
            class="themes__item"
            :class="[`themes__item--${item.value}`, { 'is-active': props.settings.theme === item.value }]"
            @click="onTheme(item.value)"
          >
            <span class="themes__swatch" />
            <span class="themes__label">{{ item.label }}</span>
          </button>
        </div>
      </section>

      <section class="row row--inline">
        <div class="row__head">
          <span class="row__label">顶上/底下自动翻章</span>
          <span class="row__hint">在章首继续上滚切上一章，在章末继续下滚切下一章</span>
        </div>
        <ElSwitch :model-value="props.settings.autoNextChapter" @update:model-value="onAutoNext" />
      </section>

      <SettingsAbout :data-dir="props.settings.dataDir" />
    </div>
  </ElDrawer>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row--inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.row__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.row--inline .row__head {
  flex-direction: column;
  align-items: flex-start;
}

.row__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-fg);
}

.row__value {
  font-size: 12px;
  color: var(--app-fg-muted);
  font-variant-numeric: tabular-nums;
}

.row__hint {
  font-size: 12px;
  color: var(--app-fg-muted);
}

.themes {
  display: flex;
  gap: 8px;
}

.themes__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: transparent;
  color: var(--app-fg-muted);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.14s ease,
    color 0.14s ease;
}

.themes__item.is-active {
  border-color: var(--accent);
  color: var(--accent);
}

.themes__swatch {
  width: 100%;
  height: 22px;
  border-radius: 5px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.themes__item--light .themes__swatch {
  background: linear-gradient(135deg, #ffffff, #efece6);
}

.themes__item--sepia .themes__swatch {
  background: linear-gradient(135deg, #faf0dc, #e3cea6);
}

.themes__item--dark .themes__swatch {
  background: linear-gradient(135deg, #23262c, #101216);
}

.themes__label {
  line-height: 1.4;
}
</style>

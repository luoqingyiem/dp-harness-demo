import { ref } from "vue";
import { defineStore } from "pinia";
import { DEFAULT_SETTINGS, type FontFamilyName, type ReaderSettings } from "@shared/types";
import { toastError, unwrap } from "@/lib/api";

const FONT_STACK: Record<FontFamilyName, string> = {
  serif: 'Georgia, "Songti SC", "SimSun", serif',
  sans: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
};

/** 设置写盘防抖间隔（ms） */
const SAVE_DELAY = 250;

export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<ReaderSettings>({ ...DEFAULT_SETTINGS });
  const loaded = ref(false);

  let saveTimer: number | null = null;
  let pending: Partial<ReaderSettings> = {};
  let saving = false;

  /** 把主题与排版变量写到 <html>，正文区只依赖 CSS 变量，切换零重排 */
  function applyToDom(): void {
    const root = document.documentElement;
    const value = settings.value;
    root.dataset.theme = value.theme;
    root.classList.toggle("dark", value.theme === "dark");
    root.style.setProperty("--reader-font-family", FONT_STACK[value.fontFamily]);
    root.style.setProperty("--reader-font-size", `${value.fontSize}px`);
    root.style.setProperty("--reader-line-height", String(value.lineHeight));
    root.style.setProperty("--reader-paragraph-gap", `${value.paragraphSpacing}em`);
    root.style.setProperty("--reader-max-width", `${value.maxWidth}px`);
  }

  function schedule(): void {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void persist();
    }, SAVE_DELAY);
  }

  async function persist(): Promise<void> {
    const patch = pending;
    pending = {};
    if (Object.keys(patch).length === 0) return;
    if (saving) {
      pending = { ...patch, ...pending };
      schedule();
      return;
    }
    saving = true;
    try {
      const merged = await unwrap(window.api.settings.save(patch));
      if (Object.keys(pending).length === 0) settings.value = merged;
    } catch (error) {
      toastError(error, "保存设置失败");
    } finally {
      saving = false;
    }
  }

  async function load(): Promise<void> {
    try {
      settings.value = await unwrap(window.api.settings.get());
    } catch (error) {
      toastError(error, "读取设置失败，已使用默认设置");
    } finally {
      loaded.value = true;
      applyToDom();
    }
  }

  /** 立即生效 + 防抖落盘 */
  function update(patch: Partial<ReaderSettings>): void {
    settings.value = { ...settings.value, ...patch };
    applyToDom();
    pending = { ...pending, ...patch };
    schedule();
  }

  return { settings, loaded, load, applyToDom, update };
});

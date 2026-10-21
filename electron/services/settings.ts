import { DEFAULT_SETTINGS, SCHEMA_VERSION, SETTINGS_LIMITS } from '@shared/types'
import type { FontFamilyName, ReaderSettings, ThemeName } from '@shared/types'
import { dataFile, getDataDir } from './paths'
import { JsonFile } from './storage'

const THEMES: readonly ThemeName[] = ['light', 'sepia', 'dark']
const FONTS: readonly FontFamilyName[] = ['serif', 'sans']

const store = new JsonFile<Record<string, unknown>>(() => dataFile('settings.json'), () => ({}))

function pickNumber(raw: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const value = raw[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function pickEnum<T extends string>(raw: Record<string, unknown>, key: string, allowed: readonly T[], fallback: T): T {
  const value = raw[key]
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** 校验 + clamp + 强制回填 dataDir；schemaVersion 高于当前版本时回退默认值 */
function normalize(raw: unknown): ReaderSettings {
  const stored: Record<string, unknown> =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const storedVersion = typeof stored['schemaVersion'] === 'number' ? stored['schemaVersion'] : SCHEMA_VERSION
  // 更高版本可能带不兼容语义：不崩溃，直接忽略全部已存字段回退默认值
  const source: Record<string, unknown> = storedVersion > SCHEMA_VERSION ? {} : stored
  const settings: ReaderSettings = {
    schemaVersion: SCHEMA_VERSION,
    fontSize: pickNumber(source, 'fontSize', DEFAULT_SETTINGS.fontSize, SETTINGS_LIMITS.fontSize[0], SETTINGS_LIMITS.fontSize[1]),
    lineHeight: pickNumber(source, 'lineHeight', DEFAULT_SETTINGS.lineHeight, SETTINGS_LIMITS.lineHeight[0], SETTINGS_LIMITS.lineHeight[1]),
    paragraphSpacing: pickNumber(
      source,
      'paragraphSpacing',
      DEFAULT_SETTINGS.paragraphSpacing,
      SETTINGS_LIMITS.paragraphSpacing[0],
      SETTINGS_LIMITS.paragraphSpacing[1]
    ),
    maxWidth: pickNumber(source, 'maxWidth', DEFAULT_SETTINGS.maxWidth, SETTINGS_LIMITS.maxWidth[0], SETTINGS_LIMITS.maxWidth[1]),
    theme: pickEnum(source, 'theme', THEMES, DEFAULT_SETTINGS.theme),
    fontFamily: pickEnum(source, 'fontFamily', FONTS, DEFAULT_SETTINGS.fontFamily),
    autoNextChapter: typeof source['autoNextChapter'] === 'boolean' ? source['autoNextChapter'] : DEFAULT_SETTINGS.autoNextChapter,
    dataDir: getDataDir().dir
  }
  return settings
}

export function getSettings(): ReaderSettings {
  return normalize(store.read())
}

/** 合并 patch 后统一校验并落盘，返回合并后的完整设置 */
export function saveSettings(patch: Partial<ReaderSettings> | Record<string, unknown>): ReaderSettings {
  const merged: Record<string, unknown> = { ...store.read(), ...patch }
  const settings = normalize(merged)
  store.write({ ...settings })
  return settings
}

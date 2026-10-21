/**
 * 让 tsc 能识别 .vue 单文件组件（vue-tsc 之外的类型检查兜底）。
 * 必须放在没有 import/export 的文件里，否则会被当成模块增强而不是环境声明。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

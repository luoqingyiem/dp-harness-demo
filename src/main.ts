import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/theme.css'
import App from './App.vue'
import { router } from './router'
import { useSettingsStore } from './stores/settings'

async function bootstrap(): Promise<void> {
  const app = createApp(App)

  app.use(createPinia())
  app.use(router)

  // 挂载前先把设置读回来并写到 <html>，避免主题闪烁
  const settingsStore = useSettingsStore()
  await settingsStore.load()

  await router.isReady()
  app.mount('#app')
}

void bootstrap()

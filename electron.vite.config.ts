import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const root = __dirname
const sharedDir = resolve(root, 'shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': sharedDir } },
    build: {
      rollupOptions: { input: { index: resolve(root, 'electron/main.ts') } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': sharedDir } },
    build: {
      rollupOptions: { input: { index: resolve(root, 'electron/preload.ts') } }
    }
  },
  renderer: {
    root: resolve(root, 'src'),
    resolve: {
      alias: {
        '@': resolve(root, 'src'),
        '@shared': sharedDir
      }
    },
    plugins: [vue()],
    build: {
      rollupOptions: { input: { index: resolve(root, 'src/index.html') } }
    }
  }
})

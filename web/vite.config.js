import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  publicDir: 'src/public',
  resolve: { alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: {
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false
  },
  build: { target: ['chrome111', 'edge111'], sourcemap: false },
  server: { host: '127.0.0.1', port: 8010, strictPort: true },
  preview: { host: '127.0.0.1', port: 8765, strictPort: true }
})


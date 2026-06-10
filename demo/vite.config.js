import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 7432,
    proxy: {
      '/api': {
        target: 'http://localhost:9271',
        changeOrigin: true
      }
    }
  }
})

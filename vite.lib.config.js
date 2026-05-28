import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: path.resolve(__dirname, 'lib/index.js'),
      name: 'AiModelForm',
      fileName: (format) => `ai-model-form.${format === 'es' ? 'mjs' : 'umd.cjs'}`,
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: { vue: 'Vue' },
        assetFileNames: 'ai-model-form.[ext]',
      },
    },
    outDir: 'dist',
  },
});

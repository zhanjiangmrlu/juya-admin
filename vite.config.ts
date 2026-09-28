import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              maxSize: 400 * 1024,
              name: 'element-plus',
              test: /node_modules[\\/]element-plus[\\/]/
            },
            {
              name: 'vue-vendor',
              test: /node_modules[\\/](?:@vue|pinia|vue|vue-router)[\\/]/
            }
          ]
        }
      }
    }
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})

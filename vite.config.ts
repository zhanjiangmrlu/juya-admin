import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

import { createDevApiProxy } from './src/app/dev-api-proxy.js'

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '')

  return {
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                maxSize: 350 * 1024,
                name: 'echarts',
                test: /node_modules[\\/](?:echarts|zrender)[\\/]/
              },
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
    },
    server: {
      proxy: createDevApiProxy(environment.VITE_DEV_API_PROXY_TARGET)
    }
  }
})

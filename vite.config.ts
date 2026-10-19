import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

/** 根据运行模式隔离外网分享缓存，并保留同源接口代理
 * @param options Vite运行配置，mode用于区分普通开发和local-share
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    cacheDir: mode === 'local-share' ? 'node_modules/.vite-local-share-admin' : undefined,
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      host: '127.0.0.1',
      port: 5173,
      allowedHosts: mode === 'local-share' ? ['dev-admin.juyayingyu.com'] : [],
      proxy: { '/api': { target: env.VITE_DEV_API_PROXY_TARGET || 'http://127.0.0.1:8001' } }
    }
  }
})

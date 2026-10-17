import { ElDialog } from 'element-plus'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import { ensureRandomUUID } from './services/browser-compatibility'

import 'element-plus/dist/index.css'
import './styles/main.scss'
ensureRandomUUID()
createApp(App).use(createPinia()).use(router).component('ElDialog', ElDialog).mount('#app')

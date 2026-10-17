import { ElDialog } from 'element-plus'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'

import 'element-plus/dist/index.css'
import './styles/main.scss'
createApp(App).use(createPinia()).use(router).component('ElDialog', ElDialog).mount('#app')

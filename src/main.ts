import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { router } from '@/router'

import App from './App.vue'

import 'element-plus/dist/index.css'
import './styles/tokens.scss'
import './styles/element-plus.scss'
import './styles/global.scss'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.mount('#app')

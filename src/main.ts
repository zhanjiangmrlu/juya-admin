import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { router } from '@/router'

import App from './App.vue'

import './styles/global.scss'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.mount('#app')

import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { installRouteGuard } from '@/app/route-guard'
import { useAuthStore } from '@/features/auth/auth-store'
import { router } from '@/router'

import App from './App.vue'

import 'element-plus/dist/index.css'
import './styles/tokens.scss'
import './styles/element-plus.scss'
import './styles/global.scss'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
installRouteGuard(router, useAuthStore(pinia))
app.use(router)
app.use(ElementPlus)
app.mount('#app')

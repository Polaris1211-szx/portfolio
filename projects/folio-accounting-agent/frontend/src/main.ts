import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import { i18n } from './i18n'
import { router } from './router'
import { useAppearanceStore } from './stores/appearance'

const pinia = createPinia()
useAppearanceStore(pinia)
createApp(App).use(pinia).use(i18n).use(router).mount('#app')

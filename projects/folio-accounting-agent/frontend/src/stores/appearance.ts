import { onScopeDispose, ref, watch, watchEffect } from 'vue'
import { defineStore } from 'pinia'

type Theme = 'evergreen' | 'slate' | 'blue'
type ColorMode = 'light' | 'dark' | 'auto'

function readPreference(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function validTheme(value: unknown): Theme {
  return value === 'slate' || value === 'blue' ? value : 'evergreen'
}

function validMode(value: unknown): ColorMode {
  return value === 'light' || value === 'dark' ? value : 'auto'
}

export const useAppearanceStore = defineStore('appearance', () => {
  const theme = ref(validTheme(readPreference('ledgerflow-theme')))
  const mode = ref(validMode(readPreference('ledgerflow-color-mode')))
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(media.matches)

  function followSystem(event: MediaQueryListEvent) {
    systemDark.value = event.matches
  }

  media.addEventListener('change', followSystem)
  onScopeDispose(() => media.removeEventListener('change', followSystem))

  watchEffect(() => {
    const dark = mode.value === 'dark' || (mode.value === 'auto' && systemDark.value)
    document.documentElement.dataset.theme = theme.value
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  })

  watch([theme, mode], ([nextTheme, nextMode]) => {
    try {
      localStorage.setItem('ledgerflow-theme', nextTheme)
      localStorage.setItem('ledgerflow-color-mode', nextMode)
    } catch {
      // Storage can be disabled; the selected appearance still works for this page.
    }
  }, { immediate: true })

  function setTheme(value: unknown) {
    theme.value = validTheme(value)
  }

  function setMode(value: unknown) {
    mode.value = validMode(value)
  }

  return { theme, mode, setTheme, setMode }
})

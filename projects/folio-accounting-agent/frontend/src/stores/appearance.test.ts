/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppearanceStore } from './appearance'

const preferences = new Map<string, string>()
const classes = new Set<string>()
const listeners = new Set<(event: { matches: boolean }) => void>()
const root = { dataset: { theme: '' }, style: { colorScheme: '' }, classList: {
  toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name),
} }
const media = {
  matches: false,
  addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.add(listener),
  removeEventListener: (_: string, listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
}
let store: ReturnType<typeof useAppearanceStore> | undefined

beforeEach(() => {
  setActivePinia(createPinia())
  preferences.clear()
  classes.clear()
  media.matches = false
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => preferences.get(key) ?? null,
    setItem: (key: string, value: string) => preferences.set(key, value),
  })
  vi.stubGlobal('window', { matchMedia: () => media })
  vi.stubGlobal('document', { documentElement: root })
})

afterEach(() => {
  store?.$dispose()
  store = undefined
  expect(listeners.size).toBe(0)
  vi.unstubAllGlobals()
})

it('restores saved appearance before mount and persists changes', async () => {
  preferences.set('ledgerflow-theme', 'blue')
  preferences.set('ledgerflow-color-mode', 'dark')
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
  expect(script).toBeTruthy()
  runInNewContext(script!, { localStorage, window, document })
  expect(classes.has('dark')).toBe(true)
  expect(root.dataset.theme).toBe('blue')
  expect(root.style.colorScheme).toBe('dark')

  store = useAppearanceStore()
  expect(store.theme).toBe('blue')
  expect(store.mode).toBe('dark')
  store.setTheme('slate')
  store.setMode('light')
  await nextTick()
  expect(preferences.get('ledgerflow-theme')).toBe('slate')
  expect(preferences.get('ledgerflow-color-mode')).toBe('light')
  expect(classes.has('dark')).toBe(false)
  expect(root.style.colorScheme).toBe('light')
})

it('follows OS changes in auto mode without overriding an explicit choice', async () => {
  media.matches = true
  store = useAppearanceStore()
  expect(store.mode).toBe('auto')
  expect(classes.has('dark')).toBe(true)
  listeners.forEach((listener) => listener({ matches: false }))
  await nextTick()
  expect(classes.has('dark')).toBe(false)
  store.setMode('dark')
  await nextTick()
  expect(classes.has('dark')).toBe(true)
  listeners.forEach((listener) => listener({ matches: false }))
  await nextTick()
  expect(classes.has('dark')).toBe(true)
  store.setMode('auto')
  await nextTick()
  expect(classes.has('dark')).toBe(false)
})

it('normalizes invalid stored values and rejects unsupported selections', async () => {
  preferences.set('ledgerflow-theme', 'invalid')
  preferences.set('ledgerflow-color-mode', 'invalid')
  store = useAppearanceStore()
  expect(store.theme).toBe('evergreen')
  expect(store.mode).toBe('auto')
  expect(preferences.get('ledgerflow-theme')).toBe('evergreen')
  expect(preferences.get('ledgerflow-color-mode')).toBe('auto')
  store.setTheme('blue')
  store.setMode('dark')
  store.setTheme({ value: 'blue' })
  store.setMode(null)
  await nextTick()
  expect(root.dataset.theme).toBe('evergreen')
  expect(classes.has('dark')).toBe(false)
})

it('keeps appearance usable when browser storage is blocked', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('Storage disabled') },
    setItem: () => { throw new Error('Storage disabled') },
  })
  store = useAppearanceStore()
  store.setTheme('slate')
  store.setMode('dark')
  await nextTick()
  expect(root.dataset.theme).toBe('slate')
  expect(classes.has('dark')).toBe(true)
})

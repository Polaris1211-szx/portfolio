import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ErrorNotice from '@/components/ErrorNotice.vue'

const preferences = new Map<string, string>()

beforeEach(() => {
  vi.resetModules()
  preferences.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => preferences.get(key) ?? null,
    setItem: (key: string, value: string) => preferences.set(key, value),
  })
  vi.stubGlobal('document', { documentElement: { lang: '' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('defaults to English and persists the selected language with the document language', async () => {
  const { i18n, setLocale } = await import('./i18n')
  expect(i18n.global.locale.value).toBe('en')
  expect(document.documentElement.lang).toBe('en')
  expect(preferences.has('locale')).toBe(false)
  setLocale('zh-CN')
  expect(document.documentElement.lang).toBe('zh-CN')
  expect(preferences.get('locale')).toBe('zh-CN')
  vi.resetModules()
  expect((await import('./i18n')).i18n.global.locale.value).toBe('zh-CN')
})

it('falls back to English for a missing Chinese message and works without storage', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('Storage disabled') },
    setItem: () => { throw new Error('Storage disabled') },
  })
  const { i18n, setLocale } = await import('./i18n')
  i18n.global.mergeLocaleMessage('en', { fallbackProbe: 'English fallback' })
  setLocale('zh-CN')
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  expect(i18n.global.t('fallbackProbe')).toBe('English fallback')
})

it('renders API errors in the selected language with diagnostic code and request ID', async () => {
  const { i18n, setLocale } = await import('./i18n')
  setLocale('zh-CN')
  const app = createSSRApp(ErrorNotice, {
    code: 'INVALID_CREDENTIALS', status: 401, message: 'Email or password is incorrect', requestId: 'req-123',
  }).use(i18n)
  const html = await renderToString(app)
  expect(html).toContain('邮箱或密码不正确。')
  expect(html).toContain('INVALID_CREDENTIALS')
  expect(html).toContain('req-123')
  expect(html).not.toContain('Email or password is incorrect')
})

it('translates submitted activity with its round number', async () => {
  const { i18n, setLocale } = await import('./i18n')
  expect(i18n.global.t('collections.events.SUBMITTED', { round: 2 })).toBe('Client submitted round 2')
  setLocale('zh-CN')
  expect(i18n.global.t('collections.events.SUBMITTED', { round: 2 })).toBe('客户提交第 2 轮资料')
})

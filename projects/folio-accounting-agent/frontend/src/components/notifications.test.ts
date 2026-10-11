import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import { notificationsApi, type NotificationItem } from '@/api/notifications'
import { notificationsMessages } from '@/i18n/notifications'
import NotificationCenter from './NotificationCenter.vue'

const renderer = createRenderer({
  insert: () => {}, remove: () => {}, patchProp: () => {}, createElement: () => ({}),
  createText: () => ({}), createComment: () => ({}), setText: () => {},
  setElementText: () => {}, parentNode: () => null, nextSibling: () => null,
})

afterEach(() => vi.restoreAllMocks())

it('filters unread notifications, paginates, and returns to the last available page after reading', async () => {
  const notice: NotificationItem = {
    id: 'last', requestId: 'request', eventType: 'PUBLISHED', clientName: 'Client',
    period: '2026-09-01', payload: {}, readAt: null, createdAt: '2026-09-25T03:00:00Z',
  }
  let remaining = 21
  const list = vi.spyOn(notificationsApi, 'list').mockImplementation(async (params = {}) => ({
    items: [notice], total: remaining, unreadCount: remaining, page: params.page ?? 1, pageSize: 20,
  }))
  vi.spyOn(notificationsApi, 'markRead').mockImplementation(async () => {
    remaining = 20
    return { ...notice, readAt: '2026-09-25T03:01:00Z' }
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { render: () => null } },
  ] })
  await router.push('/')
  const app = renderer.createApp({ ...NotificationCenter, render: () => null }, { area: 'client', pageView: true })
    .use(router).use(createI18n({ legacy: false, locale: 'en', messages: notificationsMessages }))
  app.provide(ssrContextKey, {})
  app.mount({})
  try {
    const state = (app._instance as unknown as { setupState: {
      loading: boolean; page: number; unreadOnly: boolean
      filter: (value: boolean) => void
      markRead: (item: NotificationItem) => Promise<void>
    } }).setupState
    await vi.waitFor(() => expect(state.loading).toBe(false))
    state.filter(true)
    await nextTick()
    await vi.waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, unreadOnly: true }))
    state.page = 2
    await nextTick()
    await vi.waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 2, unreadOnly: true }))
    await state.markRead(notice)
    await nextTick()
    await vi.waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, unreadOnly: true }))
    expect(state.page).toBe(1)
    state.filter(false)
    await nextTick()
    expect(list).toHaveBeenLastCalledWith({ page: 1, unreadOnly: false })
  } finally {
    app.unmount()
  }
})

it('loads unread status, marks notifications read and opens the related request', async () => {
  const notice: NotificationItem = {
    id: 'notice', requestId: 'request', eventType: 'SUBMITTED', clientName: 'Client',
    period: '2026-09-01', payload: { roundNo: 2, manualReviewRequested: true }, readAt: null,
    createdAt: '2026-09-25T03:00:00Z',
  }
  vi.spyOn(notificationsApi, 'list').mockResolvedValue({
    items: [notice], total: 1, unreadCount: 1, page: 1, pageSize: 20,
  })
  const markRead = vi.spyOn(notificationsApi, 'markRead').mockResolvedValue({
    ...notice, readAt: '2026-09-25T03:01:00Z',
  })
  const markAllRead = vi.spyOn(notificationsApi, 'markAllRead').mockResolvedValue({} as never)
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { render: () => null } },
    { path: '/staff/collections/:id', component: { render: () => null } },
  ] })
  await router.push('/')
  const app = renderer.createApp({ ...NotificationCenter, render: () => null }, { area: 'staff' })
    .use(router)
    .use(createI18n({ legacy: false, locale: 'en', messages: notificationsMessages }))
  app.provide(ssrContextKey, {})
  app.mount({})
  try {
    const state = (app._instance as unknown as { setupState: {
      items: NotificationItem[]
      unreadCount: number
      loading: boolean
      message: (item: NotificationItem, part: 'title' | 'body') => string
      openNotification: (item: NotificationItem) => Promise<void>
      markAllRead: () => Promise<void>
    } }).setupState
    await vi.waitFor(() => expect(state.loading).toBe(false))
    expect(state.unreadCount).toBe(1)
    expect(state.message(state.items[0]!, 'title')).toBe('Manual review requested')
    await state.openNotification(state.items[0]!)
    expect(markRead).toHaveBeenCalledWith('notice')
    expect(state.unreadCount).toBe(0)
    expect(router.currentRoute.value.fullPath).toBe('/staff/collections/request')

    state.items[0]!.readAt = null
    state.unreadCount = 1
    await state.markAllRead()
    expect(markAllRead).toHaveBeenCalledOnce()
    expect(state.items[0]!.readAt).not.toBeNull()
  } finally {
    app.unmount()
  }
})

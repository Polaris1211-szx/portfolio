import type { AxiosAdapter } from 'axios'
import { AxiosError, AxiosHeaders } from 'axios'
import { createPinia } from 'pinia'
import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it, vi } from 'vitest'
import App from '@/App.vue'
import { api, refreshSession, sessionClient } from '@/api/client'
import type { AuthSession } from '@/types'
import { useAuthStore } from './auth'

it('redirects an expired session immediately without hijacking intentional sign-out', async () => {
  const apiAdapter = api.defaults.adapter
  const sessionAdapter = sessionClient.defaults.adapter
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/staff/profile', component: { render: () => null }, meta: { requiresAuth: true } },
      { path: '/login', name: 'login', component: { render: () => null } },
    ],
  })
  const renderer = createRenderer({
    insert: () => {}, remove: () => {}, patchProp: () => {},
    createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
    setText: () => {}, setElementText: () => {},
    parentNode: () => null, nextSibling: () => null,
  })
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  const session: AuthSession = {
    accessToken: 'test-access', tokenType: 'bearer', expiresIn: 900,
    user: {
      id: 'user-1', name: 'Admin', email: 'admin@example.com',
      firm: { id: 'firm-1', name: 'Firm', timezone: 'UTC' },
      firmRole: 'FIRM_ADMIN', clientMemberships: [],
    },
  }
  const successfulResponse: AxiosAdapter = async (config) => ({
    data: session, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config,
  })
  api.defaults.adapter = successfulResponse
  await auth.login('admin@example.com', 'test-password')
  await router.push('/staff/profile')
  // Vitest's Node transform supplies ssrRender; exercise the real setup without a DOM.
  const app = renderer.createApp({ ...App, render: () => null }).use(pinia).use(router)
  app.provide(ssrContextKey, {})
  app.mount({})

  try {
    sessionClient.defaults.adapter = async () => { throw new Error('Refresh revoked') }
    const redirected = new Promise<void>((resolve) => {
      const remove = router.afterEach((to) => {
        if (to.name === 'login') { remove(); resolve() }
      })
    })
    await expect(refreshSession()).rejects.toThrow('Refresh revoked')
    await redirected
    expect(auth.isAuthenticated).toBe(false)
    expect(router.currentRoute.value.query).toEqual({ redirect: '/staff/profile' })

    await auth.login('admin@example.com', 'test-password')
    await router.push('/staff/profile')
    sessionClient.defaults.adapter = successfulResponse
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
        data: {}, status: 401, statusText: 'Unauthorized', headers: new AxiosHeaders(), config,
      })
    }
    const failures = await Promise.allSettled([api.get('/me'), api.get('/clients'), api.get('/users')])
    expect(failures.every((result) => result.status === 'rejected')).toBe(true)
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(auth.sessionExpired).toBe(true)

    api.defaults.adapter = successfulResponse
    await auth.login('admin@example.com', 'test-password')
    await router.push('/staff/profile')
    api.defaults.adapter = async () => { throw new Error('Revocation unavailable') }
    await expect(auth.logout()).rejects.toThrow('Revocation unavailable')
    expect(auth.isAuthenticated).toBe(true)
    expect(router.currentRoute.value.path).toBe('/staff/profile')

    // Changing a password already revoked the server session; preserve its login notice.
    auth.clearSession()
    await router.replace({ name: 'login', query: { passwordChanged: '1' } })
    await nextTick()
    expect(auth.sessionExpired).toBe(false)
    expect(router.currentRoute.value.query).toEqual({ passwordChanged: '1' })
  } finally {
    app.unmount()
    auth.clearSession()
    api.defaults.adapter = apiAdapter
    sessionClient.defaults.adapter = sessionAdapter
  }
})

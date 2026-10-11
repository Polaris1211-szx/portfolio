import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, refreshSession, setAccessToken, setSessionListener } from '@/api/client'
import type { AuthSession, Principal } from '@/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<Principal | null>(null)
  const initialized = ref(false)
  const sessionExpired = ref(false)
  const isAuthenticated = computed(() => user.value !== null)
  const isStaff = computed(() => user.value?.firmRole != null)
  const homePath = computed(() => (isStaff.value ? '/staff' : '/client'))

  function applySession(session: AuthSession | null) {
    user.value = session?.user ?? null
    sessionExpired.value = false
    setAccessToken(session?.accessToken ?? null)
  }

  setSessionListener((session) => {
    const expired = session === null && (isAuthenticated.value || sessionExpired.value)
    applySession(session)
    sessionExpired.value = expired
  })

  function clearSession() {
    applySession(null)
  }

  async function bootstrap() {
    if (initialized.value) return
    try {
      await refreshSession()
    } catch {
      applySession(null)
    } finally {
      initialized.value = true
    }
  }

  async function login(email: string, password: string) {
    const { data } = await api.post<AuthSession>('/auth/login', { email, password })
    applySession(data)
  }

  async function logout() {
    await api.post('/auth/logout')
    clearSession()
  }

  return { user, initialized, sessionExpired, isAuthenticated, isStaff, homePath, bootstrap, login, logout, clearSession }
})

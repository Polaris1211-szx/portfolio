import { createPinia, setActivePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import type { Principal } from '@/types'
import { useAuthStore } from '@/stores/auth'

vi.mock('vue-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('vue-router')>()
  return { ...original, createWebHistory: original.createMemoryHistory }
})
vi.mock('@/components/AppShell.vue', () => ({ default: {} }))
vi.mock('@/views/HomeView.vue', () => ({ default: {} }))
vi.mock('@/views/LoginView.vue', () => ({ default: {} }))
vi.mock('@/views/NotFoundView.vue', () => ({ default: {} }))
vi.mock('@/views/ProfileView.vue', () => ({ default: {} }))
vi.mock('@/views/ClientsView.vue', () => ({ default: {} }))
vi.mock('@/views/ClientDetailView.vue', () => ({ default: {} }))
vi.mock('@/views/StaffView.vue', () => ({ default: {} }))
vi.mock('@/views/ContactsView.vue', () => ({ default: {} }))
vi.mock('@/views/InvitationAcceptView.vue', () => ({ default: {} }))
vi.mock('@/views/ForbiddenView.vue', () => ({ default: {} }))
vi.mock('@/views/PortalCollectionsView.vue', () => ({ default: {} }))
vi.mock('@/views/PortalCollectionDetailView.vue', () => ({ default: {} }))

import { router } from './router'

it('enforces staff/client boundaries and preserves guest return paths with the real guard', async () => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.initialized = true
  const user: Principal = {
    id: 'user-1', name: 'Accountant', email: 'accountant@example.com',
    firm: { id: 'firm-1', name: 'Firm', timezone: 'UTC' },
    firmRole: 'ACCOUNTANT', clientMemberships: [],
  }

  await router.push('/staff/profile?tab=security#password')
  expect(router.currentRoute.value.name).toBe('login')
  expect(router.currentRoute.value.query.redirect).toBe('/staff/profile?tab=security#password')

  auth.user = user
  await router.push('/client/profile')
  expect(router.currentRoute.value.path).toBe('/staff')
  await router.push('/login')
  expect(router.currentRoute.value.path).toBe('/staff')

  auth.user = {
    ...user, firmRole: null,
    clientMemberships: [{ clientId: 'client-1', clientName: 'Client', role: 'CLIENT_SUBMITTER' }],
  }
  await router.push('/staff/profile')
  expect(router.currentRoute.value.path).toBe('/client')
  await router.push('/login')
  expect(router.currentRoute.value.path).toBe('/client')
  await router.push('/portal/collections/request-1')
  expect(router.currentRoute.value.name).toBe('portal-collection-detail')
  expect(router.currentRoute.value.path).toBe('/client/collections/request-1')

  auth.clearSession()
  await router.push('/client/missing')
  expect(router.currentRoute.value.name).toBe('login')
  expect(router.currentRoute.value.query.redirect).toBe('/client/missing')
})

const staffUser: Principal = {
  id: 'staff-user', name: 'Staff', email: 'staff@example.com',
  firm: { id: 'firm', name: 'Firm', timezone: 'UTC' },
  firmRole: 'FIRM_ADMIN', clientMemberships: [],
}

it('allows firm administrators to manage staff and clients but sends accountants to the forbidden page', async () => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.initialized = true
  auth.user = staffUser
  for (const [path, name] of [
    ['/staff/admin/users', 'staff-users'],
    ['/staff/clients/new', 'client-new'],
    ['/staff/clients/client-1', 'client-detail'],
  ]) {
    await router.push(path!)
    expect(router.currentRoute.value.name).toBe(name)
  }

  auth.user = { ...staffUser, firmRole: 'ACCOUNTANT' }
  await router.push('/staff/clients?page=2&search=Business')
  expect(router.currentRoute.value.name).toBe('clients')
  expect(router.currentRoute.value.query).toEqual({ page: '2', search: 'Business' })
  await router.push('/staff/clients/client-1')
  expect(router.currentRoute.value.name).toBe('client-detail')
  for (const path of ['/staff/admin/users', '/staff/clients/new']) {
    await router.push(path)
    expect(router.currentRoute.value.name).toBe('staff-forbidden')
    expect(router.currentRoute.value.path).toBe('/staff/forbidden')
  }
})

it('requires at least one client-administrator membership for contact management', async () => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.initialized = true
  auth.user = {
    ...staffUser, firmRole: null,
    clientMemberships: [{ clientId: 'client-1', clientName: 'Client 1', role: 'CLIENT_SUBMITTER' }],
  }
  await router.push('/client/contacts')
  expect(router.currentRoute.value.name).toBe('client-forbidden')

  auth.user = { ...auth.user, clientMemberships: [] }
  await router.push('/client/contacts')
  expect(router.currentRoute.value.name).toBe('client-forbidden')

  auth.user = {
    ...auth.user,
    clientMemberships: [
      { clientId: 'client-1', clientName: 'Client 1', role: 'CLIENT_SUBMITTER' },
      { clientId: 'client-2', clientName: 'Client 2', role: 'CLIENT_ADMIN' },
    ],
  }
  await router.push('/client/contacts')
  expect(router.currentRoute.value.name).toBe('client-contacts')
})

it('keeps invitation acceptance public for guests and signed-in users without copying its token into a login redirect', async () => {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.initialized = true
  const principals: Array<Principal | null> = [
    null,
    staffUser,
    { ...staffUser, firmRole: null, clientMemberships: [{ clientId: 'client-1', clientName: 'Client', role: 'CLIENT_SUBMITTER' }] },
  ]
  for (const [index, principal] of principals.entries()) {
    auth.user = principal
    const hash = `#token=${String(index).repeat(40)}`
    await router.push(`/invitations/accept${hash}`)
    expect(router.currentRoute.value.name).toBe('invitation-accept')
    expect(router.currentRoute.value.hash).toBe(hash)
    expect(router.currentRoute.value.query.redirect).toBeUndefined()
    expect(router.currentRoute.value.meta.requiresAuth).not.toBe(true)
    expect(router.currentRoute.value.meta.guest).not.toBe(true)
  }
})

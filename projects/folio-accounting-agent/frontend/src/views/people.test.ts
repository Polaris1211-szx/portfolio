import { createPinia } from 'pinia'
import { createRenderer, ssrContextKey, type Component } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import { accountsApi, type Invitation, type InvitationToken, type UserAccount } from '@/api/accounts'
import { readApiError } from '@/api/client'
import InvitationsPanel from '@/components/InvitationsPanel.vue'
import { peopleMessages } from '@/i18n/people'
import { useAuthStore } from '@/stores/auth'
import InvitationAcceptView from '@/views/InvitationAcceptView.vue'
import StaffView from '@/views/StaffView.vue'

const renderer = createRenderer({
  insert: () => {}, remove: () => {}, patchProp: () => {},
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText: () => {}, setElementText: () => {}, parentNode: () => null, nextSibling: () => null,
})
const cleanup: (() => void)[] = []

async function mount<T>(component: Component, path: string, props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.user = {
    id: 'self', email: 'self@example.com', name: 'Self', firmRole: 'FIRM_ADMIN',
    firm: { id: 'firm', name: 'Firm', timezone: 'UTC' }, clientMemberships: [],
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  })
  await router.push(path)
  const app = renderer.createApp({ ...component, render: () => null }, props)
    .use(pinia).use(router).use(createI18n({ legacy: false, locale: 'en', messages: peopleMessages }))
  app.provide(ssrContextKey, {})
  app.mount({})
  cleanup.push(() => app.unmount())
  return { state: (app._instance as unknown as { setupState: T }).setupState, router }
}

afterEach(() => {
  cleanup.splice(0).forEach(unmount => unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const account: UserAccount = {
  id: 'other', name: 'Other', email: 'other@example.com', status: 'ACTIVE',
  firmRole: 'ACCOUNTANT', clientRoles: [], lastLoginAt: null,
}
const invitation: Invitation = {
  id: 'invitation', email: 'other@example.com', role: 'ACCOUNTANT', status: 'PENDING',
  createdAt: '2026-09-17T00:00:00Z', expiresAt: '2026-09-24T00:00:00Z',
}

it('restores staff filters from the URL, resets pagination on search, and prevents self-disable or duplicate writes', async () => {
  const list = vi.spyOn(accountsApi, 'listUsers').mockResolvedValue({ items: [account], total: 22, page: 2, pageSize: 20 })
  const update = vi.spyOn(accountsApi, 'updateUser')
  const { state, router } = await mount<{
    searchInput: string; selectedUser: UserAccount | null; busy: boolean; error: ReturnType<typeof readApiError> | null
    applyFilters: (status?: string) => Promise<unknown>; updateStatus: () => Promise<void>
  }>(StaffView, '/staff/admin/users?page=2&search=Case&status=DISABLED')
  expect(list).toHaveBeenLastCalledWith({ page: 2, pageSize: 20, search: 'Case', status: 'DISABLED', staffOnly: true })
  state.searchInput = '  Find me  '
  await state.applyFilters('ACTIVE')
  expect(router.currentRoute.value.query).toEqual({ search: 'Find me', status: 'ACTIVE' })
  await vi.waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, search: 'Find me', status: 'ACTIVE', staffOnly: true }))

  state.selectedUser = { ...account, id: 'self' }
  await state.updateStatus()
  expect(update).not.toHaveBeenCalled()
  let finish!: (value: UserAccount) => void
  update.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  state.selectedUser = account
  const saving = state.updateStatus()
  await state.updateStatus()
  expect(update).toHaveBeenCalledTimes(1)
  expect(update).toHaveBeenCalledWith('other', { status: 'DISABLED' })
  expect(state.busy).toBe(true)
  finish({ ...account, status: 'DISABLED' })
  await saving
  expect(state.busy).toBe(false)
  expect(state.selectedUser).toBeNull()
})

it('preserves failed invitations, creates one link per click, and clears a revoked token', async () => {
  vi.stubGlobal('window', { location: { origin: 'https://ledger.example' } })
  vi.spyOn(accountsApi, 'listInvitations').mockResolvedValue({ items: [invitation], total: 1, page: 1, pageSize: 10 })
  const create = vi.spyOn(accountsApi, 'invite').mockRejectedValue(new Error('Offline'))
  const revoke = vi.spyOn(accountsApi, 'revokeInvitation').mockResolvedValue({ message: 'Revoked' })
  const busyChange = vi.fn()
  const { state } = await mount<{
    email: string; role: string; busy: boolean; generated: InvitationToken | null; invitationLink: string
    error: ReturnType<typeof readApiError> | null; pendingAction: { invitation: Invitation; action: 'revoke' }
    invite: () => Promise<void>; runAction: () => Promise<void>
  }>(InvitationsPanel, '/client/contacts', { clientId: 'client-1', onBusyChange: busyChange })
  state.email = 'other@example.com'
  expect(state.role).toBe('CLIENT_SUBMITTER')
  await state.invite()
  expect(state.email).toBe('other@example.com')
  expect(state.generated).toBeNull()
  expect(state.error).not.toBeNull()

  let finish!: (value: InvitationToken) => void
  create.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const saving = state.invite()
  await state.invite()
  expect(create).toHaveBeenCalledTimes(2)
  expect(create).toHaveBeenLastCalledWith({ email: 'other@example.com', role: 'CLIENT_SUBMITTER' }, 'client-1')
  expect(busyChange).toHaveBeenLastCalledWith(true)
  finish({ ...invitation, token: 'private_token' })
  await saving
  expect(state.email).toBe('')
  expect(state.invitationLink).toBe('https://ledger.example/invitations/accept#token=private_token')
  expect(busyChange).toHaveBeenLastCalledWith(false)
  state.pendingAction = { invitation, action: 'revoke' }
  await state.runAction()
  expect(revoke).toHaveBeenCalledWith('invitation', 'client-1')
  expect(state.generated).toBeNull()
})

it('rejects missing invitation tokens without a request and retains form values on an invalid token response', async () => {
  const accept = vi.spyOn(accountsApi, 'acceptInvitation').mockRejectedValue(new Error('Expired'))
  const { state, router } = await mount<{
    name: string; password: string; validToken: boolean; accepted: boolean
    error: ReturnType<typeof readApiError> | null; accept: () => Promise<void>
  }>(InvitationAcceptView, '/invitations/accept')
  state.name = ' Invitee '
  state.password = 'OriginalPassword123!'
  await state.accept()
  expect(state.validToken).toBe(false)
  expect(accept).not.toHaveBeenCalled()
  await router.replace(`/invitations/accept#token=${'a'.repeat(40)}`)
  await state.accept()
  expect(accept).toHaveBeenCalledWith({ token: 'a'.repeat(40), name: 'Invitee', password: 'OriginalPassword123!' })
  expect(state.accepted).toBe(false)
  expect(state.name).toBe(' Invitee ')
  expect(state.password).toBe('OriginalPassword123!')
  expect(state.error).not.toBeNull()
})

it('accepts a link only once, then removes the fragment and password', async () => {
  let finish!: (value: { message: string }) => void
  const accept = vi.spyOn(accountsApi, 'acceptInvitation').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const { state, router } = await mount<{
    name: string; password: string; accepted: boolean; busy: boolean; accept: () => Promise<void>
  }>(InvitationAcceptView, `/invitations/accept#token=${'b'.repeat(40)}`)
  state.name = 'Invitee'
  state.password = 'NewPassword123!'
  const saving = state.accept()
  await state.accept()
  expect(state.busy).toBe(true)
  expect(accept).toHaveBeenCalledTimes(1)
  finish({ message: 'Accepted' })
  await saving
  expect(state.accepted).toBe(true)
  expect(state.password).toBe('')
  expect(router.currentRoute.value.hash).toBe('')
  await state.accept()
  expect(accept).toHaveBeenCalledTimes(1)
})

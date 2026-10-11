import { createPinia } from 'pinia'
import { createRenderer, nextTick, ssrContextKey, type Component } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, expect, it, vi } from 'vitest'
import { accountsApi, type ClientMember, type UserAccount } from '@/api/accounts'
import ClientAssignments from '@/components/ClientAssignments.vue'
import ClientContacts from '@/components/ClientContacts.vue'
import { contactsMessages } from '@/i18n/contacts'
import { useAuthStore } from '@/stores/auth'
import type { ClientRole } from '@/types'

const renderer = createRenderer({
  insert: () => {}, remove: () => {}, patchProp: () => {},
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText: () => {}, setElementText: () => {}, parentNode: () => null, nextSibling: () => null,
})
const cleanup: (() => void)[] = []

function mount(component: Component, props: Record<string, unknown>) {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.user = {
    id: 'self', email: 'self@example.com', name: 'Self', firmRole: null,
    firm: { id: 'firm', name: 'Firm', timezone: 'UTC' },
    clientMemberships: [{ clientId: 'client', clientName: 'Business', role: 'CLIENT_ADMIN' }],
  }
  const app = renderer.createApp({ ...component, render: () => null }, props)
    .use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: contactsMessages }))
  app.provide(ssrContextKey, {})
  app.mount({})
  cleanup.push(() => app.unmount())
  return (app._instance as unknown as { setupState: Record<string, unknown> }).setupState
}

afterEach(() => {
  cleanup.splice(0).forEach(unmount => unmount())
  vi.restoreAllMocks()
})

it('keeps failed role edits, blocks duplicate writes and self edits, and removes only after success', async () => {
  const self: ClientMember = { userId: 'self', name: 'Self', email: 'self@example.com', status: 'ACTIVE', role: 'CLIENT_ADMIN' }
  const other: ClientMember = { userId: 'other', name: 'Other', email: 'other@example.com', status: 'ACTIVE', role: 'CLIENT_SUBMITTER' }
  vi.spyOn(accountsApi, 'listMembers').mockResolvedValue([self, other])
  const update = vi.spyOn(accountsApi, 'updateMember').mockRejectedValue(new Error('Offline'))
  const state = mount(ClientContacts, { clientId: 'client', canManage: true }) as {
    members: ClientMember[]; editingId: string | null; editRole: ClientRole; success: string; busy: boolean
    edit: (member: ClientMember) => void; update: (member: ClientMember, active?: boolean) => Promise<void>
  }
  await vi.waitFor(() => expect(state.members).toHaveLength(2))
  state.edit(self)
  await state.update(self, false)
  expect(state.editingId).toBeNull()
  expect(update).not.toHaveBeenCalled()

  state.edit(other)
  state.editRole = 'CLIENT_ADMIN'
  await state.update(other)
  expect(state.editingId).toBe('other')
  expect(state.editRole).toBe('CLIENT_ADMIN')
  expect(state.members[1]!.role).toBe('CLIENT_SUBMITTER')
  expect(state.success).toBe('')

  let finish!: (value: ClientMember | null) => void
  update.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const saving = state.update(other)
  await state.update(other)
  expect(update).toHaveBeenCalledTimes(2)
  expect(state.busy).toBe(true)
  finish({ ...other, role: 'CLIENT_ADMIN' })
  await saving
  expect(state.members[1]!.role).toBe('CLIENT_ADMIN')
  expect(state.success).toBe('contacts.saved')

  update.mockResolvedValue(null)
  await state.update(state.members[1]!, false)
  expect(update).toHaveBeenLastCalledWith('client', 'other', { role: 'CLIENT_ADMIN', active: false })
  expect(state.members).toEqual([self])
})

it('loads every accountant page and never silently drops disabled or unavailable assignments', async () => {
  const account = (id: string, status: 'ACTIVE' | 'DISABLED'): UserAccount => ({
    id, status, name: id, email: `${id}@example.com`, firmRole: 'ACCOUNTANT', clientRoles: [], lastLoginAt: null,
  })
  vi.spyOn(accountsApi, 'getAssignments').mockResolvedValue({ userIds: ['disabled', 'missing'] })
  const list = vi.spyOn(accountsApi, 'listUsers')
    .mockResolvedValueOnce({ items: [account('disabled', 'DISABLED')], total: 2, page: 1, pageSize: 1 })
    .mockResolvedValueOnce({ items: [account('active', 'ACTIVE')], total: 2, page: 2, pageSize: 1 })
  const replace = vi.spyOn(accountsApi, 'replaceAssignments').mockRejectedValue(new Error('Offline'))
  const state = mount(ClientAssignments, { clientId: 'client' }) as {
    loaded: boolean; selectedIds: string[]; assignedIds: string[]; invalidSelection: boolean
    choices: UserAccount[]; missingIds: string[]; saved: boolean; save: () => Promise<void>
  }
  await vi.waitFor(() => expect(state.loaded).toBe(true))
  expect(list).toHaveBeenCalledTimes(2)
  expect(list.mock.calls[1]![0]!.page).toBe(2)
  expect(state.choices.map(user => user.id)).toEqual(['disabled', 'active'])
  expect(state.missingIds).toEqual(['missing'])
  expect(state.selectedIds).toEqual(['disabled', 'missing'])
  expect(state.invalidSelection).toBe(true)
  await state.save()
  expect(replace).not.toHaveBeenCalled()

  state.selectedIds = ['active']
  await state.save()
  expect(state.saved).toBe(false)
  expect(state.selectedIds).toEqual(['active'])
  expect(state.assignedIds).toEqual(['disabled', 'missing'])
  replace.mockResolvedValue({ userIds: ['active'] })
  await state.save()
  await nextTick()
  expect(replace).toHaveBeenLastCalledWith('client', ['active'])
  expect(state.saved).toBe(true)
  expect(state.assignedIds).toEqual(['active'])
})

it('does not call mutation APIs for read-only contacts', async () => {
  const member: ClientMember = { userId: 'other', name: 'Other', email: 'other@example.com', status: 'ACTIVE', role: 'CLIENT_SUBMITTER' }
  vi.spyOn(accountsApi, 'listMembers').mockResolvedValue([member])
  const update = vi.spyOn(accountsApi, 'updateMember')
  const state = mount(ClientContacts, { clientId: 'client', canManage: false }) as {
    edit: (member: ClientMember) => void; update: (member: ClientMember, active?: boolean) => Promise<void>; editingId: string | null
  }
  state.edit(member)
  await state.update(member, false)
  expect(state.editingId).toBeNull()
  expect(update).not.toHaveBeenCalled()
})

it('discards earlier contact responses when a newer load completes first', async () => {
  const old: ClientMember = { userId: 'old', name: 'Old', email: 'old@example.com', status: 'ACTIVE', role: 'CLIENT_SUBMITTER' }
  const latest: ClientMember = { ...old, userId: 'latest', name: 'Latest' }
  let finishOld!: (members: ClientMember[]) => void
  const list = vi.spyOn(accountsApi, 'listMembers')
    .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    .mockResolvedValueOnce([latest])
  const state = mount(ClientContacts, { clientId: 'client', canManage: true }) as {
    members: ClientMember[]; loading: boolean; load: () => Promise<void>
  }
  expect(state.loading).toBe(true)
  await state.load()
  expect(state.members).toEqual([latest])
  finishOld([old])
  await nextTick()
  expect(list).toHaveBeenCalledTimes(2)
  expect(state.members).toEqual([latest])
  expect(state.loading).toBe(false)
})

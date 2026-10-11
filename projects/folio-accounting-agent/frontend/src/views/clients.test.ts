import { AxiosError, AxiosHeaders } from 'axios'
import { createPinia } from 'pinia'
import { createRenderer, nextTick, ssrContextKey, type Component } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import { accountsApi, type BankAccount, type ClientAccount } from '@/api/accounts'
import BankAccounts from '@/components/BankAccounts.vue'
import ClientDetailView from './ClientDetailView.vue'
import ClientsView from './ClientsView.vue'
import { useAuthStore } from '@/stores/auth'

const client: ClientAccount = {
  industry: 'OTHER',
  id: 'client-a', code: 'ACME', legalName: 'Acme', baseCurrency: 'SGD', status: 'ACTIVE',
  features: { usesPaymentPlatform: false, hasEmployeeReimbursement: false, hasLoan: false, multiCurrency: false, projectBased: false, hasRetention: false },
}
const renderer = createRenderer({
  insert: () => {}, remove: () => {}, patchProp: () => {},
  createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
  setText: () => {}, setElementText: () => {}, parentNode: () => null, nextSibling: () => null,
})
const cleanup: (() => void)[] = []

async function mount<T>(component: Component, path: string, props: Record<string, unknown> = {}) {
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.user = { id: 'admin', email: 'admin@example.com', name: 'Admin', firmRole: 'FIRM_ADMIN', firm: { id: 'firm', name: 'Firm', timezone: 'UTC' }, clientMemberships: [] }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/staff/clients', name: 'clients', component: { render: () => null } },
    { path: '/staff/clients/new', name: 'client-new', component: { render: () => null } },
    { path: '/staff/clients/:id', name: 'client-detail', component: { render: () => null } },
  ] })
  await router.push(path)
  const app = renderer.createApp({ ...component, render: () => null }, props)
    .use(pinia).use(router).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
  app.provide(ssrContextKey, {})
  app.mount({})
  cleanup.push(() => app.unmount())
  return { state: (app._instance as unknown as { setupState: T }).setupState, router }
}

afterEach(() => {
  cleanup.splice(0).forEach(unmount => unmount())
  vi.restoreAllMocks()
})

it('keeps client search, status and pagination in the URL', async () => {
  const list = vi.spyOn(accountsApi, 'listClients').mockResolvedValue({ items: [client], total: 43, page: 2, pageSize: 20 })
  const { state, router } = await mount<{ search: string; navigate: (page?: number) => Promise<unknown> }>(ClientsView, '/staff/clients?page=2&search=Acme&status=ACTIVE')
  expect(list).toHaveBeenLastCalledWith({ page: 2, pageSize: 20, search: 'Acme', status: 'ACTIVE' })
  state.search = '  New client  '
  await state.navigate()
  expect(router.currentRoute.value.query).toEqual({ search: 'New client', status: 'ACTIVE' })
  await vi.waitFor(() => expect(list).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, search: 'New client', status: 'ACTIVE' }))
})

it('prevents duplicate creation and preserves input after a conflict', async () => {
  let fail!: (reason: unknown) => void
  const create = vi.spyOn(accountsApi, 'createClient').mockImplementation(() => new Promise((_resolve, reject) => { fail = reject }))
  const { state } = await mount<{
    form: { code: string; legalName: string; baseCurrency: string }; saving: boolean
    saveError: { status?: number } | null; save: () => Promise<void>
  }>(ClientDetailView, '/staff/clients/new')
  state.form.code = 'ACME'
  state.form.legalName = 'Acme'
  const first = state.save()
  await state.save()
  expect(create).toHaveBeenCalledTimes(1)
  fail(new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, { data: { code: 'CLIENT_CODE_EXISTS' }, status: 409, statusText: 'Conflict', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } }))
  await first
  expect(state.form.legalName).toBe('Acme')
  expect(state.form.code).toBe('ACME')
  expect(state.saveError?.status).toBe(409)
  expect(state.saving).toBe(false)
})

it('ignores a save response from the previous client after navigation', async () => {
  vi.spyOn(accountsApi, 'getClient').mockImplementation(async (id) => ({ ...client, id, legalName: id }))
  let finish!: (value: ClientAccount) => void
  vi.spyOn(accountsApi, 'updateClient').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const { state, router } = await mount<{
    client: ClientAccount | null; form: { legalName: string }; saving: boolean; saved: boolean; save: () => Promise<void>
  }>(ClientDetailView, '/staff/clients/client-a')
  await vi.waitFor(() => expect(state.client?.id).toBe('client-a'))
  state.form.legalName = 'Changed A'
  const oldSave = state.save()
  await router.push('/staff/clients/client-b')
  await vi.waitFor(() => expect(state.client?.id).toBe('client-b'))
  finish({ ...client, legalName: 'Changed A' })
  await oldSave
  await nextTick()
  expect(state.client?.id).toBe('client-b')
  expect(state.form.legalName).toBe('client-b')
  expect(state.saved).toBe(false)
  expect(state.saving).toBe(false)
})

it('sends bank account last four digits only and rejects duplicate submits', async () => {
  vi.spyOn(accountsApi, 'listBanks').mockResolvedValue([])
  let finish!: (value: BankAccount) => void
  const create = vi.spyOn(accountsApi, 'createBank').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const { state } = await mount<{
    form: { bank: string; accountLast4: string; currency: string }; busy: boolean; save: () => Promise<void>
  }>(BankAccounts, '/staff/clients/client-a', { clientId: 'client-a', canManage: true })
  state.form.bank = 'Harbour Bank'
  state.form.accountLast4 = '1234'
  state.form.currency = 'sgd'
  const first = state.save()
  await state.save()
  expect(create).toHaveBeenCalledTimes(1)
  expect(create).toHaveBeenCalledWith('client-a', { bank: 'Harbour Bank', accountLast4: '1234', currency: 'SGD' })
  finish({ id: 'bank-a', bank: 'Harbour Bank', accountLast4: '1234', currency: 'SGD', status: 'ACTIVE' })
  await first
  expect(state.busy).toBe(false)
})

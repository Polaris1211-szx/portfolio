import { createPinia } from 'pinia'
import { createRenderer, ssrContextKey } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, expect, it, vi } from 'vitest'
import { accountsApi, type ClientAccount } from '@/api/accounts'
import { useAuthStore } from '@/stores/auth'
import HomeView from './HomeView.vue'

const client: ClientAccount = {
  industry: 'OTHER',
  id: 'client-a', code: 'ACME', legalName: 'Acme', baseCurrency: 'SGD', status: 'ACTIVE',
  features: { usesPaymentPlatform: false, hasEmployeeReimbursement: false, hasLoan: false, multiCurrency: false, projectBased: false, hasRetention: false },
}
const renderer = createRenderer({
  insert: () => {}, remove: () => {}, patchProp: () => {}, createElement: () => ({}),
  createText: () => ({}), createComment: () => ({}), setText: () => {},
  setElementText: () => {}, parentNode: () => null, nextSibling: () => null,
})
const cleanup: (() => void)[] = []

afterEach(() => {
  cleanup.splice(0).forEach(unmount => unmount())
  vi.restoreAllMocks()
})

it('loads assignment-scoped clients for staff instead of treating them as client memberships', async () => {
  const list = vi.spyOn(accountsApi, 'listClients').mockResolvedValue({ items: [client], total: 1, page: 1, pageSize: 5 })
  const pinia = createPinia()
  useAuthStore(pinia).user = {
    id: 'accountant', email: 'acc@test.com', name: 'Accountant', firmRole: 'ACCOUNTANT',
    firm: { id: 'firm', name: 'Firm', timezone: 'UTC' }, clientMemberships: [],
  }
  const app = renderer.createApp({ ...HomeView, render: () => null }).use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
  app.provide(ssrContextKey, {})
  app.mount({})
  cleanup.push(() => app.unmount())

  await vi.waitFor(() => expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 5 }))
  const state = (app._instance as unknown as { setupState: { clients: ClientAccount[]; clientTotal: number } }).setupState
  await vi.waitFor(() => expect(state.clients).toEqual([client]))
  expect(state.clientTotal).toBe(1)
})

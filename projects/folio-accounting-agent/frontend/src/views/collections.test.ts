import { createPinia } from 'pinia'
import { createRenderer, ssrContextKey } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import { accountsApi } from '@/api/accounts'
import { collectionsApi, type CollectionDetail, type RequirementInput } from '@/api/collections'
import CollectionDetailPanel from '@/components/CollectionDetailPanel.vue'
import { collectionsMessages } from '@/i18n/collections'
import { useAuthStore } from '@/stores/auth'
import CollectionFormView from './CollectionFormView.vue'
import CollectionsView from './CollectionsView.vue'

const renderer = createRenderer({
  insert: () => {}, remove: () => {}, patchProp: () => {}, createElement: () => ({}),
  createText: () => ({}), createComment: () => ({}), setText: () => {},
  setElementText: () => {}, parentNode: () => null, nextSibling: () => null,
})

afterEach(() => vi.restoreAllMocks())

it('allows the first step when the client already has an active request for the period', async () => {
  vi.spyOn(accountsApi, 'listClients').mockResolvedValue({ items: [{
    id: 'client', code: 'CLIENT', legalName: 'Client', baseCurrency: 'SGD', industry: 'OTHER', status: 'ACTIVE',
    features: { usesPaymentPlatform: false, hasEmployeeReimbursement: false, hasLoan: false, multiCurrency: false, projectBased: false, hasRetention: false },
  }], total: 1, page: 1, pageSize: 100 })
  vi.spyOn(collectionsApi, 'list').mockResolvedValue({ items: [{
    id: 'existing', clientId: 'client', clientName: 'Client', period: '2026-09-01', dueAt: '2026-09-25T00:00:00Z', status: 'OPEN', scopeNote: null,
    version: 1, assigneeId: 'accountant', assigneeName: 'Accountant', requirementCount: 1, updatedAt: '2026-09-01T00:00:00Z',
  }], total: 1, page: 1, pageSize: 100 })
  const pinia = createPinia()
  useAuthStore(pinia).user = {
    id: 'accountant', email: 'acc@test.com', name: 'Accountant', firmRole: 'ACCOUNTANT',
    firm: { id: 'firm', name: 'Firm', timezone: 'UTC' }, clientMemberships: [],
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/staff/collections/new', name: 'collection-new', component: { render: () => null } },
  ] })
  await router.push('/staff/collections/new')
  const app = renderer.createApp({ ...CollectionFormView, render: () => null })
    .use(pinia).use(router).use(createI18n({ legacy: false, locale: 'en', messages: {
      en: { ...collectionsMessages.en, error: { codes: { COLLECTION_EXISTS: 'Request already exists.' } } },
    } }))
  app.provide(ssrContextKey, {})
  app.mount({})
  try {
    const state = (app._instance as unknown as { setupState: {
      loading: boolean; step: number; stepError: string
      requirementsValid: boolean
      form: { aiMode: string; reviewPreference: string; requirements: RequirementInput[] }
      advance: () => Promise<void>
    } }).setupState
    await vi.waitFor(() => expect(state.loading).toBe(false))
    expect(state.form.aiMode).toBe('AUTO_REVIEW')
    expect(state.form.reviewPreference).toBe('STANDARD')
    expect(state.form.requirements[0]).not.toHaveProperty('analysisType')
    state.form.requirements = [{ type: 'BANK_STATEMENT', title: 'Bank statements', required: true, criteria: {} }]
    expect(state.requirementsValid).toBe(true)
    expect(state.form.requirements[0]!.criteria).not.toHaveProperty('targetTransaction')
    state.form.requirements[0]!.title = ' '
    expect(state.requirementsValid).toBe(false)
    await state.advance()
    expect(state.step).toBe(2)
    expect(state.stepError).toBe('')
    expect(collectionsApi.list).not.toHaveBeenCalled()
  } finally { app.unmount() }
})

it('applies the selected due-date range without a separate submit action', async () => {
  vi.spyOn(accountsApi, 'listClients').mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 })
  const list = vi.spyOn(collectionsApi, 'list').mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
  const pinia = createPinia()
  useAuthStore(pinia).user = {
    id: 'accountant', email: 'acc@test.com', name: 'Accountant', firmRole: 'ACCOUNTANT',
    firm: { id: 'firm', name: 'Firm', timezone: 'UTC' }, clientMemberships: [],
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/staff/collections', name: 'collections', component: { render: () => null } },
  ] })
  await router.push('/staff/collections')
  const app = renderer.createApp({ ...CollectionsView, render: () => null })
    .use(pinia).use(router).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
  app.provide(ssrContextKey, {})
  app.mount({})
  try {
    const state = (app._instance as unknown as { setupState: { filters: { dueFrom: string; dueTo: string } } }).setupState
    state.filters.dueFrom = '2026-09-20'
    state.filters.dueTo = '2026-10-10'
    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({ dueFrom: '2026-09-20', dueTo: '2026-10-10' }))
    await vi.waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({
      dueFrom: new Date('2026-09-20T00:00:00').toISOString(),
      dueTo: new Date('2026-10-10T23:59:59').toISOString(),
      sort: 'updated_at',
      order: 'desc',
    })))
  } finally { app.unmount() }
})

it('collapses only the middle of a long activity history', async () => {
  const detail: CollectionDetail = {
    id: 'request', clientId: 'client', clientName: 'Client', period: '2026-09-01', dueAt: '2026-09-30T00:00:00Z',
    status: 'IN_REVIEW', scopeNote: null, version: 1, assigneeId: 'accountant', assigneeName: 'Accountant', requirementCount: 0, updatedAt: '2026-09-01T00:00:00Z', requirements: [],
    events: Array.from({ length: 10 }, (_, index) => ({ id: `event-${index}`, actorId: 'accountant', actorName: 'Accountant', eventType: 'UPDATED', payload: {}, createdAt: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z` })),
  }
  vi.spyOn(collectionsApi, 'get').mockResolvedValue(detail)
  const app = renderer.createApp({ ...CollectionDetailPanel, render: () => null }, { requestId: 'request' })
    .use(createI18n({ legacy: false, locale: 'en', messages: collectionsMessages }))
  app.provide(ssrContextKey, {})
  app.mount({})
  try {
    const state = (app._instance as unknown as { setupState: { hiddenActivityCount: number; activityExpanded: boolean; visibleActivityEvents: Array<{ id: string }> } }).setupState
    await vi.waitFor(() => expect(state.hiddenActivityCount).toBe(5))
    expect(state.visibleActivityEvents.map(event => event.id)).toEqual(['event-9', 'event-8', 'event-2', 'event-1', 'event-0'])
    state.activityExpanded = true
    expect(state.visibleActivityEvents).toHaveLength(10)
  } finally { app.unmount() }
})

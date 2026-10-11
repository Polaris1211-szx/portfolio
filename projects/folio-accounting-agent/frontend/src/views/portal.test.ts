import { createRenderer, ssrContextKey } from 'vue'
import { createPinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, expect, it, vi } from 'vitest'
import { portalApi, type ClassificationRun, type PortalCollectionDetail } from '@/api/portal'
import { portalMessages } from '@/i18n/portal'
import { useAuthStore } from '@/stores/auth'
import PortalCollectionDetailView from './PortalCollectionDetailView.vue'
import PortalCollectionsView from './PortalCollectionsView.vue'

const renderer = createRenderer({
  insert: () => {}, remove: () => {}, patchProp: () => {}, createElement: () => ({}),
  createText: () => ({}), createComment: () => ({}), setText: () => {},
  setElementText: () => {}, parentNode: () => null, nextSibling: () => null,
})

afterEach(() => vi.restoreAllMocks())

it('applies client collection filters and sorting from the URL', async () => {
  const list = vi.spyOn(portalApi, 'list').mockResolvedValue({ items: [], total: 0 })
  const pinia = createPinia()
  useAuthStore(pinia).user = {
    id: 'user', email: 'client@test.com', name: 'Client', firmRole: null,
    firm: { id: 'firm', name: 'Firm', timezone: 'UTC' },
    clientMemberships: [{ clientId: 'client', clientName: 'Client Ltd', role: 'CLIENT_SUBMITTER' }],
  }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/client/collections', component: { render: () => null } },
  ] })
  await router.push('/client/collections?client=client&period=2026-09&status=OPEN&sort=due_at%3Aasc')
  const app = renderer.createApp({ ...PortalCollectionsView, render: () => null })
    .use(pinia).use(router).use(createI18n({ legacy: false, locale: 'en', messages: portalMessages }))
  app.provide(ssrContextKey, {})
  app.mount({})
  try {
    const state = (app._instance as unknown as { setupState: {
      loading: boolean
      filters: { client: string; period: string; status: string; sort: string }
    } }).setupState
    await vi.waitFor(() => expect(state.loading).toBe(false))
    expect(list).toHaveBeenLastCalledWith({
      clientId: 'client', period: '2026-09-01', status: 'OPEN', sort: 'due_at', order: 'asc',
    })
    state.filters.period = '2026-10'
    await vi.waitFor(() => expect(router.currentRoute.value.query.period).toBe('2026-10'))
    await vi.waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ period: '2026-10-01' })))
  } finally { app.unmount() }
})

it('stages files before classification, cancels without merging, and supports manual fallback', async () => {
  const detail: PortalCollectionDetail = {
    id: 'request', clientId: 'client', clientName: 'Client', period: '2026-09-01',
    dueAt: '2026-09-25T00:00:00Z', status: 'OPEN', assigneeName: 'Accountant',
    requiredCount: 1, readyCount: 0, updatedAt: '2026-09-01T00:00:00Z', scopeNote: null, submission: null, manualReviewAvailable: false,
    events: [{ id: 'published', eventType: 'PUBLISHED', payload: {}, createdAt: '2026-09-01T00:00:00Z' }],
    requirements: [
      { id: 'bank', type: 'BANK_STATEMENT', title: 'Bank statement', required: true, criteria: {}, status: 'PENDING', clientMessage: null, documents: [] },
      { id: 'request', type: 'OTHER', title: 'Other supporting documents', required: false, criteria: {}, status: 'PENDING', clientMessage: null, documents: [] },
    ],
  }
  vi.spyOn(portalApi, 'get').mockResolvedValue(detail)
  const run: ClassificationRun = { id: 'run', status: 'DRAFT', provider: 'MOCK', confirmedAt: null, error: null, documents: [], items: [] }
  vi.spyOn(portalApi, 'createClassification').mockResolvedValue(run)
  const stage = vi.spyOn(portalApi, 'stage').mockImplementation(async (_id, _run, file) => ({ documentId: file.name }))
  vi.spyOn(portalApi, 'startClassification').mockResolvedValue({ ...run, status: 'QUEUED' })
  const finished: ClassificationRun = { ...run, status: 'SUCCEEDED', documents: [
    { documentId: 'bank-statement.pdf', name: 'bank-statement.pdf', status: 'AVAILABLE', failureCode: null },
    { documentId: 'notes.pdf', name: 'notes.pdf', status: 'AVAILABLE', failureCode: null },
  ], items: [
    { documentId: 'bank-statement.pdf', category: 'REQUIREMENT', requirementId: 'bank', documentType: 'BANK_STATEMENT', confidence: 0.9 },
    { documentId: 'notes.pdf', category: 'INVALID', requirementId: null, documentType: null, confidence: 0.5 },
  ] }
  const classify = vi.spyOn(portalApi, 'classification').mockResolvedValue(finished)
  const cancel = vi.spyOn(portalApi, 'cancelClassification').mockResolvedValue({ ...run, status: 'CANCELLED' })
  const confirm = vi.spyOn(portalApi, 'confirmClassification').mockResolvedValue({ ...finished, confirmedAt: '2026-09-22T00:00:00Z' })
  const upload = vi.spyOn(portalApi, 'upload')
  const submit = vi.spyOn(portalApi, 'submit').mockImplementation(async (_id, note, manualReviewRequested) => ({
    ...detail,
    status: 'IN_REVIEW',
    reviewStatus: 'AWAITING_ACCOUNTANT',
    manualReviewAvailable: false,
    events: [...detail.events, {
      id: 'submitted', eventType: 'SUBMITTED',
      payload: { roundNo: 2, manualReviewRequested: manualReviewRequested ?? false },
      createdAt: '2026-09-22T00:00:00Z',
    }],
    submission: {
      id: 'submission-2', roundNo: 2, status: 'SUBMITTED', note: note ?? null,
      manualReviewRequested: manualReviewRequested ?? false, submittedAt: '2026-09-22T00:00:00Z', createdAt: '2026-09-22T00:00:00Z',
    },
  }))
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/client/collections/:id', component: { render: () => null } },
  ] })
  await router.push('/client/collections/request')
  const app = renderer.createApp({ ...PortalCollectionDetailView, render: () => null })
    .use(router).use(createI18n({ legacy: false, locale: 'en', messages: portalMessages }))
  app.provide(ssrContextKey, {})
  app.mount({})
  try {
    const state = (app._instance as unknown as { setupState: {
      loading: boolean
      smartDialogOpen: boolean
      smartPhase: string
      smartManual: boolean
      smartRun: ClassificationRun | null
      smartCancelConfirm: boolean
      smartCandidates: Array<{ id: string; target: string }>
      detail: PortalCollectionDetail
      submissionNote: string
      manualReviewRequested: boolean
      smartCategories: Array<{ target: string }>
      missing: PortalCollectionDetail['requirements']
      requirementEditable: (requirement: PortalCollectionDetail['requirements'][number]) => boolean
      requirementHasIssue: (requirement: PortalCollectionDetail['requirements'][number]) => boolean
      collectionStatus: string
      timelineEventName: (event: PortalCollectionDetail['events'][number]) => string
      prepareSmartUpload: (files: File[]) => void
      startSmartAnalysis: () => Promise<void>
      moveSmartCandidate: (candidateId: string, target: string) => void
      requestSmartClose: (open: boolean) => void
      discardSmartUpload: () => Promise<void>
      confirmSmartUpload: () => Promise<void>
      submit: () => Promise<void>
    } }).setupState
    await vi.waitFor(() => expect(state.loading).toBe(false))
    state.detail.status = 'IN_REVIEW'
    state.detail.reviewStatus = 'AI_PASSED'
    expect(state.collectionStatus).toBe('AI_PASSED')
    state.detail.status = 'OPEN'
    state.detail.reviewStatus = null
    state.prepareSmartUpload([
      new File(['statement'], 'bank-statement.pdf', { type: 'application/pdf' }),
      new File(['notes'], 'notes.pdf', { type: 'application/pdf' }),
    ])

    expect(state.smartDialogOpen).toBe(true)
    expect(state.smartPhase).toBe('confirm')
    expect(classify).not.toHaveBeenCalled()
    expect(stage).not.toHaveBeenCalled()

    const analysis = state.startSmartAnalysis()
    expect(state.smartPhase).toBe('staging')
    await analysis
    expect(state.smartPhase).toBe('results')
    expect(state.smartCandidates.map(candidate => candidate.target)).toEqual(['bank', '__invalid__'])

    state.moveSmartCandidate(state.smartCandidates[1]!.id, 'request')
    expect(state.smartCandidates[1]?.target).toBe('request')
    expect(upload).not.toHaveBeenCalled()
    expect(stage).toHaveBeenCalledTimes(2)
    expect(confirm).not.toHaveBeenCalled()

    state.requestSmartClose(false)
    expect(state.smartCancelConfirm).toBe(true)
    expect(state.smartDialogOpen).toBe(true)
    await state.discardSmartUpload()
    expect(cancel).toHaveBeenCalledWith('request', 'run')
    expect(state.smartDialogOpen).toBe(false)
    expect(detail.requirements.flatMap(item => item.documents)).toEqual([])

    classify.mockResolvedValue({ ...finished, status: 'FAILED', error: 'AGENT_UNAVAILABLE', items: [] })
    state.prepareSmartUpload([new File(['statement'], 'bank-statement.pdf', { type: 'application/pdf' })])
    await state.startSmartAnalysis()
    expect(state.smartManual).toBe(true)
    expect(state.smartCandidates[0]?.target).toBe('request')
    state.moveSmartCandidate(state.smartCandidates[0]!.id, 'bank')
    await state.confirmSmartUpload()
    expect(confirm).toHaveBeenCalledWith('request', 'run', [{ documentId: 'bank-statement.pdf', category: 'REQUIREMENT', requirementId: 'bank' }])
    expect(state.smartDialogOpen).toBe(false)

    let finishLate!: (value: ClassificationRun) => void
    classify.mockReturnValue(new Promise(resolve => { finishLate = resolve }))
    state.prepareSmartUpload([new File(['statement'], 'bank-statement.pdf', { type: 'application/pdf' })])
    const pending = state.startSmartAnalysis()
    await vi.waitFor(() => expect(classify).toHaveBeenCalledTimes(3))
    state.requestSmartClose(false)
    await state.discardSmartUpload()
    finishLate(finished)
    await pending
    expect(state.smartDialogOpen).toBe(false)
    expect(state.smartRun).toBeNull()

    state.detail.status = 'CHANGES_REQUESTED'
    state.detail.requirements[0]!.status = 'SATISFIED'
    expect(state.requirementEditable(state.detail.requirements[0]!)).toBe(false)
    state.detail.requirements[0]!.status = 'RECEIVED'
    state.detail.requirements[0]!.clientMessage = 'Wrong period'
    expect(state.requirementHasIssue(state.detail.requirements[0]!)).toBe(true)
    expect(state.requirementEditable(state.detail.requirements[0]!)).toBe(true)
    expect(state.requirementEditable(state.detail.requirements[1]!)).toBe(false)
    state.detail.requirements[0]!.status = 'NEEDS_ACTION'
    expect(state.requirementEditable(state.detail.requirements[0]!)).toBe(true)
    expect(state.smartCategories.map(category => category.target)).toEqual(['bank', '__invalid__'])

    state.detail.requirements[0]!.documents = [{
      id: 'original', linkId: 'original-link', name: 'original.pdf', contentType: 'application/pdf',
      sizeBytes: 10, status: 'AVAILABLE', failureCode: null, duplicate: false, editable: true,
      countsForSubmission: false, createdAt: '2026-09-20T00:00:00Z',
    }]
    state.detail.manualReviewAvailable = true
    expect(state.missing).toHaveLength(1)
    state.submissionNote = 'Please ask an accountant to review this.'
    state.manualReviewRequested = true
    expect(state.missing).toHaveLength(0)
    await state.submit()
    expect(submit).toHaveBeenCalledWith('request', 'Please ask an accountant to review this.', true)
    expect(state.detail.submission?.manualReviewRequested).toBe(true)
    expect(state.detail.reviewStatus).toBe('AWAITING_ACCOUNTANT')
    expect(state.timelineEventName(state.detail.events.at(-1)!)).toBe('Round 2 submitted for manual review')
  } finally { app.unmount() }
})

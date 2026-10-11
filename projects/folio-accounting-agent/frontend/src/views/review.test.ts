import { createPinia } from 'pinia'
import { createRenderer, nextTick, ssrContextKey } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it, vi } from 'vitest'
import { reviewApi, type ReviewCollection, type ReviewRun } from '@/api/review'
import { useAuthStore } from '@/stores/auth'
import CollectionReviewView from './CollectionReviewView.vue'

const renderer = createRenderer({
  insert: () => {}, remove: () => {}, patchProp: () => {}, createElement: () => ({}),
  createText: () => ({}), createComment: () => ({}), setText: () => {},
  setElementText: () => {}, parentNode: () => null, nextSibling: () => null,
})

it('defaults to the latest submission and filters every requirement to the selected round', async () => {
  const detail: ReviewCollection = {
    id: 'request', clientId: 'client', clientName: 'Client', period: '2026-09-01',
    dueAt: '2026-09-30T00:00:00Z', status: 'IN_REVIEW', version: 1,
    assigneeName: 'Accountant', otherDocuments: [
      { id: 'other-old', linkId: 'other-old-link', submissionId: 'round-1', roundNo: 1, name: 'notes-old.pdf', contentType: 'application/pdf', sizeBytes: 10, status: 'AVAILABLE', documentType: 'OTHER', relation: 'REFERENCE', createdAt: '2026-09-10T00:00:00Z' },
      { id: 'other-new', linkId: 'other-new-link', submissionId: 'round-2', roundNo: 2, name: 'notes-new.pdf', contentType: 'application/pdf', sizeBytes: 10, status: 'AVAILABLE', documentType: 'OTHER', relation: 'REFERENCE', createdAt: '2026-09-20T00:00:00Z' },
    ], events: [],
    submissions: [
      { id: 'round-1', roundNo: 1, note: null, manualReviewRequested: false, submittedAt: '2026-09-10T00:00:00Z' },
      { id: 'round-2', roundNo: 2, note: null, manualReviewRequested: false, submittedAt: '2026-09-20T00:00:00Z' },
    ],
    requirements: [{
      id: 'requirement', type: 'BANK_STATEMENT', title: 'Bank statement', required: true,
      status: 'NEEDS_ACTION', version: 1, issueCode: 'WRONG_PERIOD', clientMessage: 'Saved review message.', internalNote: null, decisions: [{
        id: 'decision', submissionId: 'round-2', decision: 'REQUEST_ACTION', issueCode: 'WRONG_PERIOD', clientMessage: 'Saved review message.', internalNote: null,
        createdBy: 'accountant', source: 'HUMAN', aiRunId: null, createdByName: 'Accountant', createdAt: '2026-09-20T00:00:00Z', evidence: [],
      }],
      documents: [
        { id: 'old', linkId: 'old-link', submissionId: 'round-1', roundNo: 1, name: 'old.pdf', contentType: 'application/pdf', sizeBytes: 10, status: 'AVAILABLE', documentType: 'BANK_STATEMENT', relation: 'SUPPORTS', createdAt: '2026-09-10T00:00:00Z' },
        { id: 'new', linkId: 'new-link', submissionId: 'round-2', roundNo: 2, name: 'new.pdf', contentType: 'application/pdf', sizeBytes: 10, status: 'AVAILABLE', documentType: 'BANK_STATEMENT', relation: 'SUPPORTS', createdAt: '2026-09-20T00:00:00Z' },
      ],
    }, {
      id: 'unreviewed', type: 'OTHER', title: 'Supporting documents', required: false,
      status: 'RECEIVED', version: 1, issueCode: null, clientMessage: null, internalNote: null, decisions: [], documents: [],
    }],
  }
  vi.spyOn(reviewApi, 'get').mockResolvedValue(detail)
  const run = (id: string, submissionId: string): ReviewRun => ({
    id, submissionId, status: 'SUCCEEDED', modelVersion: 'mock-reviewer-v1', error: null, createdAt: '', finishedAt: '', documents: submissionId === 'round-2' ? [{ id: 'new', name: 'new.pdf', contentType: 'application/pdf', scope: 'CURRENT' }] : [], searches: [],
    output: { findings: submissionId === 'round-2' ? [{ requirementId: 'requirement', action: 'ASK_CLIENT', suggestedDecision: 'REQUEST_ACTION', issueCode: 'WRONG_PERIOD', entityCheck: 'MATCH', periodCheck: 'MISMATCH', explanation: '', clientMessage: 'Please upload the correct period.', evidence: [{ documentId: 'new', relation: 'CONTRADICTS', reason: 'Wrong period' }], amounts: [], amountsValid: true, manualReasons: [], autoApplied: false }] : [], extractions: [] },
  })
  vi.spyOn(reviewApi, 'runs').mockResolvedValue([run('new-run', 'round-2'), run('old-run', 'round-1')])
  const pinia = createPinia()
  useAuthStore(pinia).user = { id: 'accountant', email: 'a@test.com', name: 'Accountant', firmRole: 'ACCOUNTANT', firm: { id: 'firm', name: 'Firm', timezone: 'UTC' }, clientMemberships: [] }
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/staff/collections/:id/review', component: { render: () => null } }] })
  await router.push('/staff/collections/request/review')
  const app = renderer.createApp({ ...CollectionReviewView, render: () => null })
    .use(pinia).use(router).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
  app.provide(ssrContextKey, {})
  app.mount({})
  try {
    const state = (app._instance as unknown as { setupState: { detail: ReviewCollection; selectedId: string; selectedSubmissionId: string; selectedRun: ReviewRun; isLatestRound: boolean; canEditDecision: boolean; canRequestChanges: boolean; unreviewedCount: number; canApplySuggestion: boolean; decision: string; issueCode?: string; clientMessage: string; internalNote: string; selectedEvidenceIds: string[]; transitionReason: string; applySuggestion: () => void; generateReturnReason: () => void; statusFor: (requirement: ReviewCollection['requirements'][number]) => string; visibleDocuments: Array<{ id: string }> } }).setupState
    await vi.waitFor(() => expect(state.selectedSubmissionId).toBe('round-2'))
    expect(state.isLatestRound).toBe(true)
    expect(state.selectedRun.id).toBe('new-run')
    expect(state.visibleDocuments.map(document => document.id)).toEqual(['new'])
    expect([state.unreviewedCount, state.canRequestChanges]).toEqual([1, false])
    state.detail.requirements[1]!.status = 'WAIVED'
    await nextTick()
    expect([state.unreviewedCount, state.canRequestChanges]).toEqual([0, true])
    expect(state.canApplySuggestion).toBe(true)
    state.internalNote = 'Keep this note'
    state.applySuggestion()
    expect([state.decision, state.issueCode, state.clientMessage, state.internalNote]).toEqual(['REQUEST_ACTION', 'WRONG_PERIOD', 'Please upload the correct period.', 'Keep this note'])
    expect(state.selectedEvidenceIds).toEqual(['new'])
    state.detail.requirements[0]!.status = 'RECEIVED'
    state.detail.requirements[0]!.status = 'SATISFIED'
    expect(state.statusFor(state.detail.requirements[0]!)).toBe('SATISFIED')
    state.generateReturnReason()
    expect(state.transitionReason).toContain('1. Bank statement: Saved review message.')
    expect(state.transitionReason).not.toContain('Please upload the correct period.')
    state.detail.requirements[0]!.status = 'SATISFIED'
    await nextTick()
    expect(state.canEditDecision).toBe(true)
    state.selectedSubmissionId = 'round-1'
    await nextTick()
    expect(state.isLatestRound).toBe(false)
    expect(state.selectedRun.id).toBe('old-run')
    expect(state.visibleDocuments.map(document => document.id)).toEqual(['old'])
    state.selectedId = '__other_documents__'
    await nextTick()
    expect(state.visibleDocuments.map(document => document.id)).toEqual(['other-old'])
  } finally {
    app.unmount()
    vi.restoreAllMocks()
  }
})

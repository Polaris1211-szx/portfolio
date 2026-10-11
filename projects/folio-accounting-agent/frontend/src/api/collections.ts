import { api } from './client'
import type { Page } from './accounts'

export type CollectionStatus = 'DRAFT' | 'OPEN' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'READY_FOR_BOOKKEEPING' | 'CANCELLED'
export type CollectionFilterStatus = CollectionStatus | 'AI_PASSED' | 'PROCESSING' | 'AI_NEEDS_REVIEW' | 'AI_FAILED' | 'AWAITING_ACCOUNTANT'
export type RequirementStatus = 'PENDING' | 'RECEIVED' | 'NEEDS_ACTION' | 'SATISFIED' | 'WAIVED'
export type AIMode = 'OFF' | 'SUGGEST' | 'AUTO_REVIEW'
export type ReviewPreference = 'CAUTIOUS' | 'STANDARD' | 'EFFICIENT'
export type AnalysisType = 'DOCUMENT_REQUIREMENT_VALIDATION' | 'BANK_TRANSACTION_RECONCILIATION'
export interface AIPolicy { aiMode?: AIMode; reviewPreference?: ReviewPreference }

export interface RequirementInput {
  type: string
  title: string
  required: boolean
  criteria: Record<string, unknown>
}

export interface Requirement extends RequirementInput {
  analysisType?: AnalysisType
  id: string
  position: number
  origin: 'INITIAL' | 'FOLLOW_UP'
  status: RequirementStatus
  version: number
}

export interface CollectionSummary {
  id: string
  clientId: string
  clientName: string
  period: string
  dueAt: string
  status: CollectionStatus
  scopeNote: string | null
  version: number
  assigneeId: string
  assigneeName: string
  requirementCount: number
  updatedAt: string
  reviewStatus?: 'PROCESSING' | 'AI_PASSED' | 'AI_NEEDS_REVIEW' | 'AI_FAILED' | 'AWAITING_ACCOUNTANT' | null
}

export interface WorkflowEvent {
  id: string
  actorId: string | null
  actorName: string
  eventType: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface CollectionDetail extends CollectionSummary, AIPolicy {
  requirements: Requirement[]
  events: WorkflowEvent[]
}

export interface CollectionInput extends AIPolicy {
  clientId: string
  period: string
  dueAt: string
  scopeNote?: string | null
  assigneeId?: string
  requirements: RequirementInput[]
}

export interface CollectionListQuery {
  page?: number
  pageSize?: number
  clientId?: string
  period?: string
  status?: CollectionFilterStatus
  assigneeId?: string
  dueFrom?: string
  dueTo?: string
  sort?: 'due_at' | 'period' | 'created_at' | 'updated_at'
  order?: 'asc' | 'desc'
}

export interface CollectionDashboard {
  awaitingReview: CollectionSummary[]
  waitingClient: CollectionSummary[]
  dueSoon: CollectionSummary[]
  overdue: CollectionSummary[]
  counts: Record<'awaitingReview' | 'waitingClient' | 'dueSoon' | 'overdue', number>
}

const idempotency = (key: string) => ({ headers: { 'Idempotency-Key': key } })

export const collectionsApi = {
  dashboard: () => api.get<CollectionDashboard>('/collection-requests/dashboard').then(({ data }) => data),
  list: (params: CollectionListQuery = {}) => api.get<Page<CollectionSummary>>('/collection-requests', { params }).then(({ data }) => data),
  get: (id: string) => api.get<CollectionDetail>(`/collection-requests/${id}`).then(({ data }) => data),
  create: (body: CollectionInput, key: string) => api.post<CollectionDetail>('/collection-requests', body, idempotency(key)).then(({ data }) => data),
  update: (id: string, body: AIPolicy & { version: number; dueAt?: string; scopeNote?: string | null; assigneeId?: string }) => api.patch<CollectionDetail>(`/collection-requests/${id}`, body).then(({ data }) => data),
  publish: (id: string, version: number, key: string) => api.post<CollectionDetail>(`/collection-requests/${id}/publish`, { version }, idempotency(key)).then(({ data }) => data),
  cancel: (id: string, version: number, reason: string, key: string) => api.post<CollectionDetail>(`/collection-requests/${id}/cancel`, { version, reason }, idempotency(key)).then(({ data }) => data),
  copy: (id: string, period: string, key: string) => api.post<CollectionDetail>(`/collection-requests/${id}/copy`, undefined, { params: { period }, ...idempotency(key) }).then(({ data }) => data),
  addRequirement: (id: string, body: RequirementInput) => api.post<Requirement>(`/collection-requests/${id}/requirements`, body).then(({ data }) => data),
  updateRequirement: (id: string, body: RequirementInput & { version: number }) => api.patch<Requirement>(`/requirements/${id}`, body).then(({ data }) => data),
  deleteRequirement: (id: string, version: number) => api.delete(`/requirements/${id}`, { params: { version } }),
}

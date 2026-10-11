import type { AxiosProgressEvent } from 'axios'
import { api } from './client'
import type { CollectionFilterStatus, CollectionStatus, RequirementStatus } from './collections'

export type DocumentStatus = 'QUARANTINED' | 'AVAILABLE' | 'FAILED' | 'EXCLUDED'

export interface PortalDocument {
  id: string
  linkId: string
  name: string
  contentType: string
  sizeBytes: number
  status: DocumentStatus
  failureCode: string | null
  duplicate: boolean
  editable: boolean
  countsForSubmission: boolean
  createdAt: string
}

export interface PortalRequirement {
  id: string
  type: string
  title: string
  required: boolean
  criteria: Record<string, unknown>
  status: RequirementStatus
  clientMessage: string | null
  documents: PortalDocument[]
}

export interface PortalSubmission {
  id: string
  roundNo: number
  status: 'DRAFT' | 'SUBMITTED'
  note: string | null
  manualReviewRequested: boolean
  submittedAt: string | null
  createdAt: string
}

export interface PortalWorkflowEvent {
  id: string
  eventType: 'PUBLISHED' | 'SUBMITTED' | 'AI_REVIEW_COMPLETED' | 'CHANGES_REQUESTED' | 'APPROVED' | 'APPROVAL_WITHDRAWN' | 'CANCELLED'
  payload: Record<string, unknown>
  createdAt: string
}

export interface PortalCollectionSummary {
  id: string
  clientId: string
  clientName: string
  period: string
  dueAt: string
  status: CollectionStatus
  assigneeName: string
  requiredCount: number
  readyCount: number
  updatedAt: string
  reviewStatus?: 'PROCESSING' | 'AI_PASSED' | 'AI_NEEDS_REVIEW' | 'AI_FAILED' | 'AWAITING_ACCOUNTANT' | null
}

export interface PortalCollectionListQuery {
  clientId?: string
  period?: string
  status?: CollectionFilterStatus
  sort?: 'due_at' | 'period' | 'updated_at'
  order?: 'asc' | 'desc'
}

export interface PortalCollectionDetail extends PortalCollectionSummary {
  scopeNote: string | null
  requirements: PortalRequirement[]
  submission: PortalSubmission | null
  manualReviewAvailable: boolean
  events: PortalWorkflowEvent[]
}

export interface PortalUploadResult {
  submissionId: string
  document: PortalDocument
}

export interface ClassificationChoice { documentId: string; category: 'REQUIREMENT' | 'OTHER' | 'INVALID'; requirementId: string | null }
export interface ClassificationRun {
  id: string
  status: 'DRAFT' | 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  provider: 'MOCK' | 'REMOTE' | 'DEEPSEEK' | 'MANUAL' | 'DISABLED'
  error: string | null
  confirmedAt: string | null
  documents: Array<{ documentId: string; name: string; status: DocumentStatus; failureCode: string | null }>
  items: Array<ClassificationChoice & { documentType: string | null; confidence: number }>
}

export const portalApi = {
  createClassification: (id: string) => api.post<ClassificationRun>(`/portal/collection-requests/${id}/classification-runs`).then(({ data }) => data),
  stage: (id: string, runId: string, file: File, onProgress: (event: AxiosProgressEvent) => void) => {
    const body = new FormData()
    body.append('file', file)
    body.append('classification_run_id', runId)
    return api.post<{ documentId: string }>(`/portal/collection-requests/${id}/documents`, body, { onUploadProgress: onProgress }).then(({ data }) => data)
  },
  startClassification: (id: string, runId: string) => api.post<ClassificationRun>(`/portal/collection-requests/${id}/classification-runs/${runId}/start`).then(({ data }) => data),
  classification: (id: string, runId: string) => api.get<ClassificationRun>(`/portal/collection-requests/${id}/classification-runs/${runId}`).then(({ data }) => data),
  cancelClassification: (id: string, runId: string) => api.post<ClassificationRun>(`/portal/collection-requests/${id}/classification-runs/${runId}/cancel`).then(({ data }) => data),
  manualClassification: (id: string, runId: string) => api.post<ClassificationRun>(`/portal/collection-requests/${id}/classification-runs/${runId}/manual`).then(({ data }) => data),
  confirmClassification: (id: string, runId: string, items: ClassificationChoice[]) => api.post<ClassificationRun>(`/portal/collection-requests/${id}/classification-runs/${runId}/confirm`, { items }).then(({ data }) => data),
  list: (params: PortalCollectionListQuery = {}) => api.get<{ items: PortalCollectionSummary[]; total: number }>('/portal/collection-requests', { params }).then(({ data }) => data),
  get: (id: string) => api.get<PortalCollectionDetail>(`/portal/collection-requests/${id}`).then(({ data }) => data),
  upload: (id: string, requirementId: string | null, file: File, onProgress: (event: AxiosProgressEvent) => void) => {
    const body = new FormData()
    body.append('file', file)
    if (requirementId) body.append('requirement_id', requirementId)
    return api.post<PortalUploadResult>(`/portal/collection-requests/${id}/documents`, body, { onUploadProgress: onProgress }).then(({ data }) => data)
  },
  document: (linkId: string) => api.get<PortalDocument>(`/portal/document-links/${linkId}`).then(({ data }) => data),
  exclude: (linkId: string) => api.delete<PortalDocument>(`/portal/document-links/${linkId}`).then(({ data }) => data),
  submit: (id: string, note?: string, manualReviewRequested = false) => api.post<PortalCollectionDetail>(`/portal/collection-requests/${id}/submit`, {
    note: note?.trim() || null,
    manualReviewRequested,
  }).then(({ data }) => data),
  download: (linkId: string) => api.get<Blob>(`/portal/document-links/${linkId}/download`, { responseType: 'blob' }).then(({ data }) => data),
}

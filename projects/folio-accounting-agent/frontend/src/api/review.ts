import { api } from './client'
import type { CollectionStatus, CollectionSummary, WorkflowEvent } from './collections'

export type EvidenceRelation = 'SUPPORTS' | 'CONTRADICTS' | 'REFERENCE'
export type ReviewAction = 'SATISFY' | 'REQUEST_ACTION' | 'WAIVE'
export type IssueCode = 'MISSING' | 'WRONG_PERIOD' | 'ENTITY_MISMATCH' | 'UNREADABLE' | 'INCOMPLETE' | 'OTHER'

export interface ReviewDocument {
  id: string
  linkId: string
  submissionId: string
  roundNo: number
  name: string
  contentType: string
  sizeBytes: number
  status: string
  documentType: string
  relation: EvidenceRelation
  createdAt: string
}

export interface ReviewDecision {
  id: string
  submissionId: string
  decision: ReviewAction
  issueCode: IssueCode | null
  clientMessage: string | null
  internalNote: string | null
  createdBy: string | null
  source: 'HUMAN' | 'AI'
  aiRunId: string | null
  createdByName: string
  createdAt: string
  evidence: Array<{ documentId: string; relation: EvidenceRelation }>
}

export interface ReviewRequirement {
  id: string
  type: string
  title: string
  required: boolean
  status: string
  version: number
  issueCode: IssueCode | null
  clientMessage: string | null
  internalNote: string | null
  documents: ReviewDocument[]
  decisions: ReviewDecision[]
}

export interface ReviewCollection {
  reviewStatus?: CollectionSummary['reviewStatus']
  id: string
  clientId: string
  clientName: string
  period: string
  dueAt: string
  status: CollectionStatus
  version: number
  assigneeName: string
  requirements: ReviewRequirement[]
  otherDocuments: ReviewDocument[]
  submissions: Array<{ id: string; roundNo: number; note: string | null; manualReviewRequested: boolean; submittedAt: string | null }>
  events: WorkflowEvent[]
}

export interface ReviewFinding {
  requirementId: string
  action: 'ASK_CLIENT' | 'RESOLVE' | 'ESCALATE'
  suggestedDecision: 'SATISFY' | 'REQUEST_ACTION' | null
  issueCode: IssueCode | null
  entityCheck: 'MATCH' | 'MISMATCH' | 'UNKNOWN'
  periodCheck: 'MATCH' | 'MISMATCH' | 'UNKNOWN'
  explanation: string
  clientMessage: string | null
  requestedDocumentType?: string | null
  evidence: Array<{ documentId: string; relation: EvidenceRelation; reason: string }>
  amounts: Array<{ currency: string; operation: 'SUM' | 'SUBTRACT' | 'MULTIPLY'; operands: Array<{ documentId: string; amount: string; label: string }>; expectedAmount: string; actualAmount: string; difference: string }>
  amountsValid: boolean
  manualReasons: string[]
  autoApplied?: boolean
}

export interface ReviewRun {
  id: string
  submissionId: string
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
  modelVersion: string | null
  error: string | null
  createdAt: string
  finishedAt: string | null
  documents: Array<{ id: string; name: string; contentType: string; scope: 'CURRENT' | 'HISTORY' }>
  searches: Array<{ action: 'SEARCH_CURRENT' | 'SEARCH_HISTORY'; count: number }>
  output: {
    findings: ReviewFinding[]
    extractions: Array<{ documentId: string; documentType: string | null; entityName: string | null; period: string | null; invoiceNumber: string | null; counterparty: string | null; amount: string | null; currency: string | null; transactions: Array<{ date: string; description: string; amount: string; currency: string }> }>
  } | null
}

const idempotency = (key: string) => ({ headers: { 'Idempotency-Key': key } })

export const reviewApi = {
  runs: (id: string) => api.get<ReviewRun[]>(`/collection-requests/${id}/review-runs`).then(({ data }) => data),
  retryRun: (id: string, runId: string) => api.post<ReviewRun>(`/collection-requests/${id}/review-runs/${runId}/retry`).then(({ data }) => data),
  get: (id: string) => api.get<ReviewCollection>(`/collection-requests/${id}/review`).then(({ data }) => data),
  review: (id: string, body: {
    version: number
    submissionId: string
    decision: ReviewAction
    issueCode?: IssueCode
    clientMessage?: string
    internalNote?: string
    evidence?: Array<{ documentId: string; relation: EvidenceRelation }>
  }) => api.post<ReviewCollection>(`/requirements/${id}/review`, body).then(({ data }) => data),
  requestChanges: (id: string, version: number, reason: string, key: string) => api.post<ReviewCollection>(`/collection-requests/${id}/request-changes`, { version, reason }, idempotency(key)).then(({ data }) => data),
  approve: (id: string, version: number, key: string) => api.post<ReviewCollection>(`/collection-requests/${id}/approve`, { version }, idempotency(key)).then(({ data }) => data),
  reopen: (id: string, version: number, reason: string, key: string) => api.post<ReviewCollection>(`/collection-requests/${id}/reopen`, { version, reason }, idempotency(key)).then(({ data }) => data),
  download: (id: string) => api.get<Blob>(`/documents/${id}/download`, { responseType: 'blob' }).then(({ data }) => data),
}

import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createI18n } from 'vue-i18n'
import { expect, it } from 'vitest'
import type { ReviewRun } from '@/api/review'
import { reviewMessages } from '@/i18n/review'
import ReviewAnalysisPanel from './ReviewAnalysisPanel.vue'

const render = (run: ReviewRun, canRetry = true) => renderToString(
  createSSRApp(ReviewAnalysisPanel, { run, requirementId: 'req', documentIds: ['doc'], canRetry, retrying: false })
    .use(createI18n({ legacy: false, locale: 'en', messages: reviewMessages })),
)

it('shows analysis details without implementation metadata', async () => {
  const run: ReviewRun = {
    id: 'run', submissionId: 'round', status: 'SUCCEEDED', modelVersion: 'mock-reviewer-v1', error: null, createdAt: '', finishedAt: '', searches: [],
    documents: [{ id: 'doc', name: 'G02.pdf', contentType: 'application/pdf', scope: 'CURRENT' }],
    output: { extractions: [], findings: [{ requirementId: 'req', action: 'ASK_CLIENT', suggestedDecision: 'REQUEST_ACTION', issueCode: 'WRONG_PERIOD', entityCheck: 'UNKNOWN', periodCheck: 'MISMATCH', explanation: 'Wrong period <script>alert(1)</script>', clientMessage: 'Please upload September.', evidence: [{ documentId: 'doc', relation: 'CONTRADICTS', reason: 'July statement' }], amounts: [], amountsValid: true, manualReasons: ['LOW_CONFIDENCE', 'MANUAL_REVIEW_REQUIRED'], autoApplied: false }] },
  }
  const html = await render(run)
  expect(html).toContain('Does not match')
  expect(html).toContain('Contradicts')
  expect(html).toContain('Suggested client message')
  expect(html).not.toContain('mock-reviewer-v1')
  expect(html).not.toContain('MANUAL_REVIEW_REQUIRED')
  expect(html).not.toContain('<script>')
})

it('puts incomplete states and retry inside the card body', async () => {
  const run: ReviewRun = { id: 'run', submissionId: 'round', status: 'PROCESSING', modelVersion: null, error: null, createdAt: '', finishedAt: null, documents: [], searches: [], output: null }
  const processing = await render(run)
  expect(processing).toContain('Analyzing submitted documents')
  expect(processing).not.toContain('Try again')

  const failed = await render({ ...run, status: 'FAILED', error: 'AGENT_UNAVAILABLE' })
  expect(failed).toContain('The analysis service is unavailable')
  expect(failed).toContain('Try again')
})

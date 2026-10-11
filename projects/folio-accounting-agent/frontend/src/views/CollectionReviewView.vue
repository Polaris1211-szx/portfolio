<script setup lang="ts">
import { ArrowLeft, CheckCircle2, Clock3, Download, RotateCcw, Send, Sparkles } from '@lucide/vue'
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { readApiError } from '@/api/client'
import { reviewApi, type IssueCode, type ReviewAction, type ReviewCollection, type ReviewRequirement, type ReviewRun } from '@/api/review'
import ReviewAnalysisPanel from '@/components/ReviewAnalysisPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DocumentPreviewDialog from '@/components/DocumentPreviewDialog.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import FileTypeIcon from '@/components/FileTypeIcon.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/stores/auth'

type Transition = 'requestChanges' | 'approve' | 'reopen'
const OTHER_DOCUMENTS_ID = '__other_documents__'

const route = useRoute()
const auth = useAuthStore()
const { t, locale } = useI18n()
const detail = ref<ReviewCollection | null>(null)
const selectedId = ref('')
const selectedSubmissionId = ref('')
const runs = ref<ReviewRun[]>([])
const runError = ref(false)
const retrying = ref(false)
let runTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
const selectedRun = computed(() => runs.value.find(run => run.submissionId === selectedSubmissionId.value))

async function loadRuns() {
  clearTimeout(runTimer)
  try {
    const hadRuns = runs.value.length > 0
    const hadPending = runs.value.some(run => ['QUEUED', 'PROCESSING'].includes(run.status))
    const value = await reviewApi.runs(String(route.params.id))
    if (disposed) return
    runs.value = value
    runError.value = false
    const hasPending = value.some(run => ['QUEUED', 'PROCESSING'].includes(run.status))
    if (hasPending) runTimer = setTimeout(loadRuns, 2000)
    else if (hadPending || !hadRuns) {
      detail.value = await reviewApi.get(String(route.params.id))
      resetForm()
    }
  } catch { if (!disposed) runError.value = true }
}

async function retryRun() {
  if (!selectedRun.value || retrying.value) return
  retrying.value = true
  try {
    await reviewApi.retryRun(String(route.params.id), selectedRun.value.id)
    await loadRuns()
  } catch (caught) { actionError.value = readApiError(caught) }
  finally { retrying.value = false }
}
onUnmounted(() => { disposed = true; clearTimeout(runTimer) })
const loading = ref(true)
const busy = ref('')
const error = ref<ReturnType<typeof readApiError> | null>(null)
const actionError = ref<ReturnType<typeof readApiError> | null>(null)
const success = ref('')
const decision = ref<ReviewAction>('SATISFY')
const issueCode = ref<IssueCode | undefined>()
const clientMessage = ref('')
const internalNote = ref('')
const selectedEvidenceIds = ref<string[]>([])
const validation = ref('')
const confirmDecision = ref(false)
const transition = ref<Transition | null>(null)
const transitionReason = ref('')
const keys = reactive<Record<string, string>>({})
const previewOpen = ref(false)
const previewDocument = ref<{ id: string; name: string; contentType: string } | null>(null)

const selected = computed(() => detail.value?.requirements.find(item => item.id === selectedId.value) ?? null)
const latestSubmission = computed(() => detail.value?.submissions.at(-1) ?? null)
const selectedSubmission = computed(() => detail.value?.submissions.find(item => item.id === selectedSubmissionId.value) ?? null)
const isLatestRound = computed(() => !!latestSubmission.value && selectedSubmissionId.value === latestSubmission.value.id)
const showingOtherDocuments = computed(() => selectedId.value === OTHER_DOCUMENTS_ID)
const visibleDocuments = computed(() => (showingOtherDocuments.value ? detail.value?.otherDocuments : selected.value?.documents)?.filter(document => document.submissionId === selectedSubmissionId.value) ?? [])
const otherDocumentCount = computed(() => detail.value?.otherDocuments.filter(document => document.submissionId === selectedSubmissionId.value).length ?? 0)
const selectedRoundDecision = computed(() => selected.value?.decisions.find(item => item.submissionId === selectedSubmissionId.value) ?? null)
const canEditDecision = computed(() => isLatestRound.value && detail.value?.status === 'IN_REVIEW')
const selectedFinding = computed(() => selectedRun.value?.status === 'SUCCEEDED' ? selectedRun.value.output?.findings.find(item => item.requirementId === selected.value?.id) ?? null : null)
const evidenceCandidates = computed(() => {
  const candidates = new Map<string, { id: string; name: string; contentType: string; scope: 'CURRENT' | 'HISTORY' }>()
  for (const document of visibleDocuments.value) candidates.set(document.id, { id: document.id, name: document.name, contentType: document.contentType, scope: 'CURRENT' })
  const extraIds = new Set([
    ...(selectedFinding.value?.evidence.map(value => value.documentId) ?? []),
    ...(selectedRoundDecision.value?.evidence.map(value => value.documentId) ?? []),
  ])
  for (const document of selectedRun.value?.documents ?? []) {
    if (extraIds.has(document.id)) candidates.set(document.id, document)
  }
  return [...candidates.values()]
})
const canApplySuggestion = computed(() => canEditDecision.value && !!selectedFinding.value?.suggestedDecision)
const requestChangeItems = computed(() => {
  const submissionId = latestSubmission.value?.id
  if (!submissionId) return []
  return detail.value?.requirements.flatMap(requirement => {
    const review = requirement.decisions.find(item => item.submissionId === submissionId && item.decision === 'REQUEST_ACTION')
    return review?.clientMessage?.trim() ? [{ title: requirement.title, message: review.clientMessage.trim() }] : []
  }) ?? []
})
const unreviewedCount = computed(() => detail.value?.requirements.filter(item => !['NEEDS_ACTION', 'SATISFIED', 'WAIVED'].includes(item.status)).length ?? 0)
const incompleteCount = computed(() => detail.value?.requirements.filter(item => !['SATISFIED', 'WAIVED'].includes(item.status)).length ?? 0)
const hasRequestedChanges = computed(() => detail.value?.requirements.some(item => item.status === 'NEEDS_ACTION') ?? false)
const canRequestChanges = computed(() => detail.value?.status === 'IN_REVIEW' && unreviewedCount.value === 0 && hasRequestedChanges.value)
const canApprove = computed(() => detail.value?.status === 'IN_REVIEW' && incompleteCount.value === 0)
const aiRoundPassed = computed(() => canApprove.value && !!selectedRun.value?.output?.findings.length && selectedRun.value.output.findings.every(item => item.suggestedDecision === 'SATISFY' && item.manualReasons.length === 0))
const decisionStatuses: Record<ReviewAction, string> = { SATISFY: 'SATISFIED', REQUEST_ACTION: 'NEEDS_ACTION', WAIVE: 'WAIVED' }

function decisionFor(requirement: ReviewRequirement) {
  return requirement.decisions.find(item => item.submissionId === selectedSubmissionId.value)
}


function statusFor(requirement: ReviewRequirement) {
  if (isLatestRound.value) {
    return requirement.status
  }
  const decision = decisionFor(requirement)
  return decision ? decisionStatuses[decision.decision] : 'PENDING'
}

function documentCount(requirement: ReviewRequirement) {
  return requirement.documents.filter(document => document.submissionId === selectedSubmissionId.value).length
}

function formatPeriod(value: string) {
  return new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
}

function resetForm() {
  const requirement = selected.value
  decision.value = requirement?.status === 'NEEDS_ACTION' ? 'REQUEST_ACTION' : requirement?.status === 'WAIVED' ? 'WAIVE' : 'SATISFY'
  issueCode.value = requirement?.issueCode ?? undefined
  clientMessage.value = requirement?.clientMessage ?? ''
  internalNote.value = requirement?.internalNote ?? ''
  selectedEvidenceIds.value = selectedRoundDecision.value?.evidence.map(value => value.documentId) ?? []
  validation.value = ''
  success.value = ''
}

function applySuggestion() {
  const finding = selectedFinding.value
  if (!finding?.suggestedDecision) return
  decision.value = finding.suggestedDecision
  issueCode.value = finding.suggestedDecision === 'REQUEST_ACTION' ? finding.issueCode ?? undefined : undefined
  clientMessage.value = finding.clientMessage ?? ''
  selectedEvidenceIds.value = finding.evidence.map(value => value.documentId)
  validation.value = ''
  success.value = ''
}

async function load() {
  loading.value = true
  error.value = null
  try {
    const value = await reviewApi.get(String(route.params.id))
    detail.value = value
    void loadRuns()
    if (!value.requirements.some(item => item.id === selectedId.value) && !(selectedId.value === OTHER_DOCUMENTS_ID && value.otherDocuments.length)) selectedId.value = value.requirements[0]?.id ?? ''
    if (!value.submissions.some(item => item.id === selectedSubmissionId.value)) selectedSubmissionId.value = value.submissions.at(-1)?.id ?? ''
  } catch (caught) { error.value = readApiError(caught) }
  finally { loading.value = false }
}

async function download(document: { id: string; name: string }) {
  actionError.value = null
  try {
    const url = URL.createObjectURL(await reviewApi.download(document.id))
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = document.name
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (caught) { actionError.value = readApiError(caught) }
}

function preview(document: { id: string; name: string; contentType: string }) {
  previewDocument.value = document
  previewOpen.value = true
}

function validateDecision() {
  if (decision.value === 'REQUEST_ACTION' && (!issueCode.value || !clientMessage.value.trim())) return t('review.incompleteDecision')
  if (decision.value === 'WAIVE' && !clientMessage.value.trim() && !internalNote.value.trim()) return t('review.waiveReason')
  return ''
}

function askSave() {
  validation.value = validateDecision()
  if (validation.value) return
  if (decision.value === 'WAIVE') confirmDecision.value = true
  else saveDecision()
}

async function saveDecision() {
  if (!selected.value || !latestSubmission.value || !isLatestRound.value || busy.value) return
  busy.value = 'decision'
  actionError.value = null
  success.value = ''
  try {
    detail.value = await reviewApi.review(selected.value.id, {
      version: selected.value.version,
      submissionId: latestSubmission.value.id,
      decision: decision.value,
      issueCode: decision.value === 'REQUEST_ACTION' ? issueCode.value : undefined,
      clientMessage: clientMessage.value.trim() || undefined,
      internalNote: internalNote.value.trim() || undefined,
      evidence: selectedEvidenceIds.value.map(documentId => ({
        documentId,
        relation: decision.value === 'SATISFY' ? 'SUPPORTS' : decision.value === 'REQUEST_ACTION' ? 'CONTRADICTS' : 'REFERENCE',
      })),
    })
    confirmDecision.value = false
    success.value = t('review.saved')
    resetForm()
  } catch (caught) { actionError.value = readApiError(caught) }
  finally { busy.value = '' }
}

function askTransition(value: Transition) {
  transition.value = value
  transitionReason.value = ''
}

function generateReturnReason() {
  transitionReason.value = [
    t('review.generatedReasonIntro'),
    ...requestChangeItems.value.map((item, index) => `${index + 1}. ${item.title}: ${item.message}`),
  ].join('\n')
}

function keyFor(action: string) {
  return keys[action] ??= crypto.randomUUID()
}

async function runTransition() {
  if (!detail.value || !transition.value || busy.value) return
  const action = transition.value
  if (action !== 'approve' && !transitionReason.value.trim()) return
  busy.value = action
  actionError.value = null
  try {
    const reason = transitionReason.value.trim()
    detail.value = action === 'requestChanges'
      ? await reviewApi.requestChanges(detail.value.id, detail.value.version, reason, keyFor(action))
      : action === 'approve'
        ? await reviewApi.approve(detail.value.id, detail.value.version, keyFor(action))
        : await reviewApi.reopen(detail.value.id, detail.value.version, reason, keyFor(action))
    delete keys[action]
    transition.value = null
    transitionReason.value = ''
  } catch (caught) { actionError.value = readApiError(caught) }
  finally { busy.value = '' }
}

watch(selectedId, resetForm)
watch(selectedSubmissionId, resetForm)
watch(decision, () => { validation.value = '' })
load()
</script>

<template>
  <section class="space-y-6 pb-24 lg:pb-20">
    <RouterLink :to="{ name: 'collection-detail', params: { id: route.params.id } }" class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft class="size-4" />{{ t('review.back') }}</RouterLink>

    <div v-if="error" class="space-y-3"><ErrorNotice v-bind="error" /><Button variant="outline" @click="load">{{ t('review.retry') }}</Button></div>
    <p v-else-if="loading" role="status" class="text-sm text-muted-foreground">{{ t('review.loading') }}</p>
    <template v-else-if="detail">
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div><p class="text-sm text-muted-foreground">{{ detail.clientName }} · {{ formatPeriod(detail.period) }}</p><h1 class="mt-1 text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ t('review.title') }}</h1></div>
        <StatusBadge :status="detail.reviewStatus ?? detail.status" translation-prefix="collections.status" />
      </header>

      <ErrorNotice v-if="actionError" v-bind="actionError" />
      <div v-if="actionError?.code === 'VERSION_CONFLICT'" class="app-panel flex flex-wrap items-center justify-between gap-3 px-5 py-4"><p class="text-sm">{{ t('review.conflict') }}</p><Button size="sm" variant="outline" @click="load">{{ t('review.reload') }}</Button></div>

      <div class="space-y-5">
          <section v-if="selectedSubmission" class="app-panel overflow-hidden">
            <div class="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div><div class="flex flex-wrap items-center gap-2"><p class="text-sm font-semibold">{{ t('review.submissionRound') }}</p><span v-if="selectedSubmission.manualReviewRequested" class="rounded-full bg-amber-500/12 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">{{ t('review.manualReviewRequested') }}</span></div><p class="mt-1 text-xs text-muted-foreground">{{ formatDate(selectedSubmission.submittedAt) }}</p></div>
              <Select v-model="selectedSubmissionId"><SelectTrigger class="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="submission in [...detail.submissions].reverse()" :key="submission.id" :value="submission.id">{{ t('review.roundOption', { round: submission.roundNo }) }}{{ submission.id === latestSubmission?.id ? ` · ${t('review.latest')}` : '' }}</SelectItem></SelectContent></Select>
            </div>
            <div class="h-[72px] border-t bg-muted/25 px-5 py-3"><p class="text-xs font-medium text-muted-foreground">{{ t('review.submissionNote') }}</p><p class="mt-1 line-clamp-2 text-sm leading-5" :class="selectedSubmission.note ? '' : 'text-muted-foreground'" :title="selectedSubmission.note ?? ''">{{ selectedSubmission.note || t('review.noSubmissionNote') }}</p></div>
          </section>
          <div class="grid items-start gap-5" :class="showingOtherDocuments ? 'lg:grid-cols-[260px_minmax(0,1fr)]' : 'lg:grid-cols-[260px_minmax(0,1fr)_320px]'">
            <aside class="app-panel overflow-hidden">
              <header class="border-b px-5 py-4"><h2 class="text-sm font-semibold">{{ t('review.requirements') }}</h2></header>
              <div class="divide-y">
                <button v-for="requirement in detail.requirements" :key="requirement.id" type="button" class="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50" :class="selectedId === requirement.id ? 'bg-accent/60' : ''" @click="selectedId = requirement.id">
                  <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{{ documentCount(requirement) }}</span>
                  <span class="min-w-0 flex-1"><span class="block text-sm font-medium">{{ requirement.title }}</span><span class="mt-1 block text-xs text-muted-foreground">{{ requirement.required ? t('portal.required') : t('portal.optional') }}</span></span>
                  <StatusBadge :status="statusFor(requirement)" translation-prefix="collections.status" />
                </button>
                <button v-if="detail.otherDocuments.length" type="button" class="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50" :class="showingOtherDocuments ? 'bg-accent/60' : ''" @click="selectedId = OTHER_DOCUMENTS_ID">
                  <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">{{ otherDocumentCount }}</span>
                  <span class="min-w-0 flex-1"><span class="block text-sm font-medium">{{ t('collections.types.OTHER') }}</span><span class="mt-1 block text-xs text-muted-foreground">{{ t('review.supportingFiles') }}</span></span>
                </button>
              </div>
            </aside>

            <main v-if="selected || showingOtherDocuments" class="space-y-5">
              <section class="app-panel overflow-hidden">
                <header class="flex items-start justify-between gap-3 border-b px-5 py-4"><div><h2 class="font-semibold">{{ showingOtherDocuments ? t('collections.types.OTHER') : selected?.title }}</h2><p class="mt-1 text-xs text-muted-foreground">{{ showingOtherDocuments ? t('review.supportingFilesHint') : t(`collections.types.${selected?.type}`) }}</p></div><StatusBadge v-if="selected" :status="statusFor(selected)" translation-prefix="collections.status" /></header>
                <div v-if="visibleDocuments.length" class="divide-y">
                  <article v-for="document in visibleDocuments" :key="document.linkId" class="flex flex-wrap items-center gap-3 px-5 py-4">
                    <button type="button" class="flex min-w-36 flex-1 items-center gap-3 text-left" @click="preview(document)">
                      <FileTypeIcon :name="document.name" :content-type="document.contentType" />
                      <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium hover:underline" :title="document.name">{{ document.name }}</span><span class="mt-1 block text-xs text-muted-foreground">{{ formatSize(document.sizeBytes) }}</span></span>
                    </button>
                    <Button size="icon-sm" variant="ghost" :aria-label="t('review.download')" @click="download(document)"><Download class="size-4" /></Button>
                  </article>
                </div>
                <p v-else class="px-5 py-10 text-center text-sm text-muted-foreground">{{ t('review.noFiles') }}</p>
              </section>

              <div v-if="runError" class="app-panel flex flex-wrap items-center justify-between gap-3 p-5"><p class="text-sm text-muted-foreground">{{ t('review.ai.loadError') }}</p><Button size="sm" variant="outline" @click="loadRuns">{{ t('review.retry') }}</Button></div>
              <ReviewAnalysisPanel v-else-if="selectedRun" :run="selectedRun" :requirement-id="selected?.id" :document-ids="visibleDocuments.map(document => document.id)" :can-retry="isLatestRound && detail.status === 'IN_REVIEW'" :retrying="retrying" @retry="retryRun" @preview="preview" />
            </main>

            <aside v-if="selected" class="app-panel min-w-0 overflow-hidden lg:sticky lg:top-6">
              <header class="flex items-center justify-between gap-3 border-b px-5 py-4">
                <div class="flex items-center gap-2"><h2 class="text-sm font-semibold">{{ t('review.decision') }}</h2><span v-if="selectedRoundDecision?.source === 'AI'" class="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">{{ t('review.aiDecision') }}</span></div>
                <Button v-if="canApplySuggestion" size="sm" variant="outline" @click="applySuggestion"><Sparkles class="size-4" />{{ t('review.applySuggestion') }}</Button>
              </header>
              <div v-if="!isLatestRound" class="space-y-4 p-5">
                <p class="text-sm leading-6 text-muted-foreground">{{ t('review.historicalRound') }}</p>
                <template v-if="selectedRoundDecision">
                  <div><p class="text-xs text-muted-foreground">{{ t('review.action') }}</p><p class="mt-1 text-sm font-medium">{{ t(`review.${selectedRoundDecision.decision}`) }}</p></div>
                  <div v-if="selectedRoundDecision.issueCode"><p class="text-xs text-muted-foreground">{{ t('review.issue') }}</p><p class="mt-1 text-sm">{{ t(`review.issueCodes.${selectedRoundDecision.issueCode}`) }}</p></div>
                  <div v-if="selectedRoundDecision.clientMessage"><p class="text-xs text-muted-foreground">{{ t('review.clientMessage') }}</p><p class="mt-1 whitespace-pre-wrap text-sm leading-6">{{ selectedRoundDecision.clientMessage }}</p></div>
                  <div v-if="selectedRoundDecision.internalNote"><p class="text-xs text-muted-foreground">{{ t('review.internalNote') }}</p><p class="mt-1 whitespace-pre-wrap text-sm leading-6">{{ selectedRoundDecision.internalNote }}</p></div>
                </template>
                <p v-else class="text-sm text-muted-foreground">{{ t('review.noRoundDecision') }}</p>
              </div>
              <fieldset v-else :disabled="!canEditDecision" class="min-w-0 space-y-5 p-5">
                <div class="space-y-2"><Label>{{ t('review.action') }}</Label><Select v-model="decision" :disabled="!canEditDecision"><SelectTrigger class="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="action in ['SATISFY', 'REQUEST_ACTION', 'WAIVE']" :key="action" :value="action">{{ t(`review.${action}`) }}</SelectItem></SelectContent></Select></div>
                <div v-if="decision === 'REQUEST_ACTION'" class="space-y-2"><Label>{{ t('review.issue') }}</Label><Select v-model="issueCode" :disabled="!canEditDecision"><SelectTrigger class="w-full"><SelectValue :placeholder="t('review.issuePlaceholder')" /></SelectTrigger><SelectContent><SelectItem v-for="code in ['MISSING', 'WRONG_PERIOD', 'ENTITY_MISMATCH', 'UNREADABLE', 'INCOMPLETE', 'OTHER']" :key="code" :value="code">{{ t(`review.issueCodes.${code}`) }}</SelectItem></SelectContent></Select></div>
                <div class="space-y-2"><Label for="client-message">{{ t('review.clientMessage') }}</Label><textarea id="client-message" v-model="clientMessage" rows="4" class="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-3 focus:ring-ring/50" /><p class="text-xs text-muted-foreground">{{ t('review.clientMessageHint') }}</p></div>
                <div class="space-y-2"><Label for="internal-note">{{ t('review.internalNote') }}</Label><textarea id="internal-note" v-model="internalNote" rows="4" class="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-3 focus:ring-ring/50" /><p class="text-xs text-muted-foreground">{{ t('review.internalNoteHint') }}</p></div>
                <div v-if="evidenceCandidates.length" class="space-y-2">
                  <div><Label>{{ t('review.evidence') }}</Label><p class="mt-1 text-xs text-muted-foreground">{{ t('review.evidenceHint') }}</p></div>
                  <label v-for="document in evidenceCandidates" :key="document.id" class="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors" :class="selectedEvidenceIds.includes(document.id) ? 'border-primary/50 bg-primary/5' : ''">
                    <input v-model="selectedEvidenceIds" type="checkbox" :value="document.id" class="size-4 shrink-0 accent-primary" />
                    <FileTypeIcon :name="document.name" :content-type="document.contentType" />
                    <span class="min-w-0 flex-1"><span class="block truncate text-sm" :title="document.name">{{ document.name }}</span><span class="text-xs text-muted-foreground">{{ t(`review.ai.scopes.${document.scope}`) }}</span></span>
                  </label>
                </div>
                <p v-if="validation" class="text-sm text-destructive">{{ validation }}</p><p v-if="success" class="text-sm text-primary">{{ success }}</p>
                <Button class="w-full" :disabled="!canEditDecision || busy === 'decision'" @click="askSave"><CheckCircle2 class="size-4" />{{ busy === 'decision' ? t('review.saving') : t('review.saveDecision') }}</Button>
              </fieldset>
            </aside>
          </div>

          <section v-if="isLatestRound && (detail.status === 'IN_REVIEW' || (detail.status === 'READY_FOR_BOOKKEEPING' && auth.user?.firmRole === 'FIRM_ADMIN'))" class="fixed right-4 bottom-24 left-4 z-20 mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 rounded-2xl border bg-card px-5 py-4 shadow-xl lg:right-10 lg:bottom-6 lg:left-[calc(16rem+2.5rem)]">
            <p v-if="detail.status === 'IN_REVIEW' && unreviewedCount" class="mr-auto text-sm text-muted-foreground">{{ t('review.reviewPending', { count: unreviewedCount }) }}</p><p v-else-if="detail.status === 'IN_REVIEW' && incompleteCount" class="mr-auto text-sm text-muted-foreground">{{ t('review.approvalBlocked', { count: incompleteCount }) }}</p><p v-else-if="aiRoundPassed" class="mr-auto text-sm text-muted-foreground">{{ t('review.aiRoundPassed') }}</p><span v-else class="mr-auto" />
            <Button v-if="hasRequestedChanges" variant="outline" :disabled="!canRequestChanges" @click="askTransition('requestChanges')"><Send class="size-4" />{{ t('review.requestChanges') }}</Button>
            <Button v-if="detail.status === 'IN_REVIEW'" :disabled="!canApprove" @click="askTransition('approve')"><CheckCircle2 class="size-4" />{{ t('review.approve') }}</Button>
            <Button v-if="detail.status === 'READY_FOR_BOOKKEEPING' && auth.user?.firmRole === 'FIRM_ADMIN'" variant="outline" @click="askTransition('reopen')"><RotateCcw class="size-4" />{{ t('review.reopen') }}</Button>
          </section>
          <section v-else-if="isLatestRound && detail.status === 'CHANGES_REQUESTED'" class="app-panel flex items-start gap-3 px-5 py-4">
            <span class="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"><Clock3 class="size-4" /></span>
            <div><p class="text-sm font-medium">{{ t('review.waitingClient') }}</p><p class="mt-1 text-xs leading-5 text-muted-foreground">{{ t('review.waitingClientHint') }}</p></div>
          </section>
      </div>

      <ConfirmDialog v-model:open="confirmDecision" :title="t('review.waiveConfirmTitle')" :description="t('review.waiveConfirmHint')" :busy="busy === 'decision'" @confirm="saveDecision" />
      <DocumentPreviewDialog v-if="previewDocument" v-model:open="previewOpen" :name="previewDocument.name" :content-type="previewDocument.contentType" :load="() => reviewApi.download(previewDocument!.id)" />
      <ConfirmDialog v-if="transition" :open="true" :title="t(`review.${transition}Title`)" :description="t(`review.${transition}Hint`)" :busy="busy === transition" :confirm-disabled="transition !== 'approve' && !transitionReason.trim()" :confirm-label="t('review.confirm')" :cancel-label="t('review.cancel')" @update:open="!$event && (transition = null)" @confirm="runTransition">
        <div v-if="transition !== 'approve'" class="mt-4 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <Label for="transition-reason">{{ t('review.reason') }}</Label>
            <Button v-if="transition === 'requestChanges'" size="sm" variant="outline" :disabled="!requestChangeItems.length" @click="generateReturnReason"><Sparkles class="size-4" />{{ t('review.generateReason') }}</Button>
          </div>
          <textarea id="transition-reason" v-model="transitionReason" rows="4" :placeholder="t('review.reasonPlaceholder')" class="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-3 focus:ring-ring/50" />
        </div>
      </ConfirmDialog>
    </template>
  </section>
</template>

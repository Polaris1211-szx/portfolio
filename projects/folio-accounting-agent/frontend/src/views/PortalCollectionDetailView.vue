<script setup lang="ts">
import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileText, GripVertical, MessageSquareText, RotateCw, Sparkles, Trash2, Upload, X } from '@lucide/vue'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { readApiError } from '@/api/client'
import { portalApi, type ClassificationRun, type PortalCollectionDetail, type PortalDocument, type PortalRequirement, type PortalWorkflowEvent } from '@/api/portal'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DocumentPreviewDialog from '@/components/DocumentPreviewDialog.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import FileTypeIcon from '@/components/FileTypeIcon.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Stepper, StepperDescription, StepperIndicator, StepperItem, StepperSeparator, StepperTitle, StepperTrigger } from '@/components/ui/stepper'

interface UploadState { progress: number; busy: boolean; file?: File; error?: ReturnType<typeof readApiError> }
interface SmartCandidate {
  id: string
  file: File
  target: string
  suggestedTarget: string
  confidence: number
  documentId?: string
  failure?: string
  available?: boolean
}

const INVALID_TARGET = '__invalid__'

const route = useRoute()
const { t, te, locale } = useI18n()
const detail = ref<PortalCollectionDetail | null>(null)
const expanded = ref<string[]>([])
const loading = ref(true)
const busy = ref(false)
const error = ref<ReturnType<typeof readApiError> | null>(null)
const actionError = ref<ReturnType<typeof readApiError> | null>(null)
const validationMessage = ref('')
const confirmSubmit = ref(false)
const submissionNote = ref('')
const manualReviewRequested = ref(false)
const previewOpen = ref(false)
const previewDocument = ref<PortalDocument | null>(null)
const uploads = reactive<Record<string, UploadState>>({})
const dragging = ref<string | null>(null)
const smartDragging = ref(false)
const smartUpload = reactive({ busy: false })
const smartDialogOpen = ref(false)
const smartPhase = ref<'confirm' | 'staging' | 'scanning' | 'analyzing' | 'results' | 'uploading'>('confirm')
const smartRun = ref<ClassificationRun | null>(null)
const smartManual = ref(false)
const smartProgress = ref(0)
const smartCancelling = ref(false)
const smartCandidates = ref<SmartCandidate[]>([])
const smartClassificationError = ref<ReturnType<typeof readApiError> | null>(null)
const smartCancelConfirm = ref(false)
const smartDragTarget = ref<string | null>(null)
const draggedCandidateId = ref<string | null>(null)
const selectedCandidateId = ref<string | null>(null)
const timers = new Set<ReturnType<typeof setTimeout>>()
const timelineIcons: Record<PortalWorkflowEvent['eventType'], Component> = {
  PUBLISHED: FileText,
  SUBMITTED: Upload,
  AI_REVIEW_COMPLETED: Sparkles,
  CHANGES_REQUESTED: AlertCircle,
  APPROVED: CheckCircle2,
  APPROVAL_WITHDRAWN: RotateCw,
  CANCELLED: X,
}
let smartGeneration = 0
let reviewTimer: ReturnType<typeof setTimeout> | undefined
let disposed = false
function pollReview() {
  clearTimeout(reviewTimer)
  if (disposed || detail.value?.reviewStatus !== 'PROCESSING') return
  reviewTimer = setTimeout(async () => {
    try {
      const value = await portalApi.get(String(route.params.id))
      if (!disposed && detail.value) detail.value = value
    } catch { /* Keep the submitted state; analysis never blocks manual review. */ }
    pollReview()
  }, 3000)
}
watch(() => detail.value?.reviewStatus, pollReview)

const editable = computed(() => detail.value && ['OPEN', 'CHANGES_REQUESTED'].includes(detail.value.status))
const collectionStatus = computed(() => detail.value?.reviewStatus ?? detail.value?.status ?? '')
const isOtherBucket = (item: PortalRequirement) => item.id === detail.value?.id
const requirementEditable = (item: PortalRequirement) => detail.value?.status === 'OPEN'
  || (detail.value?.status === 'CHANGES_REQUESTED' && !isOtherBucket(item) && ['PENDING', 'RECEIVED', 'NEEDS_ACTION'].includes(item.status))
const requirementHasIssue = (item: PortalRequirement) => item.status === 'NEEDS_ACTION'
  || (item.status === 'RECEIVED' && Boolean(item.clientMessage))
const editableRequirements = computed(() => detail.value?.requirements.filter(requirementEditable) ?? [])
const required = computed(() => detail.value?.requirements.filter(item => item.required) ?? [])
const requirementReady = (item: PortalRequirement) => ['SATISFIED', 'WAIVED'].includes(item.status)
  || item.documents.some(document => document.status === 'AVAILABLE' && (
    !editable.value || document.countsForSubmission
    || (detail.value?.status === 'CHANGES_REQUESTED' && ['PENDING', 'RECEIVED'].includes(item.status))
    || (manualReviewRequested.value && detail.value?.manualReviewAvailable)
  ))
const readyRequired = computed(() => required.value.filter(requirementReady).length)
const progress = computed(() => required.value.length ? Math.round(readyRequired.value / required.value.length * 100) : 100)
const processing = computed(() => detail.value?.requirements.some(item => item.documents.some(document => document.status === 'QUARANTINED')) ?? false)
const missing = computed(() => required.value.filter(item => !requirementReady(item)))
const smartCategories = computed(() => [
  ...editableRequirements.value.map(requirement => ({
    target: requirement.id,
    label: isOtherBucket(requirement) ? t('collections.types.OTHER') : requirement.title,
  })),
  { target: INVALID_TARGET, label: t('portal.invalidClassification') },
])
const smartGroups = computed(() => smartCategories.value.map(category => ({
  ...category,
  candidates: smartCandidates.value.filter(candidate => candidate.target === category.target),
})))

function formatPeriod(value: string) {
  return new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function timelineEventName(event: PortalWorkflowEvent) {
  const key = event.eventType === 'SUBMITTED' && event.payload.manualReviewRequested
    ? 'MANUAL_REVIEW_REQUESTED'
    : event.eventType
  return t(`portal.timelineEvents.${key}`, { round: Number(event.payload.roundNo ?? 1) })
}

const timelineStatusIcon = computed<Component>(() => ({
  PROCESSING: Sparkles,
  AI_PASSED: Sparkles,
  AI_NEEDS_REVIEW: FileText,
  AI_FAILED: FileText,
  AWAITING_ACCOUNTANT: FileText,
  CHANGES_REQUESTED: AlertCircle,
  READY_FOR_BOOKKEEPING: CheckCircle2,
  CANCELLED: X,
} as Record<string, Component>)[collectionStatus.value] ?? FileText)

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function criteriaText(requirement: PortalRequirement) {
  return Object.values(requirement.criteria).filter(value => typeof value === 'string').join(' · ')
}

function translatedError(error?: ReturnType<typeof readApiError>) {
  return error?.code && te(`error.codes.${error.code}`) ? t(`error.codes.${error.code}`) : error?.message
}

function failureText(code: string | null) {
  return code && te(`portal.failure.${code}`) ? t(`portal.failure.${code}`) : t('portal.failure.UNKNOWN')
}

function replaceDocument(document: PortalDocument) {
  for (const requirement of detail.value?.requirements ?? []) {
    const index = requirement.documents.findIndex(item => item.linkId === document.linkId)
    if (index >= 0) requirement.documents[index] = document
  }
}

function poll(document: PortalDocument, attempts = 0) {
  if (document.status !== 'QUARANTINED' || attempts >= 40) return
  const timer = setTimeout(async () => {
    timers.delete(timer)
    try {
      const current = await portalApi.document(document.linkId)
      replaceDocument(current)
      poll(current, attempts + 1)
    } catch (caught) { actionError.value = readApiError(caught) }
  }, 1500)
  timers.add(timer)
}

async function load() {
  loading.value = true
  error.value = null
  try {
    detail.value = await portalApi.get(String(route.params.id))
    expanded.value = detail.value.requirements[0] ? [detail.value.requirements[0].id] : []
    detail.value.requirements.flatMap(item => item.documents).forEach(document => poll(document))
  } catch (caught) { error.value = readApiError(caught) }
  finally { loading.value = false }
}

async function upload(requirement: PortalRequirement, file: File) {
  if (!requirementEditable(requirement)) return false
  const state: UploadState = uploads[requirement.id] = { progress: 0, busy: true, file }
  actionError.value = null
  validationMessage.value = ''
  try {
    const result = await portalApi.upload(
      String(route.params.id), isOtherBucket(requirement) ? null : requirement.id, file,
      event => { state.progress = event.total ? Math.round(event.loaded / event.total * 100) : 0 },
    )
    detail.value = await portalApi.get(String(route.params.id))
    poll(result.document)
    return true
  } catch (caught) { state.error = readApiError(caught) }
  finally { state.busy = false }
  return false
}

async function uploadFiles(requirement: PortalRequirement, files: File[]) {
  for (const file of files) await upload(requirement, file)
}

function chooseFiles(requirement: PortalRequirement, event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (files.length) uploadFiles(requirement, files)
}

function dropFiles(requirement: PortalRequirement, event: DragEvent) {
  dragging.value = null
  const files = [...(event.dataTransfer?.files ?? [])]
  if (files.length) uploadFiles(requirement, files)
}

function leaveDropZone(id: string, event: DragEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null) && dragging.value === id) dragging.value = null
}

function leaveSmartDropZone(event: DragEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) smartDragging.value = false
}

function prepareSmartUpload(files: File[]) {
  if (!detail.value || !files.length || smartUpload.busy) return
  smartGeneration += 1
  smartCandidates.value = files.map((file, index) => ({
    id: `${index}-${file.name}-${file.size}-${file.lastModified}`,
    file,
    target: '',
    suggestedTarget: '',
    confidence: 0,
  }))
  smartDialogOpen.value = true
  smartRun.value = null
  selectedCandidateId.value = null
  smartManual.value = false
  smartProgress.value = 0
  smartPhase.value = 'confirm'
  smartClassificationError.value = null
  actionError.value = null
}

async function startSmartAnalysis() {
  if (!detail.value || smartPhase.value !== 'confirm') return
  const generation = smartGeneration
  smartPhase.value = 'staging'
  smartClassificationError.value = null
  try {
    const requestId = String(route.params.id)
    const run = smartRun.value ?? await portalApi.createClassification(requestId)
    if (generation !== smartGeneration) { await portalApi.cancelClassification(requestId, run.id); return }
    smartRun.value = run
    for (const [index, candidate] of smartCandidates.value.entries()) {
      if (generation !== smartGeneration) return
      if (candidate.documentId || candidate.failure) continue
      try {
        const result = await portalApi.stage(requestId, run.id, candidate.file, event => { if (generation === smartGeneration) smartProgress.value = Math.round((index + (event.total ? event.loaded / event.total : 0)) / smartCandidates.value.length * 100) })
        candidate.documentId = result.documentId
      } catch (caught) {
        candidate.failure = translatedError(readApiError(caught)) ?? t('portal.failure.UNKNOWN')
        candidate.target = INVALID_TARGET
      }
    }
    if (generation !== smartGeneration) return
    // Content deduplication is authoritative on the server, including renamed files.
    const seen = new Set<string>()
    smartCandidates.value = smartCandidates.value.filter(candidate => {
      if (!candidate.documentId) return true
      if (seen.has(candidate.documentId)) return false
      seen.add(candidate.documentId)
      return true
    })
    if (!seen.size) { smartManual.value = true; smartPhase.value = 'results'; return }
    const started = await portalApi.startClassification(requestId, run.id)
    if (generation !== smartGeneration) return
    smartRun.value = started
    while (generation === smartGeneration) {
      const current = await portalApi.classification(requestId, run.id)
      if (generation !== smartGeneration) return
      smartRun.value = current
      for (const candidate of smartCandidates.value) {
        const document = current.documents.find(item => item.documentId === candidate.documentId)
        candidate.available = document?.status === 'AVAILABLE'
        if (document?.status === 'FAILED') candidate.failure = failureText(document.failureCode)
      }
      if (current.status === 'SUCCEEDED' || current.status === 'FAILED') {
        smartManual.value = current.status === 'FAILED' || current.provider === 'MANUAL'
        applyClassification(current)
        smartPhase.value = 'results'
        return
      }
      if (current.status === 'CANCELLED') { discardSmartUpload(); return }
      smartPhase.value = current.documents.some(doc => doc.status === 'QUARANTINED') ? 'scanning' : 'analyzing'
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  } catch (caught) {
    if (generation === smartGeneration) {
      smartClassificationError.value = readApiError(caught)
      smartPhase.value = 'confirm'
    }
  }
}

function applyClassification(run: ClassificationRun) {
  const fallback = editableRequirements.value.find(isOtherBucket)?.id ?? INVALID_TARGET
  for (const candidate of smartCandidates.value) {
    const item = run.items.find(item => item.documentId === candidate.documentId)
    candidate.target = !candidate.available ? INVALID_TARGET : item?.category === 'REQUIREMENT' && editableRequirements.value.some(req => req.id === item.requirementId) ? item.requirementId! : item?.category === 'INVALID' ? INVALID_TARGET : fallback
    candidate.suggestedTarget = candidate.target
    candidate.confidence = item?.confidence ?? 0
  }
}

async function classifyManually() {
  if (!smartRun.value) return
  const generation = smartGeneration
  try {
    const run = await portalApi.manualClassification(String(route.params.id), smartRun.value.id)
    if (generation !== smartGeneration) return
    smartGeneration += 1
    smartRun.value = run
    smartManual.value = true
    for (const candidate of smartCandidates.value) candidate.available = run.documents.some(doc => doc.documentId === candidate.documentId && doc.status === 'AVAILABLE')
    applyClassification(run)
    smartPhase.value = 'results'
  } catch (caught) { if (generation === smartGeneration) smartClassificationError.value = readApiError(caught) }
}

function requestSmartClose(open: boolean) {
  if (open || smartPhase.value === 'uploading') return
  smartCancelConfirm.value = true
}

async function discardSmartUpload() {
  if (smartCancelling.value) return
  smartCancelling.value = true
  smartGeneration += 1
  try {
    if (smartRun.value && !smartRun.value.confirmedAt) await portalApi.cancelClassification(String(route.params.id), smartRun.value.id)
  } catch (caught) {
    smartClassificationError.value = readApiError(caught)
    smartCancelConfirm.value = false
    smartPhase.value = 'confirm'
    return
  }
  finally { smartCancelling.value = false }
  smartDialogOpen.value = false
  smartCancelConfirm.value = false
  smartPhase.value = 'confirm'
  smartCandidates.value = []
  smartClassificationError.value = null
  smartDragTarget.value = null
  draggedCandidateId.value = null
  smartRun.value = null
}

function removeSmartCandidate(candidateId: string) {
  smartCandidates.value = smartCandidates.value.filter(candidate => candidate.id !== candidateId || candidate.documentId)
}

function startSmartDrag(candidate: SmartCandidate, event: DragEvent) {
  draggedCandidateId.value = candidate.id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', candidate.id)
  }
}

function moveSmartCandidate(candidateId: string, target: string) {
  const candidate = smartCandidates.value.find(item => item.id === candidateId)
  if (candidate && candidate.available && smartCategories.value.some(category => category.target === target)) candidate.target = target
  selectedCandidateId.value = null
}

function dropSmartCandidate(target: string, event: DragEvent) {
  const candidateId = event.dataTransfer?.getData('text/plain') || draggedCandidateId.value
  if (candidateId) moveSmartCandidate(candidateId, target)
  smartDragTarget.value = null
  draggedCandidateId.value = null
}

async function confirmSmartUpload() {
  if (!detail.value || smartPhase.value !== 'results') return
  smartPhase.value = 'uploading'
  smartUpload.busy = true
  try {
    if (smartRun.value && smartCandidates.value.some(candidate => candidate.documentId)) {
      smartRun.value = await portalApi.confirmClassification(String(route.params.id), smartRun.value.id, smartCandidates.value.filter(candidate => candidate.documentId).map(candidate => {
        const requirement = detail.value?.requirements.find(item => item.id === candidate.target)
        const other = requirement && isOtherBucket(requirement)
        return { documentId: candidate.documentId!, category: candidate.target === INVALID_TARGET ? 'INVALID' : other ? 'OTHER' : 'REQUIREMENT', requirementId: candidate.target === INVALID_TARGET || other ? null : candidate.target }
      }))
    } else if (smartRun.value) { await portalApi.cancelClassification(String(route.params.id), smartRun.value.id) }
    detail.value = await portalApi.get(String(route.params.id))
    smartDialogOpen.value = false
    smartCandidates.value = []
    smartRun.value = null
  } catch (caught) {
    smartClassificationError.value = readApiError(caught)
    smartPhase.value = 'results'
  } finally {
    smartUpload.busy = false
  }
}

function chooseSmartFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  prepareSmartUpload(files)
}

function dropSmartFiles(event: DragEvent) {
  smartDragging.value = false
  prepareSmartUpload([...(event.dataTransfer?.files ?? [])])
}

async function exclude(document: PortalDocument) {
  actionError.value = null
  try {
    await portalApi.exclude(document.linkId)
    detail.value = await portalApi.get(String(route.params.id))
  }
  catch (caught) { actionError.value = readApiError(caught) }
}

async function download(document: PortalDocument) {
  actionError.value = null
  try {
    const url = URL.createObjectURL(await portalApi.download(document.linkId))
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = document.name
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (caught) { actionError.value = readApiError(caught) }
}

function preview(document: PortalDocument) {
  if (document.status !== 'AVAILABLE') return
  previewDocument.value = document
  previewOpen.value = true
}

function askSubmit() {
  validationMessage.value = processing.value
    ? t('portal.processingHint')
    : missing.value.length ? t('portal.missingHint', { count: missing.value.length }) : ''
  if (!validationMessage.value) confirmSubmit.value = true
}

async function submit() {
  busy.value = true
  actionError.value = null
  try {
    detail.value = await portalApi.submit(
      String(route.params.id),
      submissionNote.value,
      manualReviewRequested.value,
    )
    confirmSubmit.value = false
    submissionNote.value = ''
    manualReviewRequested.value = false
  } catch (caught) { actionError.value = readApiError(caught) }
  finally { busy.value = false }
}

onMounted(load)
onBeforeUnmount(() => { disposed = true; clearTimeout(reviewTimer); smartGeneration += 1; timers.forEach(clearTimeout) })
</script>

<template>
  <section class="space-y-7" :class="editable ? 'pb-20 lg:pb-14' : ''">
    <RouterLink :to="{ name: 'portal-collections' }" class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft class="size-4" />{{ t('portal.back') }}</RouterLink>

    <div v-if="error" class="space-y-3"><ErrorNotice v-bind="error" /><Button variant="outline" @click="load">{{ t('portal.retry') }}</Button></div>
    <p v-else-if="loading" role="status" class="text-sm text-muted-foreground">{{ t('portal.loading') }}</p>
    <template v-else-if="detail">
      <p v-if="detail.reviewStatus" role="status" class="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{{ detail.submission?.manualReviewRequested ? t('portal.manualReviewPending') : t(`portal.reviewStatus.${detail.reviewStatus}`) }}</p>
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div><p class="text-sm text-muted-foreground">{{ detail.clientName }}</p><h1 class="mt-1 text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ formatPeriod(detail.period) }}</h1></div>
        <StatusBadge :status="collectionStatus" translation-prefix="collections.status" />
      </header>

      <section class="app-panel overflow-hidden">
        <div class="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div class="px-5 py-5 sm:px-6"><p class="text-xs text-muted-foreground">{{ t('portal.dueLabel') }}</p><p class="mt-1.5 text-sm font-medium">{{ formatDate(detail.dueAt) }}</p></div>
          <div class="px-5 py-5 sm:px-6"><p class="text-xs text-muted-foreground">{{ t('portal.contact') }}</p><p class="mt-1.5 text-sm font-medium">{{ detail.assigneeName }}</p></div>
          <div class="px-5 py-5 sm:px-6"><div class="flex justify-between text-xs"><span class="text-muted-foreground">{{ t('portal.progress') }}</span><span class="font-medium">{{ readyRequired }}/{{ required.length }}</span></div><Progress :model-value="progress" class="mt-3 h-1.5" /></div>
        </div>
        <div v-if="detail.scopeNote" class="border-t px-5 py-5 text-sm leading-6 text-muted-foreground sm:px-6"><p class="mb-1 text-xs font-medium text-foreground">{{ t('portal.instructions') }}</p>{{ detail.scopeNote }}</div>
      </section>

      <div v-if="actionError" class="space-y-3"><ErrorNotice v-bind="actionError" /><Button variant="ghost" size="sm" @click="actionError = null">{{ t('portal.dismiss') }}</Button></div>

      <div class="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section class="app-panel min-w-0 overflow-hidden" aria-labelledby="requirements-title">
        <header class="border-b px-5 py-5 sm:px-7"><h2 id="requirements-title" class="text-base font-semibold">{{ t('portal.requirements') }}</h2><p class="mt-1.5 text-sm text-muted-foreground">{{ t('portal.requirementsHint') }}</p></header>
        <div v-if="editableRequirements.length" class="border-b px-5 py-5 sm:px-7">
          <label
            class="flex min-h-24 cursor-pointer items-center gap-4 rounded-2xl border border-dashed px-5 py-4 transition-colors focus-within:ring-3 focus-within:ring-ring/50"
            :class="smartDragging ? 'border-primary bg-accent/60' : 'hover:bg-muted/40'"
            @dragenter.prevent="smartDragging = true"
            @dragover.prevent="smartDragging = true"
            @dragleave.prevent="leaveSmartDropZone"
            @drop.prevent="dropSmartFiles"
          >
            <span class="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Sparkles class="size-4" /></span>
            <span class="min-w-0 flex-1"><span class="block text-sm font-semibold">{{ t('portal.smartUpload') }}</span><span class="mt-1 block text-xs leading-5 text-muted-foreground">{{ smartDragging ? t('portal.dropNow') : t('portal.smartUploadHint') }}</span></span>
            <span class="hidden text-xs font-medium text-primary sm:block">{{ t('portal.chooseFiles') }}</span>
            <input class="sr-only" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" :disabled="smartUpload.busy" @change="chooseSmartFiles">
          </label>
        </div>
        <Accordion v-model="expanded" type="multiple">
          <AccordionItem v-for="requirement in detail.requirements" :key="requirement.id" :value="requirement.id" class="px-5 sm:px-7">
            <AccordionTrigger class="py-5 hover:no-underline">
              <span class="flex min-w-0 items-start gap-3 pr-3">
                <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full" :class="requirementHasIssue(requirement) ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : ['SATISFIED', 'WAIVED'].includes(requirement.status) ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'">
                  <AlertCircle v-if="requirementHasIssue(requirement)" class="size-4" />
                  <CheckCircle2 v-else-if="['SATISFIED', 'WAIVED'].includes(requirement.status)" class="size-4" />
                  <FileText v-else class="size-4" />
                </span>
                <span class="min-w-0"><span class="block font-medium">{{ requirement.title }}</span><span class="mt-1 block text-xs font-normal text-muted-foreground">{{ requirement.required ? t('portal.required') : t('portal.optional') }} · {{ t(`collections.types.${requirement.type}`) }}</span></span>
              </span>
            </AccordionTrigger>
            <AccordionContent class="pb-6 pl-11">
              <p v-if="criteriaText(requirement)" class="mb-4 text-sm leading-6 text-muted-foreground">{{ criteriaText(requirement) }}</p>
              <div v-if="requirement.clientMessage" class="mb-4 flex items-start gap-3 rounded-2xl border border-amber-600/25 bg-amber-500/[0.08] p-4">
                <span class="grid size-9 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300"><MessageSquareText class="size-4" /></span>
                <div class="min-w-0"><p class="text-sm font-semibold text-foreground">{{ t('portal.reviewNote') }}</p><p class="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-foreground/80">{{ requirement.clientMessage }}</p></div>
              </div>

              <div v-if="requirement.documents.length" class="mb-4 space-y-2">
                <div v-for="document in requirement.documents" :key="document.linkId" class="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3 shadow-sm">
                  <button type="button" class="flex min-w-32 flex-1 items-center gap-3 text-left disabled:cursor-default" :disabled="document.status !== 'AVAILABLE'" @click="preview(document)">
                    <FileTypeIcon :name="document.name" :content-type="document.contentType" />
                    <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium enabled:hover:underline" :title="document.name">{{ document.name }}</span><span class="mt-0.5 block text-xs text-muted-foreground">{{ formatSize(document.sizeBytes) }}<span v-if="document.duplicate"> · {{ t('portal.reused') }}</span><span v-if="document.status === 'FAILED'"> · {{ failureText(document.failureCode) }}</span></span></span>
                  </button>
                  <StatusBadge :status="document.status" translation-prefix="portal.documentStatus" />
                  <Button v-if="document.status === 'AVAILABLE'" variant="ghost" size="icon-sm" :aria-label="t('portal.download')" @click="download(document)"><Download class="size-4" /></Button>
                  <Button v-if="document.editable && document.status !== 'EXCLUDED'" variant="ghost" size="icon-sm" :aria-label="t('portal.exclude')" @click="exclude(document)"><Trash2 class="size-4" /></Button>
                </div>
              </div>

              <div v-if="requirementEditable(requirement)" class="space-y-3">
                <label
                  class="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 text-center text-sm font-medium transition-colors focus-within:ring-3 focus-within:ring-ring/50"
                  :class="dragging === requirement.id ? 'border-primary bg-accent/60' : 'hover:bg-muted/40'"
                  @dragenter.prevent="dragging = requirement.id"
                  @dragover.prevent="dragging = requirement.id"
                  @dragleave.prevent="leaveDropZone(requirement.id, $event)"
                  @drop.prevent="dropFiles(requirement, $event)"
                >
                  <Upload class="size-4" />{{ dragging === requirement.id ? t('portal.dropNow') : t('portal.chooseOrDrop') }}
                  <input class="sr-only" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" :disabled="uploads[requirement.id]?.busy" @change="chooseFiles(requirement, $event)">
                </label>
                <div v-if="uploads[requirement.id]?.busy" role="status"><div class="mb-2 flex justify-between text-xs text-muted-foreground"><span>{{ t('portal.uploading') }}</span><span>{{ uploads[requirement.id]?.progress }}%</span></div><Progress :model-value="uploads[requirement.id]?.progress ?? 0" class="h-1.5" /></div>
                <div v-if="uploads[requirement.id]?.error" class="flex flex-wrap items-center gap-2 text-sm text-destructive"><AlertCircle class="size-4" /><span class="flex-1">{{ translatedError(uploads[requirement.id]?.error) }}</span><Button variant="outline" size="sm" @click="uploads[requirement.id]?.file && upload(requirement, uploads[requirement.id]!.file!)"><RotateCw class="size-4" />{{ t('portal.retry') }}</Button></div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <section class="app-panel overflow-hidden lg:sticky lg:top-6" aria-labelledby="timeline-title">
        <header class="border-b px-5 py-5 sm:px-7">
          <h2 id="timeline-title" class="text-base font-semibold">{{ t('portal.timeline') }}</h2>
          <p class="mt-1.5 text-sm text-muted-foreground">{{ t('portal.timelineHint') }}</p>
        </header>
        <Stepper :model-value="detail.events.length + 1" orientation="vertical" class="flex-col gap-0 px-5 py-5 sm:px-7">
          <StepperItem v-for="(event, index) in detail.events" :key="event.id" :step="index + 1" class="relative flex w-full items-start gap-3">
            <StepperTrigger class="pointer-events-none flex shrink-0 flex-col items-center" tabindex="-1">
              <StepperIndicator class="size-8 border bg-background text-muted-foreground">
                <component :is="timelineIcons[event.eventType]" class="size-4" />
              </StepperIndicator>
            </StepperTrigger>
            <div class="min-w-0 flex-1 pb-6 pt-1">
              <StepperTitle class="text-sm font-medium">{{ timelineEventName(event) }}</StepperTitle>
              <StepperDescription class="mt-1 text-xs">{{ formatDateTime(event.createdAt) }}</StepperDescription>
            </div>
            <StepperSeparator class="absolute left-4 top-8 h-[calc(100%-2rem)] w-px" />
          </StepperItem>
          <StepperItem :step="detail.events.length + 1" class="relative flex w-full items-start gap-3">
            <StepperTrigger class="pointer-events-none flex shrink-0 flex-col items-center" tabindex="-1">
              <StepperIndicator class="size-8 border-primary bg-primary text-primary-foreground">
                <component :is="timelineStatusIcon" class="size-4" />
              </StepperIndicator>
            </StepperTrigger>
            <div class="min-w-0 flex-1 pt-1">
              <StepperTitle class="text-sm font-semibold">{{ t('portal.timelineCurrent', { status: t(`collections.status.${collectionStatus}`) }) }}</StepperTitle>
            </div>
          </StepperItem>
        </Stepper>
      </section>
      </div>

      <section v-if="editable || detail.submission?.note" class="app-panel overflow-hidden">
        <div v-if="editable" class="space-y-2 px-5 py-4">
          <Label for="submission-note">{{ t('portal.submissionNote') }}</Label>
          <textarea id="submission-note" v-model="submissionNote" rows="3" maxlength="2000" :placeholder="t('portal.submissionNotePlaceholder')" class="w-full resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-3 focus:ring-ring/50" />
          <p class="text-xs text-muted-foreground">{{ t('portal.submissionNoteHint') }}</p>
          <label v-if="detail.manualReviewAvailable" class="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/25 p-4">
            <Checkbox v-model="manualReviewRequested" class="mt-0.5" />
            <span><span class="block text-sm font-medium">{{ t('portal.requestManualReview') }}</span><span class="mt-1 block text-xs leading-5 text-muted-foreground">{{ t('portal.requestManualReviewHint') }}</span></span>
          </label>
        </div>
        <div v-else class="px-5 py-4"><p class="whitespace-pre-wrap text-sm leading-6">{{ detail.submission?.note }}</p></div>
      </section>

      <section v-if="editable" class="fixed right-4 bottom-24 left-4 z-20 mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 rounded-2xl border bg-card px-5 py-4 shadow-xl lg:right-10 lg:bottom-6 lg:left-[calc(16rem+2.5rem)]">
        <div class="mr-auto min-w-0"><p class="text-sm font-medium">{{ t('portal.submitTitle') }}</p><p class="mt-1 text-xs text-muted-foreground">{{ validationMessage || t('portal.submitHint') }}</p></div>
        <Button class="h-10" @click="askSubmit">{{ t('portal.submit') }}</Button>
      </section>

      <DialogRoot :open="smartDialogOpen" @update:open="requestSmartClose">
        <DialogPortal>
          <DialogOverlay class="fixed inset-0 z-50 bg-black/45" />
          <DialogContent class="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl" @escape-key-down="smartPhase === 'uploading' && $event.preventDefault()">
            <header class="relative border-b px-6 py-5 pr-14">
              <DialogTitle class="text-lg font-semibold">{{ t(`portal.smartPhase.${smartPhase}.title`) }}</DialogTitle>
              <DialogDescription class="mt-1.5 text-sm leading-6 text-muted-foreground">{{ t(`portal.smartPhase.${smartPhase}.hint`) }}</DialogDescription>
              <Button type="button" variant="ghost" size="icon-sm" class="absolute top-5 right-5" :disabled="smartPhase === 'uploading'" :aria-label="t('portal.cancelSmartUpload')" @click="requestSmartClose(false)"><X class="size-4" /></Button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto p-6">
              <ErrorNotice v-if="smartClassificationError" v-bind="smartClassificationError" class="mb-4" />
              <template v-if="smartPhase === 'confirm'">
                <div class="divide-y rounded-xl border">
                  <div v-for="candidate in smartCandidates" :key="candidate.id" class="flex items-center gap-3 px-4 py-3">
                    <FileTypeIcon :name="candidate.file.name" :content-type="candidate.file.type" />
                    <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium" :title="candidate.file.name">{{ candidate.file.name }}</p><p class="mt-0.5 text-xs text-muted-foreground">{{ formatSize(candidate.file.size) }}</p></div>
                    <Button type="button" variant="ghost" size="icon-sm" :disabled="Boolean(candidate.documentId)" :aria-label="t('portal.removeSelectedFile')" @click="removeSmartCandidate(candidate.id)"><Trash2 class="size-4" /></Button>
                  </div>
                </div>
              </template>

              <div v-else-if="['staging', 'scanning', 'analyzing'].includes(smartPhase)" role="status" class="grid min-h-80 place-items-center text-center">
                <div class="w-full max-w-sm">
                  <span class="relative mx-auto grid size-16 place-items-center rounded-full bg-primary text-primary-foreground"><span class="absolute inset-0 animate-ping rounded-full bg-primary/25" /><Sparkles class="relative size-6 animate-pulse" /></span>
                  <p class="mt-5 font-medium">{{ t(`portal.smartPhase.${smartPhase}.title`) }}</p>
                  <Progress v-if="smartPhase === 'staging'" :model-value="smartProgress" class="mt-4 h-1.5" />
                  <p v-if="smartRun?.provider === 'MOCK'" class="mt-3 text-sm text-muted-foreground">{{ t('portal.mockClassification') }}</p>
                  <Button v-if="smartPhase === 'analyzing'" variant="outline" class="mt-4" @click="classifyManually">{{ t('portal.classifyManually') }}</Button>
                </div>
              </div>

              <template v-else-if="smartPhase === 'results'">
                <p v-if="smartManual" role="status" class="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{{ t('portal.manualClassification') }}</p>
                <p v-else-if="smartRun?.provider === 'MOCK'" class="mb-4 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">{{ t('portal.mockClassification') }}</p>
                <p class="mb-4 text-sm text-muted-foreground">{{ t('portal.dragClassificationHint') }}</p>
                <div class="grid items-start gap-4 lg:grid-cols-2">
                  <section
                    v-for="group in smartGroups"
                    :key="group.target"
                    class="rounded-xl border transition-colors"
                    :class="[
                      group.target === INVALID_TARGET ? 'border-destructive/30' : '',
                      smartDragTarget === group.target ? 'border-primary bg-accent/40' : '',
                    ]"
                    @dragenter.prevent="smartDragTarget = group.target"
                    @dragover.prevent="smartDragTarget = group.target"
                    @dragleave.prevent="smartDragTarget === group.target && (smartDragTarget = null)"
                    @drop.prevent="dropSmartCandidate(group.target, $event)"
                  >
                    <header class="flex items-center justify-between gap-2 border-b px-4 py-3"><h3 class="text-sm font-semibold">{{ group.label }}</h3><Button v-if="selectedCandidateId" size="sm" variant="outline" @click="moveSmartCandidate(selectedCandidateId, group.target)">{{ t('portal.moveHere') }}</Button><span v-else class="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{{ group.candidates.length }}</span></header>
                    <div class="min-h-24 space-y-2 p-3">
                      <p v-if="!group.candidates.length" class="grid min-h-16 place-items-center text-xs text-muted-foreground">{{ t('portal.dropCategoryHere') }}</p>
                      <article
                        v-for="candidate in group.candidates"
                        :key="candidate.id"
                        :draggable="candidate.available"
                        :tabindex="candidate.available ? 0 : undefined"
                        :role="candidate.available ? 'button' : undefined"
                        :aria-pressed="candidate.available ? selectedCandidateId === candidate.id : undefined"
                        class="rounded-xl border bg-background p-3 shadow-sm"
                        :class="[candidate.available && 'cursor-grab active:cursor-grabbing', selectedCandidateId === candidate.id && 'ring-2 ring-primary']"
                        @click="candidate.available && (selectedCandidateId = selectedCandidateId === candidate.id ? null : candidate.id)"
                        @keydown.enter.prevent="candidate.available && (selectedCandidateId = candidate.id)"
                        @keydown.space.prevent="candidate.available && (selectedCandidateId = candidate.id)"
                        @dragstart="startSmartDrag(candidate, $event)"
                        @dragend="smartDragTarget = null; draggedCandidateId = null"
                      >
                        <div class="flex items-start gap-2">
                          <GripVertical class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                          <FileTypeIcon :name="candidate.file.name" :content-type="candidate.file.type" />
                          <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium" :title="candidate.file.name">{{ candidate.file.name }}</p><p class="mt-1 text-xs text-muted-foreground">{{ formatSize(candidate.file.size) }}<template v-if="candidate.available && !smartManual"> · {{ candidate.target === candidate.suggestedTarget ? t('portal.aiConfidence', { confidence: Math.round(candidate.confidence * 100) }) : t('portal.manuallyAdjusted') }}</template></p><p v-if="candidate.failure" class="mt-1 text-xs text-destructive">{{ candidate.failure }}</p></div>
                        </div>
                      </article>
                    </div>
                  </section>
                </div>
              </template>

              <div v-else role="status" class="grid min-h-64 place-items-center">
                <div class="text-center"><RotateCw class="mx-auto mb-3 size-6 animate-spin" /><p class="font-medium">{{ t('portal.smartPhase.uploading.title') }}</p></div>
              </div>
            </div>

            <footer class="flex justify-end gap-2 border-t px-6 py-4">
              <Button type="button" variant="outline" :disabled="smartPhase === 'uploading'" @click="requestSmartClose(false)">{{ t('portal.cancelSmartUpload') }}</Button>
              <Button v-if="smartPhase === 'confirm'" type="button" :disabled="!smartCandidates.length" @click="startSmartAnalysis"><Sparkles class="size-4" />{{ t('portal.startAnalysis') }}</Button>
              <Button v-else-if="['staging', 'scanning', 'analyzing'].includes(smartPhase)" type="button" disabled>{{ t(`portal.smartPhase.${smartPhase}.title`) }}</Button>
              <Button v-else-if="smartPhase === 'results'" type="button" @click="confirmSmartUpload">{{ t('portal.confirmSmartUpload') }}</Button>
              <Button v-else type="button" disabled>{{ t('portal.smartPhase.uploading.title') }}</Button>
            </footer>
          </DialogContent>
        </DialogPortal>
      </DialogRoot>

      <ConfirmDialog
        :open="smartCancelConfirm"
        :busy="smartCancelling"
        :title="t('portal.cancelConfirmTitle')"
        :description="t('portal.cancelConfirmHint')"
        :confirm-label="t('portal.confirmCancel')"
        :cancel-label="t('portal.keepProcessing')"
        @update:open="smartCancelConfirm = $event"
        @confirm="discardSmartUpload"
      />

      <DocumentPreviewDialog v-if="previewDocument" v-model:open="previewOpen" :name="previewDocument.name" :content-type="previewDocument.contentType" :load="() => portalApi.download(previewDocument!.linkId)" />
      <ConfirmDialog v-model:open="confirmSubmit" :title="t(manualReviewRequested ? 'portal.confirmManualReviewTitle' : 'portal.confirmTitle')" :description="t(manualReviewRequested ? 'portal.confirmManualReviewHint' : 'portal.confirmHint')" :busy="busy" @confirm="submit" />
    </template>
  </section>
</template>

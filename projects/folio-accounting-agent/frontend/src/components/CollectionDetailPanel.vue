<script setup lang="ts">
import { Archive, ArrowUpRight, BadgeCheck, Ban, CalendarDays, ChevronDown, ChevronUp, ClipboardCheck, Clock3, Copy, FilePenLine, FilePlus2, ListChecks, Pencil, RotateCcw, Send, Sparkles, Undo2, Upload, UserRound, XCircle } from '@lucide/vue'
import { computed, reactive, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { collectionsApi, type CollectionDetail, type WorkflowEvent } from '@/api/collections'
import { readApiError } from '@/api/client'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Stepper, StepperDescription, StepperIndicator, StepperItem, StepperSeparator, StepperTitle, StepperTrigger } from '@/components/ui/stepper'

const props = defineProps<{ requestId: string; embedded?: boolean }>()
const emit = defineEmits<{ updated: [value: CollectionDetail] }>()
const { t, te, locale } = useI18n()
const detail = ref<CollectionDetail | null>(null)
const loading = ref(false)
const busy = ref('')
const error = ref<ReturnType<typeof readApiError> | null>(null)
const actionError = ref<ReturnType<typeof readApiError> | null>(null)
const confirmAction = ref<'publish' | 'cancel' | null>(null)
const cancelReason = ref('')
const activityExpanded = ref(false)
const keys = reactive<Record<string, string>>({})
let generation = 0

const canEdit = computed(() => detail.value?.status === 'DRAFT')
const canCancel = computed(() => detail.value && ['DRAFT', 'OPEN', 'IN_REVIEW', 'CHANGES_REQUESTED'].includes(detail.value.status))
const displayStatus = computed(() => detail.value?.reviewStatus ?? detail.value?.status ?? '')
const activityEvents = computed(() => detail.value ? [...detail.value.events].reverse() : [])
const hiddenActivityCount = computed(() => activityEvents.value.length > 8 ? activityEvents.value.length - 5 : 0)
const visibleActivityEvents = computed(() => activityExpanded.value || !hiddenActivityCount.value
  ? activityEvents.value
  : [...activityEvents.value.slice(0, 2), ...activityEvents.value.slice(-3)])
const currentStep = computed(() => visibleActivityEvents.value.length + 1)
const eventIcons: Record<string, Component> = {
  CREATED: FilePlus2, UPDATED: FilePenLine, REQUIREMENT_ADDED: ListChecks, FOLLOW_UP_ADDED: ListChecks,
  REQUIREMENT_UPDATED: FilePenLine, REQUIREMENT_REMOVED: ListChecks, PUBLISHED: Send, CANCELLED: Ban,
  COPIED: Copy, SUBMITTED: Upload, REQUIREMENT_REVIEWED: ClipboardCheck, AI_REQUIREMENT_REVIEWED: Sparkles, AI_REVIEW_COMPLETED: Sparkles, CHANGES_REQUESTED: Undo2,
  APPROVED: BadgeCheck, APPROVAL_WITHDRAWN: RotateCcw, CLOSED: Archive,
}
const statusIcons: Record<string, Component> = {
  PROCESSING: Sparkles, AI_NEEDS_REVIEW: ClipboardCheck, AI_FAILED: Clock3, AWAITING_ACCOUNTANT: ClipboardCheck, DRAFT: FilePenLine, OPEN: Clock3, IN_REVIEW: ClipboardCheck, AI_PASSED: Sparkles, CHANGES_REQUESTED: Clock3,
  READY_FOR_BOOKKEEPING: BadgeCheck, CANCELLED: Ban,
}

function formatPeriod(value: string) {
  return new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat(locale.value, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value))
}

function keyFor(action: string) {
  return keys[action] ??= crypto.randomUUID()
}

async function load() {
  const current = ++generation
  loading.value = true
  error.value = null
  actionError.value = null
  try {
    const value = await collectionsApi.get(props.requestId)
    if (current === generation) detail.value = value
  } catch (caught) { if (current === generation) error.value = readApiError(caught) }
  finally { if (current === generation) loading.value = false }
}

async function run(action: 'publish' | 'cancel') {
  if (!detail.value || busy.value) return
  busy.value = action
  actionError.value = null
  try {
    let value: CollectionDetail
    if (action === 'publish') value = await collectionsApi.publish(detail.value.id, detail.value.version, keyFor(action))
    else value = await collectionsApi.cancel(detail.value.id, detail.value.version, cancelReason.value.trim(), keyFor(action))
    delete keys[action]
    detail.value = value
    confirmAction.value = null
    cancelReason.value = ''
    emit('updated', value)
  } catch (caught) { actionError.value = readApiError(caught) }
  finally { busy.value = '' }
}

function eventName(event: WorkflowEvent) {
  const key = `collections.events.${event.eventType}`
  return te(key) ? t(key, { round: event.payload.roundNo ?? event.payload.round_no ?? '' }) : event.eventType
}

function eventReason(event: WorkflowEvent) {
  return typeof event.payload.reason === 'string' ? event.payload.reason : ''
}

watch(() => props.requestId, () => { activityExpanded.value = false; load() }, { immediate: true })
</script>

<template>
  <div :class="embedded ? 'h-full overflow-y-auto' : 'space-y-6'">
    <div v-if="error" class="space-y-3 p-5"><ErrorNotice v-bind="error" /><Button variant="outline" size="sm" @click="load">{{ t('collections.retry') }}</Button></div>
    <p v-else-if="loading" role="status" class="p-8 text-sm text-muted-foreground">{{ t('collections.loading') }}</p>
    <div v-else-if="detail" :class="embedded ? '' : 'space-y-6'">
      <header :class="embedded ? 'border-b px-6 py-5' : ''">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0"><p class="text-sm text-muted-foreground">{{ formatPeriod(detail.period) }}</p><h2 class="mt-1 truncate text-xl font-semibold tracking-tight">{{ detail.clientName }}</h2></div>
          <StatusBadge :status="displayStatus" translation-prefix="collections.status" />
        </div>
        <div class="mt-4 flex flex-wrap gap-2">
          <Button v-if="canEdit" size="sm" @click="confirmAction = 'publish'"><Send class="size-4" />{{ t('collections.publish') }}</Button>
          <Button v-if="canEdit" as-child size="sm" variant="outline"><RouterLink :to="{ name: 'collection-edit', params: { id: detail.id } }"><Pencil class="size-4" />{{ t('collections.edit') }}</RouterLink></Button>
          <Button v-if="['IN_REVIEW', 'CHANGES_REQUESTED', 'READY_FOR_BOOKKEEPING'].includes(detail.status)" as-child size="sm" variant="outline"><RouterLink :to="{ name: 'collection-review', params: { id: detail.id } }"><ClipboardCheck class="size-4" />{{ t('review.open') }}</RouterLink></Button>
          <Button as-child size="sm" variant="outline"><RouterLink :to="{ name: 'collection-new', query: { copyFrom: detail.id } }"><Copy class="size-4" />{{ t('collections.copy') }}</RouterLink></Button>
          <Button v-if="canCancel" size="sm" variant="ghost" class="text-destructive" @click="confirmAction = 'cancel'"><XCircle class="size-4" />{{ t('collections.cancel') }}</Button>
          <Button v-if="embedded" as-child size="sm" variant="ghost" class="ml-auto"><RouterLink :to="{ name: 'collection-detail', params: { id: detail.id } }">{{ t('collections.fullPage') }}<ArrowUpRight class="size-4" /></RouterLink></Button>
        </div>
        <ErrorNotice v-if="actionError" v-bind="actionError" class="mt-4" />
        <div v-if="actionError?.code === 'VERSION_CONFLICT'" class="mt-3"><p class="text-sm font-medium">{{ t('collections.conflictTitle') }}</p><Button class="mt-2" size="sm" variant="outline" @click="load">{{ t('collections.reloadLatest') }}</Button></div>
      </header>

      <div :class="embedded ? 'space-y-6 p-6' : 'grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]'">
        <div class="space-y-6">
          <section :class="embedded ? '' : 'app-panel overflow-hidden'">
            <header :class="embedded ? 'mb-3' : 'border-b px-6 py-4'"><h3 class="text-sm font-semibold">{{ t('collections.overview') }}</h3></header>
            <dl :class="embedded ? 'grid gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-2' : 'grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0'">
              <div :class="embedded ? '' : 'px-6 py-5'"><dt class="text-xs text-muted-foreground"><CalendarDays class="mr-1 inline size-3.5" />{{ t('collections.dueDate') }}</dt><dd class="mt-1.5 text-sm font-medium">{{ formatDate(detail.dueAt) }}</dd></div>
              <div :class="embedded ? '' : 'px-6 py-5'"><dt class="text-xs text-muted-foreground"><UserRound class="mr-1 inline size-3.5" />{{ t('collections.assignee') }}</dt><dd class="mt-1.5 text-sm font-medium">{{ detail.assigneeName }}</dd></div>
            </dl>
            <div v-if="detail.aiMode" :class="embedded ? 'mt-4' : 'border-t px-6 py-5'">
              <p class="text-xs text-muted-foreground">{{ t('collections.aiPolicy') }}</p>
              <p class="mt-2 text-sm font-medium">{{ t(`collections.aiModes.${detail.aiMode}`) }}</p>
              <p v-if="detail.aiMode !== 'OFF'" class="mt-1 text-xs text-muted-foreground">{{ t('collections.reviewPreference') }}: {{ t(`collections.reviewPreferences.${detail.reviewPreference ?? 'STANDARD'}`) }}</p>
              <p class="mt-2 text-xs leading-5 text-muted-foreground">{{ t('collections.aiPolicyHint') }}</p>
            </div>
            <div v-if="detail.scopeNote" :class="embedded ? 'mt-4' : 'border-t px-6 py-5'"><p class="text-xs text-muted-foreground">{{ t('collections.scopeNote') }}</p><p class="mt-2 whitespace-pre-wrap text-sm leading-6">{{ detail.scopeNote }}</p></div>
          </section>

          <section :class="embedded ? '' : 'app-panel overflow-hidden'">
            <header :class="embedded ? 'mb-3' : 'border-b px-6 py-4'"><h3 class="text-sm font-semibold">{{ t('collections.requirements') }} <span class="ml-1 font-normal text-muted-foreground">{{ detail.requirementCount }}</span></h3></header>
            <div class="divide-y" :class="embedded ? 'rounded-xl border' : ''">
              <div v-for="requirement in detail.requirements" :key="requirement.id" class="flex items-start gap-4 px-5 py-4">
                <span class="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums">{{ requirement.position + 1 }}</span>
                <div class="min-w-0 flex-1"><p class="text-sm font-medium">{{ requirement.title }}</p><p class="mt-1 text-xs text-muted-foreground">{{ t(`collections.types.${requirement.type}`) }} · {{ t(requirement.required ? 'collections.required' : 'collections.optional') }}</p></div>
                <StatusBadge :status="requirement.status" translation-prefix="collections.status" />
              </div>
            </div>
          </section>

        </div>

        <section :class="embedded ? '' : 'app-panel overflow-hidden'">
          <header :class="embedded ? 'mb-3' : 'border-b px-6 py-4'"><h3 class="text-sm font-semibold">{{ t('collections.activity') }}</h3></header>
          <Stepper :model-value="currentStep" orientation="vertical" class="flex-col gap-0 p-5" :class="embedded ? 'rounded-xl border' : ''">
            <template v-for="(event, index) in visibleActivityEvents" :key="event.id">
              <div v-if="index === 2 && hiddenActivityCount" class="relative pb-6 pl-10">
                <span class="absolute top-0 bottom-0 left-3.5 w-px bg-border" />
                <Button type="button" size="sm" variant="ghost" class="relative z-10 -ml-2 h-8 text-muted-foreground" @click="activityExpanded = !activityExpanded">
                  <ChevronUp v-if="activityExpanded" class="size-4" /><ChevronDown v-else class="size-4" />
                  {{ t(activityExpanded ? 'collections.collapseActivity' : 'collections.expandActivity', { count: hiddenActivityCount }) }}
                </Button>
              </div>
              <StepperItem :step="index + 1" class="relative w-full items-start gap-3 pb-6 last:pb-0">
                <StepperTrigger tabindex="-1" class="pointer-events-none relative z-10 shrink-0 p-0">
                  <StepperIndicator class="size-7 border border-border !bg-card !text-muted-foreground"><component :is="eventIcons[event.eventType] ?? Clock3" class="size-3.5" /></StepperIndicator>
                </StepperTrigger>
                <div class="min-w-0 pt-1">
                  <StepperTitle class="text-sm font-medium whitespace-normal">{{ eventName(event) }}</StepperTitle>
                  <StepperDescription class="mt-1 leading-5">{{ t('collections.eventBy', { actor: event.actorName, time: formatDate(event.createdAt, true) }) }}</StepperDescription>
                  <p v-if="eventReason(event)" class="mt-2 whitespace-pre-wrap text-sm leading-6">{{ eventReason(event) }}</p>
                </div>
                <StepperSeparator class="absolute top-7 left-3.5 h-[calc(100%-1.75rem)] w-px !bg-border" />
              </StepperItem>
            </template>
            <StepperItem :step="currentStep" class="relative w-full items-start gap-3">
              <StepperTrigger tabindex="-1" class="pointer-events-none relative z-10 shrink-0 p-0"><StepperIndicator class="size-7 border border-primary !bg-primary !text-primary-foreground ring-4 ring-primary/10"><component :is="statusIcons[displayStatus] ?? Clock3" class="size-3.5" /></StepperIndicator></StepperTrigger>
              <div class="min-w-0 pt-1"><StepperTitle class="text-sm font-semibold whitespace-normal">{{ t('collections.currentStatus', { status: t(`collections.status.${displayStatus}`) }) }}</StepperTitle><StepperDescription class="mt-1 leading-5">{{ t(`collections.currentStatusHint.${displayStatus}`) }}</StepperDescription></div>
            </StepperItem>
          </Stepper>
        </section>
      </div>
    </div>

    <ConfirmDialog :open="confirmAction === 'publish'" :busy="busy === 'publish'" :title="t('collections.publishTitle')" :description="t('collections.publishHint')" @update:open="confirmAction = $event ? 'publish' : null" @confirm="run('publish')" />
    <ConfirmDialog :open="confirmAction === 'cancel'" :busy="busy === 'cancel'" :title="t('collections.cancelTitle')" :description="t('collections.cancelReasonHint')" @update:open="confirmAction = $event ? 'cancel' : null" @confirm="cancelReason.trim() && run('cancel')">
      <div class="mt-4 space-y-2"><Label for="cancel-reason">{{ t('collections.cancelReason') }}</Label><textarea id="cancel-reason" v-model="cancelReason" required maxlength="1000" class="min-h-24 w-full resize-y rounded-xl border bg-card px-3 py-2 text-sm focus-visible:outline-ring" /></div>
    </ConfirmDialog>
  </div>
</template>

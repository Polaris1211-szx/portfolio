<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertCircle, CheckCircle2, CircleHelp, LoaderCircle, RotateCcw } from '@lucide/vue'
import type { ReviewRun } from '@/api/review'
import { Button } from '@/components/ui/button'
import FileTypeIcon from '@/components/FileTypeIcon.vue'

const props = defineProps<{ run: ReviewRun; requirementId?: string; documentIds: string[]; canRetry: boolean; retrying: boolean }>()
defineEmits<{ retry: []; preview: [document: { id: string; name: string; contentType: string }] }>()
const { t } = useI18n()
const finding = computed(() => props.run.output?.findings.find(item => item.requirementId === props.requirementId))
const manualReasons = computed(() => finding.value?.manualReasons.filter(value => value !== 'MANUAL_REVIEW_REQUIRED') ?? [])
const extractions = computed(() => props.run.output?.extractions.filter(item => props.documentIds.includes(item.documentId)) ?? [])
const document = (id: string) => props.run.documents.find(item => item.id === id)
const checkIcon = (value: string) => value === 'MATCH' ? CheckCircle2 : value === 'MISMATCH' ? AlertCircle : CircleHelp
const checkColor = (value: string) => value === 'MATCH' ? 'text-emerald-600 dark:text-emerald-400' : value === 'MISMATCH' ? 'text-destructive' : 'text-muted-foreground'
</script>

<template>
  <section class="app-panel overflow-hidden" aria-live="polite">
    <header class="border-b px-5 py-4"><h2 class="text-sm font-semibold">{{ t('review.ai.title') }}</h2></header>
    <div v-if="run.status !== 'SUCCEEDED'" class="flex min-h-28 items-center gap-3 p-5">
      <LoaderCircle v-if="run.status === 'QUEUED' || run.status === 'PROCESSING'" class="size-5 shrink-0 text-muted-foreground" :class="run.status === 'PROCESSING' && 'animate-spin motion-reduce:animate-none'" />
      <AlertCircle v-else class="size-5 shrink-0 text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">{{ t(`review.ai.states.${run.status}`) }}</p>
        <p v-if="run.error" class="mt-1 text-sm leading-6 text-muted-foreground">{{ t(`review.ai.errors.${run.error}`, t('review.ai.errors.UNKNOWN')) }}</p>
      </div>
      <Button v-if="canRetry && run.status === 'FAILED'" size="sm" variant="outline" :disabled="retrying" @click="$emit('retry')"><RotateCcw class="size-4" />{{ t('review.retry') }}</Button>
    </div>
    <div v-else class="space-y-5 p-5">
      <template v-if="finding">
        <div class="space-y-2">
          <div class="flex flex-wrap items-center gap-2"><p class="text-sm font-medium">{{ t(`review.ai.actions.${finding.action}`) }}</p><span v-if="finding.autoApplied && finding.suggestedDecision" class="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">{{ t(`review.ai.autoApplied.${finding.suggestedDecision}`) }}</span></div>
          <p class="whitespace-pre-wrap text-sm leading-6">{{ finding.explanation }}</p>
          <p v-if="manualReasons.length" class="text-xs text-amber-700 dark:text-amber-300">{{ manualReasons.map(value => t(`review.ai.manualReasons.${value}`)).join(' · ') }}</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div v-for="check in [{ label: 'entity', value: finding.entityCheck }, { label: 'period', value: finding.periodCheck }]" :key="check.label" class="flex items-center gap-2 rounded-xl border px-3 py-3 text-sm">
            <component :is="checkIcon(check.value)" class="size-4 shrink-0" :class="checkColor(check.value)" /><span>{{ t(`review.ai.${check.label}`) }}</span><span class="ml-auto text-xs" :class="checkColor(check.value)">{{ t(`review.ai.checks.${check.value}`) }}</span>
          </div>
        </div>
        <div v-if="finding.clientMessage" class="space-y-1"><h3 class="text-xs font-medium text-muted-foreground">{{ t('review.ai.suggestedMessage') }}</h3><p class="whitespace-pre-wrap text-sm leading-6">{{ finding.clientMessage }}</p></div>
        <div v-if="finding.evidence.length" class="space-y-3">
          <h3 class="text-sm font-medium">{{ t('review.ai.evidence') }}</h3>
          <article v-for="evidence in finding.evidence" :key="evidence.documentId" class="rounded-xl border p-3">
            <button v-if="document(evidence.documentId)" type="button" class="flex w-full min-w-0 items-center gap-3 text-left" @click="$emit('preview', document(evidence.documentId)!)">
              <FileTypeIcon :name="document(evidence.documentId)!.name" :content-type="document(evidence.documentId)!.contentType" />
              <span class="min-w-0"><span class="block truncate text-sm hover:underline">{{ document(evidence.documentId)!.name }}</span><span class="text-xs text-muted-foreground">{{ t(`review.ai.scopes.${document(evidence.documentId)!.scope}`) }} · {{ t(`review.ai.relations.${evidence.relation}`) }}</span></span>
            </button>
            <p v-else class="text-sm text-muted-foreground">{{ t('review.ai.unavailableFile') }}</p>
            <p class="mt-2 text-xs leading-5 text-muted-foreground">{{ evidence.reason }}</p>
          </article>
        </div>
        <div v-if="finding.amounts.length" class="space-y-3">
          <h3 class="text-sm font-medium">{{ t('review.ai.amounts') }}</h3>
          <div v-for="(amount, index) in finding.amounts" :key="index" class="rounded-xl border p-3 text-sm">
            <p class="break-words font-mono text-xs leading-6">{{ amount.operands.map(item => item.amount).join(amount.operation === 'SUBTRACT' ? ' − ' : amount.operation === 'MULTIPLY' ? ' × ' : ' + ') }} = {{ amount.actualAmount }} {{ amount.currency }}</p>
            <p class="mt-2 text-xs text-muted-foreground">{{ t('review.ai.expected') }}: {{ amount.expectedAmount }} · {{ t('review.ai.difference') }}: {{ amount.difference }}</p>
          </div>
          <p class="text-xs" :class="finding.amountsValid ? 'text-muted-foreground' : 'text-destructive'">{{ t(finding.amountsValid ? 'review.ai.recomputed' : 'review.ai.amountMismatch') }}</p>
        </div>
      </template>
      <div v-if="extractions.length" class="space-y-3">
        <h3 class="text-sm font-medium">{{ t('review.ai.extracted') }}</h3>
        <details v-for="item in extractions" :key="item.documentId" class="rounded-xl border px-3 py-3">
          <summary class="cursor-pointer break-words text-sm">{{ document(item.documentId)?.name || t('review.ai.unavailableFile') }}</summary>
          <dl class="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
            <template v-for="field in [{ label: 'entity', value: item.entityName }, { label: 'period', value: item.period }, { label: 'number', value: item.invoiceNumber }, { label: 'counterparty', value: item.counterparty }, { label: 'amounts', value: item.amount ? `${item.amount} ${item.currency ?? ''}` : null }]" :key="field.label"><dt class="text-muted-foreground">{{ t(`review.ai.${field.label}`) }}</dt><dd class="break-words">{{ field.value || t('review.ai.checks.UNKNOWN') }}</dd></template>
          </dl>
          <div v-if="item.transactions.length" class="mt-4 overflow-x-auto"><table class="w-full text-left text-xs"><thead><tr><th class="p-2">{{ t('review.ai.date') }}</th><th class="p-2">{{ t('review.ai.description') }}</th><th class="p-2">{{ t('review.ai.amounts') }}</th></tr></thead><tbody><tr v-for="(transaction, index) in item.transactions" :key="index" class="border-t"><td class="whitespace-nowrap p-2">{{ transaction.date }}</td><td class="min-w-40 p-2">{{ transaction.description }}</td><td class="whitespace-nowrap p-2">{{ transaction.amount }} {{ transaction.currency }}</td></tr></tbody></table></div>
        </details>
      </div>
    </div>
  </section>
</template>

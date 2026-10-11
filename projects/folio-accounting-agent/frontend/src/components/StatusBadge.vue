<script setup lang="ts">
import { useI18n } from 'vue-i18n'
withDefaults(defineProps<{ status: string; translationPrefix?: string }>(), {
  translationPrefix: 'accounts.status',
})
const { t } = useI18n()
</script>

<template>
  <span
    class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium"
    :class="['ACTIVE', 'ACCEPTED', 'OPEN', 'SATISFIED', 'AI_PASSED', 'READY_FOR_BOOKKEEPING', 'AVAILABLE'].includes(status) ? 'border-primary/25 bg-accent text-accent-foreground' : ['PENDING', 'DRAFT', 'IN_REVIEW', 'QUARANTINED', 'PROCESSING', 'AI_NEEDS_REVIEW', 'AI_FAILED', 'AWAITING_ACCOUNTANT'].includes(status) ? 'border-amber-700/25 bg-amber-500/10 text-amber-700 dark:text-amber-300' : ['EXPIRED', 'CANCELLED', 'NEEDS_ACTION', 'CHANGES_REQUESTED', 'FAILED'].includes(status) ? 'border-destructive/25 bg-destructive/10 text-destructive' : 'border-border bg-muted/70 text-muted-foreground'"
  >
    <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />{{ t(`${translationPrefix}.${status}`) }}
  </span>
</template>

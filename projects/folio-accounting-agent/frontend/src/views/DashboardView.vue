<script setup lang="ts">
import { AlertCircle, ArrowUpRight, Clock3, Inbox, ScanSearch } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { collectionsApi, type CollectionDashboard, type CollectionSummary } from '@/api/collections'
import { readApiError } from '@/api/client'
import ErrorNotice from '@/components/ErrorNotice.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'

const { t, locale } = useI18n()
const data = ref<CollectionDashboard | null>(null)
const loading = ref(true)
const error = ref<ReturnType<typeof readApiError> | null>(null)
const queues = computed(() => data.value ? [
  { key: 'awaitingReview', items: data.value.awaitingReview, icon: ScanSearch },
  { key: 'waitingClient', items: data.value.waitingClient, icon: Inbox },
  { key: 'dueSoon', items: data.value.dueSoon, icon: Clock3 },
  { key: 'overdue', items: data.value.overdue, icon: AlertCircle },
] as const : [])

function formatPeriod(value: string) {
  return new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(value))
}

async function load() {
  loading.value = true
  error.value = null
  try { data.value = await collectionsApi.dashboard() }
  catch (caught) { error.value = readApiError(caught) }
  finally { loading.value = false }
}

function rowQuery(item: CollectionSummary) {
  if (item.status === 'IN_REVIEW') return { status: 'IN_REVIEW' }
  return undefined
}

onMounted(load)
</script>

<template>
  <section class="space-y-7">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div><h1 class="text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ t('collections.dashboard') }}</h1><p class="mt-2 text-sm text-muted-foreground">{{ t('collections.dashboardHint') }}</p></div>
      <Button as-child class="h-10"><RouterLink :to="{ name: 'collection-new' }">{{ t('collections.new') }}<ArrowUpRight class="size-4" /></RouterLink></Button>
    </header>

    <div v-if="error" class="space-y-3"><ErrorNotice v-bind="error" /><Button variant="outline" @click="load">{{ t('collections.retry') }}</Button></div>
    <p v-else-if="loading" role="status" class="py-10 text-sm text-muted-foreground">{{ t('collections.loading') }}</p>
    <template v-else-if="data">
      <section class="app-panel grid overflow-hidden sm:grid-cols-2 xl:grid-cols-4" aria-label="Collection counts">
        <RouterLink v-for="queue in queues" :key="queue.key" :to="{ name: 'collections', query: queue.key === 'awaitingReview' ? { status: 'IN_REVIEW' } : undefined }" class="group flex min-h-32 items-start gap-4 border-b p-5 transition-colors hover:bg-muted/25 sm:odd:border-r xl:border-b-0 xl:border-r xl:last:border-r-0">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><component :is="queue.icon" class="size-5" /></span>
          <span><span class="block text-3xl font-semibold tracking-tight">{{ data.counts[queue.key] }}</span><span class="mt-1.5 block text-sm text-muted-foreground">{{ t(`collections.queues.${queue.key}`) }}</span></span>
        </RouterLink>
      </section>

      <div class="grid items-start gap-6 xl:grid-cols-2">
        <section v-for="queue in queues" :key="queue.key" class="app-panel overflow-hidden">
          <header class="flex items-center justify-between border-b px-5 py-4"><h2 class="text-sm font-semibold">{{ t(`collections.queues.${queue.key}`) }}</h2><span class="text-xs tabular-nums text-muted-foreground">{{ data.counts[queue.key] }}</span></header>
          <div v-if="queue.items.length" class="divide-y">
            <RouterLink v-for="item in queue.items" :key="item.id" :to="{ name: 'collection-detail', params: { id: item.id }, query: rowQuery(item) }" class="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/25">
              <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ item.clientName }}</span><span class="mt-1 block text-xs text-muted-foreground">{{ formatPeriod(item.period) }} · {{ formatDate(item.dueAt) }}</span></span>
              <StatusBadge :status="item.reviewStatus ?? item.status" translation-prefix="collections.status" />
            </RouterLink>
          </div>
          <p v-else class="px-5 py-8 text-sm text-muted-foreground">{{ t('collections.emptyQueue') }}</p>
        </section>
      </div>
      <Button as-child variant="outline"><RouterLink :to="{ name: 'collections' }">{{ t('collections.openAll') }}<ArrowUpRight class="size-4" /></RouterLink></Button>
    </template>
  </section>
</template>

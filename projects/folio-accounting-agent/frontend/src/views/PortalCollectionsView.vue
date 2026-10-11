<script setup lang="ts">
import { ArrowUpRight, ClipboardList } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import type { CollectionFilterStatus } from '@/api/collections'
import { portalApi, type PortalCollectionSummary } from '@/api/portal'
import { readApiError } from '@/api/client'
import ErrorNotice from '@/components/ErrorNotice.vue'
import MonthPicker from '@/components/MonthPicker.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/stores/auth'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const items = ref<PortalCollectionSummary[]>([])
const loading = ref(true)
const error = ref<ReturnType<typeof readApiError> | null>(null)
const filters = ref({ client: 'all', period: '', status: 'all', sort: 'updated_at:desc' })
const statuses: CollectionFilterStatus[] = ['OPEN', 'IN_REVIEW', 'CHANGES_REQUESTED', 'READY_FOR_BOOKKEEPING', 'CANCELLED']
const clients = computed(() => auth.user?.clientMemberships ?? [])
let generation = 0
let syncingFilters = false

function formatPeriod(value: string) {
  return new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function progress(item: PortalCollectionSummary) {
  return item.requiredCount ? Math.round(item.readyCount / item.requiredCount * 100) : 100
}

async function load() {
  const current = ++generation
  syncFilters()
  loading.value = true
  error.value = null
  const [sort, order] = filters.value.sort.split(':') as ['due_at' | 'period' | 'updated_at', 'asc' | 'desc']
  try {
    const result = await portalApi.list({
      clientId: filters.value.client === 'all' ? undefined : filters.value.client,
      period: filters.value.period ? `${filters.value.period}-01` : undefined,
      status: filters.value.status === 'all' ? undefined : filters.value.status as CollectionFilterStatus,
      sort,
      order,
    })
    if (current === generation) items.value = result.items
  } catch (caught) { if (current === generation) error.value = readApiError(caught) }
  finally { if (current === generation) loading.value = false }
}

function syncFilters() {
  const next = {
    client: typeof route.query.client === 'string' ? route.query.client : 'all',
    period: typeof route.query.period === 'string' ? route.query.period : '',
    status: statuses.includes(route.query.status as CollectionFilterStatus) ? String(route.query.status) : 'all',
    sort: typeof route.query.sort === 'string' && ['updated_at:desc', 'due_at:asc', 'due_at:desc', 'period:desc'].includes(route.query.sort) ? route.query.sort : 'updated_at:desc',
  }
  if (JSON.stringify(next) === JSON.stringify(filters.value)) return
  syncingFilters = true
  filters.value = next
  syncingFilters = false
}

function navigate() {
  return router.push({ query: {
    client: filters.value.client === 'all' ? undefined : filters.value.client,
    period: filters.value.period || undefined,
    status: filters.value.status === 'all' ? undefined : filters.value.status,
    sort: filters.value.sort === 'updated_at:desc' ? undefined : filters.value.sort,
  } })
}

function clearFilters() {
  filters.value = { client: 'all', period: '', status: 'all', sort: 'updated_at:desc' }
}

watch(() => [route.query.client, route.query.period, route.query.status, route.query.sort], load, { immediate: true })
watch(filters, () => { if (!syncingFilters) navigate() }, { deep: true, flush: 'sync' })
</script>

<template>
  <section class="space-y-7">
    <header>
      <h1 class="text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ t('portal.title') }}</h1>
      <p class="mt-2 text-sm text-muted-foreground">{{ t('portal.description') }}</p>
    </header>

    <section class="app-panel grid grid-cols-2 gap-2 p-4 sm:gap-3 lg:grid-cols-4">
      <Select v-model="filters.client"><SelectTrigger size="lg" class="w-full bg-card" :aria-label="t('portal.client')"><SelectValue /></SelectTrigger><SelectContent position="popper"><SelectItem value="all">{{ t('portal.allClients') }}</SelectItem><SelectItem v-for="client in clients" :key="client.clientId" :value="client.clientId">{{ client.clientName }}</SelectItem></SelectContent></Select>
      <MonthPicker v-model="filters.period" :label="t('portal.period')" :placeholder="t('portal.allPeriods')" />
      <Select v-model="filters.status"><SelectTrigger size="lg" class="w-full bg-card" :aria-label="t('portal.status')"><SelectValue /></SelectTrigger><SelectContent position="popper"><SelectItem value="all">{{ t('portal.allStatuses') }}</SelectItem><SelectItem v-for="status in statuses" :key="status" :value="status">{{ t(`collections.status.${status}`) }}</SelectItem></SelectContent></Select>
      <Select v-model="filters.sort"><SelectTrigger size="lg" class="w-full bg-card" :aria-label="t('portal.sort')"><SelectValue /></SelectTrigger><SelectContent position="popper"><SelectItem value="updated_at:desc">{{ t('portal.sortUpdated') }}</SelectItem><SelectItem value="due_at:asc">{{ t('portal.sortDueSoonest') }}</SelectItem><SelectItem value="due_at:desc">{{ t('portal.sortDueLatest') }}</SelectItem><SelectItem value="period:desc">{{ t('portal.sortPeriod') }}</SelectItem></SelectContent></Select>
      <div class="col-span-full"><Button type="button" variant="ghost" @click="clearFilters">{{ t('portal.clear') }}</Button></div>
    </section>

    <div v-if="error" class="space-y-3"><ErrorNotice v-bind="error" /><Button variant="outline" @click="load">{{ t('portal.retry') }}</Button></div>
    <p v-else-if="loading" role="status" class="text-sm text-muted-foreground">{{ t('portal.loading') }}</p>
    <section v-else-if="items.length" class="app-panel overflow-hidden">
      <RouterLink
        v-for="item in items"
        :key="item.id"
        :to="{ name: 'portal-collection-detail', params: { id: item.id } }"
        class="group grid gap-4 border-b px-5 py-5 transition-colors last:border-b-0 hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-center sm:px-7"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2.5">
            <h2 class="text-base font-semibold">{{ formatPeriod(item.period) }}</h2>
            <StatusBadge :status="item.reviewStatus ?? item.status" translation-prefix="collections.status" />
          </div>
          <p class="mt-1.5 text-sm text-muted-foreground">{{ item.clientName }} · {{ t('portal.due', { date: formatDate(item.dueAt) }) }}</p>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('portal.lastUpdated') }} · {{ formatDateTime(item.updatedAt) }}</p>
        </div>
        <div>
          <div class="mb-2 flex justify-between text-xs"><span class="text-muted-foreground">{{ t('portal.progress') }}</span><span class="font-medium">{{ item.readyCount }}/{{ item.requiredCount }}</span></div>
          <Progress :model-value="progress(item)" class="h-1.5" />
        </div>
        <ArrowUpRight class="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:block" />
      </RouterLink>
    </section>
    <section v-else class="app-panel grid min-h-72 place-items-center px-6 text-center">
      <div><ClipboardList class="mx-auto size-8 text-muted-foreground" /><h2 class="mt-4 font-medium">{{ t(Object.values(filters).some(value => value && value !== 'all' && value !== 'updated_at:desc') ? 'portal.noResults' : 'portal.empty') }}</h2><p class="mt-2 text-sm text-muted-foreground">{{ t(Object.values(filters).some(value => value && value !== 'all' && value !== 'updated_at:desc') ? 'portal.noResultsHint' : 'portal.emptyHint') }}</p></div>
    </section>
  </section>
</template>

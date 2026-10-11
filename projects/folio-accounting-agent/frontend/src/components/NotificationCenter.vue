<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BadgeCheck,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPlus,
  FileCheck2,
  RotateCcw,
  Sparkles,
  Upload,
  XCircle,
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { notificationsApi, type NotificationEvent, type NotificationItem } from '@/api/notifications'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const props = defineProps<{ area: 'staff' | 'client'; pageView?: boolean }>()
const { locale, t } = useI18n()
const router = useRouter()
const open = ref(false)
const items = ref<NotificationItem[]>([])
const unreadCount = ref(0)
const loading = ref(false)
const error = ref(false)
const actionError = ref(false)
const saving = ref(false)
const page = ref(1)
const unreadOnly = ref(false)
const total = ref(0)
const pages = computed(() => Math.max(1, Math.ceil(total.value / 20)))
let loadId = 0
let timer: ReturnType<typeof setInterval> | undefined

const icons = {
  PUBLISHED: ClipboardPlus,
  SUBMITTED: Upload,
  CHANGES_REQUESTED: RotateCcw,
  AI_REVIEW_COMPLETED: Sparkles,
  APPROVED: BadgeCheck,
  APPROVAL_WITHDRAWN: RotateCcw,
  CLOSED: FileCheck2,
  CANCELLED: XCircle,
} satisfies Record<NotificationEvent, typeof Bell>

const iconStyles = {
  PUBLISHED: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  SUBMITTED: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
  CHANGES_REQUESTED: 'bg-amber-500/14 text-amber-700 dark:text-amber-400',
  AI_REVIEW_COMPLETED: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  APPROVED: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400',
  APPROVAL_WITHDRAWN: 'bg-orange-500/12 text-orange-700 dark:text-orange-400',
  CLOSED: 'bg-slate-500/12 text-slate-600 dark:text-slate-400',
  CANCELLED: 'bg-red-500/12 text-red-600 dark:text-red-400',
} satisfies Record<NotificationEvent, string>

const badge = computed(() => unreadCount.value > 99 ? '99+' : String(unreadCount.value))

async function load() {
  const id = ++loadId
  loading.value = true
  error.value = false
  try {
    const result = await notificationsApi.list({ page: page.value, unreadOnly: unreadOnly.value })
    if (id !== loadId) return
    items.value = result.items
    unreadCount.value = result.unreadCount
    total.value = result.total
    if (page.value > pages.value) page.value = pages.value
  } catch {
    if (id === loadId) error.value = true
  } finally {
    if (id === loadId) loading.value = false
  }
}

function period(value: string) {
  return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short' })
    .format(new Date(`${value}T00:00:00`))
}

function time(value: string) {
  return new Intl.DateTimeFormat(locale.value, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function message(item: NotificationItem, part: 'title' | 'body') {
  const event = item.eventType === 'SUBMITTED' && item.payload.manualReviewRequested
    ? 'MANUAL_REVIEW_REQUESTED'
    : item.eventType
  return t(`notifications.events.${event}.${part}`, {
    client: item.clientName,
    period: period(item.period),
    round: Number(item.payload.roundNo ?? 1),
  })
}

async function openNotification(item: NotificationItem) {
  if (!item.readAt) await markRead(item)
  open.value = false
  await router.push(`/${props.area}/collections/${item.requestId}`)
}

function notifyReadChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('notifications-read'))
}

async function markRead(item: NotificationItem) {
  saving.value = true
  actionError.value = false
  try {
    const updated = await notificationsApi.markRead(item.id)
    item.readAt = updated.readAt
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    notifyReadChanged()
    if (unreadOnly.value) await load()
  } catch {
    actionError.value = true
  } finally {
    saving.value = false
  }
}

async function markAllRead() {
  if (!unreadCount.value) return
  saving.value = true
  actionError.value = false
  try {
    await notificationsApi.markAllRead()
    const readAt = new Date().toISOString()
    items.value.forEach(item => { item.readAt ||= readAt })
    unreadCount.value = 0
    notifyReadChanged()
    if (unreadOnly.value) await load()
  } catch {
    actionError.value = true
  } finally {
    saving.value = false
  }
}

watch([page, unreadOnly], () => void load())
function filter(value: boolean) {
  page.value = 1
  unreadOnly.value = value
}
watch(open, value => { if (value) void load() })
onMounted(() => {
  void load()
  if (typeof window !== 'undefined') window.addEventListener('notifications-read', load)
  timer = setInterval(() => void load(), 30_000)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  if (typeof window !== 'undefined') window.removeEventListener('notifications-read', load)
})
</script>

<template>
  <component :is="pageView ? 'div' : Popover" v-model:open="open">
    <header v-if="pageView" class="mb-8 pr-12">
      <h1 class="text-3xl font-semibold tracking-tight">{{ t('notifications.title') }}</h1>
    </header>
    <PopoverTrigger v-else as-child>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        class="app-glass relative size-10 rounded-full"
        :aria-label="t(unreadCount ? 'notifications.openUnread' : 'notifications.open', { count: unreadCount })"
      >
        <Bell class="size-[18px]" />
        <span
          v-if="unreadCount"
          class="absolute -top-1 -right-1 grid min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] leading-[18px] font-semibold text-white ring-2 ring-background"
          aria-hidden="true"
        >{{ badge }}</span>
      </Button>
    </PopoverTrigger>

    <component :is="pageView ? 'section' : PopoverContent" align="start" :side-offset="10" class="gap-0 overflow-hidden rounded-2xl p-0" :class="pageView ? 'border bg-card' : 'w-[min(24rem,calc(100vw-2rem))]'">
      <header class="flex min-h-14 items-center justify-between gap-3 border-b px-4">
        <div v-if="pageView" class="flex gap-1 py-2" :aria-label="t('notifications.title')">
          <Button type="button" :variant="unreadOnly ? 'ghost' : 'secondary'" size="sm" :aria-pressed="!unreadOnly" @click="filter(false)">{{ t('notifications.all') }}</Button>
          <Button type="button" :variant="unreadOnly ? 'secondary' : 'ghost'" size="sm" :aria-pressed="unreadOnly" @click="filter(true)">{{ t('notifications.unread') }}<span v-if="unreadCount">{{ unreadCount }}</span></Button>
        </div>
        <h2 v-else class="font-semibold tracking-[-0.01em]">{{ t('notifications.title') }}</h2>
        <Button v-if="unreadCount" type="button" variant="ghost" size="sm" :disabled="saving" @click="markAllRead">
          {{ t('notifications.markAllRead') }}
        </Button>
      </header>
      <p v-if="actionError" role="alert" class="px-4 py-3 text-sm text-destructive">{{ t('notifications.saveFailed') }}</p>

      <div v-if="loading && !items.length" class="px-5 py-12 text-center text-sm text-muted-foreground" role="status">
        {{ t('notifications.loading') }}
      </div>
      <div v-else-if="error" class="px-5 py-10 text-center">
        <p class="text-sm text-muted-foreground">{{ t('notifications.loadFailed') }}</p>
        <Button type="button" variant="outline" size="sm" class="mt-4" @click="load">{{ t('notifications.retry') }}</Button>
      </div>
      <div v-else-if="!items.length" class="px-6 py-12 text-center">
        <span class="mx-auto grid size-11 place-items-center rounded-full bg-muted text-muted-foreground"><Bell class="size-5" /></span>
        <p class="mt-4 text-sm font-medium">{{ t('notifications.empty') }}</p>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">{{ t('notifications.emptyHint') }}</p>
      </div>
      <div v-else class="divide-y" :class="pageView ? '' : 'max-h-[min(32rem,70vh)] overflow-y-auto'" :aria-busy="loading">
        <div v-for="item in items" :key="item.id" class="flex items-center" :class="!item.readAt ? 'bg-primary/[0.035]' : ''">
        <button
          type="button"
          class="flex min-w-0 flex-1 gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/55 focus-visible:bg-muted focus-visible:outline-none"
          @click="openNotification(item)"
        >
          <span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full" :class="iconStyles[item.eventType]">
            <component :is="icons[item.eventType]" class="size-[17px]" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="flex items-start justify-between gap-3">
              <span class="text-sm font-medium leading-5">{{ message(item, 'title') }}</span>
              <span v-if="!item.readAt" class="mt-1.5 size-2 shrink-0 rounded-full bg-primary" :aria-label="t('notifications.unread')" />
            </span>
            <span class="mt-0.5 block text-xs leading-5 text-muted-foreground">{{ message(item, 'body') }}</span>
            <span class="mt-1 block text-[11px] text-muted-foreground/80">{{ time(item.createdAt) }}</span>
          </span>
        </button>
        <Button v-if="pageView && !item.readAt" type="button" variant="ghost" size="icon" class="mr-3 shrink-0" :disabled="saving" :aria-label="t('notifications.markRead')" :title="t('notifications.markRead')" @click="markRead(item)"><Check class="size-4" /></Button>
        </div>
      </div>
      <footer v-if="pageView" class="flex items-center justify-between gap-3 border-t px-4 py-3">
        <p class="text-xs text-muted-foreground">{{ t('notifications.pagination', { total, page, pages }) }}</p>
        <div class="flex gap-1">
          <Button type="button" variant="ghost" size="icon" :disabled="page <= 1 || loading" :aria-label="t('notifications.previous')" @click="page--"><ChevronLeft class="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon" :disabled="page >= pages || loading" :aria-label="t('notifications.next')" @click="page++"><ChevronRight class="size-4" /></Button>
        </div>
      </footer>
      <footer v-else class="border-t p-2">
        <Button as-child variant="ghost" class="w-full" @click="open = false"><RouterLink :to="`/${area}/notifications`">{{ t('notifications.viewAll') }}</RouterLink></Button>
      </footer>
    </component>
  </component>
</template>

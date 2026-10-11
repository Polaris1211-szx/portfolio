<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Search, RefreshCw } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { accountsApi, type UserAccount } from '@/api/accounts'
import { readApiError } from '@/api/client'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import InvitationsPanel from '@/components/InvitationsPanel.vue'
import ListPagination from '@/components/ListPagination.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const pageSize = 20
const page = computed(() => {
  const value = Number(route.query.page)
  return Number.isSafeInteger(value) && value > 0 ? value : 1
})
const search = computed(() => typeof route.query.search === 'string' ? route.query.search : '')
const status = computed(() => route.query.status === 'ACTIVE' || route.query.status === 'DISABLED' ? route.query.status : 'ALL')
const searchInput = ref(search.value)
const users = ref<UserAccount[]>([])
const total = ref(0)
const loading = ref(false)
const busy = ref(false)
const selectedUser = ref<UserAccount | null>(null)
const error = ref<ReturnType<typeof readApiError> | null>(null)
let request = 0

async function load() {
  const current = ++request
  loading.value = true
  error.value = null
  try {
    const result = await accountsApi.listUsers({
      page: page.value, pageSize, staffOnly: true,
      search: search.value || undefined,
      status: status.value === 'ALL' ? undefined : status.value,
    })
    if (current !== request) return
    users.value = result.items
    total.value = result.total
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
    if (page.value > lastPage) await changePage(lastPage)
  } catch (caught) {
    if (current === request) {
      users.value = []
      error.value = readApiError(caught)
    }
  } finally {
    if (current === request) loading.value = false
  }
}

function applyFilters(nextStatus: string = status.value) {
  return router.push({ query: {
    ...route.query, page: undefined,
    search: searchInput.value.trim() || undefined,
    status: nextStatus === 'ALL' ? undefined : nextStatus,
  } })
}

function changePage(nextPage: number) {
  return router.push({ query: { ...route.query, page: nextPage === 1 ? undefined : String(nextPage) } })
}

async function updateStatus() {
  const user = selectedUser.value
  if (!user || busy.value || user.id === auth.user?.id) return
  busy.value = true
  error.value = null
  try {
    await accountsApi.updateUser(user.id, { status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
    selectedUser.value = null
    await load()
  } catch (caught) {
    error.value = readApiError(caught)
    selectedUser.value = null
  } finally {
    busy.value = false
  }
}

watch(search, value => { searchInput.value = value })
watch([page, search, status], load, { immediate: true })
onBeforeUnmount(() => { request++ })
</script>

<template>
  <section class="space-y-7">
    <header>
      <h1 class="text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ t('people.staffTitle') }}</h1>
      <p class="mt-2 text-sm text-muted-foreground">{{ t('people.staffDescription') }}</p>
    </header>

    <section class="app-panel overflow-hidden" :aria-busy="loading">
      <form class="flex flex-wrap items-end gap-3 border-b px-5 py-4 sm:px-6" @submit.prevent="applyFilters()">
        <div class="min-w-48 flex-1 space-y-2">
          <Label for="staff-search" class="sr-only">{{ t('people.searchStaff') }}</Label>
          <div class="relative">
            <Search class="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" aria-hidden="true" />
            <Input id="staff-search" v-model="searchInput" class="h-10 pl-9" :placeholder="t('people.searchStaff')" maxlength="100" type="search" />
          </div>
        </div>
        <Select :model-value="status" :disabled="busy" @update:model-value="value => applyFilters(String(value))">
          <SelectTrigger size="lg" class="w-40" :aria-label="t('people.status')"><SelectValue /></SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="ALL">{{ t('people.allStatuses') }}</SelectItem>
            <SelectItem value="ACTIVE">{{ t('accounts.status.ACTIVE') }}</SelectItem>
            <SelectItem value="DISABLED">{{ t('accounts.status.DISABLED') }}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline" size="icon" class="size-10" :aria-label="t('people.search')" :title="t('people.search')" :disabled="busy"><Search /></Button>
        <Button type="button" variant="ghost" size="icon" class="h-10 w-10" :disabled="loading || busy" :aria-label="t('people.refresh')" @click="load">
          <RefreshCw class="size-4" />
        </Button>
      </form>

      <ErrorNotice v-if="error" v-bind="error" class="m-5 sm:m-6" />
      <p v-if="loading" class="px-6 py-12 text-center text-sm text-muted-foreground" role="status">{{ t('people.loadingStaff') }}</p>
      <p v-else-if="!users.length && !error" class="px-6 py-12 text-center text-sm text-muted-foreground">{{ t(search || status !== 'ALL' ? 'people.noMatches' : 'people.noStaff') }}</p>
      <div v-else-if="users.length" class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">{{ t('people.staffTitle') }}</caption>
          <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" class="px-6 py-3 font-medium">{{ t('people.person') }}</th>
              <th scope="col" class="px-6 py-3 font-medium">{{ t('people.role') }}</th>
              <th scope="col" class="px-6 py-3 font-medium">{{ t('people.status') }}</th>
              <th scope="col" class="px-6 py-3 text-right font-medium">{{ t('people.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="user in users" :key="user.id" class="hover:bg-muted/20">
              <td class="px-6 py-4">
                <p class="font-medium">{{ user.name }} <span v-if="user.id === auth.user?.id" class="ml-1 text-xs font-normal text-muted-foreground">{{ t('people.you') }}</span></p>
                <p class="mt-1 text-xs text-muted-foreground">{{ user.email }}</p>
              </td>
              <td class="whitespace-nowrap px-6 py-4">{{ t(`people.roles.${user.firmRole}`) }}</td>
              <td class="px-6 py-4"><StatusBadge :status="user.status" /></td>
              <td class="px-6 py-4 text-right">
                <Button type="button" variant="ghost" size="sm" :disabled="busy || user.id === auth.user?.id" :title="user.id === auth.user?.id ? t('people.selfDisableHint') : undefined" @click="selectedUser = user">
                  {{ t(user.status === 'ACTIVE' ? 'people.disable' : 'people.enable') }}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ListPagination :page="page" :page-size="pageSize" :total="total" :disabled="loading || busy" @page="changePage" />
    </section>

    <InvitationsPanel />
    <ConfirmDialog
      :open="!!selectedUser"
      :title="t(selectedUser?.status === 'ACTIVE' ? 'people.disableTitle' : 'people.enableTitle')"
      :description="t(selectedUser?.status === 'ACTIVE' ? 'people.disableDescription' : 'people.enableDescription', { name: selectedUser?.name ?? '' })"
      :busy="busy"
      @update:open="open => { if (!open && !busy) selectedUser = null }"
      @confirm="updateStatus"
    />
  </section>
</template>

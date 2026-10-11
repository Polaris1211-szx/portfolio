<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { accountsApi, type UserAccount } from '@/api/accounts'
import { readApiError } from '@/api/client'
import ErrorNotice from '@/components/ErrorNotice.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{ clientId: string }>()
const emit = defineEmits<{ 'busy-change': [busy: boolean] }>()
const { t } = useI18n()
const users = ref<UserAccount[]>([])
const assignedIds = ref<string[]>([])
const selectedIds = ref<string[]>([])
const loading = ref(false)
const busy = ref(false)
const loaded = ref(false)
const error = ref<ReturnType<typeof readApiError> | null>(null)
const saved = ref(false)
let generation = 0
const activeIds = computed(() => new Set(users.value.filter(user => user.status === 'ACTIVE' && user.firmRole === 'ACCOUNTANT').map(user => user.id)))
const choices = computed(() => users.value.filter(user => activeIds.value.has(user.id) || assignedIds.value.includes(user.id)))
const missingIds = computed(() => assignedIds.value.filter(id => !users.value.some(user => user.id === id)))
const invalidSelection = computed(() => selectedIds.value.some(id => !activeIds.value.has(id)))
const changed = computed(() => selectedIds.value.length !== assignedIds.value.length || selectedIds.value.some(id => !assignedIds.value.includes(id)))

async function load() {
  const current = ++generation
  loading.value = true
  loaded.value = false
  error.value = null
  users.value = []
  assignedIds.value = []
  selectedIds.value = []
  saved.value = false
  try {
    const [assignments, firstPage] = await Promise.all([
      accountsApi.getAssignments(props.clientId),
      accountsApi.listUsers({ role: 'ACCOUNTANT', staffOnly: true, page: 1, pageSize: 100 }),
    ])
    const allUsers = [...firstPage.items]
    for (let page = 2; page <= Math.ceil(firstPage.total / firstPage.pageSize); page++) {
      if (current !== generation) return
      const next = await accountsApi.listUsers({ role: 'ACCOUNTANT', staffOnly: true, page, pageSize: 100 })
      allUsers.push(...next.items)
    }
    if (current !== generation) return
    users.value = allUsers
    assignedIds.value = assignments.userIds
    selectedIds.value = [...assignments.userIds]
    loaded.value = true
  } catch (caught) {
    if (current === generation) error.value = readApiError(caught)
  } finally {
    if (current === generation) loading.value = false
  }
}

async function save() {
  if (busy.value || !loaded.value || invalidSelection.value || !changed.value) return
  const current = generation
  busy.value = true
  emit('busy-change', true)
  error.value = null
  saved.value = false
  try {
    const result = await accountsApi.replaceAssignments(props.clientId, [...selectedIds.value])
    if (current !== generation) return
    assignedIds.value = result.userIds
    selectedIds.value = [...result.userIds]
    saved.value = true
  } catch (caught) {
    if (current === generation) error.value = readApiError(caught)
  } finally {
    busy.value = false
    emit('busy-change', false)
  }
}

watch(() => props.clientId, load, { immediate: true })
watch(selectedIds, () => { saved.value = false }, { flush: 'sync' })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="app-panel overflow-hidden" :aria-busy="loading || busy">
    <header class="border-b px-6 py-5">
      <h2 class="text-base font-semibold">{{ t('contacts.assignments') }}</h2>
      <p class="mt-1.5 text-sm text-muted-foreground">{{ t('contacts.assignmentsHint') }}</p>
    </header>
    <div v-if="error" class="space-y-3 px-6 pt-5">
      <ErrorNotice v-bind="error" />
      <Button v-if="!loaded" variant="outline" :disabled="loading" @click="load">{{ t('contacts.retry') }}</Button>
    </div>
    <p v-if="loading" role="status" class="px-6 py-8 text-sm text-muted-foreground">{{ t('contacts.loadingAssignments') }}</p>
    <form v-else-if="loaded" @submit.prevent="save">
      <div v-if="!choices.length && !missingIds.length" class="px-6 py-9">
        <p class="text-sm font-medium">{{ t('contacts.noAccountants') }}</p>
        <p class="mt-1.5 text-sm text-muted-foreground">{{ t('contacts.noAccountantsHint') }}</p>
      </div>
      <div v-else class="max-h-96 divide-y overflow-y-auto px-6">
        <label v-for="user in choices" :key="user.id" class="flex cursor-pointer items-center gap-3 py-4">
          <input v-model="selectedIds" type="checkbox" :value="user.id" :disabled="busy" class="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
          <span class="min-w-0 flex-1"><span class="block text-sm font-medium">{{ user.name }}</span><span class="mt-1 block break-all text-xs text-muted-foreground">{{ user.email }}</span></span>
          <StatusBadge :status="user.status" />
        </label>
        <label v-for="id in missingIds" :key="id" class="flex cursor-pointer items-center gap-3 py-4">
          <input v-model="selectedIds" type="checkbox" :value="id" :disabled="busy" class="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
          <span class="min-w-0"><span class="block text-sm font-medium">{{ t('contacts.unavailable') }}</span><span class="mt-1 block break-all text-xs text-muted-foreground">{{ id }}</span></span>
        </label>
      </div>
      <footer class="space-y-4 border-t px-6 py-5">
        <p v-if="invalidSelection" role="status" class="text-sm text-destructive">{{ t('contacts.invalidAssignments') }}</p>
        <p v-if="saved" role="status" class="text-sm text-primary">{{ t('contacts.assignmentsSaved') }}</p>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-xs text-muted-foreground">{{ t('contacts.selected', { count: selectedIds.length }) }}<span v-if="changed"> · {{ t('contacts.unsaved') }}</span></p>
          <Button type="submit" :disabled="busy || invalidSelection || !changed">{{ busy ? t('contacts.saving') : t('contacts.save') }}</Button>
        </div>
      </footer>
    </form>
  </section>
</template>

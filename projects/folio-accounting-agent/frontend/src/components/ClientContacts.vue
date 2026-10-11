<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { accountsApi, type ClientMember } from '@/api/accounts'
import { readApiError } from '@/api/client'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/stores/auth'
import type { ClientRole } from '@/types'

const props = defineProps<{ clientId: string; canManage: boolean }>()
const emit = defineEmits<{ 'busy-change': [busy: boolean] }>()
const { t } = useI18n()
const auth = useAuthStore()
const members = ref<ClientMember[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref<ReturnType<typeof readApiError> | null>(null)
const loadFailed = ref(false)
const success = ref('')
const editingId = ref<string | null>(null)
const editRole = ref<ClientRole>('CLIENT_SUBMITTER')
const removing = ref<ClientMember | null>(null)
let generation = 0

async function load() {
  const current = ++generation
  loading.value = true
  loadFailed.value = false
  error.value = null
  members.value = []
  editingId.value = null
  removing.value = null
  success.value = ''
  try {
    const result = await accountsApi.listMembers(props.clientId)
    if (current === generation) members.value = result
  } catch (caught) {
    if (current === generation) {
      error.value = readApiError(caught)
      loadFailed.value = true
    }
  } finally {
    if (current === generation) loading.value = false
  }
}

function edit(member: ClientMember) {
  if (!props.canManage || busy.value || member.userId === auth.user?.id) return
  editingId.value = member.userId
  editRole.value = member.role
  success.value = ''
  error.value = null
}

async function update(member: ClientMember, active = true) {
  if (!props.canManage || busy.value || member.userId === auth.user?.id) return
  if (active && editingId.value !== member.userId) return
  const current = generation
  busy.value = true
  emit('busy-change', true)
  error.value = null
  success.value = ''
  try {
    const result = await accountsApi.updateMember(props.clientId, member.userId, {
      role: active ? editRole.value : member.role, active,
    })
    if (current !== generation) return
    members.value = result
      ? members.value.map(item => item.userId === member.userId ? result : item)
      : members.value.filter(item => item.userId !== member.userId)
    editingId.value = null
    removing.value = null
    success.value = active ? 'contacts.saved' : 'contacts.removed'
  } catch (caught) {
    if (current === generation) error.value = readApiError(caught)
  } finally {
    busy.value = false
    emit('busy-change', false)
  }
}

watch(() => props.clientId, load, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="app-panel overflow-hidden" :aria-busy="loading || busy">
    <header class="border-b px-6 py-5">
      <h2 class="text-base font-semibold">{{ t('contacts.members') }}</h2>
      <p class="mt-1.5 text-sm text-muted-foreground">{{ t('contacts.membersHint') }}</p>
    </header>
    <div v-if="error || success" class="space-y-3 px-6 pt-5">
      <ErrorNotice v-if="error" v-bind="error" />
      <p v-if="success" role="status" class="text-sm text-primary">{{ t(success) }}</p>
      <Button v-if="loadFailed" variant="outline" :disabled="loading" @click="load">{{ t('contacts.retry') }}</Button>
    </div>
    <p v-if="loading" role="status" class="px-6 py-8 text-sm text-muted-foreground">{{ t('contacts.loading') }}</p>
    <div v-else-if="!loadFailed && !members.length" class="px-6 py-9">
      <p class="text-sm font-medium">{{ t('contacts.empty') }}</p>
      <p class="mt-1.5 text-sm text-muted-foreground">{{ t(canManage ? 'contacts.emptyHint' : 'contacts.emptyReadOnlyHint') }}</p>
    </div>
    <div v-else-if="members.length" class="overflow-x-auto">
      <table class="w-full text-left text-sm">
        <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" class="px-6 py-3 font-medium">{{ t('contacts.name') }}</th>
            <th scope="col" class="px-6 py-3 font-medium">{{ t('contacts.role') }}</th>
            <th scope="col" class="px-6 py-3 font-medium">{{ t('contacts.status') }}</th>
            <th v-if="canManage" scope="col" class="px-6 py-3 text-right font-medium">{{ t('contacts.actions') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="member in members" :key="member.userId">
            <td class="px-6 py-4">
              <p class="font-medium">{{ member.name }} <span v-if="member.userId === auth.user?.id" class="ml-1 text-xs font-normal text-muted-foreground">({{ t('contacts.you') }})</span></p>
              <p class="mt-1 text-xs text-muted-foreground">{{ member.email }}</p>
            </td>
            <td class="px-6 py-4">
              <Select v-if="editingId === member.userId" v-model="editRole" :disabled="busy">
                <SelectTrigger class="w-48 bg-card" :aria-label="t('contacts.role')"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CLIENT_ADMIN">{{ t('contacts.admin') }}</SelectItem>
                  <SelectItem value="CLIENT_SUBMITTER">{{ t('contacts.submitter') }}</SelectItem>
                </SelectContent>
              </Select>
              <span v-else class="whitespace-nowrap text-muted-foreground">{{ t(member.role === 'CLIENT_ADMIN' ? 'contacts.admin' : 'contacts.submitter') }}</span>
            </td>
            <td class="px-6 py-4"><StatusBadge :status="member.status" /></td>
            <td v-if="canManage" class="px-6 py-4">
              <div v-if="member.userId !== auth.user?.id" class="flex justify-end gap-2 whitespace-nowrap">
                <template v-if="editingId === member.userId">
                  <Button size="sm" :disabled="busy || editRole === member.role" @click="update(member)">{{ busy ? t('contacts.saving') : t('contacts.save') }}</Button>
                  <Button size="sm" variant="outline" :disabled="busy" @click="editingId = null">{{ t('contacts.cancel') }}</Button>
                </template>
                <template v-else>
                  <Button size="sm" variant="outline" :disabled="busy" @click="edit(member)">{{ t('contacts.edit') }}</Button>
                  <Button size="sm" variant="ghost" class="text-destructive hover:text-destructive" :disabled="busy" @click="removing = member">{{ t('contacts.remove') }}</Button>
                </template>
              </div>
              <span v-else class="block text-right text-xs text-muted-foreground" :title="t('contacts.selfHint')">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ConfirmDialog
      :open="removing !== null" :title="t('contacts.removeTitle')" :description="t('contacts.removeHint', { name: removing?.name ?? '' })" :busy="busy"
      @update:open="value => { if (!value && !busy) removing = null }" @confirm="removing && update(removing, false)"
    >
      <ErrorNotice v-if="error && removing" class="mt-4" v-bind="error" />
    </ConfirmDialog>
  </section>
</template>

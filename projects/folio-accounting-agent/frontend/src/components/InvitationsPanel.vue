<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Copy, RefreshCw, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { accountsApi, type Invitation, type InvitationToken } from '@/api/accounts'
import { readApiError } from '@/api/client'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import ListPagination from '@/components/ListPagination.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ClientRole, FirmRole } from '@/types'

const props = defineProps<{ clientId?: string }>()
const emit = defineEmits<{ 'busy-change': [value: boolean] }>()
const { t, locale } = useI18n()
const email = ref('')
const role = ref<FirmRole | ClientRole>(props.clientId ? 'CLIENT_SUBMITTER' : 'ACCOUNTANT')
const roles = computed(() => props.clientId ? ['CLIENT_SUBMITTER', 'CLIENT_ADMIN'] : ['ACCOUNTANT', 'FIRM_ADMIN'])
const invitations = ref<Invitation[]>([])
const page = ref(1)
const pageSize = 10
const total = ref(0)
const loading = ref(false)
const busy = ref(false)
const error = ref<ReturnType<typeof readApiError> | null>(null)
const generated = ref<InvitationToken | null>(null)
const copied = ref(false)
const copyFailed = ref(false)
const pendingAction = ref<{ invitation: Invitation; action: 'resend' | 'revoke' } | null>(null)
const invitationLink = computed(() => generated.value
  ? `${window.location.origin}/invitations/accept#token=${encodeURIComponent(generated.value.token)}`
  : '')
let request = 0

function formatDate(value: string) {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(value))
}

async function load() {
  const current = ++request
  loading.value = true
  error.value = null
  try {
    const result = await accountsApi.listInvitations(props.clientId, { page: page.value, pageSize })
    if (current !== request) return
    invitations.value = result.items
    total.value = result.total
    const lastPage = Math.max(1, Math.ceil(result.total / pageSize))
    if (page.value > lastPage) page.value = lastPage
  } catch (caught) {
    if (current === request) {
      invitations.value = []
      error.value = readApiError(caught)
    }
  } finally {
    if (current === request) loading.value = false
  }
}

function showLink(result: InvitationToken) {
  generated.value = result
  copied.value = false
  copyFailed.value = false
}

async function invite() {
  if (busy.value || !email.value.trim()) return
  busy.value = true
  error.value = null
  try {
    showLink(await accountsApi.invite({ email: email.value.trim(), role: role.value }, props.clientId))
    email.value = ''
    if (page.value !== 1) page.value = 1
    else await load()
  } catch (caught) {
    error.value = readApiError(caught)
  } finally {
    busy.value = false
  }
}

async function runAction() {
  const action = pendingAction.value
  if (!action || busy.value) return
  busy.value = true
  error.value = null
  try {
    if (action.action === 'resend') {
      showLink(await accountsApi.resendInvitation(action.invitation.id, props.clientId))
    } else {
      await accountsApi.revokeInvitation(action.invitation.id, props.clientId)
      if (generated.value?.id === action.invitation.id) generated.value = null
    }
    pendingAction.value = null
    await load()
  } catch (caught) {
    error.value = readApiError(caught)
    pendingAction.value = null
  } finally {
    busy.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(invitationLink.value)
    copied.value = true
    copyFailed.value = false
  } catch {
    copied.value = false
    copyFailed.value = true
  }
}

watch(busy, value => emit('busy-change', value), { flush: 'sync' })
watch(() => props.clientId, () => {
  email.value = ''
  generated.value = null
  pendingAction.value = null
  role.value = props.clientId ? 'CLIENT_SUBMITTER' : 'ACCOUNTANT'
  page.value = 1
})
watch([() => props.clientId, page], load, { immediate: true })
onBeforeUnmount(() => { request++; emit('busy-change', false) })
</script>

<template>
  <section class="app-panel overflow-hidden" :aria-busy="loading">
    <header class="flex items-start justify-between gap-4 border-b px-6 py-5">
      <div>
        <h2 class="text-base font-semibold">{{ t('people.invitations') }}</h2>
        <p class="mt-1.5 text-sm leading-6 text-muted-foreground">{{ t('people.invitationDescription') }}</p>
      </div>
      <Button type="button" variant="ghost" size="icon" :disabled="loading || busy" :aria-label="t('people.refreshInvitations')" @click="load"><RefreshCw class="size-4" /></Button>
    </header>

    <div class="space-y-5 p-6">
      <form @submit.prevent="invite">
        <fieldset class="flex flex-wrap items-end gap-3" :disabled="busy">
          <div class="min-w-52 flex-1 space-y-2">
            <Label :for="`invite-email-${clientId || 'staff'}`">{{ t('auth.email') }}</Label>
            <Input :id="`invite-email-${clientId || 'staff'}`" v-model="email" class="h-10" type="email" autocomplete="email" maxlength="254" required />
          </div>
          <div class="w-full space-y-2 sm:w-52">
            <Label :for="`invite-role-${clientId || 'staff'}`">{{ t('people.role') }}</Label>
            <Select :model-value="role" :disabled="busy" @update:model-value="value => { if (roles.includes(String(value))) role = value as FirmRole | ClientRole }">
              <SelectTrigger :id="`invite-role-${clientId || 'staff'}`" size="lg" class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent position="popper"><SelectItem v-for="option in roles" :key="option" :value="option">{{ t(`people.roles.${option}`) }}</SelectItem></SelectContent>
            </Select>
          </div>
          <Button type="submit" class="h-10" :disabled="busy">{{ t(busy ? 'people.saving' : 'people.createInvitation') }}</Button>
        </fieldset>
      </form>

      <ErrorNotice v-if="error" v-bind="error" />
      <div v-if="generated" class="space-y-3 rounded-lg border bg-muted/40 p-4" role="status">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="break-words text-sm font-medium">{{ t('people.linkReady', { email: generated.email }) }}</p>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">{{ t('people.shareLinkHint', { date: formatDate(generated.expiresAt) }) }}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" class="size-7 shrink-0" :aria-label="t('people.dismissLink')" @click="generated = null"><X class="size-4" /></Button>
        </div>
        <div class="flex flex-wrap gap-2">
          <Input :model-value="invitationLink" :aria-label="t('people.invitationLink')" readonly class="min-w-36 flex-1 font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
          <Button type="button" variant="outline" @click="copyLink"><Copy class="size-4" />{{ t(copied ? 'error.copied' : 'people.copyLink') }}</Button>
        </div>
        <p v-if="copyFailed" class="text-xs text-destructive">{{ t('people.copyFailed') }}</p>
      </div>
    </div>

    <p v-if="loading" class="border-t px-6 py-10 text-center text-sm text-muted-foreground" role="status">{{ t('people.loadingInvitations') }}</p>
    <p v-else-if="!invitations.length && !error" class="border-t px-6 py-10 text-center text-sm text-muted-foreground">{{ t('people.noInvitations') }}</p>
    <div v-else-if="invitations.length" class="overflow-x-auto border-t">
      <table class="w-full text-left text-sm">
        <caption class="sr-only">{{ t('people.invitations') }}</caption>
        <thead class="border-b bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" class="px-6 py-3 font-medium">{{ t('auth.email') }}</th>
            <th scope="col" class="px-6 py-3 font-medium">{{ t('people.role') }}</th>
            <th scope="col" class="px-6 py-3 font-medium">{{ t('people.status') }}</th>
            <th scope="col" class="px-6 py-3 font-medium">{{ t('people.expires') }}</th>
            <th scope="col" class="px-6 py-3 text-right font-medium">{{ t('people.actions') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="invitation in invitations" :key="invitation.id" class="hover:bg-muted/20">
            <td class="px-6 py-4">{{ invitation.email }}</td>
            <td class="whitespace-nowrap px-6 py-4">{{ t(`people.roles.${invitation.role}`) }}</td>
            <td class="px-6 py-4"><StatusBadge :status="invitation.status" /></td>
            <td class="whitespace-nowrap px-6 py-4 text-muted-foreground">{{ formatDate(invitation.expiresAt) }}</td>
            <td class="px-6 py-3 text-right">
              <div class="flex justify-end gap-1">
                <Button v-if="invitation.status !== 'ACCEPTED'" type="button" variant="ghost" size="sm" :disabled="busy" @click="pendingAction = { invitation, action: 'resend' }">{{ t('people.resend') }}</Button>
                <Button v-if="invitation.status === 'PENDING'" type="button" variant="ghost" size="sm" :disabled="busy" @click="pendingAction = { invitation, action: 'revoke' }">{{ t('people.revoke') }}</Button>
                <span v-if="invitation.status === 'ACCEPTED'" class="text-muted-foreground">—</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <ListPagination :page="page" :page-size="pageSize" :total="total" :disabled="loading || busy" @page="page = $event" />
    <ConfirmDialog
      :open="!!pendingAction"
      :title="t(pendingAction?.action === 'resend' ? 'people.resendTitle' : 'people.revokeTitle')"
      :description="t(pendingAction?.action === 'resend' ? 'people.resendDescription' : 'people.revokeDescription', { email: pendingAction?.invitation.email ?? '' })"
      :busy="busy"
      @update:open="open => { if (!open && !busy) pendingAction = null }"
      @confirm="runAction"
    />
  </section>
</template>

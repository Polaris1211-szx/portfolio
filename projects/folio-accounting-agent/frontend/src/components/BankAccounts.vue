<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Plus, Landmark } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { accountsApi, type BankAccount } from '@/api/accounts'
import { readApiError } from '@/api/client'
import ErrorNotice from '@/components/ErrorNotice.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const props = defineProps<{ clientId: string; canManage: boolean }>()
const { t } = useI18n()
const banks = ref<BankAccount[]>([])
const loading = ref(false)
const busy = ref(false)
const editing = ref(false)
const editingId = ref<string | null>(null)
const pending = ref<BankAccount | null>(null)
const error = ref<ReturnType<typeof readApiError> | null>(null)
const actionError = ref<ReturnType<typeof readApiError> | null>(null)
const saved = ref(false)
const form = reactive({ bank: '', accountLast4: '', currency: 'SGD' })
let generation = 0

async function load() {
  const current = ++generation
  loading.value = true
  error.value = null
  try {
    const data = await accountsApi.listBanks(props.clientId)
    if (current === generation) banks.value = data
  } catch (caught) { if (current === generation) error.value = readApiError(caught) }
  finally { if (current === generation) loading.value = false }
}

function edit(bank?: BankAccount) {
  editingId.value = bank?.id ?? null
  Object.assign(form, bank ? { bank: bank.bank, accountLast4: bank.accountLast4, currency: bank.currency } : { bank: '', accountLast4: '', currency: 'SGD' })
  editing.value = true
  actionError.value = null
  saved.value = false
}

async function save() {
  if (busy.value || !props.canManage) return
  busy.value = true
  actionError.value = null
  try {
    const body = { bank: form.bank.trim(), accountLast4: form.accountLast4, currency: form.currency.toUpperCase() }
    if (editingId.value) await accountsApi.updateBank(props.clientId, editingId.value, body)
    else await accountsApi.createBank(props.clientId, body)
    editing.value = false
    saved.value = true
    await load()
  } catch (caught) { actionError.value = readApiError(caught) }
  finally { busy.value = false }
}

async function changeStatus(bank: BankAccount) {
  if (busy.value || !props.canManage) return
  busy.value = true
  actionError.value = null
  try {
    await accountsApi.updateBank(props.clientId, bank.id, { status: bank.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })
    pending.value = null
    saved.value = true
    await load()
  } catch (caught) { actionError.value = readApiError(caught) }
  finally { busy.value = false }
}
watch(() => props.clientId, () => { banks.value = []; editing.value = false; pending.value = null; saved.value = false; void load() }, { immediate: true })
</script>

<template>
  <section class="app-panel overflow-hidden" :aria-busy="loading || busy">
    <header class="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-5"><div><h2 class="text-base font-semibold">{{ t('accounts.banks') }}</h2><p class="mt-1.5 text-xs leading-5 text-muted-foreground">{{ t('accounts.bankHint') }}</p></div><Button v-if="canManage && !editing" size="sm" variant="outline" :disabled="busy || loading" @click="edit()"><Plus class="size-4" />{{ t('accounts.addBank') }}</Button></header>
    <div v-if="saved" role="status" class="px-6 pt-4 text-sm text-primary">{{ t('accounts.saved') }}</div>
    <div v-if="error" class="space-y-3 p-6"><ErrorNotice v-bind="error" /><Button variant="outline" @click="load">{{ t('accounts.retry') }}</Button></div>
    <ErrorNotice v-if="actionError && !editing && !pending" v-bind="actionError" class="m-6" />
    <form v-if="editing && canManage" class="space-y-5 border-b bg-muted/20 p-6" @submit.prevent="save">
      <ErrorNotice v-if="actionError" v-bind="actionError" />
      <fieldset :disabled="busy" class="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <div class="space-y-2"><Label for="bank-name">{{ t('accounts.bank') }}</Label><Input id="bank-name" v-model="form.bank" required maxlength="100" pattern=".*\S.*" class="h-10" /></div>
        <div class="space-y-2"><Label for="bank-last4">{{ t('accounts.last4') }}</Label><Input id="bank-last4" v-model="form.accountLast4" required inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" class="h-10" /></div>
        <div class="space-y-2"><Label for="bank-currency">{{ t('accounts.bankCurrency') }}</Label><Input id="bank-currency" v-model="form.currency" required pattern="[A-Z]{3}" minlength="3" maxlength="3" class="h-10 uppercase" @input="form.currency = form.currency.toUpperCase()" /></div>
      </fieldset>
      <div class="flex gap-2"><Button type="submit" :disabled="busy">{{ t(busy ? 'accounts.saving' : 'accounts.save') }}</Button><Button type="button" variant="outline" :disabled="busy" @click="editing = false; actionError = null">{{ t('accounts.cancel') }}</Button></div>
    </form>
    <p v-if="loading" role="status" class="p-6 text-sm text-muted-foreground">{{ t('accounts.loading') }}</p>
    <div v-else-if="!error" class="divide-y">
      <p v-if="!banks.length" class="p-6 text-sm text-muted-foreground">{{ t('accounts.noBanks') }}</p>
      <div v-for="bank in banks" :key="bank.id" class="flex flex-wrap items-center gap-4 px-6 py-5"><Landmark class="size-5 text-muted-foreground" /><div class="min-w-0 flex-1"><p class="font-medium">{{ bank.bank }}</p><p class="mt-1 text-xs text-muted-foreground">•••• {{ bank.accountLast4 }} <span class="mx-2">·</span>{{ bank.currency }}</p></div><StatusBadge :status="bank.status" /><div v-if="canManage" class="flex gap-1"><Button size="sm" variant="ghost" :disabled="busy || editing" @click="edit(bank)">{{ t('accounts.edit') }}</Button><Button size="sm" variant="ghost" :disabled="busy || editing" @click="actionError = null; bank.status === 'ACTIVE' ? pending = bank : changeStatus(bank)">{{ t(bank.status === 'ACTIVE' ? 'accounts.disable' : 'accounts.enable') }}</Button></div></div>
    </div>
    <ConfirmDialog :open="!!pending" :title="t('accounts.disableBank')" :description="t('accounts.disableBankHint')" :busy="busy" @update:open="!$event && (pending = null)" @confirm="pending && changeStatus(pending)"><ErrorNotice v-if="actionError" v-bind="actionError" class="mt-4" /></ConfirmDialog>
  </section>
</template>

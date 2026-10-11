<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ArrowLeft } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { accountsApi, type ClientAccount, type ClientFeatures } from '@/api/accounts'
import { readApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import ErrorNotice from '@/components/ErrorNotice.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BankAccounts from '@/components/BankAccounts.vue'
import ClientContacts from '@/components/ClientContacts.vue'
import ClientAssignments from '@/components/ClientAssignments.vue'
import InvitationsPanel from '@/components/InvitationsPanel.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { t } = useI18n()
const id = computed(() => typeof route.params.id === 'string' ? route.params.id : '')
const isNew = computed(() => route.name === 'client-new')
const isAdmin = computed(() => auth.user?.firmRole === 'FIRM_ADMIN')
const listQuery = computed(() => ({ search: route.query.search, status: route.query.status, page: route.query.page }))
const tab = computed(() => route.query.tab === 'contacts' ? 'contacts' : route.query.tab === 'team' && isAdmin.value ? 'team' : 'overview')
const client = ref<ClientAccount | null>(null)
const loading = ref(false)
const saving = ref(false)
const saved = ref(false)
const statusOpen = ref(false)
const error = ref<ReturnType<typeof readApiError> | null>(null)
const saveError = ref<ReturnType<typeof readApiError> | null>(null)
const emptyFeatures = (): ClientFeatures => ({ usesPaymentPlatform: false, hasEmployeeReimbursement: false, hasLoan: false, multiCurrency: false, projectBased: false, hasRetention: false })
const industries = ['PROFESSIONAL_SERVICES', 'ONLINE_COMMERCE', 'PROJECT_ENGINEERING', 'TRADING_DISTRIBUTION', 'FOOD_BEVERAGE', 'SOFTWARE_SAAS', 'OTHER']
const form = reactive({ code: '', legalName: '', baseCurrency: 'SGD', industry: 'OTHER', features: emptyFeatures() })
const featureKeys = Object.keys(emptyFeatures()) as (keyof ClientFeatures)[]
let generation = 0

async function load() {
  const current = ++generation
  client.value = null
  error.value = null
  saveError.value = null
  saved.value = false
  saving.value = false
  statusOpen.value = false
  Object.assign(form, { code: '', legalName: '', baseCurrency: 'SGD', industry: 'OTHER', features: emptyFeatures() })
  if (isNew.value) { loading.value = false; return }
  loading.value = true
  try {
    const data = await accountsApi.getClient(id.value)
    if (current !== generation) return
    client.value = data
    Object.assign(form, { code: data.code, legalName: data.legalName, baseCurrency: data.baseCurrency, industry: data.industry, features: { ...data.features } })
  } catch (caught) { if (current === generation) error.value = readApiError(caught) }
  finally { if (current === generation) loading.value = false }
}

async function save() {
  if (saving.value || !isAdmin.value) return
  const current = generation
  const clientId = id.value
  const creating = isNew.value
  saving.value = true
  saveError.value = null
  saved.value = false
  try {
    const body = { legalName: form.legalName.trim(), baseCurrency: form.baseCurrency.toUpperCase(), industry: form.industry, features: { ...form.features } }
    if (creating) {
      const data = await accountsApi.createClient({ ...body, code: form.code.trim() })
      if (current !== generation || !isNew.value) return
      await router.replace({ name: 'client-detail', params: { id: data.id }, query: listQuery.value })
    } else {
      const updated = await accountsApi.updateClient(clientId, body)
      if (current !== generation) return
      client.value = updated
      saved.value = true
    }
  } catch (caught) { if (current === generation) saveError.value = readApiError(caught) }
  finally { if (current === generation) saving.value = false }
}

async function changeStatus() {
  if (saving.value || !client.value || !isAdmin.value) return
  const current = generation
  const clientId = id.value
  const nextStatus = client.value.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  saving.value = true
  saveError.value = null
  try {
    const updated = await accountsApi.updateClient(clientId, { status: nextStatus })
    if (current !== generation) return
    client.value = updated
    statusOpen.value = false
    saved.value = true
  } catch (caught) { if (current === generation) saveError.value = readApiError(caught) }
  finally { if (current === generation) saving.value = false }
}
watch(() => [id.value, isNew.value], load, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="space-y-7">
    <RouterLink :to="{ name: 'clients', query: listQuery }" class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft class="size-4" />{{ t('accounts.back') }}</RouterLink>
    <div v-if="error" class="space-y-4"><ErrorNotice v-bind="error" /><Button variant="outline" @click="load">{{ t('accounts.retry') }}</Button></div>
    <p v-else-if="loading" role="status" class="py-10 text-sm text-muted-foreground">{{ t('accounts.loading') }}</p>
    <template v-else-if="client || isNew">
      <header class="flex flex-wrap items-start justify-between gap-4"><div><div class="flex flex-wrap items-center gap-3"><h1 class="text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ isNew ? t('accounts.newClient') : client?.legalName }}</h1><StatusBadge v-if="client" :status="client.status" /></div><p class="mt-2 text-sm text-muted-foreground">{{ isNew ? t('accounts.description') : `${client?.code} · ${client?.baseCurrency}` }}</p></div><Button v-if="client && isAdmin" variant="outline" :disabled="saving" @click="saveError = null; client.status === 'ACTIVE' ? statusOpen = true : changeStatus()">{{ t(client.status === 'ACTIVE' ? 'accounts.disable' : 'accounts.enable') }}</Button></header>
      <ErrorNotice v-if="saveError && tab !== 'overview' && !statusOpen" v-bind="saveError" />
      <nav v-if="!isNew" class="flex gap-6 overflow-x-auto border-b text-sm" :aria-label="t('accounts.details')">
        <RouterLink v-for="item in [{ value: 'overview', label: 'accounts.overview' }, { value: 'contacts', label: 'accounts.people' }, ...(isAdmin ? [{ value: 'team', label: 'accounts.assignments' }] : [])]" :key="item.value" :to="{ query: { ...listQuery, tab: item.value === 'overview' ? undefined : item.value } }" class="shrink-0 border-b-2 py-3" :class="tab === item.value ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'" :aria-current="tab === item.value ? 'page' : undefined">{{ t(item.label) }}</RouterLink>
      </nav>
      <template v-if="isNew || tab === 'overview'">
        <p v-if="!isAdmin" class="text-sm text-muted-foreground">{{ t('accounts.readonly') }}</p>
        <div :class="client ? 'grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]' : ''">
        <form class="app-panel overflow-hidden" @submit.prevent="save">
          <header class="border-b px-6 py-5"><h2 class="text-base font-semibold">{{ t('accounts.basicInfo') }}</h2></header>
          <div class="space-y-6 p-6">
            <ErrorNotice v-if="saveError && !statusOpen" v-bind="saveError" />
            <p v-if="saved" role="status" class="text-sm text-primary">{{ t('accounts.saved') }}</p>
            <fieldset :disabled="saving || !isAdmin" class="space-y-6">
              <div class="grid gap-5 sm:grid-cols-2">
                <div class="space-y-2"><Label for="client-industry">{{ t('accounts.industry') }}</Label><Select v-model="form.industry" :disabled="saving || !isAdmin"><SelectTrigger id="client-industry" class="h-10 w-full bg-card"><SelectValue /></SelectTrigger><SelectContent><SelectItem v-for="industry in industries" :key="industry" :value="industry">{{ t(`accounts.industries.${industry}`) }}</SelectItem></SelectContent></Select></div>
                <div class="space-y-2"><Label for="legal-name">{{ t('accounts.name') }}</Label><Input id="legal-name" v-model="form.legalName" required pattern=".*\S.*" maxlength="200" class="h-10 bg-card" /></div>
                <div class="space-y-2"><Label for="client-code">{{ t('accounts.code') }}</Label><Input id="client-code" v-model="form.code" :disabled="!isNew" required pattern="[A-Za-z0-9_-]+" maxlength="50" class="h-10 bg-card font-mono" /></div>
                <div class="space-y-2"><Label for="base-currency">{{ t('accounts.currency') }}</Label><Input id="base-currency" v-model="form.baseCurrency" required pattern="[A-Z]{3}" minlength="3" maxlength="3" class="h-10 bg-card font-mono uppercase" @input="form.baseCurrency = form.baseCurrency.toUpperCase()" /></div>
              </div>
              <div class="border-t pt-6"><h3 class="text-sm font-semibold">{{ t('accounts.businessFeatures') }}</h3><p class="mt-1.5 text-xs leading-5 text-muted-foreground">{{ t('accounts.featuresHint') }}</p><div class="mt-5 grid border-t sm:grid-cols-2 lg:grid-cols-3"><label v-for="key in featureKeys" :key="key" class="flex cursor-pointer items-center gap-3 border-b py-3 pr-4 text-sm sm:border-r sm:pl-4"><input v-model="form.features[key]" type="checkbox" class="size-4 accent-primary focus-visible:outline-ring" />{{ t(`accounts.features.${key}`) }}</label></div></div>
            </fieldset>
          </div>
          <footer v-if="isAdmin" class="flex gap-3 border-t px-6 py-5"><Button type="submit" :disabled="saving">{{ t(saving ? 'accounts.saving' : isNew ? 'accounts.createClient' : 'accounts.save') }}</Button><Button v-if="isNew" as-child variant="outline"><RouterLink :to="{ name: 'clients', query: listQuery }">{{ t('accounts.cancel') }}</RouterLink></Button></footer>
        </form>
        <BankAccounts v-if="client" :key="client.id" :client-id="client.id" :can-manage="isAdmin" />
        </div>
      </template>
      <div v-else-if="tab === 'contacts' && client" class="space-y-6"><ClientContacts :key="client.id" :client-id="client.id" :can-manage="isAdmin" /><InvitationsPanel v-if="isAdmin && client.status === 'ACTIVE'" :key="`invites-${client.id}`" :client-id="client.id" /></div>
      <ClientAssignments v-else-if="tab === 'team' && isAdmin && client" :key="client.id" :client-id="client.id" />
      <ConfirmDialog :open="statusOpen" :busy="saving" :title="t('accounts.disableClient')" :description="t('accounts.disableHint')" @update:open="statusOpen = $event" @confirm="changeStatus"><ErrorNotice v-if="saveError" v-bind="saveError" class="mt-4" /></ConfirmDialog>
    </template>
  </section>
</template>

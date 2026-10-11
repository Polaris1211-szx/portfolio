<script setup lang="ts">
import { ArrowUpRight, Building2, FolderOpen } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { accountsApi, type ClientAccount } from '@/api/accounts'
import { readApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import ErrorNotice from '@/components/ErrorNotice.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const roleKeys = {
  FIRM_ADMIN: 'home.firmAdmin',
  ACCOUNTANT: 'home.accountant',
  CLIENT_ADMIN: 'home.clientAdmin',
  CLIENT_SUBMITTER: 'home.clientSubmitter',
} as const
const formatRole = (role?: keyof typeof roleKeys | null) => (role ? t(roleKeys[role]) : '—')
const clients = ref<ClientAccount[]>([])
const clientTotal = ref(0)
const loadingClients = ref(false)
const clientError = ref<ReturnType<typeof readApiError> | null>(null)
const isAdmin = computed(() => auth.user?.firmRole === 'FIRM_ADMIN')

async function loadClients() {
  if (!auth.isStaff) return
  loadingClients.value = true
  clientError.value = null
  try {
    const result = await accountsApi.listClients({ page: 1, pageSize: 5 })
    clients.value = result.items
    clientTotal.value = result.total
  } catch (error) {
    clientError.value = readApiError(error)
  } finally {
    loadingClients.value = false
  }
}

onMounted(loadClients)
</script>

<template>
  <section class="space-y-7">
    <header>
      <div>
        <h1 class="text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ t('nav.workspace') }}</h1>
        <p class="mt-2 text-sm text-muted-foreground">{{ t('home.description') }}</p>
      </div>
    </header>

    <section class="app-panel overflow-hidden" aria-labelledby="organisation-title">
      <div class="flex items-center gap-4 border-b px-5 py-6 sm:px-7">
        <span class="grid size-12 shrink-0 place-items-center rounded-xl border border-primary/10 bg-accent text-primary"><Building2 class="size-6" /></span>
        <div class="min-w-0">
          <p class="mb-1 text-xs text-muted-foreground">{{ t('home.firm') }}</p>
          <h2 id="organisation-title" class="break-words text-xl font-semibold tracking-tight">{{ auth.user?.firm.name }}</h2>
        </div>
      </div>
      <dl class="grid divide-y text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div class="px-5 py-5 sm:px-7">
          <dt class="text-xs text-muted-foreground">{{ t('home.timezone') }}</dt>
          <dd class="mt-1.5 font-medium">{{ auth.user?.firm.timezone }}</dd>
        </div>
        <div class="px-5 py-5 sm:px-7">
          <dt class="text-xs text-muted-foreground">{{ t('home.role') }}</dt>
          <dd class="mt-1.5 font-medium">{{ formatRole(auth.user?.firmRole ?? auth.user?.clientMemberships[0]?.role) }}</dd>
        </div>
      </dl>
    </section>

    <section v-if="auth.isStaff" class="app-panel overflow-hidden" aria-labelledby="staff-clients-title">
      <header class="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-5 sm:px-7">
        <div>
          <h2 id="staff-clients-title" class="text-base font-semibold">{{ t(isAdmin ? 'home.managedClients' : 'home.assignedClients') }}</h2>
          <p class="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{{ t(isAdmin ? 'home.managedClientsHint' : 'home.assignedClientsHint', { total: clientTotal }) }}</p>
        </div>
        <Button as-child variant="outline" size="sm"><RouterLink to="/staff/clients">{{ t('home.viewClients') }}<ArrowUpRight class="size-4" /></RouterLink></Button>
      </header>
      <div v-if="clientError" class="space-y-3 p-5 sm:px-7"><ErrorNotice v-bind="clientError" /><Button variant="outline" size="sm" @click="loadClients">{{ t('accounts.retry') }}</Button></div>
      <p v-else-if="loadingClients" class="px-5 py-10 text-sm text-muted-foreground sm:px-7" role="status">{{ t('accounts.loading') }}</p>
      <table v-else-if="clients.length" class="w-full text-left text-sm">
        <thead class="border-b bg-muted/50 text-xs text-muted-foreground"><tr><th scope="col" class="w-3/5 px-5 py-3 font-medium sm:px-7">{{ t('home.client') }}</th><th scope="col" class="px-5 py-3 font-medium">{{ t('accounts.code') }}</th><th scope="col" class="px-5 py-3 font-medium sm:px-7">{{ t('accounts.statusLabel') }}</th></tr></thead>
        <tbody><tr v-for="client in clients" :key="client.id" class="border-b last:border-b-0"><td class="px-5 py-4 font-medium sm:px-7"><RouterLink class="underline-offset-4 hover:underline" :to="`/staff/clients/${client.id}`">{{ client.legalName }}</RouterLink></td><td class="px-5 py-4 font-mono text-xs text-muted-foreground">{{ client.code }}</td><td class="px-5 py-4 sm:px-7"><StatusBadge :status="client.status" /></td></tr></tbody>
      </table>
      <div v-else class="flex min-h-40 items-start gap-4 px-5 py-9 sm:items-center sm:px-7"><FolderOpen class="mt-0.5 size-6 shrink-0 text-muted-foreground/65" /><div><p class="text-sm font-medium">{{ t(isAdmin ? 'accounts.noClients' : 'home.noAssignedClients') }}</p><p class="mt-1.5 text-sm leading-6 text-muted-foreground">{{ t(isAdmin ? 'accounts.noClientsHint' : 'home.noAssignedClientsHint') }}</p></div></div>
    </section>

    <section v-else class="app-panel overflow-hidden" aria-labelledby="memberships-title">
      <header class="border-b px-5 py-5 sm:px-7">
        <h2 id="memberships-title" class="text-base font-semibold">{{ t('home.memberships') }}</h2>
        <p class="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{{ t('home.membershipsHint') }}</p>
      </header>
      <table v-if="auth.user?.clientMemberships.length" class="w-full text-left text-sm">
        <thead class="border-b bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" class="w-3/5 px-5 py-3 font-medium sm:px-7">{{ t('home.client') }}</th>
            <th scope="col" class="px-5 py-3 font-medium sm:px-7">{{ t('home.role') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="client in auth.user.clientMemberships" :key="client.clientId" class="border-b last:border-b-0">
            <td class="px-5 py-4 font-medium sm:px-7">{{ client.clientName }}</td>
            <td class="px-5 py-4 text-muted-foreground sm:px-7">{{ formatRole(client.role) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-else class="flex min-h-40 items-start gap-4 px-5 py-9 sm:items-center sm:px-7">
        <FolderOpen class="mt-0.5 size-6 shrink-0 text-muted-foreground/65" />
        <div>
          <p class="text-sm font-medium">{{ t('home.noClients') }}</p>
          <p class="mt-1.5 text-sm leading-6 text-muted-foreground">{{ t('home.membershipsEmptyHint') }}</p>
        </div>
      </div>
    </section>
  </section>
</template>

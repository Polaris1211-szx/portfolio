<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import ClientContacts from '@/components/ClientContacts.vue'
import InvitationsPanel from '@/components/InvitationsPanel.vue'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const membersBusy = ref(false)
const invitationsBusy = ref(false)
const busy = computed(() => membersBusy.value || invitationsBusy.value)
const clients = computed(() => auth.user?.clientMemberships.filter(member => member.role === 'CLIENT_ADMIN') ?? [])
const selected = computed(() => clients.value.find(client => client.clientId === route.query.clientId) ?? clients.value[0])

function selectClient(value: unknown) {
  if (busy.value || typeof value !== 'string' || !clients.value.some(client => client.clientId === value)) return
  void router.replace({ query: { ...route.query, clientId: value } })
}

watch(() => selected.value?.clientId, () => {
  membersBusy.value = false
  invitationsBusy.value = false
})
onBeforeRouteUpdate(to => !busy.value || to.query.clientId === route.query.clientId)
</script>

<template>
  <section class="space-y-7">
    <header class="flex flex-wrap items-end justify-between gap-5">
      <div>
        <h1 class="text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ t('contacts.title') }}</h1>
        <p class="mt-2 text-sm text-muted-foreground">{{ t('contacts.description') }}</p>
      </div>
      <div v-if="selected" class="w-full space-y-2 sm:w-72">
        <Label for="contacts-client">{{ t('contacts.client') }}</Label>
        <Select :model-value="selected.clientId" :disabled="busy || clients.length === 1" @update:model-value="selectClient">
          <SelectTrigger id="contacts-client" class="w-full bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="client in clients" :key="client.clientId" :value="client.clientId">{{ client.clientName }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </header>
    <template v-if="selected">
      <ClientContacts :key="`contacts-${selected.clientId}`" :client-id="selected.clientId" :can-manage="true" @busy-change="membersBusy = $event" />
      <InvitationsPanel :key="`invitations-${selected.clientId}`" :client-id="selected.clientId" @busy-change="invitationsBusy = $event" />
    </template>
    <div v-else class="app-panel px-6 py-9">
      <p class="text-sm font-medium">{{ t('contacts.forbidden') }}</p>
      <p class="mt-1.5 text-sm text-muted-foreground">{{ t('contacts.forbiddenHint') }}</p>
    </div>
  </section>
</template>

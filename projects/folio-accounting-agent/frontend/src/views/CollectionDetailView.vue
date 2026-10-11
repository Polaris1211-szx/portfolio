<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import CollectionDetailPanel from '@/components/CollectionDetailPanel.vue'

const route = useRoute()
const { t } = useI18n()
const id = computed(() => String(route.params.id ?? ''))
const listQuery = computed(() => ({
  page: route.query.page,
  client: route.query.client,
  period: route.query.period,
  status: route.query.status,
  assignee: route.query.assignee,
  dueFrom: route.query.dueFrom,
  dueTo: route.query.dueTo,
}))
</script>

<template>
  <section class="space-y-7">
    <RouterLink :to="{ name: 'collections', query: listQuery }" class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft class="size-4" />{{ t('collections.back') }}</RouterLink>
    <CollectionDetailPanel :request-id="id" />
  </section>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'

const props = defineProps<{ page: number; pageSize: number; total: number; disabled?: boolean }>()
defineEmits<{ page: [value: number] }>()
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))
const { t } = useI18n()
</script>

<template>
  <nav class="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 text-sm" :aria-label="t('accounts.pagination')">
    <p class="text-xs text-muted-foreground">{{ t('accounts.pageSummary', { page, pages, total }) }}</p>
    <div class="flex gap-2">
      <Button variant="outline" size="icon" :aria-label="t('accounts.previous')" :title="t('accounts.previous')" :disabled="disabled || page <= 1" @click="$emit('page', page - 1)"><ChevronLeft /></Button>
      <Button variant="outline" size="icon" :aria-label="t('accounts.next')" :title="t('accounts.next')" :disabled="disabled || page >= pages" @click="$emit('page', page + 1)"><ChevronRight /></Button>
    </div>
  </nav>
</template>

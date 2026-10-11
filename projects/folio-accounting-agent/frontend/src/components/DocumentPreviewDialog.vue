<script setup lang="ts">
import { Download, X } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const props = defineProps<{
  open: boolean
  name: string
  contentType: string
  load: () => Promise<Blob>
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const { t } = useI18n()
const url = ref('')
const resolvedType = ref('')
const loading = ref(false)
const failed = ref(false)
let generation = 0

const isImage = computed(() => resolvedType.value.startsWith('image/'))
const isPdf = computed(() => resolvedType.value === 'application/pdf')

function clearUrl() {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
}

watch([() => props.open, () => props.name], async ([open]) => {
  const current = ++generation
  clearUrl()
  failed.value = false
  if (!open) return
  loading.value = true
  try {
    const blob = await props.load()
    if (current !== generation) return
    resolvedType.value = blob.type || props.contentType
    url.value = URL.createObjectURL(blob)
  } catch {
    if (current === generation) failed.value = true
  } finally {
    if (current === generation) loading.value = false
  }
}, { immediate: true })

function download() {
  if (!url.value) return
  const anchor = document.createElement('a')
  anchor.href = url.value
  anchor.download = props.name
  anchor.click()
}

onBeforeUnmount(() => { generation += 1; clearUrl() })
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
      <DialogContent :show-close-button="false" class="flex h-[min(88vh,900px)] max-w-[1100px] flex-col overflow-hidden p-0">
        <header class="flex items-center gap-3 border-b px-5 py-4">
          <div class="min-w-0 flex-1">
            <DialogTitle class="truncate text-sm font-semibold" :title="name">{{ name }}</DialogTitle>
            <DialogDescription class="mt-0.5 text-xs text-muted-foreground">{{ t('common.filePreview') }}</DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" :disabled="!url" :aria-label="t('common.download')" @click="download"><Download class="size-4" /></Button>
          <Button type="button" variant="ghost" size="icon-sm" :aria-label="t('common.close')" @click="emit('update:open', false)"><X class="size-4" /></Button>
        </header>
        <div class="min-h-0 flex-1 bg-muted/35 p-3 sm:p-5">
          <div v-if="loading" role="status" class="grid h-full place-items-center text-sm text-muted-foreground">{{ t('common.previewLoading') }}</div>
          <div v-else-if="failed || (!isImage && !isPdf)" class="grid h-full place-items-center text-sm text-muted-foreground">{{ t('common.previewUnavailable') }}</div>
          <img v-else-if="isImage" :src="url" :alt="name" class="h-full w-full object-contain">
          <iframe v-else :src="url" :title="name" class="h-full w-full rounded-xl border bg-white" />
        </div>
      </DialogContent>
  </Dialog>
</template>

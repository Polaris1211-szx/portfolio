<script setup lang="ts">
import { computed } from 'vue'
import { File, FileImage, FileText } from '@lucide/vue'

const props = defineProps<{ name: string; contentType?: string }>()
const kind = computed(() => {
  const extension = props.name.split('.').pop()?.toLowerCase()
  if (props.contentType?.startsWith('image/') || ['png', 'jpg', 'jpeg'].includes(extension ?? '')) return 'image'
  if (props.contentType === 'application/pdf' || extension === 'pdf') return 'pdf'
  return 'file'
})
</script>

<template>
  <span
    class="grid size-10 shrink-0 place-items-center rounded-xl"
    :class="kind === 'image' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : kind === 'pdf' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-muted text-muted-foreground'"
    aria-hidden="true"
  >
    <FileImage v-if="kind === 'image'" class="size-5" />
    <FileText v-else-if="kind === 'pdf'" class="size-5" />
    <File v-else class="size-5" />
  </span>
</template>

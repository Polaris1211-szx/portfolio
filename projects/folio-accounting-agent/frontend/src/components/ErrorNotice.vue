<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'

const props = defineProps<{ message: string; code?: string; status?: number; details?: unknown; requestId?: string }>()
const { t, te } = useI18n()
const copied = ref(false)
const copyFailed = ref(false)
const message = computed(() => {
  const key = `error.codes.${props.code}`
  if (props.code && (te(key) || te(key, 'en'))) return t(key)
  const statusKey = `error.status.${props.status}`
  return te(statusKey) || te(statusKey, 'en') ? t(statusKey) : t('error.generic')
})

watch(() => props.requestId, () => {
  copied.value = false
  copyFailed.value = false
})

async function copyRequestId(requestId: string) {
  try {
    await navigator.clipboard.writeText(requestId)
    copied.value = true
    copyFailed.value = false
  } catch {
    copyFailed.value = true
  }
}
</script>

<template>
  <div role="alert" class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
    <p>{{ message }}</p>
    <p v-if="code" class="mt-1 text-xs text-muted-foreground"><code>{{ code }}</code></p>
    <div v-if="requestId" class="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      <span>{{ t('error.requestId') }}: <code>{{ requestId }}</code></span>
      <Button type="button" variant="ghost" size="xs" @click="copyRequestId(requestId)">
        {{ copied ? t('error.copied') : t('error.copy') }}
      </Button>
    </div>
    <p v-if="copyFailed" role="status" class="mt-2 text-xs">{{ t('error.copyFailed') }}</p>
  </div>
</template>

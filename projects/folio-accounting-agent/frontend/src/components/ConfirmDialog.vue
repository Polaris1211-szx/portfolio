<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { AlertDialogRoot, AlertDialogPortal, AlertDialogOverlay, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel } from 'reka-ui'
import { Button } from '@/components/ui/button'

defineProps<{
  open: boolean
  title: string
  description?: string
  busy?: boolean
  confirmDisabled?: boolean
  confirmLabel?: string
  cancelLabel?: string
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; confirm: [] }>()
const { t } = useI18n()
</script>

<template>
  <AlertDialogRoot :open="open" @update:open="!busy && emit('update:open', $event)">
    <AlertDialogPortal>
      <AlertDialogOverlay class="fixed inset-0 z-50 bg-black/45" />
      <AlertDialogContent class="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-6 shadow-xl" @escape-key-down="busy && $event.preventDefault()">
        <AlertDialogTitle class="text-lg font-semibold">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription class="mt-3 text-sm leading-6 text-muted-foreground">{{ description || t('accounts.confirmHint') }}</AlertDialogDescription>
        <slot />
        <div class="mt-6 flex justify-end gap-2">
          <AlertDialogCancel as-child><Button variant="outline" :disabled="busy">{{ cancelLabel || t('accounts.cancel') }}</Button></AlertDialogCancel>
          <Button :disabled="busy || confirmDisabled" @click="emit('confirm')">{{ busy ? t('accounts.saving') : confirmLabel || t('accounts.confirm') }}</Button>
        </div>
      </AlertDialogContent>
    </AlertDialogPortal>
  </AlertDialogRoot>
</template>

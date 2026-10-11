<script setup lang="ts">
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const props = withDefaults(defineProps<{ modelValue: string, label: string, placeholder: string, disabled?: boolean }>(), { disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { locale, t } = useI18n()
const open = ref(false)
const current = new Date()
const displayedYear = ref(current.getFullYear())

const months = computed(() => Array.from({ length: 12 }, (_, index) => ({
  number: index + 1,
  label: new Intl.DateTimeFormat(locale.value, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, index, 1))),
})))
const formatted = computed(() => props.modelValue
  ? new Intl.DateTimeFormat(locale.value, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${props.modelValue}-01T00:00:00Z`))
  : '')

watch(open, (value) => {
  if (value) displayedYear.value = Number(props.modelValue.slice(0, 4)) || current.getFullYear()
})

function choose(month: number) {
  emit('update:modelValue', `${displayedYear.value}-${String(month).padStart(2, '0')}`)
  open.value = false
}

function clear() {
  emit('update:modelValue', '')
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button type="button" variant="outline" class="h-10 w-full justify-between bg-card px-3 font-normal" :disabled="disabled" :aria-label="label">
        <span class="flex min-w-0 items-center gap-2"><CalendarDays class="size-4 shrink-0 text-muted-foreground" /><span class="truncate" :class="formatted ? '' : 'text-muted-foreground'">{{ formatted || placeholder }}</span></span>
        <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-72 p-3">
      <div class="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon-sm" :aria-label="`${displayedYear - 1}`" @click="displayedYear--"><ChevronLeft /></Button>
        <span class="font-medium">{{ displayedYear }}</span>
        <Button type="button" variant="ghost" size="icon-sm" :aria-label="`${displayedYear + 1}`" @click="displayedYear++"><ChevronRight /></Button>
      </div>
      <div class="grid grid-cols-3 gap-1 py-1">
        <Button
          v-for="month in months"
          :key="month.number"
          type="button"
          :variant="modelValue === `${displayedYear}-${String(month.number).padStart(2, '0')}` ? 'default' : 'ghost'"
          class="justify-center"
          @click="choose(month.number)"
        >{{ month.label }}</Button>
      </div>
      <div class="border-t pt-2">
        <Button type="button" variant="ghost" size="sm" class="w-full" :disabled="!modelValue" @click="clear">{{ t('common.clear') }}</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

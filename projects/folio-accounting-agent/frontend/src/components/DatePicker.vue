<script setup lang="ts">
import type { DateValue } from 'reka-ui'
import { CalendarDays, ChevronDown } from '@lucide/vue'
import { parseDate, today, getLocalTimeZone } from '@internationalized/date'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const props = withDefaults(defineProps<{
  modelValue: string
  label: string
  placeholder?: string
  disabled?: boolean
}>(), { placeholder: '' })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { locale, t } = useI18n()
const open = ref(false)

const selected = computed<DateValue | undefined>(() => {
  if (!props.modelValue) return undefined
  return parseDate(props.modelValue)
})
const calendarPlaceholder = computed(() => selected.value ?? today(getLocalTimeZone()))
const formatted = computed(() => {
  if (!selected.value) return props.placeholder
  const date = new Date(Date.UTC(selected.value.year, selected.value.month - 1, selected.value.day))
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
})

function choose(value: DateValue | undefined) {
  if (!value) return
  emit('update:modelValue', value.toString())
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
        <span class="flex min-w-0 items-center gap-2"><CalendarDays class="size-4 shrink-0 text-muted-foreground" /><span class="truncate" :class="formatted ? '' : 'text-muted-foreground'">{{ formatted || label }}</span></span>
        <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-auto p-0">
      <Calendar
        :model-value="selected"
        :placeholder="calendarPlaceholder"
        :locale="locale"
        :calendar-label="label"
        layout="month-and-year"
        initial-focus
        @update:model-value="choose"
      />
      <div class="border-t p-2">
        <Button type="button" variant="ghost" size="sm" class="w-full" :disabled="!modelValue" @click="clear">{{ t('common.clear') }}</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

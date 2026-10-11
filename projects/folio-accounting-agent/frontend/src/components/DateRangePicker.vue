<script setup lang="ts">
import type { DateRange, DateValue } from 'reka-ui'
import { CalendarDays, ChevronDown } from '@lucide/vue'
import { getLocalTimeZone, parseDate, today } from '@internationalized/date'
import { useMediaQuery } from '@vueuse/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RangeCalendar } from '@/components/ui/range-calendar'

const props = defineProps<{ start: string, end: string, label: string, placeholder: string }>()
const emit = defineEmits<{ 'update:start': [value: string], 'update:end': [value: string] }>()
const { locale, t } = useI18n()
const open = ref(false)
const showTwoMonths = useMediaQuery('(min-width: 640px)')

const selected = computed<DateRange>({
  get: () => ({
    start: props.start ? parseDate(props.start) : undefined,
    end: props.end ? parseDate(props.end) : undefined,
  }),
  set: (value) => {
    emit('update:start', value.start?.toString() ?? '')
    emit('update:end', value.end?.toString() ?? '')
    if (value.start && value.end) open.value = false
  },
})
const calendarPlaceholder = computed<DateValue>(() => selected.value.start ?? today(getLocalTimeZone()))
const format = (value: DateValue) => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeZone: 'UTC' })
  .format(new Date(Date.UTC(value.year, value.month - 1, value.day)))
const formatted = computed(() => {
  if (!selected.value.start) return ''
  return selected.value.end ? `${format(selected.value.start)} – ${format(selected.value.end)}` : `${format(selected.value.start)} – …`
})

function clear() {
  emit('update:start', '')
  emit('update:end', '')
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button type="button" variant="outline" class="h-10 w-full justify-between bg-card px-3 font-normal" :aria-label="label">
        <span class="flex min-w-0 items-center gap-2"><CalendarDays class="size-4 shrink-0 text-muted-foreground" /><span class="truncate" :class="formatted ? '' : 'text-muted-foreground'">{{ formatted || placeholder }}</span></span>
        <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-auto max-w-[calc(100vw-2rem)] overflow-auto p-0">
      <RangeCalendar v-model="selected" :placeholder="calendarPlaceholder" :locale="locale" :calendar-label="label" :number-of-months="showTwoMonths ? 2 : 1" initial-focus />
      <div class="border-t p-2">
        <Button type="button" variant="ghost" size="sm" class="w-full" :disabled="!start && !end" @click="clear">{{ t('common.clear') }}</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setLocale } from '@/i18n'

const { t, locale } = useI18n()

function changeLocale(value: unknown) {
  if (value === 'en' || value === 'zh-CN') setLocale(value)
}
</script>

<template>
  <Select :model-value="locale" @update:model-value="changeLocale">
    <SelectTrigger :aria-label="t('common.language')" class="w-40 bg-card">
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper" align="end">
      <SelectGroup>
        <SelectItem value="en">{{ t('common.english') }}</SelectItem>
        <SelectItem value="zh-CN">{{ t('common.chinese') }}</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
</template>

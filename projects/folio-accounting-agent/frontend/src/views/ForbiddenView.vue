<script setup lang="ts">
import { LockKeyhole, ArrowLeft } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
const { t } = useI18n()
const auth = useAuthStore()
</script>

<template>
  <section class="app-panel mx-auto mt-12 max-w-lg p-8 sm:p-10">
    <span class="grid size-12 place-items-center rounded-xl border bg-muted"><LockKeyhole class="size-5 text-muted-foreground" /></span>
    <h1 class="mt-6 text-2xl font-semibold tracking-tight">{{ t('accounts.forbidden') }}</h1>
    <p class="mt-3 text-sm leading-6 text-muted-foreground">{{ t('accounts.forbiddenHint') }}</p>
    <Button as-child class="mt-7"><RouterLink :to="auth.homePath"><ArrowLeft class="size-4" />{{ t('notFound.back') }}</RouterLink></Button>
  </section>
</template>

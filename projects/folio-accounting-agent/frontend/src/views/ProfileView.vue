<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { api, readApiError } from '@/api/client'
import ErrorNotice from '@/components/ErrorNotice.vue'
import LocaleSelect from '@/components/LocaleSelect.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAppearanceStore } from '@/stores/appearance'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const appearance = useAppearanceStore()
const router = useRouter()
const currentPassword = ref('')
const newPassword = ref('')
const submitting = ref(false)
const loggingOut = ref(false)
const error = ref<ReturnType<typeof readApiError> | null>(null)
const logoutError = ref<ReturnType<typeof readApiError> | null>(null)
const roleKeys = {
  FIRM_ADMIN: 'home.firmAdmin',
  ACCOUNTANT: 'home.accountant',
  CLIENT_ADMIN: 'home.clientAdmin',
  CLIENT_SUBMITTER: 'home.clientSubmitter',
} as const
const themes = [
  { value: 'evergreen', label: 'appearance.evergreen', color: '#214e3d' },
  { value: 'slate', label: 'appearance.slate', color: '#3f4b5b' },
  { value: 'blue', label: 'appearance.blue', color: '#285b94' },
] as const
const roleLabel = computed(() => {
  const role = auth.user?.firmRole ?? auth.user?.clientMemberships[0]?.role
  return role ? t(roleKeys[role]) : '—'
})

async function changePassword() {
  submitting.value = true
  error.value = null
  try {
    await api.patch('/me/password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    })
    auth.clearSession()
    await router.replace({ name: 'login', query: { passwordChanged: '1' } })
  } catch (caught) {
    error.value = readApiError(caught)
  } finally {
    submitting.value = false
  }
}

async function signOut() {
  loggingOut.value = true
  logoutError.value = null
  try {
    await auth.logout()
    await router.replace('/login')
  } catch (caught) {
    logoutError.value = readApiError(caught)
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <section class="space-y-7">
    <header>
      <h1 class="text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ t('profile.title') }}</h1>
      <p class="mt-2 text-sm text-muted-foreground">{{ t('profile.description') }}</p>
    </header>

    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)]">
      <section class="app-panel overflow-hidden">
        <header class="border-b px-6 py-5">
          <h2 class="text-base font-semibold">{{ t('profile.identity') }}</h2>
        </header>
        <div class="px-6 pt-6">
          <div class="flex items-center gap-3.5">
            <span class="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-primary">
              {{ auth.user?.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase() }}
            </span>
            <p class="break-words text-lg font-semibold tracking-tight">{{ auth.user?.name }}</p>
          </div>
          <dl class="mt-5 divide-y text-sm">
            <div class="py-4">
              <dt class="text-xs text-muted-foreground">{{ t('auth.email') }}</dt>
              <dd class="mt-1.5 break-words">{{ auth.user?.email }}</dd>
            </div>
            <div class="py-4">
              <dt class="text-xs text-muted-foreground">{{ t('profile.firm') }}</dt>
              <dd class="mt-1.5 break-words">{{ auth.user?.firm.name }}</dd>
            </div>
            <div class="py-4">
              <dt class="text-xs text-muted-foreground">{{ t('profile.access') }}</dt>
              <dd class="mt-1.5">{{ roleLabel }}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section class="app-panel overflow-hidden">
        <header class="border-b px-6 py-5">
          <h2 class="text-base font-semibold">{{ t('profile.security') }}</h2>
        </header>
        <form class="space-y-5 p-6" @submit.prevent="changePassword">
          <ErrorNotice v-if="error" v-bind="error" />
          <div class="space-y-2.5">
            <Label for="current-password">{{ t('profile.currentPassword') }}</Label>
            <Input id="current-password" v-model="currentPassword" class="h-11 bg-card" type="password" autocomplete="current-password" required />
          </div>
          <div class="space-y-2.5">
            <Label for="new-password">{{ t('profile.newPassword') }}</Label>
            <Input id="new-password" v-model="newPassword" class="h-11 bg-card" type="password" autocomplete="new-password" aria-describedby="password-hint" minlength="12" required />
            <p id="password-hint" class="text-xs text-muted-foreground">{{ t('profile.passwordHint') }}</p>
          </div>
          <div class="border-t pt-5">
            <Button class="h-10 px-4 hover:bg-primary/90" type="submit" :disabled="submitting">
              {{ submitting ? t('profile.changing') : t('profile.change') }}
            </Button>
          </div>
        </form>
      </section>
    </div>

    <section class="app-panel overflow-hidden" aria-labelledby="preferences-title">
      <header class="border-b px-6 py-5">
        <h2 id="preferences-title" class="text-base font-semibold">{{ t('appearance.title') }}</h2>
        <p class="mt-1.5 text-sm text-muted-foreground">{{ t('profile.languageHint') }}</p>
      </header>
      <div class="divide-y px-6">
        <div class="flex flex-wrap items-center justify-between gap-4 py-5">
          <p class="text-sm font-medium">{{ t('common.language') }}</p>
          <LocaleSelect />
        </div>
        <div class="flex flex-wrap items-center justify-between gap-4 py-5">
          <Label for="theme">{{ t('appearance.theme') }}</Label>
          <Select :model-value="appearance.theme" @update:model-value="appearance.setTheme">
            <SelectTrigger id="theme" class="w-40 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem v-for="theme in themes" :key="theme.value" :value="theme.value">
                <span class="size-3 rounded-full ring-1 ring-black/10" :style="{ backgroundColor: theme.color }" aria-hidden="true" />
                {{ t(theme.label) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-4 py-5">
          <div>
            <Label for="color-mode">{{ t('appearance.mode') }}</Label>
            <p id="mode-hint" class="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">{{ t('appearance.modeHint') }}</p>
          </div>
          <Select :model-value="appearance.mode" @update:model-value="appearance.setMode">
            <SelectTrigger id="color-mode" aria-describedby="mode-hint" class="w-40 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="light">{{ t('appearance.light') }}</SelectItem>
              <SelectItem value="dark">{{ t('appearance.dark') }}</SelectItem>
              <SelectItem value="auto">{{ t('appearance.auto') }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </section>

    <section class="app-panel overflow-hidden">
      <ErrorNotice v-if="logoutError" v-bind="logoutError" class="m-4" />
      <Button type="button" variant="ghost" class="h-12 w-full justify-start rounded-none px-6 text-[15px] text-destructive hover:bg-destructive/5 hover:text-destructive" :disabled="loggingOut" @click="signOut">
        {{ t('auth.signOut') }}
      </Button>
    </section>
  </section>
</template>

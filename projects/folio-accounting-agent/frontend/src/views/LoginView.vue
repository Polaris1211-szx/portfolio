<script setup lang="ts">
import { ref } from 'vue'
import { Eye, EyeOff } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { readApiError } from '@/api/client'
import BrandMark from '@/components/BrandMark.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const email = ref('')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const error = ref<ReturnType<typeof readApiError> | null>(null)

async function submit() {
  submitting.value = true
  error.value = null
  try {
    await auth.login(email.value, password.value)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
    await router.push(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : auth.homePath)
  } catch (caught) {
    error.value = readApiError(caught)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
    <aside class="relative hidden min-h-screen flex-col overflow-hidden bg-sidebar px-12 py-10 text-sidebar-foreground lg:flex xl:px-16">
      <div class="relative z-10 flex items-center gap-3">
        <BrandMark inverted />
        <span class="text-lg font-semibold tracking-[-0.035em]">{{ t('app.name') }}</span>
      </div>

      <div class="relative z-10 my-auto max-w-[380px] py-20">
        <span class="mb-8 block h-px w-10 bg-sidebar-primary/70" aria-hidden="true" />
        <h2 class="text-[40px] leading-[1.16] font-medium tracking-[-0.04em] xl:text-[44px]">
          {{ t('auth.collectionTitle') }}
        </h2>
        <p class="mt-6 max-w-[330px] text-[15px] leading-7 text-sidebar-foreground/70">
          {{ t('auth.collectionDescription') }}
        </p>
      </div>

      <svg class="pointer-events-none absolute right-[-30px] bottom-16 w-[400px] text-sidebar-primary/10" viewBox="0 0 400 220" fill="none" aria-hidden="true">
        <path d="M0 20H400M0 60H400M0 100H400M0 140H400M0 180H400M70 0V220M290 0V220M345 0V220" stroke="currentColor" />
      </svg>
      <p class="relative z-10 text-xs tracking-[0.025em] text-sidebar-foreground/60">{{ t('auth.collectionTypes') }}</p>
    </aside>

    <section class="flex min-h-screen flex-col">
      <header class="flex h-[88px] shrink-0 items-center px-6 sm:px-10 lg:hidden">
        <div class="flex items-center gap-2.5">
          <BrandMark />
          <span class="text-base font-semibold tracking-tight">{{ t('app.name') }}</span>
        </div>
      </header>

      <div class="flex flex-1 items-center px-6 pt-10 pb-24 sm:px-10 lg:pt-0">
        <div class="mx-auto w-full max-w-[380px]">
          <h1 class="text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ t('auth.welcome') }}</h1>
          <p class="mt-3 text-sm leading-6 text-muted-foreground">{{ t('auth.hint') }}</p>

          <p v-if="route.query.passwordChanged" role="status" class="mt-6 rounded-lg border bg-muted p-3 text-sm">
            {{ t('profile.changed') }}
          </p>
          <ErrorNotice v-if="error" v-bind="error" class="mt-6" />

          <form class="mt-8 space-y-5" @submit.prevent="submit">
            <div class="space-y-2">
              <Label for="email" class="text-[13px]">{{ t('auth.email') }}</Label>
              <Input id="email" v-model="email" class="h-11 bg-card px-3" type="email" autocomplete="username" required autofocus />
            </div>
            <div class="space-y-2">
              <Label for="password" class="text-[13px]">{{ t('auth.password') }}</Label>
              <div class="relative">
                <Input
                  id="password"
                  v-model="password"
                  class="h-11 bg-card px-3 pr-11"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  required
                />
                <button
                  type="button"
                  class="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  :aria-label="t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')"
                  :aria-pressed="showPassword"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" class="size-4" />
                  <Eye v-else class="size-4" />
                </button>
              </div>
            </div>
            <Button class="mt-2 h-11 w-full hover:bg-primary/90" type="submit" :disabled="submitting">
              {{ submitting ? t('auth.signingIn') : t('auth.signIn') }}
            </Button>
          </form>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Eye, EyeOff } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { accountsApi } from '@/api/accounts'
import { readApiError } from '@/api/client'
import BrandMark from '@/components/BrandMark.vue'
import ErrorNotice from '@/components/ErrorNotice.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const token = computed(() => new URLSearchParams(route.hash.slice(1)).get('token') ?? '')
const validToken = computed(() => token.value.length >= 32 && token.value.length <= 512)
const name = ref('')
const password = ref('')
const showPassword = ref(false)
const busy = ref(false)
const accepted = ref(false)
const error = ref<ReturnType<typeof readApiError> | null>(null)

async function accept() {
  if (busy.value || accepted.value || !validToken.value) return
  if (!name.value.trim()) {
    error.value = { code: undefined, status: 422, message: '', requestId: undefined }
    return
  }
  busy.value = true
  error.value = null
  try {
    await accountsApi.acceptInvitation({ token: token.value, name: name.value.trim(), password: password.value })
    accepted.value = true
    password.value = ''
    await router.replace({ path: route.path, query: route.query, hash: '' })
  } catch (caught) {
    error.value = readApiError(caught)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
    <aside class="relative hidden min-h-screen flex-col overflow-hidden bg-sidebar px-12 py-10 text-sidebar-foreground lg:flex xl:px-16">
      <div class="relative z-10 flex items-center gap-3"><BrandMark inverted /><span class="text-lg font-semibold tracking-[-0.035em]">{{ t('app.name') }}</span></div>
      <div class="relative z-10 my-auto max-w-[380px] py-20">
        <span class="mb-8 block h-px w-10 bg-sidebar-primary/70" aria-hidden="true" />
        <h2 class="text-[40px] leading-[1.16] font-medium tracking-[-0.04em] xl:text-[44px]">{{ t('auth.collectionTitle') }}</h2>
        <p class="mt-6 max-w-[330px] text-[15px] leading-7 text-sidebar-foreground/70">{{ t('auth.collectionDescription') }}</p>
      </div>
      <p class="relative z-10 text-xs tracking-[0.025em] text-sidebar-foreground/60">{{ t('auth.collectionTypes') }}</p>
    </aside>

    <section class="flex min-h-screen flex-col">
      <header class="flex h-[88px] shrink-0 items-center px-6 sm:px-10 lg:hidden"><div class="flex items-center gap-2.5"><BrandMark /><span class="text-base font-semibold tracking-tight">{{ t('app.name') }}</span></div></header>
      <div class="flex flex-1 items-center px-6 pt-10 pb-24 sm:px-10 lg:pt-0">
        <div class="mx-auto w-full max-w-[380px]">
          <template v-if="accepted">
            <h1 class="text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ t('people.acceptedTitle') }}</h1>
            <p class="mt-3 text-sm leading-6 text-muted-foreground" role="status">{{ t(auth.isAuthenticated ? 'people.acceptedSignedInHint' : 'people.acceptedHint') }}</p>
            <Button as-child class="mt-8 h-11 w-full"><RouterLink :to="auth.isAuthenticated ? auth.homePath : '/login'">{{ t(auth.isAuthenticated ? 'notFound.back' : 'auth.signIn') }}</RouterLink></Button>
          </template>
          <template v-else>
            <h1 class="text-[32px] leading-tight font-semibold tracking-[-0.025em]">{{ t('people.acceptTitle') }}</h1>
            <p class="mt-3 text-sm leading-6 text-muted-foreground">{{ t('people.acceptHint') }}</p>
            <ErrorNotice v-if="!validToken" code="INVITATION_INVALID" message="" class="mt-6" />
            <ErrorNotice v-else-if="error" v-bind="error" class="mt-6" />
            <form v-if="validToken" class="mt-8 space-y-5" @submit.prevent="accept">
              <div class="space-y-2">
                <Label for="invitation-name">{{ t('profile.name') }}</Label>
                <Input id="invitation-name" v-model="name" class="h-11 bg-card" autocomplete="name" minlength="1" maxlength="200" required :disabled="busy" />
              </div>
              <div class="space-y-2">
                <Label for="invitation-password">{{ t('auth.password') }}</Label>
                <div class="relative">
                  <Input id="invitation-password" v-model="password" class="h-11 bg-card pr-11" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" minlength="12" maxlength="128" required aria-describedby="invitation-password-hint" :disabled="busy" />
                  <button type="button" class="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" :aria-label="t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')" :aria-pressed="showPassword" @click="showPassword = !showPassword">
                    <EyeOff v-if="showPassword" class="size-4" /><Eye v-else class="size-4" />
                  </button>
                </div>
                <p id="invitation-password-hint" class="text-xs leading-5 text-muted-foreground">{{ t('people.acceptPasswordHint') }}</p>
              </div>
              <Button type="submit" class="mt-2 h-11 w-full" :disabled="busy">{{ t(busy ? 'people.accepting' : 'people.acceptInvitation') }}</Button>
            </form>
            <p v-else class="mt-5 text-sm leading-6 text-muted-foreground">{{ t('people.askForNewInvitation') }}</p>
            <RouterLink :to="auth.isAuthenticated ? auth.homePath : '/login'" class="mt-6 inline-block text-sm text-primary underline-offset-4 hover:underline">{{ t(auth.isAuthenticated ? 'notFound.back' : 'auth.signIn') }}</RouterLink>
          </template>
        </div>
      </div>
    </section>
  </main>
</template>

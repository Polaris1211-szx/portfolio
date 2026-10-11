<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()
const route = useRoute()
const withinWorkspace = computed(() => route.matched.some((record) => record.meta.requiresAuth))
</script>

<template>
  <div :class="withinWorkspace ? '' : 'min-h-screen bg-background'">
    <header v-if="!withinWorkspace" class="flex h-[88px] items-center border-b bg-card px-6 sm:px-10">
      <RouterLink :to="auth.isAuthenticated ? auth.homePath : '/login'" class="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <BrandMark />
        <span class="text-base font-semibold tracking-tight">{{ t('app.name') }}</span>
      </RouterLink>
    </header>

    <section :class="['flex items-center justify-center py-12 sm:py-16', withinWorkspace ? 'min-h-[65vh]' : 'min-h-[calc(100vh-88px)] px-6']">
      <div class="app-panel w-full max-w-[780px] overflow-hidden">
        <div class="grid items-center gap-5 px-6 pt-8 pb-10 sm:gap-8 sm:p-10 md:grid-cols-[180px_1fr] md:px-12 md:py-14">
          <svg class="mx-auto w-[150px] sm:w-[180px]" viewBox="0 0 180 200" fill="none" aria-hidden="true">
            <ellipse cx="86" cy="184" rx="64" ry="6" fill="var(--muted)" />
            <path d="M65 17H135L157 39V157C157 161.418 153.418 165 149 165H65C60.5817 165 57 161.418 57 157V25C57 20.5817 60.5817 17 65 17Z" fill="var(--muted)" stroke="var(--border)" stroke-width="1.5" />
            <path d="M39 35H109L131 57V169C131 173.418 127.418 177 123 177H39C34.5817 177 31 173.418 31 169V43C31 38.5817 34.5817 35 39 35Z" fill="var(--card)" stroke="var(--ring)" stroke-width="1.5" />
            <path d="M109 35V53C109 55.2091 110.791 57 113 57H131" stroke="var(--ring)" stroke-width="1.5" />
            <path d="M49 68H76M49 141H111M49 151H92" stroke="var(--border)" stroke-width="2" stroke-linecap="round" />
            <text x="80" y="117" text-anchor="middle" fill="var(--primary)" font-size="34" font-weight="500" font-family="inherit" letter-spacing="-1.5">404</text>
          </svg>

          <div class="text-center md:text-left">
            <h1 class="text-[26px] leading-tight font-semibold tracking-[-0.035em]">{{ t('notFound.title') }}</h1>
            <p class="mt-4 text-sm leading-6 text-muted-foreground">
              {{ t(auth.isAuthenticated ? 'notFound.description' : 'notFound.guestDescription') }}
            </p>
            <Button as-child class="mt-7 h-10 gap-2 px-4 hover:bg-primary/90">
              <RouterLink :to="auth.isAuthenticated ? auth.homePath : '/login'">
                {{ t(auth.isAuthenticated ? 'notFound.back' : 'auth.signIn') }}
                <ArrowRight class="size-4" />
              </RouterLink>
            </Button>
          </div>
        </div>
        <p class="border-t bg-muted/40 px-6 py-4 text-center text-xs leading-5 text-muted-foreground sm:px-10 md:text-left">
          {{ t('notFound.help') }}
        </p>
      </div>
    </section>
  </div>
</template>

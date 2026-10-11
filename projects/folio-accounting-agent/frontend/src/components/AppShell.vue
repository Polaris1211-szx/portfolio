<script setup lang="ts">
import { computed } from 'vue'
import { Bell, Building2, BriefcaseBusiness, ClipboardList, ContactRound, UsersRound, UserRound } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import NotificationCenter from '@/components/NotificationCenter.vue'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{ area: 'staff' | 'client' }>()
const auth = useAuthStore()
const route = useRoute()
const { t } = useI18n()
const homePath = computed(() => `/${props.area}`)
const profilePath = computed(() => `/${props.area}/profile`)
const navigation = computed(() => [
  { path: homePath.value, title: 'nav.workspace', icon: Building2 },
  ...(auth.isStaff ? [{ path: '/staff/collections', title: 'collections.title', icon: ClipboardList }] : []),
  ...(!auth.isStaff ? [{ path: '/client/collections', title: 'portal.title', icon: ClipboardList }] : []),
  ...(auth.isStaff ? [{ path: '/staff/clients', title: 'accounts.clients', icon: BriefcaseBusiness }] : []),
  ...(auth.user?.firmRole === 'FIRM_ADMIN' ? [{ path: '/staff/admin/users', title: 'accounts.employees', icon: UsersRound }] : []),
  ...(!auth.isStaff && auth.user?.clientMemberships.some(member => member.role === 'CLIENT_ADMIN') ? [{ path: '/client/contacts', title: 'accounts.contacts', icon: ContactRound }] : []),
])
const mobileNavigation = computed(() => [...navigation.value, { path: profilePath.value, title: 'nav.profile', icon: UserRound }])
const active = (path: string) => path === homePath.value ? route.path === path : route.path === path || route.path.startsWith(`${path}/`)
const initials = computed(() => auth.user?.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase() ?? '')
</script>

<template>
  <div class="app-canvas min-h-screen text-foreground">
    <div class="fixed top-4 right-4 z-40 lg:top-4 lg:right-auto lg:left-[208px]">
      <NotificationCenter :area="area" />
    </div>
    <aside class="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex">
      <RouterLink :to="homePath" class="flex h-[72px] items-center gap-3 px-6">
        <BrandMark />
        <span class="text-base font-semibold tracking-tight">{{ t('app.name') }}</span>
      </RouterLink>

      <div class="px-6 pt-4 pb-5">
        <p class="mb-1 text-xs text-muted-foreground">{{ t('home.firm') }}</p>
        <p class="truncate text-sm font-medium" :title="auth.user?.firm.name">{{ auth.user?.firm.name }}</p>
      </div>
      <nav class="flex-1 space-y-1 px-3 py-3" :aria-label="t('nav.primary')">
        <RouterLink
          v-for="item in navigation"
          :key="item.path"
          :to="item.path"
          class="flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-muted-foreground transition-colors hover:bg-foreground/[0.055] hover:text-foreground"
          :class="active(item.path) ? '!bg-foreground/[0.09] !font-medium !text-foreground' : ''"
          :aria-current="active(item.path) ? 'page' : undefined"
        >
          <component :is="item.icon" class="size-[18px]" />{{ t(item.title) }}
        </RouterLink>
      </nav>

      <RouterLink :to="`/${area}/notifications`" class="mx-3 mb-3 flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-muted-foreground hover:bg-foreground/[0.055]" :class="active(`/${area}/notifications`) ? '!bg-foreground/[0.09] !font-medium !text-foreground' : ''" :aria-current="active(`/${area}/notifications`) ? 'page' : undefined">
        <Bell class="size-[18px]" />{{ t('notifications.title') }}
      </RouterLink>
      <div class="mx-3 mb-3 border-t pt-3">
        <RouterLink :to="profilePath" class="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-foreground/[0.055]" :aria-current="active(profilePath) ? 'page' : undefined">
          <span class="grid size-9 shrink-0 place-items-center rounded-full bg-foreground/[0.08] text-xs font-medium">{{ initials }}</span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-[13px] font-medium">{{ auth.user?.name }}</p>
            <p class="mt-0.5 truncate text-[11px] text-muted-foreground">{{ auth.user?.email }}</p>
          </div>
        </RouterLink>
      </div>
    </aside>

    <div class="lg:pl-64">
      <main class="min-h-screen px-5 pt-8 pb-28 sm:px-8 lg:px-10 lg:py-12">
        <div class="mx-auto max-w-[1440px]">
          <RouterView />
        </div>
      </main>

      <nav class="app-tabbar app-glass fixed right-3 bottom-3 left-3 z-30 flex min-h-16 items-center justify-around rounded-[24px] px-2 pb-[env(safe-area-inset-bottom)] lg:hidden" :aria-label="t('nav.primary')">
        <RouterLink v-for="item in mobileNavigation" :key="item.path" :to="item.path" class="flex min-w-16 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-medium text-muted-foreground" :class="active(item.path) ? '!text-primary' : ''" :aria-current="active(item.path) ? 'page' : undefined">
          <span class="grid size-7 place-items-center rounded-full" :class="active(item.path) ? 'bg-primary/12' : ''"><component :is="item.icon" class="size-[18px]" /></span>
          {{ t(item.title) }}
        </RouterLink>
      </nav>
    </div>
  </div>
</template>

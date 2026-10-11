<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

watch(() => auth.sessionExpired, (expired) => {
  if (expired && route.meta.requiresAuth) {
    void router.replace({ name: 'login', query: { redirect: route.fullPath } })
  }
})
</script>

<template>
  <RouterView v-if="!route.meta.requiresAuth || auth.isAuthenticated" />
</template>

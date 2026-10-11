<script setup lang="ts">
defineProps<{ inverted?: boolean }>()
</script>

<template>
  <span
    class="grid size-8 shrink-0 place-items-center rounded-[9px] shadow-sm"
    :class="inverted ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'bg-primary text-primary-foreground'"
    aria-hidden="true"
  >
    <svg viewBox="0 0 32 32" class="size-7" fill="currentColor">
      <path d="M8 8a2 2 0 0 1 2-2h2v17l-4 3V8Z" />
      <path d="M14 6h12l-3.4 4.2a2 2 0 0 1-1.6.8h-7V6Z" />
      <path d="M14 14h9l-3.4 4.2a2 2 0 0 1-1.6.8h-4v-5Z" opacity=".7" />
    </svg>
  </span>
</template>

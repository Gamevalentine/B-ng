<script setup lang="ts">
/**
 * Transitional status display for draft GitHub compatibility builds.
 * This deliberately does NOT create another microphone host or change
 * BÔNG's existing Sherpa B2 capture logic. Restore the native Windows
 * hearing indicator after exact source parity is available.
 */
import { storeToRefs } from 'pinia'
import { useHearingStore } from '../../../stores/modules/hearing'

defineProps<{ align?: 'start' | 'center' }>()
const { error } = storeToRefs(useHearingStore())
</script>

<template>
  <div
    v-if="error"
    role="status"
    aria-live="polite"
    :class="['rounded-lg bg-red-500/10 p-2 text-xs text-red-500', align === 'center' && 'text-center']"
  >
    {{ error }}
  </div>
</template>

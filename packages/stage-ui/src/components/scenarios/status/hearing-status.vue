<script setup lang="ts">
/**
 * Temporary indicator for draft CI compatibility.
 * Reads the existing BÔNG hearing configuration only. This does not create
 * a microphone host, enable capture, or modify Sherpa B2. The real Windows
 * indicator must be synchronized from the original source before release.
 */
import { storeToRefs } from 'pinia'
import { useHearingStore } from '../../../stores/modules/hearing'

defineProps<{ align?: 'start' | 'center' }>()
const { configured } = storeToRefs(useHearingStore())
</script>

<template>
  <div
    v-if="!configured"
    role="status"
    :class="['rounded-lg bg-amber-500/10 p-2 text-xs text-amber-600', align === 'center' && 'text-center']"
  >
    Chưa cấu hình nhận diện tiếng nói.
  </div>
</template>

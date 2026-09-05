<script setup lang="ts">
import type { OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button, FieldInput, ScrollableArea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'

import { useSpeechStore } from '../../../../stores/modules/speech'
import { useProviderStore } from '../../../../stores/providers/provider'

const props = defineProps<{
  onNext: OnboardingStepNextHandler
  onPrevious: OnboardingStepPrevHandler
}>()

const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const {
  activeSpeechProvider,
  activeSpeechModel,
  activeSpeechVoiceId,
  providerModels,
  isLoadingSpeechProviderVoices,
  speechProviderError,
} = storeToRefs(speechStore)

const loading = ref(false)
const voices = computed(() => speechStore.getVoicesForProvider(activeSpeechProvider.value))
const usesManualVoice = computed(() => activeSpeechProvider.value === 'openai-compatible-audio-speech')
const canProceed = computed(() => Boolean(activeSpeechProvider.value && activeSpeechModel.value && activeSpeechVoiceId.value))

async function refreshVoices() {
  if (!activeSpeechProvider.value || !activeSpeechModel.value)
    return

  await speechStore.loadVoicesForProvider(activeSpeechProvider.value, activeSpeechModel.value)

  if (!activeSpeechVoiceId.value && voices.value.length > 0)
    activeSpeechVoiceId.value = voices.value[0].id
}

async function initializeVoiceStep() {
  if (!activeSpeechProvider.value || activeSpeechProvider.value === 'speech-noop')
    return

  loading.value = true
  try {
    await providersStore.initializeProvider(activeSpeechProvider.value)
    await providersStore.fetchModelsForProvider(activeSpeechProvider.value)

    if (!activeSpeechModel.value) {
      activeSpeechModel.value = providersStore.getDefaultModelForProvider(activeSpeechProvider.value)
        ?? providerModels.value[0]?.id
        ?? ''
    }

    speechStore.ensureActiveSpeechModel()
    await refreshVoices()
  }
  finally {
    loading.value = false
  }
}

watch(activeSpeechModel, async (next, previous) => {
  if (!next || next === previous)
    return

  activeSpeechVoiceId.value = ''
  await refreshVoices()
})

onMounted(initializeVoiceStep)
</script>

<template>
  <div class="min-h-0 flex min-w-0 flex-1 flex-col gap-4">
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="props.onPrevious">
        <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        Choose AIRI's voice
      </h2>
      <div h-5 w-5 />
    </div>

    <ScrollableArea class="min-h-0 flex-1">
      <div class="space-y-4">
        <div v-if="providerModels.length > 1" class="space-y-2">
          <div class="text-sm text-neutral-600 font-medium dark:text-neutral-300">
            Voice model
          </div>
          <select
            v-model="activeSpeechModel"
            class="w-full border border-neutral-200 rounded-xl bg-white px-3 py-2.5 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option v-for="model in providerModels" :key="model.id" :value="model.id">
              {{ model.name || model.id }}
            </option>
          </select>
        </div>

        <FieldInput
          v-if="usesManualVoice"
          v-model="activeSpeechVoiceId"
          label="Voice"
          description="Enter the voice ID supported by your OpenAI-compatible TTS service."
          placeholder="alloy"
        />

        <div v-else class="space-y-2">
          <div class="text-sm text-neutral-600 font-medium dark:text-neutral-300">
            Voice
          </div>
          <div v-if="voices.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <button
              v-for="voice in voices"
              :key="voice.id"
              type="button"
              class="border rounded-xl px-3 py-3 text-left transition"
              :class="activeSpeechVoiceId === voice.id
                ? 'border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-900/20'
                : 'border-neutral-200 bg-white hover:border-primary-300 dark:border-neutral-700 dark:bg-neutral-900'"
              @click="activeSpeechVoiceId = voice.id"
            >
              <div class="truncate text-sm font-medium">
                {{ voice.name || voice.id }}
              </div>
              <div class="mt-1 truncate text-xs text-neutral-500">
                {{ voice.id }}
              </div>
            </button>
          </div>
          <div v-else-if="!loading && !isLoadingSpeechProviderVoices" class="rounded-xl bg-neutral-100 p-4 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            No voices were returned by this provider.
          </div>
        </div>

        <div v-if="speechProviderError" class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
          {{ speechProviderError }}
        </div>
      </div>
    </ScrollableArea>

    <Button
      class="w-full flex-shrink-0"
      label="Continue"
      :loading="loading || isLoadingSpeechProviderVoices"
      :disabled="!canProceed"
      @click="props.onNext"
    />
  </div>
</template>

<script setup lang="ts">
import type { OnboardingStepNextHandler, OnboardingStepPrevHandler } from './types'

import { Button, ScrollableArea } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'

import { DisplayModelFormat, useDisplayModelsStore } from '../../../../stores/display-models'
import { useSettingsStageModel } from '../../../../stores/settings/stage-model'

const props = defineProps<{
  onNext: OnboardingStepNextHandler
  onPrevious: OnboardingStepPrevHandler
}>()

const displayModelsStore = useDisplayModelsStore()
const stageModelStore = useSettingsStageModel()
const { displayModels } = storeToRefs(displayModelsStore)
const { stageModelSelected } = storeToRefs(stageModelStore)
const loading = ref(false)

const quickModels = computed(() => displayModels.value.filter(model =>
  model.format === DisplayModelFormat.Live2dZip || model.format === DisplayModelFormat.VRM,
))

async function finish() {
  loading.value = true
  try {
    await stageModelStore.updateStageModel()
    await props.onNext()
  }
  finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (displayModels.value.length === 0)
    await displayModelsStore.loadDisplayModelsFromIndexedDB()
})
</script>

<template>
  <div class="min-h-0 flex min-w-0 flex-1 flex-col gap-4">
    <div sticky top-0 z-100 flex flex-shrink-0 items-center gap-2>
      <button outline-none @click="props.onPrevious">
        <div i-solar:alt-arrow-left-line-duotone h-5 w-5 />
      </button>
      <h2 class="flex-1 text-center text-xl text-neutral-800 font-semibold md:text-left md:text-2xl dark:text-neutral-100">
        Choose your character
      </h2>
      <div h-5 w-5 />
    </div>

    <ScrollableArea class="min-h-0 flex-1">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          v-for="model in quickModels"
          :key="model.id"
          type="button"
          class="overflow-hidden border rounded-2xl bg-white text-left transition dark:bg-neutral-900"
          :class="stageModelSelected === model.id
            ? 'border-primary-500 ring-2 ring-primary-500/20 dark:border-primary-400'
            : 'border-neutral-200 hover:border-primary-300 dark:border-neutral-700'"
          @click="stageModelSelected = model.id"
        >
          <div class="aspect-square w-full bg-neutral-100 dark:bg-neutral-800">
            <img
              v-if="model.previewImage"
              :src="model.previewImage"
              :alt="model.name"
              class="h-full w-full object-cover"
            >
            <div v-else class="h-full w-full flex items-center justify-center text-3xl text-neutral-400">
              <div i-solar:user-rounded-bold-duotone />
            </div>
          </div>
          <div class="p-3">
            <div class="truncate text-sm font-medium">
              {{ model.name }}
            </div>
            <div class="mt-1 text-xs text-neutral-500">
              {{ model.format === DisplayModelFormat.VRM ? '3D / VRM' : '2D / Live2D' }}
            </div>
          </div>
        </button>
      </div>
    </ScrollableArea>

    <Button
      class="w-full flex-shrink-0"
      label="Start chatting"
      :loading="loading"
      :disabled="!stageModelSelected"
      @click="finish"
    />
  </div>
</template>

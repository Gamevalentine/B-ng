<script setup lang="ts">
import type { ProviderMode } from '../../../../composables/use-analytics'
import type { ProviderMetadata } from '../../../../libs/providers/metadata'
import type {
  OnboardingStep,
  OnboardingStepGuard,
  OnboardingStepNextHandler,
  OnboardingStepPrevHandler,
  ProviderConfigData,
} from './types'

import { isCustomProvidersDisabled } from '@proj-airi/stage-shared'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, ref } from 'vue'

import StepCharacterSelection from './step-character-selection.vue'
import StepModelSelection from './step-model-selection.vue'
import StepProviderConfiguration from './step-provider-configuration.vue'
import StepProviderSelection from './step-provider-selection.vue'
import StepVoiceSelection from './step-voice-selection.vue'
import StepWelcome from './step-welcome.vue'

import { useAnalytics } from '../../../../composables/use-analytics'
import { useConsciousnessStore } from '../../../../stores/modules/consciousness'
import { useSpeechStore } from '../../../../stores/modules/speech'
import { useProviderConfigStore } from '../../../../stores/providers/config'
import { useProviderStore } from '../../../../stores/providers/provider'

interface Emits {
  (e: 'configured'): void
  (e: 'skipped'): void
}

const props = withDefaults(defineProps<{
  extraSteps?: OnboardingStep[]
}>(), {
  extraSteps: () => [],
})
const emit = defineEmits<Emits>()
const step = ref(0)
const direction = ref<'next' | 'previous'>('next')
const pendingProviderConfig = ref<ProviderConfigData | null>(null)
const pendingSpeechProviderConfig = ref<ProviderConfigData | null>(null)
const { trackOnboardingCompleted, trackOnboardingStarted, trackOnboardingStepCompleted } = useAnalytics()

const providersStore = useProviderStore()
const providerConfigStore = useProviderConfigStore()
const speechStore = useSpeechStore()
const consciousnessStore = useConsciousnessStore()

const { allChatProvidersMetadata, allAudioSpeechProvidersMetadata } = storeToRefs(providersStore)
const { activeProvider } = storeToRefs(consciousnessStore)
const { activeSpeechProvider } = storeToRefs(speechStore)

const popularProviders = computed(() => {
  const popular = ['openai', 'azure-openai', 'anthropic', 'amazon-bedrock', 'google-generative-ai', 'groq', 'nvidia', 'openrouter-ai', 'ollama', 'deepseek', 'player2', 'openai-compatible']
  return allChatProvidersMetadata.value
    .filter(provider => popular.includes(provider.id))
    .sort((a, b) => popular.indexOf(a.id) - popular.indexOf(b.id))
})

const popularSpeechProviders = computed(() => {
  const popular = ['openai-audio-speech', 'google-gemini-audio-speech', 'elevenlabs', 'openrouter-audio-speech', 'minimax-speech']
  return allAudioSpeechProvidersMetadata.value
    .filter(provider => popular.includes(provider.id))
    .sort((a, b) => popular.indexOf(a.id) - popular.indexOf(b.id))
})

const selectedProviderId = ref('')
const selectedSpeechProviderId = ref('')
const speechAutoConfigured = ref(false)

const selectedProvider = computed(() => {
  return allChatProvidersMetadata.value.find(p => p.id === selectedProviderId.value) || null
})

const selectedSpeechProvider = computed(() => {
  return allAudioSpeechProvidersMetadata.value.find(p => p.id === selectedSpeechProviderId.value) || null
})

const selectedProviderType = computed<ProviderMode>(() => {
  if (!selectedProviderId.value)
    return 'unknown'
  return selectedProviderId.value.startsWith('official-provider') ? 'official' : 'custom'
})

function selectProvider(provider: ProviderMetadata) {
  selectedProviderId.value = provider.id
  speechAutoConfigured.value = false
  selectedSpeechProviderId.value = ''
}

function selectSpeechProvider(provider: ProviderMetadata) {
  selectedSpeechProviderId.value = provider.id
}

function toProviderConfig(data: ProviderConfigData) {
  const config: Record<string, unknown> = {}

  if (data.apiKey)
    config.apiKey = data.apiKey.trim()
  if (data.baseUrl)
    config.baseUrl = data.baseUrl.trim()
  if (data.accountId)
    config.accountId = data.accountId.trim()
  if (data.customFields) {
    for (const [key, value] of Object.entries(data.customFields)) {
      if (value)
        config[key] = value.trim()
    }
  }

  return config
}

async function persistProviderConfiguration(providerId: string, config: Record<string, unknown>) {
  providerConfigStore.ensureProvider(providerId, providerId, config)
  await providerConfigStore.updateProviderConfig(providerId, config, 'configured')
  providerConfigStore.markProviderAdded(providerId)
  await providersStore.initializeProvider(providerId)
}

async function prepareSpeechFromChatProvider(providerId: string, config: Record<string, unknown>) {
  speechAutoConfigured.value = false

  // OpenAI chat and OpenAI TTS use the same API key/base URL, so fresh installs
  // can go straight from model selection to voice selection without asking for
  // the same credentials twice.
  if (providerId !== 'openai')
    return

  const speechProviderId = 'openai-audio-speech'
  await persistProviderConfiguration(speechProviderId, config)

  selectedSpeechProviderId.value = speechProviderId
  activeSpeechProvider.value = speechProviderId
  await providersStore.fetchModelsForProvider(speechProviderId)
  speechAutoConfigured.value = true
}

async function saveProviderConfiguration(data: ProviderConfigData) {
  if (!selectedProvider.value)
    return

  const config = toProviderConfig(data)
  await persistProviderConfiguration(selectedProvider.value.id, config)
  activeProvider.value = selectedProvider.value.id

  await nextTick()

  try {
    await consciousnessStore.loadModelsForProvider(selectedProvider.value.id)
  }
  catch (err) {
    console.error('[onboarding] Failed to load models for provider:', err)
  }

  try {
    await prepareSpeechFromChatProvider(selectedProvider.value.id, config)
  }
  catch (err) {
    console.error('[onboarding] Failed to prepare speech provider:', err)
    speechAutoConfigured.value = false
  }
}

async function saveSpeechProviderConfiguration(data: ProviderConfigData) {
  if (!selectedSpeechProvider.value)
    return

  const config = toProviderConfig(data)
  await persistProviderConfiguration(selectedSpeechProvider.value.id, config)

  activeSpeechProvider.value = selectedSpeechProvider.value.id
  await nextTick()
  await providersStore.fetchModelsForProvider(selectedSpeechProvider.value.id)
}

const requestPreviousStep: OnboardingStepPrevHandler = () => navigatePrevious()

const requestNextStep: OnboardingStepNextHandler = async (configData?: ProviderConfigData) => {
  if (configData) {
    if (currentStep.value?.id === 'speech-provider-configuration')
      pendingSpeechProviderConfig.value = configData
    else
      pendingProviderConfig.value = configData
  }

  await navigateNext()
}

const allSteps = computed<OnboardingStep[]>(() => {
  const coreSteps: OnboardingStep[] = [
    {
      id: 'welcome',
      component: StepWelcome,
      props: () => ({
        customProviderSetupEnabled: !isCustomProvidersDisabled(),
      }),
    },
    {
      id: 'provider-selection',
      component: StepProviderSelection,
      props: () => ({
        selectedProviderId: selectedProviderId.value,
        popularProviders: popularProviders.value,
        onSelectProvider: selectProvider,
      }),
    },
    {
      id: 'provider-configuration',
      component: StepProviderConfiguration,
      props: () => ({
        selectedProviderId: selectedProviderId.value,
        selectedProvider: selectedProvider.value,
      }),
      beforeNext: async () => {
        if (!pendingProviderConfig.value)
          return false

        await saveProviderConfiguration(pendingProviderConfig.value)
        pendingProviderConfig.value = null
        return true
      },
    },
    ...props.extraSteps.map(extraStep => ({
      ...extraStep,
      props: () => ({
        ...extraStep.props?.(),
      }),
    })),
    {
      id: 'model-selection',
      component: StepModelSelection,
    },
  ]

  if (!speechAutoConfigured.value) {
    coreSteps.push(
      {
        id: 'speech-provider-selection',
        component: StepProviderSelection,
        props: () => ({
          selectedProviderId: selectedSpeechProviderId.value,
          popularProviders: popularSpeechProviders.value,
          onSelectProvider: selectSpeechProvider,
        }),
      },
      {
        id: 'speech-provider-configuration',
        component: StepProviderConfiguration,
        props: () => ({
          selectedProviderId: selectedSpeechProviderId.value,
          selectedProvider: selectedSpeechProvider.value,
        }),
        beforeNext: async () => {
          if (!pendingSpeechProviderConfig.value)
            return false

          await saveSpeechProviderConfiguration(pendingSpeechProviderConfig.value)
          pendingSpeechProviderConfig.value = null
          return true
        },
      },
    )
  }

  coreSteps.push(
    {
      id: 'voice-selection',
      component: StepVoiceSelection,
    },
    {
      id: 'character-selection',
      component: StepCharacterSelection,
    },
  )

  return coreSteps
})

const currentStep = computed(() => allSteps.value[step.value] ?? null)
const isLastStep = computed(() => step.value === allSteps.value.length - 1)
const currentStepProps = computed(() => currentStep.value?.props?.() ?? {})

async function handleSave() {
  trackOnboardingStepCompleted(currentStep.value?.id ?? 'unknown')
  trackOnboardingCompleted({
    selected_provider_type: selectedProviderType.value,
    selected_provider_id: selectedProviderId.value || undefined,
    selected_use_case: 'unknown',
  })
  emit('configured')
}

async function canPassGuard(guard?: OnboardingStepGuard) {
  if (!guard)
    return true

  return await guard()
}

async function navigateNext() {
  if (!currentStep.value)
    return

  if (!(await canPassGuard(currentStep.value.beforeNext)))
    return

  if (isLastStep.value) {
    await handleSave()
    return
  }

  trackOnboardingStepCompleted(currentStep.value.id)
  direction.value = 'next'
  step.value++
}

async function navigatePrevious() {
  if (!currentStep.value || step.value <= 0)
    return

  if (!(await canPassGuard(currentStep.value.beforePrev)))
    return

  direction.value = 'previous'
  step.value--
}

onMounted(() => {
  trackOnboardingStarted({ entry: 'app_start' })
})
</script>

<template>
  <div class="onboarding-step-container" min-h-0 flex flex-1 flex-col>
    <Transition :name="direction === 'next' ? 'slide-next' : 'slide-prev'" mode="out-in">
      <component
        :is="currentStep.component"
        v-if="currentStep"
        :key="currentStep.id"
        class="flex flex-1 flex-col"
        v-bind="currentStepProps"
        :on-next="requestNextStep"
        :on-previous="requestPreviousStep"
      />
    </Transition>
  </div>
</template>

<style scoped>
.slide-next-enter-active,
.slide-next-leave-active,
.slide-prev-enter-active,
.slide-prev-leave-active {
  will-change: transform, opacity;
}

.slide-next-enter-active {
  animation: onboarding-slide-next-in 0.2s ease-in-out both;
}

.slide-next-leave-active {
  animation: onboarding-slide-next-out 0.2s ease-in-out both;
}

.slide-prev-enter-active {
  animation: onboarding-slide-prev-in 0.2s ease-in-out both;
}

.slide-prev-leave-active {
  animation: onboarding-slide-prev-out 0.2s ease-in-out both;
}

@keyframes onboarding-slide-next-in {
  from {
    transform: translateX(2rem);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes onboarding-slide-next-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }

  to {
    transform: translateX(-2rem);
    opacity: 0;
  }
}

@keyframes onboarding-slide-prev-in {
  from {
    transform: translateX(-2rem);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes onboarding-slide-prev-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }

  to {
    transform: translateX(2rem);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .slide-next-enter-active,
  .slide-next-leave-active,
  .slide-prev-enter-active,
  .slide-prev-leave-active {
    animation-duration: 1ms;
  }
}
</style>

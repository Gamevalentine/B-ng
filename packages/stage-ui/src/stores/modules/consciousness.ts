import type {} from 'pinia-plugin-synced'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { refManualReset } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { useProviderConfigStore } from '../providers/config'
import { useProviderStore } from '../providers/provider'
import { useConsciousnessSettingsStore } from './consciousness-settings'

export const useConsciousnessStore = defineStore('consciousness', () => {
  const providersStore = useProviderStore()
  const providerConfigStore = useProviderConfigStore()
  const settingsStore = useConsciousnessSettingsStore()

  // Pinia synchronization owns live cross-window state. localStorage remains
  // durable persistence, but storage events must not reflect state back into
  // the store and publish another synchronized snapshot.
  const persistenceOptions = { listenToStorageChanges: false }

  // State
  const activeProvider = useLocalStorageManualReset<string>('settings/consciousness/active-provider', '', persistenceOptions)
  const activeModel = useLocalStorageManualReset<string>('settings/consciousness/active-model', '', persistenceOptions)
  const activeCustomModelName = useLocalStorageManualReset<string>('settings/consciousness/active-custom-model', '', persistenceOptions)
  const expandedDescriptions = refManualReset<Record<string, boolean>>(() => ({}))
  const modelSearchQuery = refManualReset<string>('')

  // Computed properties
  const supportsModelListing = computed(() => {
    return providersStore.supportsModelListing(activeProvider.value)
  })

  const providerModels = computed(() => {
    return providersStore.getModelsForProvider(activeProvider.value)
  })

  const isLoadingActiveProviderModels = computed(() => {
    return providersStore.isLoadingModels[activeProvider.value] || false
  })

  const activeProviderModelError = computed(() => {
    return providersStore.modelLoadError[activeProvider.value] || null
  })

  const filteredModels = computed(() => {
    if (!modelSearchQuery.value.trim()) {
      return providerModels.value
    }

    const query = modelSearchQuery.value.toLowerCase().trim()
    return providerModels.value.filter(model =>
      model.name.toLowerCase().includes(query)
      || model.id.toLowerCase().includes(query)
      || (model.description && model.description.toLowerCase().includes(query)),
    )
  })

  const configuredZaiProviderId = computed(() => {
    return Object.values(providerConfigStore.providers)
      .find(provider => provider.definitionId === 'zai' && provider.status === 'configured')
      ?.id ?? ''
  })

  function resetModelSelection() {
    activeModel.reset()
    activeCustomModelName.reset()
    expandedDescriptions.reset()
    modelSearchQuery.reset()
  }

  // A model id belongs to the catalog of the provider it was picked from, so
  // clear the selection whenever the provider changes. This used to live only
  // in the consciousness settings page, so provider changes made elsewhere
  // (onboarding, character cards, provider deletion) kept the previous
  // provider's model and chat requests failed upstream with model_not_found.
  //
  // The watcher is synchronous on purpose: call sites assign the provider
  // first and a new model right after, so a
  // deferred reset would wipe the model they just chose. Synchronous flush
  // makes "set provider, then set model" a safe, ordered operation.
  //
  // Issue #1761: https://github.com/moeru-ai/airi/issues/1761
  watch(activeProvider, (provider, oldProvider) => {
    if (provider === oldProvider)
      return

    activeModel.value = ''
    activeCustomModelName.value = ''
  }, { flush: 'sync' })

  async function loadModelsForProvider(provider: string) {
    if (providersStore.supportsModelListing(provider)) {
      await providersStore.fetchModelsForProvider(provider)
    }
  }

  async function getModelsForProvider(provider: string) {
    if (providersStore.supportsModelListing(provider)) {
      return providersStore.getModelsForProvider(provider)
    }

    return []
  }

  async function resolveModelForProvider(providerId: string) {
    const configuredModel = providerConfigStore.getProviderConfig(providerId)?.model
    if (typeof configuredModel === 'string' && configuredModel.trim())
      return configuredModel.trim()

    await loadModelsForProvider(providerId)

    return providersStore.getDefaultModelForProvider(providerId)
      ?? providersStore.getModelsForProvider(providerId)[0]?.id
      ?? ''
  }

  async function activateProvider(providerId: string) {
    const model = await resolveModelForProvider(providerId)
    if (!model)
      return false

    activeProvider.value = providerId
    activeModel.value = model
    return true
  }

  // Prefer a configured Z.ai provider over the authenticated AIRI Cloud
  // provider. This keeps chat independent from Flux once a Z.ai API key is
  // configured, while still respecting any other custom provider explicitly
  // selected by the user.
  watch(configuredZaiProviderId, (zaiProviderId) => {
    if (!zaiProviderId)
      return

    const current = providerConfigStore.getProvider(activeProvider.value)
    if (current?.definitionId === 'zai' && current.status === 'configured')
      return

    if (activeProvider.value && current?.definitionId !== 'official')
      return

    void activateProvider(zaiProviderId)
  }, { immediate: true })

  // If the active Z.ai configuration becomes unavailable, fall back to the
  // configured AIRI Cloud provider instead of leaving chat unusable.
  watch(configuredZaiProviderId, (zaiProviderId, previousZaiProviderId) => {
    if (zaiProviderId || !previousZaiProviderId)
      return

    const current = providerConfigStore.getProvider(activeProvider.value)
    if (current?.definitionId !== 'zai')
      return

    const officialProviderId = Object.values(providerConfigStore.providers)
      .find(provider => provider.definitionId === 'official' && provider.status === 'configured')
      ?.id

    if (officialProviderId)
      void activateProvider(officialProviderId)
  })

  /** Resolves a provider with the reasoning mode shared by every Consciousness input path. */
  async function getChatProviderInstance(provider: string) {
    return providersStore.getChatProviderInstance(provider, {
      reasoning: settingsStore.reasoning ? 'enabled' : 'disabled',
    })
  }

  const configured = computed(() => {
    return !!activeProvider.value && !!activeModel.value
  })

  function resetState() {
    activeProvider.reset()
    resetModelSelection()
  }

  return {
    // State
    configured,
    activeProvider,
    activeModel,
    customModelName: activeCustomModelName,
    expandedDescriptions,
    modelSearchQuery,

    // Computed
    supportsModelListing,
    providerModels,
    isLoadingActiveProviderModels,
    activeProviderModelError,
    filteredModels,

    // Actions
    resetModelSelection,
    loadModelsForProvider,
    getModelsForProvider,
    getChatProviderInstance,
    resetState,
  }
}, {
  synced: {
    state: true,
  },
})

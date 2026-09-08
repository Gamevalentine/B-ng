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

  function hasApiKey(providerId: string) {
    const apiKey = providerConfigStore.getProviderConfig(providerId)?.apiKey
    return typeof apiKey === 'string' && apiKey.trim().length > 0
  }

  // A provider can temporarily be validating/unconfigured while its persisted
  // credentials are already usable. Basing routing on status caused startup
  // races where Chat stayed on AIRI Cloud and consumed Flux. Credentials are
  // the durable signal used for the strict Z.ai route instead.
  const usableZaiProviderId = computed(() => {
    const selected = providerConfigStore.getProvider(activeProvider.value)
    if (selected?.definitionId === 'zai' && hasApiKey(selected.id))
      return selected.id

    return Object.values(providerConfigStore.providers)
      .find(provider => provider.definitionId === 'zai' && hasApiKey(provider.id))
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
  // first and a new model right after, so a deferred reset would wipe the model
  // they just chose. Synchronous flush makes "set provider, then set model" a
  // safe, ordered operation.
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

  // Keep the UI selection aligned with Z.ai when AIRI Cloud (official) is the
  // current/default provider. This is only convenience; outbound provider
  // resolution below does not depend on watcher timing.
  watch(usableZaiProviderId, (zaiProviderId) => {
    if (!zaiProviderId)
      return

    const current = providerConfigStore.getProvider(activeProvider.value)
    if (current?.definitionId === 'zai')
      return

    if (activeProvider.value && current?.definitionId !== 'official')
      return

    void activateProvider(zaiProviderId)
  }, { immediate: true })

  /**
   * Resolves the provider/model for an outbound chat request.
   *
   * The custom desktop build must never silently spend Flux. When the selected
   * provider is AIRI Cloud (or stale/empty), a persisted Z.ai credential is
   * selected at send time. If none exists, the request is stopped locally
   * before an AIRI Cloud provider instance can be created.
   */
  async function resolveChatTarget() {
    const currentProviderId = activeProvider.value
    const currentProvider = providerConfigStore.getProvider(currentProviderId)

    if (currentProvider && currentProvider.definitionId !== 'official') {
      const modelId = activeModel.value || await resolveModelForProvider(currentProviderId)
      if (!modelId)
        throw new Error(`No chat model configured for provider "${currentProviderId}"`)

      if (!activeModel.value)
        activeModel.value = modelId

      return { providerId: currentProviderId, modelId }
    }

    const zaiProviderId = usableZaiProviderId.value
    if (!zaiProviderId)
      throw new Error('Z.ai chưa được cấu hình API key. AIRI Cloud/Flux đã bị chặn để tránh phát sinh Flux.')

    const modelId = await resolveModelForProvider(zaiProviderId)
    if (!modelId)
      throw new Error('Z.ai chưa có model khả dụng. AIRI Cloud/Flux đã bị chặn.')

    if (activeProvider.value !== zaiProviderId)
      activeProvider.value = zaiProviderId
    activeModel.value = modelId

    return { providerId: zaiProviderId, modelId }
  }

  /** Resolves a provider with the reasoning mode shared by every Consciousness input path. */
  async function getChatProviderInstance(provider: string) {
    const reasoning = settingsStore.reasoning ? 'enabled' : 'disabled'
    const requested = providerConfigStore.getProvider(provider)

    // A chat request can hold an `official` provider id captured before the
    // asynchronous Z.ai activation watcher finishes. Guard the requested id
    // itself rather than comparing it with the newer activeProvider state.
    // That makes every stale AIRI Cloud snapshot resolve through the current
    // non-Flux target and prevents an official provider instance from existing.
    if (!requested || requested.definitionId === 'official') {
      const target = await resolveChatTarget()
      const targetProvider = await providersStore.getChatProviderInstance(target.providerId, { reasoning })

      if (target.providerId === provider)
        return targetProvider

      return {
        ...targetProvider,
        chat: () => targetProvider.chat(target.modelId),
      }
    }

    return providersStore.getChatProviderInstance(provider, { reasoning })
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
    resolveChatTarget,
    getChatProviderInstance,
    resetState,
  }
}, {
  synced: {
    state: true,
  },
})

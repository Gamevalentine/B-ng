import type { Ref } from 'vue'

import { watch } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * Manages language sync between renderer and main process, guarding
 * against Electron localStorage flush issues on restart.
 *
 * Use when:
 * - Electron restarts and renderer localStorage may not have been flushed
 *
 * Expects:
 * - `language` is the reactive language ref from the settings store
 * - `getMainLocale` returns the raw locale persisted in main-process config
 *   (`undefined` when no config exists yet, a string when user saved one)
 * - `setLocale` syncs the renderer locale back to main process
 *
 * Returns:
 * - `restore()` to be called during component onMounted
 */
export function useLanguage(
  language: Ref<string>,
  getMainLocale: () => Promise<unknown>,
  setLocale: (locale: string) => Promise<unknown> | unknown,
) {
  const i18n = useI18n()
  // Giữ tham số để không phá API của composable; bản dựng này cố định ngôn ngữ tiếng Việt.
  void getMainLocale
  let isLocaleSynced = false

  // Guard: do not propagate the store's navigator.language fallback back
  // to main-process config before we have verified the correct locale.
  watch(language, () => {
    if (language.value !== 'vi')
      language.value = 'vi'

    i18n.locale.value = 'vi'
    localStorage.setItem('settings/language', 'vi')
    if (isLocaleSynced)
      void setLocale('vi')
  })

  async function restore() {
    language.value = 'vi'
    i18n.locale.value = 'vi'
    localStorage.setItem('settings/language', 'vi')
    isLocaleSynced = true
    void setLocale('vi')
  }

  return { restore }
}

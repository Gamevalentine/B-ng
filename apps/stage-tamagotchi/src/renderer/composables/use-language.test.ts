import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { useLanguage } from './use-language'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en' },
  }),
}))

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('useLanguage Vietnamese-first build', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorageMock.clear()
  })

  it('forces Vietnamese during restore and ignores the old main-process locale', async () => {
    localStorage.setItem('settings/language', 'ja')

    const language = ref('ja')
    const getMainLocale = vi.fn(async () => 'zh-Hant')
    const setLocale = vi.fn(async () => {})

    const { restore } = useLanguage(language, getMainLocale, setLocale)
    await restore()

    expect(getMainLocale).not.toHaveBeenCalled()
    expect(language.value).toBe('vi')
    expect(localStorage.getItem('settings/language')).toBe('vi')
    expect(setLocale).toHaveBeenCalledWith('vi')
  })

  it('does not sync another locale before restore and clamps it back to Vietnamese', async () => {
    const language = ref('vi')
    const getMainLocale = vi.fn(async () => 'en')
    const setLocale = vi.fn(async () => {})

    useLanguage(language, getMainLocale, setLocale)

    language.value = 'zh-Hans'
    await nextTick()

    expect(language.value).toBe('vi')
    expect(setLocale).not.toHaveBeenCalled()
  })

  it('keeps later language changes pinned to Vietnamese after restore', async () => {
    const language = ref('en')
    const getMainLocale = vi.fn(async () => 'en')
    const setLocale = vi.fn(async () => {})

    const { restore } = useLanguage(language, getMainLocale, setLocale)
    await restore()
    setLocale.mockClear()

    language.value = 'ja'
    await nextTick()
    await nextTick()

    expect(language.value).toBe('vi')
    expect(localStorage.getItem('settings/language')).toBe('vi')
    expect(setLocale).not.toHaveBeenCalledWith('ja')
    expect(setLocale).toHaveBeenCalledWith('vi')
  })
})

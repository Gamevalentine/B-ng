import messages from '@proj-airi/i18n/locales'

import { createI18n } from 'vue-i18n'

function getLocale() {
  localStorage.setItem('settings/language', 'vi')
  return 'vi'
}

export const i18n = createI18n({
  legacy: false,
  locale: getLocale(),
  fallbackLocale: 'vi',
  messages,
})

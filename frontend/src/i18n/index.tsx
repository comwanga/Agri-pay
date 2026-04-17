// Lightweight i18n context — no external dependencies.
//
// The active language is read from displaySettings.language (persisted in
// localStorage).  Components call `useTranslation()` to get the `t()` function
// and the raw `language` string.
//
// Template interpolation: `t('market.only_x_left', { qty: 3, unit: 'kg' })`
// replaces `{qty}` and `{unit}` in the translated string.

import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useDisplaySettings } from '../context/displaySettings.tsx'
import { TRANSLATIONS, en } from './translations.ts'
import type { SupportedLanguage } from './translations.ts'

// ── Context ───────────────────────────────────────────────────────────────────

interface I18nContextValue {
  /** Translate a key, with optional variable interpolation. */
  t: (key: string, vars?: Record<string, string | number>) => string
  /** The active language code (e.g. 'English', 'Swahili') */
  language: string
}

const I18nCtx = createContext<I18nContextValue>({
  t: (key) => key,
  language: 'English',
})

// ── Provider ──────────────────────────────────────────────────────────────────

export function I18nProvider({ children }: { children: ReactNode }) {
  const { language } = useDisplaySettings()

  const t = useMemo(() => {
    const dict = TRANSLATIONS[language as SupportedLanguage] ?? {}

    return (key: string, vars?: Record<string, string | number>): string => {
      // Look up in the active language, fall back to English, then the raw key.
      let str = dict[key] ?? en[key] ?? key

      // Simple {variable} interpolation.
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.split(`{${k}}`).join(String(v))
        }
      }
      return str
    }
  }, [language])

  return (
    <I18nCtx.Provider value={{ t, language }}>
      {children}
    </I18nCtx.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTranslation(): I18nContextValue {
  return useContext(I18nCtx)
}

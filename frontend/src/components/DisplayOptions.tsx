import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bitcoin, Globe, Moon, Languages, Check, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import { useDisplaySettings } from '../context/displaySettings.tsx'
import type { AppTheme, BtcUnit } from '../context/displaySettings.tsx'
import { useState } from 'react'

// ── Data ──────────────────────────────────────────────────────────────────────

const CURRENCIES = [
  { code: 'KES', name: 'Kenyan Shilling',    flag: '🇰🇪' },
  { code: 'USD', name: 'US Dollar',          flag: '🇺🇸' },
  { code: 'EUR', name: 'Euro',               flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound',      flag: '🇬🇧' },
  { code: 'NGN', name: 'Nigerian Naira',     flag: '🇳🇬' },
  { code: 'UGX', name: 'Ugandan Shilling',   flag: '🇺🇬' },
  { code: 'TZS', name: 'Tanzanian Shilling', flag: '🇹🇿' },
  { code: 'ZAR', name: 'South African Rand', flag: '🇿🇦' },
  { code: 'GHS', name: 'Ghanaian Cedi',      flag: '🇬🇭' },
  { code: 'ETB', name: 'Ethiopian Birr',     flag: '🇪🇹' },
  { code: 'RWF', name: 'Rwandan Franc',      flag: '🇷🇼' },
  { code: 'JPY', name: 'Japanese Yen',       flag: '🇯🇵' },
  { code: 'CNY', name: 'Chinese Yuan',       flag: '🇨🇳' },
  { code: 'INR', name: 'Indian Rupee',       flag: '🇮🇳' },
  { code: 'AED', name: 'UAE Dirham',         flag: '🇦🇪' },
  { code: 'CAD', name: 'Canadian Dollar',    flag: '🇨🇦' },
  { code: 'AUD', name: 'Australian Dollar',  flag: '🇦🇺' },
] as const

const LANGUAGES = [
  { code: 'English', label: 'English',      flag: '🇬🇧' },
  { code: 'Swahili', label: 'Swahili (KE)', flag: '🇰🇪' },
  { code: 'French',  label: 'French',       flag: '🇫🇷' },
]

const THEME_LABELS: Record<AppTheme, string> = {
  system: 'Follow system',
  dark:   'Dark',
  light:  'Light',
}

type ExpandedRow = 'btcUnit' | 'fiatCurrency' | 'theme' | 'language' | null

// ── Accordion row ─────────────────────────────────────────────────────────────

interface RowProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  expanded: boolean
  onToggle: () => void
  last?: boolean
  children: React.ReactNode
}

function SettingRow({ icon, label, value, expanded, onToggle, last, children }: RowProps) {
  return (
    <div className={clsx(!last && 'border-b border-gray-800/60')}>
      {/* Header button */}
      <button
        onClick={onToggle}
        className={clsx(
          'w-full flex items-center gap-4 px-4 py-4 text-left transition-colors',
          expanded ? 'bg-gray-800/60' : 'hover:bg-white/[0.03] active:bg-white/[0.06]',
        )}
      >
        <span className={clsx('shrink-0 transition-colors', expanded ? 'text-brand-400' : 'text-gray-400')}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className={clsx('text-sm font-semibold transition-colors', expanded ? 'text-brand-300' : 'text-gray-100')}>
            {label}
          </p>
          {!expanded && (
            <p className="text-sm text-gray-500 mt-0.5">{value}</p>
          )}
        </div>
        <ChevronDown className={clsx(
          'w-4 h-4 shrink-0 transition-transform duration-200',
          expanded ? 'rotate-180 text-brand-400' : 'text-gray-600',
        )} />
      </button>

      {/* Inline options panel */}
      {expanded && (
        <div className="border-t border-gray-800/60 bg-gray-950/60">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Option items ──────────────────────────────────────────────────────────────

interface SimpleOptionProps {
  label: React.ReactNode
  hint?: string
  selected: boolean
  onSelect: () => void
}

function OptionItem({ label, hint, selected, onSelect }: SimpleOptionProps) {
  return (
    <button
      onClick={onSelect}
      className={clsx(
        'w-full flex items-center justify-between px-5 py-3 text-left transition-colors',
        'border-b border-gray-800/40 last:border-0',
        selected ? 'bg-brand-500/10' : 'hover:bg-white/[0.03]',
      )}
    >
      <div>
        <p className={clsx('text-sm', selected ? 'text-gray-100 font-medium' : 'text-gray-400')}>
          {label}
        </p>
        {hint && <p className="text-xs text-gray-600 mt-0.5">{hint}</p>}
      </div>
      {selected && <Check className="w-4 h-4 text-brand-400 shrink-0 ml-3" />}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DisplayOptions() {
  const navigate = useNavigate()
  const { btcUnit, fiatCurrency, theme, language, update } = useDisplaySettings()
  const [expanded, setExpanded] = useState<ExpandedRow>(null)

  function toggle(row: ExpandedRow) {
    setExpanded(prev => prev === row ? null : row)
  }

  const fiatMeta  = CURRENCIES.find(c => c.code === fiatCurrency) ?? CURRENCIES[0]
  const langMeta  = LANGUAGES.find(l => l.code === language) ?? LANGUAGES[0]

  return (
    <div className="p-4 sm:p-6 max-w-lg space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3 -ml-1">
        <button
          onClick={() => navigate(-1)}
          className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-100">Display options</h1>
      </div>

      {/* Settings card */}
      <div className="rounded-2xl bg-gray-900 border border-gray-800 overflow-hidden">

        {/* ── Bitcoin unit ─────────────────────────────────────────────────── */}
        <SettingRow
          icon={<Bitcoin className="w-5 h-5" />}
          label="Bitcoin unit"
          value={
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#f7931a] shrink-0">
                <Bitcoin className="w-2.5 h-2.5 text-white" strokeWidth={3} />
              </span>
              {btcUnit === 'sats' ? 'Satoshi' : 'Bitcoin (BTC)'}
            </span>
          }
          expanded={expanded === 'btcUnit'}
          onToggle={() => toggle('btcUnit')}
        >
          {([
            ['sats', 'Satoshi',      '1 BTC = 100,000,000 sats'],
            ['btc',  'Bitcoin (BTC)', '0.00000001 BTC = 1 sat'],
          ] as [BtcUnit, string, string][]).map(([val, lbl, hint]) => (
            <OptionItem
              key={val}
              label={lbl}
              hint={hint}
              selected={btcUnit === val}
              onSelect={() => { update({ btcUnit: val }); setExpanded(null) }}
            />
          ))}
        </SettingRow>

        {/* ── Fiat currency ─────────────────────────────────────────────────── */}
        <SettingRow
          icon={<Globe className="w-5 h-5" />}
          label="Fiat currency"
          value={
            <span className="flex items-center gap-1.5">
              <span>{fiatMeta.flag}</span>
              <span>{fiatCurrency}</span>
            </span>
          }
          expanded={expanded === 'fiatCurrency'}
          onToggle={() => toggle('fiatCurrency')}
        >
          <div className="max-h-56 overflow-y-auto">
            {CURRENCIES.map(cur => (
              <button
                key={cur.code}
                onClick={() => { update({ fiatCurrency: cur.code }); setExpanded(null) }}
                className={clsx(
                  'w-full flex items-center justify-between px-5 py-3 text-left transition-colors',
                  'border-b border-gray-800/40 last:border-0',
                  fiatCurrency === cur.code ? 'bg-brand-500/10' : 'hover:bg-white/[0.03]',
                )}
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg">{cur.flag}</span>
                  <span>
                    <span className={clsx(
                      'text-sm block',
                      fiatCurrency === cur.code ? 'text-gray-100 font-medium' : 'text-gray-300',
                    )}>
                      {cur.name}
                    </span>
                    <span className="text-xs text-gray-500">{cur.code}</span>
                  </span>
                </span>
                {fiatCurrency === cur.code && <Check className="w-4 h-4 text-brand-400 shrink-0" />}
              </button>
            ))}
          </div>
        </SettingRow>

        {/* ── Application theme ─────────────────────────────────────────────── */}
        <SettingRow
          icon={<Moon className="w-5 h-5" />}
          label="Application theme"
          value={THEME_LABELS[theme]}
          expanded={expanded === 'theme'}
          onToggle={() => toggle('theme')}
        >
          {(['system', 'dark', 'light'] as AppTheme[]).map(t => (
            <OptionItem
              key={t}
              label={THEME_LABELS[t]}
              selected={theme === t}
              onSelect={() => { update({ theme: t }); setExpanded(null) }}
            />
          ))}
        </SettingRow>

        {/* ── Application language ──────────────────────────────────────────── */}
        <SettingRow
          icon={<Languages className="w-5 h-5" />}
          label="Application language"
          value={
            <span className="flex items-center gap-1.5">
              <span>{langMeta.flag}</span>
              <span>{langMeta.label}</span>
            </span>
          }
          expanded={expanded === 'language'}
          onToggle={() => toggle('language')}
          last
        >
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => { update({ language: lang.code }); setExpanded(null) }}
              className={clsx(
                'w-full flex items-center justify-between px-5 py-3 text-left transition-colors',
                'border-b border-gray-800/40 last:border-0',
                language === lang.code ? 'bg-brand-500/10' : 'hover:bg-white/[0.03]',
              )}
            >
              <span className="flex items-center gap-3">
                <span className="text-lg">{lang.flag}</span>
                <span className={clsx(
                  'text-sm',
                  language === lang.code ? 'text-gray-100 font-medium' : 'text-gray-400',
                )}>
                  {lang.label}
                </span>
              </span>
              {language === lang.code && <Check className="w-4 h-4 text-brand-400 shrink-0" />}
            </button>
          ))}
          <p className="text-xs text-gray-600 text-center py-2.5 px-5 border-t border-gray-800/40">
            Full translations coming soon
          </p>
        </SettingRow>

      </div>
    </div>
  )
}

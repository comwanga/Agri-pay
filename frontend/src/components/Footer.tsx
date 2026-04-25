import { useNavigate } from 'react-router-dom'
import { Zap, ChevronUp, Clock } from 'lucide-react'
import { useDisplaySettings } from '../context/displaySettings.tsx'
import { useTranslation } from '../i18n/index.tsx'
import type { SupportedLanguage } from '../i18n/translations.ts'

// ── Back to top ────────────────────────────────────────────────────────────────

function BackToTop() {
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="w-full py-3 bg-gray-800 border-b border-gray-700 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
    >
      <ChevronUp className="w-3.5 h-3.5" />
      Back to top
    </button>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

export default function Footer() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { language, update } = useDisplaySettings()

  const col = (title: string, links: { label: string; path: string }[]) => (
    <div key={title}>
      <h3 className="text-xs font-bold text-gray-300 mb-3">{title}</h3>
      <ul className="space-y-2">
        {links.map(({ label, path }) => (
          <li key={label}>
            <button
              onClick={() => navigate(path)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors text-left"
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  // French is a stub — hide until fully translated
  const LANGUAGES: SupportedLanguage[] = ['English', 'Swahili']

  return (
    <footer className="hidden md:block bg-gray-900 border-t border-gray-800 mt-auto">
      <BackToTop />

      {/* Main footer content */}
      <div className="max-w-screen-xl mx-auto px-6 py-12">
        <div className="grid grid-cols-5 gap-8">

          {/* Brand column */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="SokoPay" className="w-8 h-8 rounded-xl" />
              <span className="text-base font-bold text-gray-100">SokoPay</span>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
              The global Lightning marketplace. Buy and sell anywhere in the world
              — instant, borderless, non-custodial.
            </p>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Zap className="w-3.5 h-3.5 text-bitcoin shrink-0" />
              <span>Lightning</span>
              <span className="text-gray-700 mx-0.5">·</span>
              <Clock className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span className="text-purple-500">Escrow soon</span>
            </div>
          </div>

          {/* Link columns */}
          <div className="col-span-3 grid grid-cols-3 gap-8">
            {col('Marketplace', [
              { label: 'Browse All Products', path: '/browse' },
              { label: 'Price Index', path: '/price-index' },
              { label: 'Sell on SokoPay', path: '/sell' },
            ])}
            {col('Your Account', [
              { label: t('nav.orders'), path: '/orders' },
              { label: t('nav.payments'), path: '/payments' },
              { label: t('nav.profile'), path: '/profile' },
              { label: t('nav.settings'), path: '/settings' },
            ])}
            {col('Payments', [
              { label: '⚡ Lightning Network', path: '/browse' },
              { label: '🔒 Escrow (Coming Soon)', path: '/browse' },
              { label: 'New Listing', path: '/sell/new' },
            ])}
          </div>
        </div>
      </div>

      <div className="h-px bg-gray-800" />

      {/* Bottom bar */}
      <div className="max-w-screen-xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Language selector */}
        <select
          value={language}
          onChange={e => update({ language: e.target.value as SupportedLanguage })}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-400 focus:outline-none focus:border-brand-500 cursor-pointer"
        >
          {LANGUAGES.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        {/* Copyright */}
        <p className="text-[11px] text-gray-600">
          © {new Date().getFullYear()} SokoPay. The global Lightning marketplace.
        </p>
      </div>
    </footer>
  )
}

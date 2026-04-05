import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Wheat, ExternalLink } from 'lucide-react'
import Layout from './components/Layout.tsx'
import Dashboard from './components/Dashboard.tsx'
import Farmers from './components/Farmers.tsx'
import Payments from './components/Payments.tsx'
import { getToken, nostrLogin } from './api/client.ts'

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="text-center max-w-xs">
        <div className="w-14 h-14 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center mx-auto mb-5">
          <Wheat className="w-7 h-7 text-brand-400" />
        </div>
        <h1 className="text-lg font-bold text-gray-100 mb-1">AgriPay</h1>
        <p className="text-sm text-gray-400 mb-5">Lightning ↔ M-Pesa marketplace</p>
        {children}
      </div>
    </div>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken())
  const [pending, setPending] = useState(() => !getToken())
  const [authError, setAuthError] = useState<string | null>(null)
  const inFedi = typeof window !== 'undefined' && !!window.nostr

  function attemptNostrAuth() {
    setAuthError(null)
    setPending(true)
    nostrLogin()
      .then(() => { setAuthed(true); setPending(false) })
      .catch((e: unknown) => {
        setPending(false)
        setAuthError(e instanceof Error ? e.message : 'Auth failed')
      })
  }

  useEffect(() => {
    if (getToken()) { setPending(false); return }
    // Small delay to allow Fedi to inject window.nostr before we check
    const t = setTimeout(() => {
      if (!window.nostr) { setPending(false); return }
      attemptNostrAuth()
    }, 200)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (pending) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center gap-3">
        <Wheat className="w-6 h-6 text-brand-400 animate-pulse" />
        <span className="text-sm text-gray-400">Connecting…</span>
      </div>
    )
  }

  if (!authed && inFedi) {
    // In Fedi but auth failed — show error + retry
    return (
      <Screen>
        {authError && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2 mb-4">
            {authError}
          </p>
        )}
        <button onClick={attemptNostrAuth} className="btn-primary w-full justify-center">
          Retry
        </button>
      </Screen>
    )
  }

  if (!authed) {
    // Not in Fedi — guide user
    return (
      <Screen>
        <p className="text-xs text-gray-600 mb-6">Open this app inside Fedi to get started.</p>
        <a
          href="https://www.fedi.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs inline-flex items-center gap-1.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Get Fedi
        </a>
      </Screen>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/farmers" element={<Farmers />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

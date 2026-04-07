import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Wheat, ExternalLink } from 'lucide-react'
import Layout from './components/Layout.tsx'
import Marketplace from './components/Marketplace.tsx'
import ProductDetail from './components/ProductDetail.tsx'
import SellerDashboard from './components/SellerDashboard.tsx'
import BuyerOrders from './components/BuyerOrders.tsx'
import ProductForm from './components/ProductForm.tsx'
import Profile from './components/Profile.tsx'
import { getToken, nostrLogin, getProfile } from './api/client.ts'
import { getTokenPayload } from './hooks/useCurrentFarmer.ts'

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="text-center max-w-xs">
        <div className="w-14 h-14 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center mx-auto mb-5">
          <Wheat className="w-7 h-7 text-brand-400" />
        </div>
        <h1 className="text-lg font-bold text-gray-100 mb-1">AgriPay</h1>
        <p className="text-sm text-gray-400 mb-5">P2P marketplace · Pay in sats</p>
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
  const navigate = useNavigate()

  async function onLoginSuccess() {
    setAuthed(true)
    setPending(false)
    // Redirect new users (no Lightning Address) to profile setup
    try {
      const payload = getTokenPayload()
      if (payload?.farmer_id) {
        const farmer = await getProfile(payload.farmer_id)
        if (!farmer.ln_address) {
          navigate('/profile?setup=1', { replace: true })
        }
      }
    } catch { /* non-fatal */ }
  }

  function attemptNostrAuth() {
    setAuthError(null)
    setPending(true)
    nostrLogin()
      .then(onLoginSuccess)
      .catch((e: unknown) => {
        setPending(false)
        setAuthError(e instanceof Error ? e.message : 'Auth failed')
      })
  }

  useEffect(() => {
    if (getToken()) { setPending(false); return }
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

  if (!authed) {
    return (
      <Screen>
        {authError && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2 mb-4">
            {authError}
          </p>
        )}

        {inFedi ? (
          /* Inside Fedi mini-app or browser Nostr extension */
          <button onClick={attemptNostrAuth} className="btn-primary w-full justify-center">
            Connect with Nostr
          </button>
        ) : (
          /* Regular browser — guide user to get a Nostr signer */
          <>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              AgriPay uses Nostr for sign-in.
              Open this app inside <strong className="text-gray-300">Fedi</strong> for instant access,
              or install a browser extension.
            </p>
            <button
              onClick={attemptNostrAuth}
              className="btn-primary w-full justify-center mb-3"
            >
              Connect with Nostr
            </button>
            <div className="flex gap-2 justify-center">
              <a
                href="https://www.fedi.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Get Fedi
              </a>
              <a
                href="https://getalby.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary text-xs inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Alby extension
              </a>
            </div>
          </>
        )}
      </Screen>
    )
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Marketplace />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/sell" element={<SellerDashboard />} />
        <Route path="/sell/new" element={<ProductForm />} />
        <Route path="/sell/edit/:id" element={<ProductForm />} />
        <Route path="/orders" element={<BuyerOrders />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

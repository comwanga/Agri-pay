import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import {
  User, Zap, MapPin, Check, AlertCircle,
  Loader2, ShieldCheck, RefreshCw, CheckCircle2, XCircle, Settings, ChevronRight, Code2,
  Gift, Copy, Share2, Bitcoin,
} from 'lucide-react'
import { updateProfile, verifyLnAddress, isFediContext, getMyReferralCode } from '../api/client.ts'
import { useCurrentFarmer } from '../hooks/useCurrentFarmer.ts'
import { useToast } from '../context/toast.tsx'
import type { LnVerifyResponse } from '../types'
import clsx from 'clsx'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-600">{hint}</p>}
    </div>
  )
}

// ── Lightning Address field with live verification ────────────────────────────

interface LightningFieldProps {
  value: string
  savedAddress: string | null   // what's currently persisted in DB
  placeholder?: string
  formatHint?: React.ReactNode
  onChange: (v: string) => void
  onVerified: (info: LnVerifyResponse | null) => void
}

function LightningAddressField({ value, savedAddress, placeholder, formatHint, onChange, onVerified }: LightningFieldProps) {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'ok' | 'error'>('idle')
  const [info, setInfo] = useState<LnVerifyResponse | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // If the current input matches what's already saved in the DB,
  // treat it as implicitly verified so the user doesn't have to re-verify on every save.
  const isUnchanged = value.trim() !== '' && value.trim() === (savedAddress ?? '').trim()
  const showVerifiedBadge = status === 'ok' || isUnchanged

  async function handleVerify() {
    const addr = value.trim()
    if (!addr) return
    setStatus('verifying')
    setErrMsg(null)
    setInfo(null)
    onVerified(null)
    try {
      const result = await verifyLnAddress(addr)
      setInfo(result)
      setStatus('ok')
      onVerified(result)
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Verification failed')
      setStatus('error')
    }
  }

  function handleChange(v: string) {
    onChange(v)
    // Clear verification result when the user edits the field
    if (v.trim() !== value.trim()) {
      setStatus('idle')
      setInfo(null)
      setErrMsg(null)
      onVerified(null)
    }
  }

  return (
    <div className="space-y-2">
      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          <input
            type="text"
            value={value}
            onChange={e => handleChange(e.target.value)}
            placeholder={placeholder ?? 'you@domain.com or lnurl1dp68…'}
            inputMode="email"
            autoComplete="off"
            className={clsx(
              'input-base pl-9 pr-9',
              showVerifiedBadge && 'border-mpesa/40 focus:border-mpesa/70',
            )}
          />
          {showVerifiedBadge && (
            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mpesa pointer-events-none" />
          )}
        </div>
        <button
          type="button"
          onClick={handleVerify}
          disabled={!value.trim() || status === 'verifying'}
          className="btn-secondary px-3 shrink-0 gap-1.5"
          title="Verify this address is reachable"
        >
          {status === 'verifying'
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
          <span className="text-xs">{status === 'verifying' ? 'Checking…' : 'Verify'}</span>
        </button>
      </div>

      {/* Implicitly verified (unchanged from DB) */}
      {isUnchanged && status === 'idle' && (
        <p className="text-xs text-mpesa flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Previously verified and saved
        </p>
      )}

      {/* Verification success panel */}
      {status === 'ok' && info && (
        <div className="bg-mpesa/5 border border-mpesa/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-mpesa shrink-0" />
            <p className="text-xs font-semibold text-mpesa">Wallet reachable</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-start gap-2 text-xs">
              <span className="text-gray-500 w-28 shrink-0">Description</span>
              <span className="text-gray-200">{info.description}</span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <span className="text-gray-500 w-28 shrink-0">Min receivable</span>
              <span className="text-gray-200">{info.min_sendable_sats.toLocaleString()} sats</span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <span className="text-gray-500 w-28 shrink-0">Max receivable</span>
              <span className="text-gray-200">
                {info.max_sendable_sats >= 9_000_000_000_000_000
                  ? 'No limit'
                  : info.max_sendable_sats >= 100_000_000
                    ? `${(info.max_sendable_sats / 100_000_000).toFixed(2)} BTC`
                    : `${info.max_sendable_sats.toLocaleString()} sats`}
              </span>
            </div>
            <div className="flex items-start gap-2 text-xs">
              <span className="text-gray-500 w-28 shrink-0">Callback</span>
              <span className="text-gray-500 font-mono break-all text-[10px]">{info.callback}</span>
            </div>
          </div>
        </div>
      )}

      {/* Verification error panel */}
      {status === 'error' && errMsg && (
        <div className="bg-red-900/10 border border-red-700/30 rounded-xl p-3 flex gap-2 items-start">
          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold text-red-400">Address unreachable</p>
            <p className="text-xs text-red-500/80">{errMsg}</p>
            <p className="text-[11px] text-gray-600 mt-1">
              Check the address is correct, or try a different Lightning Address or wallet.
            </p>
          </div>
        </div>
      )}

      {/* Format hints */}
      {!value && (
        <div className="text-[11px] text-gray-600 space-y-0.5">
          {formatHint ?? (
            <>
              <p>Accepted formats:</p>
              <p className="font-mono pl-2">you@wallet.com  — Lightning Address</p>
              <p className="font-mono pl-2">lnurl1dp68…     — bech32 LNURL string</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Profile page ──────────────────────────────────────────────────────────────

export default function Profile() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isSetup = params.get('setup') === '1'
  const qc = useQueryClient()

  const { farmer, farmerId, isLoading } = useCurrentFarmer()
  const { toast } = useToast()
  const { data: referral } = useQuery({
    queryKey: ['my-referral'],
    queryFn:  getMyReferralCode,
    enabled:  !!farmerId,
    staleTime: 300_000,
  })

  const [name, setName] = useState('')

  // Lightning Address (user@domain.com) and LNURL (lnurl1…) are stored in the
  // same backend `ln_address` field. We show them in separate boxes for clarity.
  // Format is auto-detected on load; on save, whichever is filled wins
  // (Lightning Address takes priority if somehow both are filled).
  const [lnAddress, setLnAddress]           = useState('')
  const [lnVerifyInfo, setLnVerifyInfo]     = useState<LnVerifyResponse | null>(null)
  const [lnurl, setLnurl]                   = useState('')
  const [lnurlVerifyInfo, setLnurlVerifyInfo] = useState<LnVerifyResponse | null>(null)

  const [btcAddress, setBtcAddress]         = useState('')
  const [btcAddressError, setBtcAddressError] = useState<string | null>(null)
  const [locationName, setLocationName]     = useState('')
  const [locationLat, setLocationLat]       = useState<number | undefined>()
  const [locationLng, setLocationLng]       = useState<number | undefined>()
  const [locating, setLocating]             = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [saved, setSaved]                   = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  useEffect(() => {
    if (farmer) {
      setName(farmer.name ?? '')
      // Detect format and populate the correct box
      const saved = farmer.ln_address ?? ''
      if (saved.toLowerCase().startsWith('lnurl1')) {
        setLnurl(saved)
        setLnAddress('')
      } else {
        setLnAddress(saved)
        setLnurl('')
      }
      setBtcAddress(farmer.btc_address ?? '')
      setLocationName(farmer.location_name ?? '')
    }
  }, [farmer])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!farmerId) return

    const trimmedLnAddress = lnAddress.trim()
    const trimmedLnurl     = lnurl.trim()

    // Effective ln_address: prefer Lightning Address over LNURL if both filled
    const trimmedLn = trimmedLnAddress || trimmedLnurl

    // Require verification if the ln_address value changed from what's in the DB
    const savedLn = farmer?.ln_address ?? ''
    const lnChanged = trimmedLn !== savedLn.trim()

    if (trimmedLnAddress && lnChanged && !lnVerifyInfo) {
      setError('Please verify your Lightning Address before saving.')
      return
    }
    if (trimmedLnurl && !trimmedLnAddress && lnChanged && !lnurlVerifyInfo) {
      setError('Please verify your LNURL before saving.')
      return
    }

    // Client-side Bitcoin address format check
    const trimmedBtc = btcAddress.trim()
    if (trimmedBtc) {
      const isValid =
        trimmedBtc.startsWith('1') ||
        trimmedBtc.startsWith('3') ||
        trimmedBtc.toLowerCase().startsWith('bc1') ||
        trimmedBtc.startsWith('m') ||
        trimmedBtc.startsWith('n') ||
        trimmedBtc.startsWith('2') ||
        trimmedBtc.toLowerCase().startsWith('tb1')
      if (!isValid || trimmedBtc.length < 25 || trimmedBtc.length > 90) {
        setBtcAddressError('Enter a valid Bitcoin address (starts with 1, 3, or bc1)')
        return
      }
    }
    setBtcAddressError(null)

    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      await updateProfile(farmerId, {
        name: name.trim() || undefined,
        ln_address: trimmedLn || undefined,
        btc_address: trimmedBtc || undefined,
        location_name: locationName.trim() || undefined,
        location_lat: locationLat,
        location_lng: locationLng,
      })
      await qc.invalidateQueries({ queryKey: ['farmer-me', farmerId] })
      setSaved(true)
      if (isSetup) {
        setTimeout(() => navigate('/'), 800)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  async function handleGps() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocationLat(pos.coords.latitude)
        setLocationLng(pos.coords.longitude)
        setLocating(false)
      },
      () => setLocating(false),
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-3 text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading profile…
      </div>
    )
  }

  if (!farmer) {
    return (
      <div className="p-6 text-gray-500 text-sm">Could not load profile.</div>
    )
  }

  const isNostrUser = !!farmer.nostr_pubkey
  const connectionLabel = isFediContext ? 'Fedi wallet' : 'Nostr browser extension'

  return (
    <div className="p-6 max-w-lg space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-100">
          {isSetup ? 'Complete your profile' : 'Profile & Settings'}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {isSetup
            ? 'Add your Lightning Address or LNURL so buyers can pay you directly.'
            : 'Manage your account and payment settings.'}
        </p>
      </div>

      {/* Fedi context: LNURL setup prompt with correct navigation */}
      {isFediContext && !farmer.ln_address && (
        <div className="flex gap-3 items-start bg-brand-500/10 border border-brand-500/30 rounded-xl p-4">
          <Zap className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p className="text-brand-300 font-semibold">Copy your LNURL from Fedi to receive payments</p>
            <p className="text-brand-400/70 text-xs leading-relaxed">
              Fedi detected! Paste your LNURL in the box below — buyers pay you directly with no platform custody.
            </p>
            <div className="text-xs space-y-1">
              <p className="font-semibold text-gray-300">Find your LNURL in Fedi:</p>
              <div className="flex items-center gap-1.5 font-mono text-brand-400 bg-brand-500/10 border border-brand-500/20 rounded-lg px-3 py-2">
                Wallet → Receive → LNURL → Copy
              </div>
              <p className="text-gray-600 text-[11px]">
                Fedi uses LNURL, not Lightning Addresses. Paste it in the LNURL box below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Generic banner (non-Fedi): Lightning Address or LNURL required */}
      {!isFediContext && !farmer.ln_address && (
        <div className="flex gap-3 items-start bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="text-yellow-300 font-semibold">Add a Lightning Address or LNURL to receive payments</p>
            <p className="text-yellow-500/80 text-xs">
              Buyers pay you directly — SokoPay never holds your funds.
            </p>
          </div>
        </div>
      )}

      {/* Nostr connection status */}
      {isNostrUser && (
        <div className="flex gap-3 items-center bg-brand-500/10 border border-brand-500/20 rounded-xl p-4">
          <ShieldCheck className="w-4 h-4 text-brand-400 shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <p className="text-xs font-semibold text-brand-300">
              Connected via {connectionLabel}
            </p>
            <p className="text-[10px] text-gray-500 font-mono truncate">
              npub: {farmer.nostr_pubkey}
            </p>
          </div>
        </div>
      )}

      {/* Display options link */}
      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Settings className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="text-left">
            <p className="text-sm font-medium text-gray-200">Display options</p>
            <p className="text-xs text-gray-500">Bitcoin unit, currency, theme, language</p>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
      </button>

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-5">

        <Field label="Display name">
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              className="input-base pl-9"
            />
          </div>
        </Field>

        {/* ── Payment Receiving ─────────────────────────────────────────────────── */}
        <div className="space-y-1">
          <p className="text-xs font-bold text-gray-300 uppercase tracking-wide">How buyers pay you</p>
          <p className="text-[11px] text-gray-500">
            Add at least one Lightning option. Buyers pay you directly — SokoPay never holds funds.
          </p>
        </div>

        {/* Box 1: Lightning Address */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/25 flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5 text-brand-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-100">Lightning Address</p>
              <p className="text-[11px] text-gray-500">Email-style address from your wallet</p>
            </div>
          </div>
          <LightningAddressField
            value={lnAddress}
            savedAddress={farmer.ln_address?.includes('@') ? farmer.ln_address : null}
            placeholder="you@wallet.com"
            formatHint={<>
              <p className="font-mono pl-2">you@wallet.com  — Alby, Fedi, WoS, Coinos…</p>
            </>}
            onChange={v => { setLnAddress(v); setSaved(false) }}
            onVerified={info => { setLnVerifyInfo(info); if (info) setLnurlVerifyInfo(null) }}
          />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-800" />
          <span className="text-[11px] text-gray-600 font-medium">or</span>
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        {/* Box 2: LNURL */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-900/40 border border-purple-700/30 flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-100">LNURL</p>
              <p className="text-[11px] text-gray-500">bech32 string from wallets without an email address</p>
            </div>
          </div>
          <LightningAddressField
            value={lnurl}
            savedAddress={farmer.ln_address?.toLowerCase().startsWith('lnurl1') ? farmer.ln_address : null}
            placeholder="lnurl1dp68gurn…"
            formatHint={<>
              <p className="font-mono pl-2">lnurl1dp68…  — bech32-encoded LNURL string</p>
              {isFediContext && (
                <div className="mt-1.5 flex items-start gap-1.5 bg-brand-500/8 border border-brand-500/20 rounded-lg px-2.5 py-2">
                  <span className="text-brand-400 shrink-0 mt-0.5">⚡</span>
                  <div>
                    <p className="text-brand-300 font-semibold">In Fedi:</p>
                    <p className="text-brand-400/80 mt-0.5">
                      Wallet → Receive → LNURL → Copy
                    </p>
                    <p className="text-gray-600 mt-0.5">
                      Fedi uses LNURL, not Lightning Addresses.
                    </p>
                  </div>
                </div>
              )}
            </>}
            onChange={v => { setLnurl(v); setSaved(false) }}
            onVerified={info => { setLnurlVerifyInfo(info); if (info) setLnVerifyInfo(null) }}
          />
        </div>

        {/* Box 3: On-chain Bitcoin */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-bitcoin/10 border border-bitcoin/20 flex items-center justify-center shrink-0">
              <Bitcoin className="w-3.5 h-3.5 text-bitcoin" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-100">On-chain Bitcoin Address</p>
              <p className="text-[11px] text-gray-500">Optional — for buyers who prefer on-chain BTC</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                value={btcAddress}
                onChange={e => { setBtcAddress(e.target.value); setBtcAddressError(null); setSaved(false) }}
                placeholder="bc1q… or 1… or 3…"
                autoComplete="off"
                spellCheck={false}
                className={clsx(
                  'input-base font-mono text-sm',
                  btcAddressError && 'border-red-700/60 focus:border-red-500',
                  !btcAddressError && btcAddress.trim() && btcAddress.trim() === (farmer?.btc_address ?? '') && 'border-bitcoin/30',
                )}
              />
              {!btcAddressError && btcAddress.trim() && btcAddress.trim() === (farmer?.btc_address ?? '') && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-bitcoin/70 pointer-events-none" />
              )}
            </div>
            {btcAddressError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5 shrink-0" /> {btcAddressError}
              </p>
            )}
            {!btcAddress && (
              <div className="text-[11px] text-gray-600 space-y-0.5 pl-1">
                <p className="font-mono">bc1q… / bc1p…  — SegWit / Taproot</p>
                <p className="font-mono">3…              — P2SH</p>
                <p className="font-mono">1…              — Legacy</p>
              </div>
            )}
            {farmer?.btc_address && btcAddress.trim() === farmer.btc_address && (
              <p className="text-xs text-bitcoin/70 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {farmer.btc_address.slice(0, 14)}…{farmer.btc_address.slice(-8)} — saved
              </p>
            )}
          </div>
        </div>

        <Field
          label="Your location"
          hint="Helps buyers see delivery distance estimates"
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={locationName}
                onChange={e => setLocationName(e.target.value)}
                placeholder="e.g. Nairobi, Westlands"
                className="input-base pl-9"
              />
            </div>
            <button
              type="button"
              onClick={handleGps}
              disabled={locating}
              className="btn-secondary px-3 shrink-0"
              title="Use GPS"
            >
              {locating
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <MapPin className="w-4 h-4" />}
            </button>
          </div>
          {(locationLat || farmer.location_name) && (
            <p className="text-xs text-brand-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              {locationLat ? 'GPS location captured' : `Saved: ${farmer.location_name}`}
            </p>
          )}
        </Field>

        {error && (
          <div className="flex gap-2 items-start bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          {!isSetup && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="btn-secondary flex-1 justify-center"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className={clsx(
              'flex-1 justify-center',
              saved ? 'btn-success' : 'btn-primary',
            )}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saved ? (
              <><Check className="w-4 h-4" /> {isSetup ? 'Done! Going to marketplace…' : 'Saved'}</>
            ) : (
              isSetup ? 'Save & Continue' : 'Save Changes'
            )}
          </button>
        </div>
      </form>

      {/* Referral sharing card */}
      {referral && (
        <div className="border-t border-gray-800 pt-5 space-y-3">
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-gray-200">Invite friends to SokoPay</h3>
          </div>
          <div className="bg-gradient-to-br from-brand-500/10 to-bitcoin/5 border border-brand-500/20 rounded-2xl p-4 space-y-3">
            <p className="text-xs text-gray-400 leading-relaxed">
              Share your referral link and earn rewards when your friends sign up and make their first purchase.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-xl px-3 py-2">
                <span className="text-xs font-mono font-bold text-brand-400">{referral.referral_code}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(referral.referral_code)
                  toast('Referral code copied!', 'success', 2000)
                }}
                className="p-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
                title="Copy code"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(referral.share_url)
                  toast('Invite link copied!', 'success', 2000)
                }}
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-800 border border-gray-700 text-xs font-semibold text-gray-200 hover:bg-gray-700 transition-colors"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Join me on SokoPay — Africa's Lightning marketplace! Use my code ${referral.referral_code} at sign-up:\n${referral.share_url}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-xs font-semibold text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Developer settings link */}
      <div className="border-t border-gray-800 pt-5">
        <button
          type="button"
          onClick={() => navigate('/settings/developer')}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-gray-900 border border-gray-800 hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Code2 className="w-4 h-4 text-gray-400 shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-gray-200">Developer & Referrals</p>
              <p className="text-xs text-gray-500">API keys, referral code, invite link</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
        </button>
      </div>
    </div>
  )
}

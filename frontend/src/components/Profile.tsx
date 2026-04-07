import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  User, Zap, MapPin, Check, AlertCircle, ExternalLink, Loader2, ShieldCheck,
} from 'lucide-react'
import { updateProfile, isFediContext } from '../api/client.ts'
import { useCurrentFarmer } from '../hooks/useCurrentFarmer.ts'
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

export default function Profile() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const isSetup = params.get('setup') === '1'
  const qc = useQueryClient()

  const { farmer, farmerId, isLoading } = useCurrentFarmer()

  const [name, setName] = useState('')
  const [lnAddress, setLnAddress] = useState('')
  const [locationName, setLocationName] = useState('')
  const [locationLat, setLocationLat] = useState<number | undefined>()
  const [locationLng, setLocationLng] = useState<number | undefined>()
  const [locating, setLocating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Populate form when farmer data arrives
  useEffect(() => {
    if (farmer) {
      setName(farmer.name ?? '')
      setLnAddress(farmer.ln_address ?? '')
      setLocationName(farmer.location_name ?? '')
    }
  }, [farmer])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!farmerId) return

    const trimmedLn = lnAddress.trim()
    if (trimmedLn && !trimmedLn.includes('@')) {
      setError('Lightning Address must be in the format user@domain.com')
      return
    }

    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      await updateProfile(farmerId, {
        name: name.trim() || undefined,
        ln_address: trimmedLn || undefined,
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
            ? 'Set your Lightning Address so buyers can pay you directly.'
            : 'Manage your account and payment settings.'}
        </p>
      </div>

      {/* Lightning Address banner (setup mode or missing) */}
      {!farmer.ln_address && (
        <div className="flex gap-3 items-start bg-yellow-900/20 border border-yellow-700/30 rounded-xl p-4">
          <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="text-yellow-300 font-semibold">Lightning Address required to sell</p>
            <p className="text-yellow-500/80">
              Buyers pay you directly to your Lightning Address. Without one, invoice generation will fail.
              {isFediContext && (
                <> You can find your Fedi Lightning Address in your federation's wallet settings.</>
              )}
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

        <Field
          label="Lightning Address"
          hint={
            isFediContext
              ? 'Found in Fedi → your federation → Lightning Address'
              : 'e.g. yourname@getalby.com or yourname@walletofsatoshi.com'
          }
        >
          <div className="relative">
            <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={lnAddress}
              onChange={e => setLnAddress(e.target.value)}
              placeholder="you@domain.com"
              inputMode="email"
              className={clsx(
                'input-base pl-9',
                farmer.ln_address && 'border-mpesa/30 focus:border-mpesa/60',
              )}
            />
            {farmer.ln_address && (
              <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mpesa pointer-events-none" />
            )}
          </div>
          {isFediContext && !farmer.ln_address && (
            <a
              href="https://www.fedi.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300"
            >
              <ExternalLink className="w-3 h-3" />
              Open Fedi to copy your address
            </a>
          )}
        </Field>

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
            <p className="text-xs text-mpesa">
              {locationLat ? 'GPS location captured' : `Location: ${farmer.location_name}`}
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
    </div>
  )
}

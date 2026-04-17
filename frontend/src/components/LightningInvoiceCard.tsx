/**
 * LightningInvoiceCard
 *
 * A self-contained bolt11 invoice display with:
 *   • SokoPay logo centred inside the QR code (imageSettings)
 *   • SVG circular countdown ring (green → yellow → red)
 *   • Coloured border on the QR card that tracks the timer
 *   • Live KES equivalent + rate stamp from the oracle
 *   • Full copy-to-clipboard + WebLN pay button
 *   • Manual preimage entry for external wallets
 *   • In-person / cash pickup confirmation
 *   • Expired overlay with one-tap refresh
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import {
  Copy, Check, Zap, Loader2, CheckCircle, RefreshCw, QrCode,
} from 'lucide-react'
import { getRate, formatSats } from '../api/client.ts'
import clsx from 'clsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Invoice {
  payment_id: string
  bolt11: string
  amount_sats: number
  expires_at: string
}

interface Props {
  invoice: Invoice

  // ── callbacks ────────────────────────────────────────────────────────────────
  onExpired(): void
  onCopy(): void
  onWebLN(): void
  onManualConfirm(): void
  onInPersonConfirm(): void
  onRefresh(): void
  onCancel(): void
  setPreimage(v: string): void

  // ── state passed down ────────────────────────────────────────────────────────
  copied: boolean
  confirming: boolean
  preimage: string
  payError: string | null
  hasWebLN: boolean
  isWebLNPaying: boolean
  isRefreshing: boolean
}

// ── SVG ring constants ────────────────────────────────────────────────────────
const RING_R = 20
const RING_CIRC = 2 * Math.PI * RING_R

// ── Component ─────────────────────────────────────────────────────────────────

export default function LightningInvoiceCard({
  invoice,
  onExpired, onCopy, onWebLN, onManualConfirm, onInPersonConfirm,
  onRefresh, onCancel, setPreimage,
  copied, confirming, preimage, payError,
  hasWebLN, isWebLNPaying, isRefreshing,
}: Props) {
  // ── Timer ──────────────────────────────────────────────────────────────────
  // Compute the total window once on mount so the ring fraction is accurate
  // even if the invoice arrives with less than the nominal 60-second TTL.
  const [totalSecs] = useState(() =>
    Math.max(1, Math.floor((new Date(invoice.expires_at).getTime() - Date.now()) / 1000)),
  )
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(invoice.expires_at).getTime() - Date.now()) / 1000)),
  )
  const [expired, setExpired] = useState(secsLeft === 0)

  useEffect(() => {
    const expiresAt = new Date(invoice.expires_at).getTime()
    const tick = () => {
      const s = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setSecsLeft(s)
      if (s === 0 && !expired) {
        setExpired(true)
        onExpired()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
    // onExpired is intentionally excluded — it's a stable handler in ProductDetail
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.expires_at])

  // ── Exchange rate ──────────────────────────────────────────────────────────
  // Use the same key as Layout.tsx so both components share one cached response
  // and no extra oracle request fires when the invoice card is mounted.
  const { data: rate } = useQuery({
    queryKey: ['rate'],
    queryFn: () => getRate(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const kesEquiv = rate
    ? (invoice.amount_sats * parseFloat(rate.sats_local))
    : null

  // ── Timer visuals ──────────────────────────────────────────────────────────
  const pct = expired ? 0 : secsLeft / totalSecs          // 1.0 → 0.0
  const ringColor =
    pct > 0.4 ? '#4ade80' :  // green-400
    pct > 0.2 ? '#facc15' :  // yellow-400
                '#f87171'    // red-400
  const qrBorder =
    pct > 0.4 ? 'border-green-500/60' :
    pct > 0.2 ? 'border-yellow-500/50' :
                'border-red-500/60'

  const dashoffset = RING_CIRC * (1 - pct)
  const mins = Math.floor(secsLeft / 60)
  const secs = secsLeft % 60
  const timeStr = mins > 0
    ? `${mins}:${String(secs).padStart(2, '0')}`
    : `${secsLeft}s`

  // ── Expired overlay ────────────────────────────────────────────────────────
  if (expired) {
    return (
      <div className="space-y-4">
        <div className="bg-gray-800/80 rounded-2xl p-6 text-center space-y-3 border border-gray-700">
          <div className="w-12 h-12 rounded-full bg-red-900/30 border border-red-700/40 flex items-center justify-center mx-auto">
            <Zap className="w-6 h-6 text-red-400" />
          </div>
          <p className="font-semibold text-gray-100">Invoice expired</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            The rate was locked for {totalSecs}s. Get a fresh invoice at the current rate.
          </p>
          <button
            onClick={() => {
              setExpired(false)
              onRefresh()
            }}
            disabled={isRefreshing}
            className="btn-primary mx-auto"
          >
            {isRefreshing
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Getting new invoice…</>
              : <><RefreshCw className="w-4 h-4" /> Get New Invoice</>}
          </button>
        </div>
        <button onClick={onCancel} className="btn-secondary w-full justify-center text-sm">
          Cancel
        </button>
      </div>
    )
  }

  // ── Active invoice ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header: amount + circular countdown ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-0.5">
            Pay exactly
          </p>
          <p className="text-2xl font-bold text-brand-400 leading-tight">
            {formatSats(invoice.amount_sats)}
          </p>
          {kesEquiv !== null && (
            <p className="text-sm text-gray-400 mt-0.5 tabular-nums">
              ≈ KES {kesEquiv.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          )}
        </div>

        {/* SVG ring timer */}
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90" aria-hidden>
            {/* Background track */}
            <circle
              cx="24" cy="24" r={RING_R}
              fill="none" stroke="rgb(55,65,81)" strokeWidth="4"
            />
            {/* Progress arc */}
            <circle
              cx="24" cy="24" r={RING_R}
              fill="none"
              stroke={ringColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              strokeDashoffset={dashoffset}
              style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
            />
          </svg>
          {/* Time label — rotated back upright */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-xs font-bold font-mono leading-none tabular-nums"
              style={{ color: ringColor }}
            >
              {timeStr}
            </span>
          </div>
        </div>
      </div>

      {/* ── QR code ─────────────────────────────────────────────────────────── */}
      {/*
        Logo overlay uses CSS absolute positioning rather than QRCodeSVG's
        imageSettings / excavate approach. SVG-in-SVG via <image href> is
        unreliable across browsers and screenshot renderers: the excavation
        (blank modules) may appear but the image silently fails to paint.
        A regular <img> element positioned over the QR works everywhere.
        level="H" keeps 30% error-correction headroom so scanners handle
        the logo obscuring the centre modules.
      */}
      <div
        className={clsx(
          'relative flex justify-center p-5 bg-white rounded-2xl border-4 transition-colors duration-700',
          qrBorder,
        )}
      >
        <QRCodeSVG
          value={invoice.bolt11.toUpperCase()}
          size={220}
          level="H"
        />
        {/* Centred logo — absolutely positioned over the QR */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-white shadow-sm ring-2 ring-white">
            <img src="/logo.svg" alt="SokoPay" className="w-full h-full" draggable={false} />
          </div>
        </div>
      </div>

      {/* ── Rate stamp ──────────────────────────────────────────────────────── */}
      {rate && (
        <p className="text-center text-[11px] text-gray-600">
          1 sat ≈ KES {parseFloat(rate.sats_local).toFixed(5)}&ensp;·&ensp;
          Updated {new Date(rate.fetched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}

      {/* ── Copy invoice ────────────────────────────────────────────────────── */}
      <button
        onClick={onCopy}
        className={clsx(
          'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl',
          'text-sm font-semibold border transition-colors',
          copied
            ? 'bg-green-900/20 border-green-700/30 text-green-400'
            : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700',
        )}
      >
        {copied
          ? <><Check className="w-4 h-4" /> Copied to clipboard</>
          : <><Copy className="w-4 h-4" /> Copy invoice</>}
      </button>

      {/* ── Scan instruction ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-gray-500 justify-center">
        <QrCode className="w-3.5 h-3.5 shrink-0" />
        Scan with any Lightning wallet — or copy and paste above.
      </div>

      {/* ── WebLN ───────────────────────────────────────────────────────────── */}
      {hasWebLN && (
        <button
          onClick={onWebLN}
          disabled={isWebLNPaying}
          className="btn-primary w-full justify-center"
        >
          {isWebLNPaying
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Paying…</>
            : <><Zap className="w-4 h-4" /> Pay with Fedi / WebLN</>}
        </button>
      )}

      {/* ── Manual preimage ─────────────────────────────────────────────────── */}
      <div className="space-y-1.5 border-t border-gray-700 pt-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Paid with another wallet?
        </p>
        <label className="text-[11px] text-gray-500">
          Paste the payment preimage (hex) from your wallet's payment details:
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="64-char hex preimage…"
            value={preimage}
            onChange={e => setPreimage(e.target.value)}
            className="input-base font-mono text-xs flex-1"
          />
          <button
            onClick={onManualConfirm}
            disabled={confirming || !/^[0-9a-f]{64}$/i.test(preimage.replace(/\s+/g, ''))}
            className="btn-primary px-3 shrink-0"
          >
            {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
          </button>
        </div>
        {preimage.length > 0 && !/^[0-9a-f]{64}$/i.test(preimage.replace(/\s+/g, '')) && (
          <p className="text-[11px] text-yellow-500">
            {preimage.replace(/\s+/g, '').length}/64 hex chars
          </p>
        )}
      </div>

      {/* ── In-person ───────────────────────────────────────────────────────── */}
      <div className="space-y-2 border-t border-gray-700 pt-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Collecting in person?
        </p>
        <p className="text-[11px] text-gray-500 leading-relaxed">
          If you're meeting the seller directly and have received your goods, confirm receipt here.
          No preimage needed.
        </p>
        <button
          onClick={onInPersonConfirm}
          disabled={confirming}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-mpesa/20 border border-mpesa/30 text-mpesa hover:bg-mpesa/30 transition-colors disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          {confirming ? 'Confirming…' : 'I received my goods'}
        </button>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {payError && (
        <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
          {payError}
        </p>
      )}

      {/* ── Cancel ──────────────────────────────────────────────────────────── */}
      <button onClick={onCancel} className="btn-secondary w-full justify-center text-sm">
        Cancel
      </button>
    </div>
  )
}

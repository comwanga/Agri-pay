import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import {
  Zap, ExternalLink, Copy, Check, ChevronDown, ChevronUp,
  Loader2, AlertCircle, RefreshCw,
} from 'lucide-react'
import { getLnurlInvoice, getRate } from '../api/client.ts'
import { hasWebLN, payWithWebLN } from '../api/client.ts'
import clsx from 'clsx'

interface Props {
  sellerName: string
  sellerId: string
}

const PRESET_AMOUNTS = [100, 500, 1000, 5000]
const DEBOUNCE_MS    = 600

export default function LightningSendTip({ sellerName, sellerId }: Props) {
  const [open, setOpen]           = useState(false)
  const [amount, setAmount]       = useState('')
  const [invoice, setInvoice]     = useState<string | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)
  const [webLnPaying, setWebLnPaying] = useState(false)
  const [webLnDone, setWebLnDone]     = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live KES equivalent from oracle
  const { data: rate } = useQuery({
    queryKey: ['rate'],
    queryFn:  () => getRate(),
    staleTime: 60_000,
    enabled: open,
  })

  const sats       = parseInt(amount) || 0
  const kesEquiv   = rate && sats > 0
    ? (sats * parseFloat(rate.sats_local)).toFixed(2)
    : null

  // Fetch a real BOLT11 invoice whenever amount changes (debounced)
  useEffect(() => {
    if (!open) return
    if (sats < 1) { setInvoice(null); setError(null); return }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    setError(null)
    setInvoice(null)
    setWebLnDone(false)

    debounceRef.current = setTimeout(async () => {
      try {
        const bolt11 = await getLnurlInvoice(sellerId, sats)
        setInvoice(bolt11)
        setError(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not generate invoice')
        setInvoice(null)
      } finally {
        setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, sellerId, open])

  function selectAmount(s: number) {
    setAmount(String(s))
    setWebLnDone(false)
  }

  function copyInvoice() {
    if (!invoice) return
    navigator.clipboard.writeText(invoice)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleWebLn() {
    if (!invoice) return
    setWebLnPaying(true)
    try {
      await payWithWebLN(invoice)
      setWebLnDone(true)
    } catch { /* user dismissed or wallet error */ }
    finally { setWebLnPaying(false) }
  }

  function retry() {
    // Re-trigger by toggling amount string
    setAmount(v => v + ' ')
    setTimeout(() => setAmount(v => v.trim()), 10)
  }

  // What to show in the QR panel
  const qrValue = invoice
    ? invoice.toUpperCase()   // real BOLT11 — uppercase for better QR density
    : 'lightning:'            // placeholder until invoice is fetched

  const qrLabel = invoice ? 'Scan to pay exact amount' : 'Scan to open in wallet'

  return (
    <div className="border-t border-gray-800 pt-4">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-bitcoin" />
          <span className="text-sm font-semibold text-gray-200">Send a Lightning tip</span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-500" />
          : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <p className="text-xs text-gray-500">
            Send sats directly to{' '}
            <span className="text-gray-300 font-medium">{sellerName}</span>'s
            Lightning wallet. Pick an amount to generate a real payment invoice.
          </p>

          {/* Amount selector */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              Quick amounts (sats)
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {PRESET_AMOUNTS.map(s => (
                <button
                  key={s}
                  onClick={() => selectAmount(s)}
                  className={clsx(
                    'py-2 rounded-xl text-xs font-semibold border transition-all',
                    amount === String(s)
                      ? 'bg-bitcoin/20 border-bitcoin/30 text-bitcoin'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500',
                  )}
                >
                  {s >= 1000 ? `${s / 1000}k` : s}
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="number"
                placeholder="Custom amount in sats…"
                value={amount}
                onChange={e => { setAmount(e.target.value); setWebLnDone(false) }}
                className="input-base text-sm pr-20"
                min={1}
              />
              {kesEquiv && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-500 tabular-nums pointer-events-none">
                  ≈ KES {parseFloat(kesEquiv).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          {/* QR panel */}
          <div className="flex gap-4 items-start">
            {/* QR code */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div className={clsx(
                'relative p-3 bg-white rounded-xl border-4 transition-colors duration-500',
                invoice  ? 'border-bitcoin/60' : 'border-gray-200',
              )}>
                {loading ? (
                  <div className="w-[180px] h-[180px] flex items-center justify-center bg-gray-100 rounded-lg">
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                  </div>
                ) : (
                  <>
                    {/*
                      size=180 — each QR module ≈3.2 px, comfortably above the
                      ~2.5 px minimum most phone cameras resolve reliably.

                      level="H" — 30% error correction. Required any time a logo
                      overlays the QR; 'M' (15%) would be less than the ~10%
                      occlusion the logo creates, risking silent scan failures.
                    */}
                    <QRCodeSVG
                      value={qrValue}
                      size={180}
                      level="H"
                    />
                    {/* Logo overlay: w-7 = 28px over 180px QR = ~11% occlusion,
                        well within the 30% H-level recovery budget. */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-7 h-7 rounded-lg overflow-hidden bg-white ring-2 ring-white shadow-sm">
                        <img src="/logo.svg" alt="" className="w-full h-full" draggable={false} />
                      </div>
                    </div>
                  </>
                )}
              </div>
              <p className="text-[10px] text-gray-600 text-center max-w-[180px]">{qrLabel}</p>
              {invoice && (
                <span className="text-[10px] font-semibold text-bitcoin bg-bitcoin/10 border border-bitcoin/20 px-2 py-0.5 rounded-full">
                  ⚡ {sats.toLocaleString()} sats
                </span>
              )}
            </div>

            {/* Right: status + copy + webln */}
            <div className="flex-1 min-w-0 space-y-2.5">
              {/* Invoice ready */}
              {invoice && !loading && (
                <>
                  <div className="flex items-center gap-1.5 text-[11px] text-green-400 font-semibold">
                    <Zap className="w-3 h-3 shrink-0" />
                    Invoice ready — scan or tap below
                  </div>

                  <button
                    onClick={copyInvoice}
                    className={clsx(
                      'w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border transition-all',
                      copied
                        ? 'bg-green-900/20 border-green-700/30 text-green-400'
                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700',
                    )}
                  >
                    {copied
                      ? <><Check className="w-3.5 h-3.5" />Copied!</>
                      : <><Copy className="w-3.5 h-3.5" />Copy invoice</>}
                  </button>

                  {hasWebLN && !webLnDone && (
                    <button
                      onClick={handleWebLn}
                      disabled={webLnPaying}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-bitcoin/10 border border-bitcoin/20 text-bitcoin hover:bg-bitcoin/20 transition-all disabled:opacity-50"
                    >
                      {webLnPaying
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Paying…</>
                        : <><Zap className="w-3.5 h-3.5" />Pay with Fedi / WebLN</>}
                    </button>
                  )}

                  {webLnDone && (
                    <div className="flex items-center gap-1.5 text-[11px] text-green-400 font-semibold">
                      <Check className="w-3.5 h-3.5" />
                      Payment sent! Thank you ⚡
                    </div>
                  )}

                  <a
                    href={`lightning:${invoice}`}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open in wallet app
                  </a>
                </>
              )}

              {/* Loading */}
              {loading && (
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Generating invoice…
                </p>
              )}

              {/* Error */}
              {error && !loading && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700/30 rounded-xl px-3 py-2.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Invoice unavailable</p>
                      <p className="text-yellow-500/80 mt-0.5 text-[10px] leading-relaxed">
                        The seller's Lightning node may not be configured. Use the QR to open in your wallet manually.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={retry}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Try again
                  </button>
                </div>
              )}

              {/* No amount selected yet */}
              {!invoice && !loading && !error && (
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  Select an amount above to generate a scannable payment invoice for exactly that amount.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

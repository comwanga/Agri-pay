import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, MapPin, Package, Truck, Zap,
  CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Check,
  Loader2, ShoppingCart, BadgeCheck, ShieldCheck,
  Heart, TrendingUp, ChevronRight as ChevronRightIcon, Share2,
} from 'lucide-react'
import {
  getProduct, getOrder, createOrder, createInvoice, confirmPayment,
  updateOrderStatus, payWithWebLN, hasWebLN, formatKes, formatUsd, kesToUsd, getRate,
  rateProduct, listProducts,
} from '../api/client.ts'
import { useAuth } from '../context/auth.tsx'
import { useCart } from '../context/cart.tsx'
import { useWishlist } from '../context/wishlist.tsx'
import { useDisplaySettings } from '../context/displaySettings.tsx'
import { useToast } from '../context/toast.tsx'
import { useRecentlyViewed } from '../hooks/useRecentlyViewed.ts'
import LightningInvoiceCard from './LightningInvoiceCard.tsx'
import StarRating from './StarRating.tsx'
import ProductCard from './ProductCard.tsx'
import ShareProductModal from './ShareProductModal.tsx'
import ReceiptDownloadButton from './PaymentReceipt.tsx'
import clsx from 'clsx'

type BuyStep = 'details' | 'location' | 'invoice' | 'paying' | 'done'

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { authed, connecting, connect } = useAuth()
  const { fiatCurrency, update: updateDisplay } = useDisplaySettings()
  const { addItem, items } = useCart()
  const [cartAdded, setCartAdded] = useState(false)

  const [imgIdx, setImgIdx] = useState(0)
  const [buyStep, setBuyStep] = useState<BuyStep | null>(null)

  // Buy form state
  const [quantity, setQuantity] = useState('1')
  const [locationName, setLocationName] = useState('')
  const [locating, setLocating] = useState(false)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)

  // Lightning state
  const [orderId, setOrderId] = useState<string | null>(null)
  const [invoice, setInvoice] = useState<{
    payment_id: string; bolt11: string; amount_sats: number; expires_at: string; has_auto_detect: boolean
  } | null>(null)
  const [invoiceExpired, setInvoiceExpired] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [preimage, setPreimage] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Rating state
  const [ratingValue, setRatingValue] = useState(0)
  const [ratingReview, setRatingReview] = useState('')
  const [ratingSubmitting, setRatingSubmitting] = useState(false)
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [ratingError, setRatingError] = useState<string | null>(null)

  const { push: pushRecent }  = useRecentlyViewed()
  const { has: wishlisted, toggle: toggleWishlist } = useWishlist()
  const { toast }             = useToast()
  const [showShare, setShowShare] = useState(false)

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['product', id],
    queryFn: () => getProduct(id!),
    enabled: !!id,
  })

  // Rate for USD/KES price display (shared cache key with ProductCard)
  const { data: rate } = useQuery({
    queryKey: ['rate', 'KES'],
    queryFn: () => getRate('KES'),
    staleTime: 60_000,
  })

  const { data: similarProducts } = useQuery({
    queryKey: ['similar', product?.category, id],
    queryFn: () => listProducts({ category: product!.category, sort: 'rating', in_stock: true, per_page: 8 }),
    enabled: !!product?.category,
    staleTime: 120_000,
    select: data => data.filter(p => p.id !== id).slice(0, 6),
  })

  useEffect(() => {
    if (id && product) pushRecent(id)
  }, [id, product, pushRecent])

  // ── Poll order status while Lightning invoice is active ───────────────────────
  // WebLN payments (Fedi) return a preimage and auto-confirm.
  // For manual wallets, polling detects settlement via confirmPayment.
  useEffect(() => {
    if ((buyStep !== 'invoice' && buyStep !== 'paying') || !orderId || invoiceExpired) return
    let delay = 3000
    let timeoutId: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const order = await getOrder(orderId!)
        if (order.status === 'paid') {
          qc.invalidateQueries({ queryKey: ['orders'] })
          setBuyStep('done')
          return
        }
      } catch { /* ignore transient errors */ }
      delay = Math.min(delay * 2, 30_000)
      timeoutId = setTimeout(poll, delay)
    }

    timeoutId = setTimeout(poll, delay)
    return () => clearTimeout(timeoutId)
  }, [buyStep, orderId, invoiceExpired, qc])

  // ── Place order + fetch Lightning invoice in one step ─────────────────────────
  // SokoPay is Lightning-first — we skip method selection and go straight to
  // the invoice. The invoice is generated from the seller's own Lightning
  // Address / LNURL; funds settle directly into their wallet.
  const placeOrder = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error('No product')
      const qty = parseFloat(quantity)
      if (isNaN(qty) || qty <= 0) throw new Error('Invalid quantity')

      const order = await createOrder({
        product_id: product.id,
        quantity,
        buyer_lat: coords?.lat,
        buyer_lng: coords?.lng,
        buyer_location_name: locationName || undefined,
      })
      setOrderId(order.id)

      const inv = await createInvoice(order.id)
      setInvoice({
        payment_id: inv.payment_id,
        bolt11: inv.bolt11,
        amount_sats: inv.amount_sats,
        expires_at: inv.expires_at,
        has_auto_detect: inv.has_auto_detect,
      })
      setInvoiceExpired(false)
      setBuyStep('invoice')
    },
    onError: (e: Error) => setPayError(e.message),
  })

  // ── Refresh expired invoice (same order, new bolt11) ──────────────────────────
  const refreshInvoiceMut = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error('No order')
      const inv = await createInvoice(orderId)
      setInvoice({
        payment_id: inv.payment_id,
        bolt11: inv.bolt11,
        amount_sats: inv.amount_sats,
        expires_at: inv.expires_at,
        has_auto_detect: inv.has_auto_detect,
      })
      setInvoiceExpired(false)
      setBuyStep('invoice')
    },
    onError: (e: Error) => setPayError(e.message),
  })

  const refreshInvoice = useCallback(() => {
    setPayError(null)
    setInvoiceExpired(false)
    refreshInvoiceMut.mutate()
  }, [refreshInvoiceMut])

  // ── WebLN payment ────────────────────────────────────────────────────────────
  const payWebLN = useMutation({
    mutationFn: async () => {
      if (!invoice) throw new Error('No invoice')
      setBuyStep('paying')
      setPayError(null)
      const paymentPreimage = await payWithWebLN(invoice.bolt11)
      await confirmPayment(invoice.payment_id, paymentPreimage)
      qc.invalidateQueries({ queryKey: ['orders'] })
      setBuyStep('done')
    },
    onError: (e: Error) => {
      setPayError(e.message)
      setBuyStep('invoice')
    },
  })

  async function handleManualConfirm() {
    const cleaned = preimage.replace(/\s+/g, '').toLowerCase()
    if (!invoice || cleaned.length !== 64 || !/^[0-9a-f]{64}$/.test(cleaned)) {
      setPayError('Paste the 64-character hex preimage from your Lightning wallet.')
      return
    }
    setConfirming(true)
    setPayError(null)
    try {
      await confirmPayment(invoice.payment_id, cleaned)
      qc.invalidateQueries({ queryKey: ['orders'] })
      setBuyStep('done')
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Confirmation failed')
    } finally {
      setConfirming(false)
    }
  }

  function copyBolt11() {
    if (invoice) { navigator.clipboard.writeText(invoice.bolt11); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  }

  async function handleInPersonConfirm() {
    if (!orderId) return
    setConfirming(true)
    setPayError(null)
    try {
      await updateOrderStatus(orderId, { status: 'confirmed', notes: 'In-person pickup confirmed by buyer' })
      qc.invalidateQueries({ queryKey: ['orders'] })
      setBuyStep('done')
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Confirmation failed')
    } finally {
      setConfirming(false)
    }
  }

  async function handleRatingSubmit() {
    if (!product || !orderId || ratingValue === 0) return
    setRatingSubmitting(true)
    setRatingError(null)
    try {
      await rateProduct(product.id, {
        order_id: orderId,
        rating: ratingValue,
        review: ratingReview.trim() || undefined,
      })
      setRatingSubmitted(true)
    } catch (e) {
      setRatingError(e instanceof Error ? e.message : 'Failed to submit rating')
    } finally {
      setRatingSubmitting(false)
    }
  }

  async function handleGetLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      () => setLocating(false),
    )
  }

  function resetBuy() {
    setBuyStep(null)
    setOrderId(null)
    setInvoice(null)
    setInvoiceExpired(false)
    setPreimage('')
    setPayError(null)
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-3xl">
        <div className="skeleton h-6 w-32 rounded" />
        <div className="skeleton aspect-video rounded-xl" />
        <div className="skeleton h-8 w-2/3 rounded" />
      </div>
    )
  }

  if (isError || !product) {
    return (
      <div className="p-6 text-center py-20 text-gray-500">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" />
        <p>Product not found.</p>
      </div>
    )
  }

  const images = product.images
  const qty = parseFloat(product.quantity_avail)

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to marketplace
      </button>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Images */}
        <div className="space-y-3">
          <div className="aspect-video bg-gray-800 rounded-xl overflow-hidden relative">
            {images.length > 0 ? (
              <img
                src={images[imgIdx]?.url}
                alt={product.title}
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="w-16 h-16 text-gray-600" />
              </div>
            )}
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setImgIdx(i => Math.max(0, i - 1))}
                  disabled={imgIdx === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gray-900/70 flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setImgIdx(i => Math.min(images.length - 1, i + 1))}
                  disabled={imgIdx === images.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-gray-900/70 flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setImgIdx(i)}
                  className={clsx(
                    'w-14 h-14 rounded-lg overflow-hidden shrink-0 border-2',
                    i === imgIdx ? 'border-brand-500' : 'border-transparent',
                  )}
                >
                  <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info + Buy */}
        <div className="space-y-4">
          {product.category && (
            <span className="text-xs font-semibold bg-gray-800 text-gray-400 px-2 py-1 rounded-full">
              {product.category}
            </span>
          )}

          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-bold text-gray-100 flex-1">{product.title}</h1>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowShare(true)}
                aria-label="Share product"
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all border bg-gray-800 border-gray-700 text-gray-500 hover:text-brand-400 hover:border-brand-500/30"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const added = toggleWishlist(product.id)
                  toast(added ? 'Saved to wishlist' : 'Removed from wishlist', added ? 'success' : 'info', 2500)
                }}
                aria-label={wishlisted(product.id) ? 'Remove from wishlist' : 'Save to wishlist'}
                className={clsx(
                  'w-9 h-9 rounded-xl flex items-center justify-center transition-all border',
                  wishlisted(product.id)
                    ? 'bg-red-500/20 border-red-500/30 text-red-400'
                    : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-red-400 hover:border-red-500/30',
                )}
              >
                <Heart className={clsx('w-4 h-4', wishlisted(product.id) && 'fill-current')} />
              </button>
            </div>
          </div>

          {(product.rating_count ?? 0) > 0 && (
            <div className="flex items-center gap-2">
              <StarRating rating={product.avg_rating ?? 0} size="sm" />
              <span className="text-xs text-gray-500">
                {(product.avg_rating ?? 0).toFixed(1)} ({product.rating_count} review{product.rating_count !== 1 ? 's' : ''})
              </span>
            </div>
          )}

          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold text-brand-400">
              {fiatCurrency === 'USD' && rate
                ? formatUsd(kesToUsd(parseFloat(product.price_kes), rate))
                : formatKes(product.price_kes)}
            </span>
            <span className="text-sm text-gray-500">/{product.unit}</span>
            <button
              onClick={() => updateDisplay({ fiatCurrency: fiatCurrency === 'USD' ? 'KES' : 'USD' })}
              className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors leading-none"
              title={fiatCurrency === 'USD' ? 'Switch to KES' : 'Switch to USD'}
            >
              {fiatCurrency === 'USD' ? 'KES' : 'USD'}
            </button>
          </div>

          {/* Price position relative to similar products */}
          {similarProducts && similarProducts.length > 1 && (
            <PricePosition price={parseFloat(product.price_kes)} peers={similarProducts.map(p => parseFloat(p.price_kes))} />
          )}

          <div className="space-y-1 text-sm text-gray-400">
            <p className="flex items-center gap-1.5 flex-wrap">
              Sold by <span className="text-gray-200 font-medium">{product.seller_name}</span>
              {product.seller_verified && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded-full">
                  <BadgeCheck className="w-3 h-3" />
                  Verified
                </span>
              )}
            </p>
            {product.escrow_mode && (
              <div className="flex items-center gap-2 mt-1">
                <span className="coming-soon-pill">
                  <ShieldCheck className="w-3 h-3" /> Escrow Soon
                </span>
                <span className="text-[11px] text-gray-500">Buyer protection launching soon</span>
              </div>
            )}
            {product.location_name && (
              <p className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {product.location_name}
              </p>
            )}
            <p>Available: <span className="text-gray-200">{qty} {product.unit}</span></p>
          </div>

          {product.description && (
            <p className="text-sm text-gray-400 leading-relaxed">{product.description}</p>
          )}

          {/* Buy flow */}
          {buyStep === null && (
            <div className="space-y-2">
              <button
                disabled={qty <= 0 || connecting}
                onClick={() => {
                  if (!authed) { connect(); return }
                  setBuyStep('details')
                  setPayError(null)
                }}
                className="btn-primary w-full justify-center"
              >
                <Zap className="w-4 h-4" />
                {qty <= 0
                  ? 'Out of Stock'
                  : connecting
                    ? 'Connecting…'
                    : authed
                      ? 'Buy Now'
                      : 'Connect to Buy'}
              </button>

              {qty > 0 && (
                <button
                  onClick={() => {
                    addItem(product, 1)
                    setCartAdded(true)
                    setTimeout(() => setCartAdded(false), 1500)
                  }}
                  className={clsx(
                    'btn-secondary w-full justify-center gap-2',
                    cartAdded && 'text-brand-400 border-brand-500/40',
                  )}
                >
                  {cartAdded ? (
                    <><Check className="w-4 h-4" /> Added to cart</>
                  ) : items.some(i => i.product.id === product.id) ? (
                    <><ShoppingCart className="w-4 h-4" /> In cart</>
                  ) : (
                    <><ShoppingCart className="w-4 h-4" /> Add to cart</>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Step: quantity + location */}
          {(buyStep === 'details' || buyStep === 'location') && (
            <div className="card p-4 space-y-4">
              <h3 className="font-semibold text-gray-100">Order Details</h3>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400">
                  Quantity ({product.unit})
                </label>
                <input
                  type="number"
                  min="0.01"
                  max={product.quantity_avail}
                  step="0.01"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="input-base"
                />
                <p className="text-xs text-gray-500">
                  Total: {formatKes(
                    String(parseFloat(quantity || '0') * parseFloat(product.price_kes))
                  )}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-400">Your location (for delivery estimate)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Nairobi, Westlands"
                    value={locationName}
                    onChange={e => setLocationName(e.target.value)}
                    className="input-base"
                  />
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={locating}
                    className="btn-secondary px-3 shrink-0"
                    title="Use GPS location"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                </div>
                {coords && (
                  <p className="text-xs text-mpesa">GPS location captured</p>
                )}
              </div>

              {payError && (
                <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                  {payError}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setBuyStep(null); setPayError(null) }}
                  className="btn-secondary flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  onClick={() => placeOrder.mutate()}
                  disabled={placeOrder.isPending}
                  className="btn-primary flex-1 justify-center"
                >
                  {placeOrder.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Getting invoice…</>
                    : <><Zap className="w-4 h-4" />Pay with Lightning</>
                  }
                </button>
              </div>
            </div>
          )}

          {/* Step: show Lightning invoice */}
          {buyStep === 'invoice' && invoice && (
            <div className="card p-4">
              <LightningInvoiceCard
                invoice={invoice}
                hasAutoDetect={invoice.has_auto_detect}
                onExpired={() => setInvoiceExpired(true)}
                onCopy={copyBolt11}
                onWebLN={() => payWebLN.mutate()}
                onManualConfirm={handleManualConfirm}
                onInPersonConfirm={handleInPersonConfirm}
                onRefresh={refreshInvoice}
                onCancel={resetBuy}
                setPreimage={setPreimage}
                copied={copied}
                confirming={confirming}
                preimage={preimage}
                payError={payError}
                hasWebLN={hasWebLN}
                isWebLNPaying={payWebLN.isPending}
                isRefreshing={refreshInvoiceMut.isPending}
              />
            </div>
          )}

          {/* Step: WebLN paying */}
          {buyStep === 'paying' && (
            <div className="card p-6 text-center space-y-3">
              <Zap className="w-8 h-8 text-brand-400 animate-pulse mx-auto" />
              <p className="text-sm text-gray-300">Processing payment…</p>
            </div>
          )}

          {/* Step: done */}
          {buyStep === 'done' && (
            <div className="card p-6 space-y-4">
              <div className="text-center space-y-2">
                <CheckCircle className="w-10 h-10 text-brand-400 mx-auto" />
                <p className="font-semibold text-gray-100">Payment confirmed!</p>
                <p className="text-sm text-gray-400">
                  Lightning payment settled. Track your delivery below.
                </p>
                <div className="flex gap-2 justify-center flex-wrap">
                  <button onClick={() => navigate('/orders')} className="btn-primary">
                    <Truck className="w-4 h-4" />
                    Track Order
                  </button>
                  {orderId && (
                    <ReceiptDownloadButton data={{
                      orderId,
                      productTitle: product.title,
                      sellerName: product.seller_name,
                      quantity,
                      unit: product.unit,
                      priceKes: product.price_kes,
                      totalKes: String(parseFloat(quantity || '0') * parseFloat(product.price_kes)),
                      paymentMethod: 'lightning' as const,
                      amountSats: invoice?.amount_sats,
                      settledAt: new Date().toISOString(),
                    }} />
                  )}
                </div>
                <p className="text-xs text-gray-600">
                  Once marked delivered, you can confirm receipt or raise a dispute from My Orders.
                </p>
              </div>

              {/* Rating form */}
              {!ratingSubmitted ? (
                <div className="border-t border-gray-700 pt-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-200">Rate this product</p>
                  <StarRating
                    rating={ratingValue}
                    size="md"
                    interactive
                    onChange={setRatingValue}
                  />
                  <textarea
                    rows={2}
                    placeholder="Leave a review (optional)"
                    value={ratingReview}
                    onChange={e => setRatingReview(e.target.value)}
                    className="input-base text-sm w-full resize-none"
                  />
                  {ratingError && (
                    <p className="text-xs text-red-400 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2">
                      {ratingError}
                    </p>
                  )}
                  <button
                    onClick={handleRatingSubmit}
                    disabled={ratingValue === 0 || ratingSubmitting}
                    className="btn-secondary text-sm w-full justify-center"
                  >
                    {ratingSubmitting ? 'Submitting…' : 'Submit Rating'}
                  </button>
                </div>
              ) : (
                <div className="border-t border-gray-700 pt-4 text-center">
                  <p className="text-sm text-mpesa font-medium">Thanks for your rating!</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Similar Products */}
      {similarProducts && similarProducts.length > 0 && (
        <SimilarProductsRow
          products={similarProducts}
          category={product.category}
        />
      )}

      {showShare && (
        <ShareProductModal product={product} onClose={() => setShowShare(false)} />
      )}
    </div>
  )
}

// ── Price Position indicator ───────────────────────────────────────────────────
function PricePosition({ price, peers }: { price: number; peers: number[] }) {
  const all = [...peers, price].sort((a, b) => a - b)
  const min = all[0]
  const max = all[all.length - 1]
  const range = max - min
  const pct = range === 0 ? 50 : Math.round(((price - min) / range) * 100)

  const label =
    pct <= 25 ? 'Below average — great value' :
    pct <= 55 ? 'Near average price' :
    pct <= 80 ? 'Above average price' :
                'Premium priced'

  const color =
    pct <= 25 ? 'text-green-400' :
    pct <= 55 ? 'text-brand-400' :
    pct <= 80 ? 'text-yellow-400' :
                'text-red-400'

  const barColor =
    pct <= 25 ? 'bg-green-400' :
    pct <= 55 ? 'bg-brand-400' :
    pct <= 80 ? 'bg-yellow-400' :
                'bg-red-400'

  return (
    <div className="space-y-1.5 p-3 bg-gray-800/50 border border-gray-700/50 rounded-xl">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-gray-400">
          <TrendingUp className="w-3.5 h-3.5" />
          Price vs similar listings
        </span>
        <span className={clsx('text-[11px] font-semibold', color)}>{label}</span>
      </div>
      <div className="relative h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={clsx('absolute inset-y-0 left-0 rounded-full', barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-600">
        <span>{formatKes(String(Math.min(...peers)))}</span>
        <span>{formatKes(String(Math.max(...peers)))}</span>
      </div>
    </div>
  )
}

// ── Similar Products horizontal row ───────────────────────────────────────────
import type { Product } from '../types'

function SimilarProductsRow({ products, category }: { products: Product[]; category: string }) {
  const navigate = useNavigate()
  const rowRef   = useRef<HTMLDivElement>(null)

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-100">Similar in {category}</h2>
        <button
          onClick={() => navigate(`/category/${encodeURIComponent(category)}`)}
          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium"
        >
          See all <ChevronRightIcon className="w-3 h-3" />
        </button>
      </div>
      <div
        ref={rowRef}
        className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-6 px-6"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        {products.map(p => (
          <div key={p.id} className="shrink-0 w-44 sm:w-48" style={{ scrollSnapAlign: 'start' }}>
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  )
}

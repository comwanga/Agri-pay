import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, ArrowRight, Zap, ShieldCheck,
  Globe, BadgeCheck, Clock, Store, Check,
} from 'lucide-react'
import { listProducts, getProduct, formatKes } from '../api/client.ts'
import { PRODUCT_CATEGORIES, CATEGORY_ICONS, countryName } from '../types'
import { useRecentlyViewed } from '../hooks/useRecentlyViewed.ts'
import { useSellerFollow } from '../hooks/useSellerFollow.ts'
import { useCountry } from '../hooks/useCountry.ts'
import ProductCard from './ProductCard.tsx'
import LeaderboardSection from './LeaderboardSection.tsx'
import clsx from 'clsx'
import type { Product } from '../types'




const HERO_SLIDES = [
  {
    eyebrow: 'Instant · Borderless · Free',
    headline: 'Pay with Lightning ⚡',
    sub: 'Send money anywhere in the world in seconds. No bank account needed.',
    cta: 'Shop Now',
    link: '/browse',
    gradient: 'from-brand-600/35 via-gray-950 to-gray-950',
    ctaClass: 'bg-brand-500/25 border-brand-500/50 text-brand-300 hover:bg-brand-500/40',
    iconEl: <Zap className="w-44 h-44 sm:w-64 sm:h-64 text-brand-500/10" />,
  },
  {
    eyebrow: 'Coming soon',
    headline: 'Escrow Protection 🔒',
    sub: 'Funds held securely until you confirm delivery. Buy with total peace of mind. Launching soon.',
    cta: 'Learn More',
    link: '/browse',
    badge: 'Soon',
    gradient: 'from-purple-900/40 via-gray-950 to-gray-950',
    ctaClass: 'bg-purple-900/40 border-purple-700/50 text-purple-300 hover:bg-purple-900/60',
    iconEl: <ShieldCheck className="w-44 h-44 sm:w-64 sm:h-64 text-purple-500/10" />,
  },
  {
    eyebrow: 'Global marketplace',
    headline: 'Sell to Anyone, Anywhere 🌍',
    sub: 'List products in minutes. Accept Lightning payments instantly. Get paid the moment they buy.',
    cta: 'Start Selling',
    link: '/sell/new',
    gradient: 'from-bitcoin/15 via-gray-950 to-gray-950',
    ctaClass: 'bg-bitcoin/20 border-bitcoin/40 text-bitcoin hover:bg-bitcoin/30',
    iconEl: <Globe className="w-44 h-44 sm:w-64 sm:h-64 text-bitcoin/10" />,
  },
]

function HeroCarousel() {
  const navigate = useNavigate()
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function startTimer() {
    timerRef.current = setInterval(() => {
      setCurrent(c => (c + 1) % HERO_SLIDES.length)
    }, 5000)
  }

  useEffect(() => {
    startTimer()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function goTo(idx: number) {
    if (timerRef.current) clearInterval(timerRef.current)
    setCurrent(idx)
    startTimer()
  }

  function prev() { goTo((current - 1 + HERO_SLIDES.length) % HERO_SLIDES.length) }
  function next() { goTo((current + 1) % HERO_SLIDES.length) }

  const slide = HERO_SLIDES[current]

  return (
    <div className={clsx(
      'relative overflow-hidden rounded-2xl bg-gradient-to-br',
      'min-h-[260px] sm:min-h-[380px]',
      slide.gradient,
    )}>
      {/* Subtle dot-grid texture */}
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />

      {/* Decorative icon — right side, oversized */}
      <div className="absolute right-0 top-0 bottom-0 flex items-center justify-end pr-4 sm:pr-10 pointer-events-none select-none overflow-hidden">
        {slide.iconEl}
      </div>

      {/* Content — constrained so text doesn't overlap the icon */}
      <div className="relative z-10 flex flex-col justify-center h-full px-6 sm:px-10 py-10 sm:py-14 gap-3 sm:gap-4 max-w-[68%] sm:max-w-lg">
        <span className="section-eyebrow">{slide.eyebrow}</span>
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight">
          {slide.headline}
        </h2>
        <p className="text-sm sm:text-base text-gray-400 leading-relaxed">{slide.sub}</p>
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => navigate(slide.link)}
            className={clsx(
              'flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl text-sm font-bold border transition-all backdrop-blur-sm',
              slide.ctaClass,
            )}
          >
            {slide.cta} <ArrowRight className="w-4 h-4" />
          </button>
          {slide.badge && (
            <span className="coming-soon-pill">{slide.badge}</span>
          )}
        </div>
      </div>

      {/* Nav arrows */}
      <button
        onClick={prev}
        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-gray-950/60 text-gray-300 hover:bg-gray-900/80 transition-colors backdrop-blur-sm"
        aria-label="Previous slide"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={next}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-gray-950/60 text-gray-300 hover:bg-gray-900/80 transition-colors backdrop-blur-sm"
        aria-label="Next slide"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {HERO_SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={clsx(
              'rounded-full transition-all duration-300',
              i === current ? 'w-6 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/30 hover:bg-white/50',
            )}
          />
        ))}
      </div>
    </div>
  )
}


function CategoryGrid() {
  const navigate = useNavigate()

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="section-eyebrow mb-0.5">Browse</p>
          <h2 className="text-lg font-bold text-gray-100">Shop by Department</h2>
        </div>
        <button
          onClick={() => navigate('/browse')}
          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
        >
          All categories <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-2">
        {PRODUCT_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => navigate(`/category/${encodeURIComponent(cat)}`)}
            className="flex flex-col items-center gap-2 p-3 rounded-xl bg-gray-900 border border-gray-800 hover:border-brand-500/50 hover:bg-brand-500/10 transition-all group"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform duration-200">
              {CATEGORY_ICONS[cat] ?? '📦'}
            </span>
            <span className="text-[10px] text-gray-400 font-semibold text-center leading-tight line-clamp-2 group-hover:text-brand-400 transition-colors">
              {cat.split(' ')[0]}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}


function ProductRow({ title, products, viewAllLink }: { title: string; products: Product[]; viewAllLink: string }) {
  const navigate = useNavigate()
  const rowRef = useRef<HTMLDivElement>(null)

  function scroll(dir: 'left' | 'right') {
    if (!rowRef.current) return
    rowRef.current.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' })
  }

  if (!products.length) return null

  return (
    <section className="relative">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-100">{title}</h2>
        <button
          onClick={() => navigate(viewAllLink)}
          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-semibold transition-colors"
        >
          See all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="relative group/row">
        {/* Left scroll button */}
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 w-8 h-8 rounded-full bg-gray-900 border border-gray-700 shadow-lg text-gray-300 hover:text-gray-100 hover:bg-gray-800 transition-all opacity-0 group-hover/row:opacity-100 hidden sm:flex items-center justify-center"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div
          ref={rowRef}
          className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {products.map(product => (
            <div
              key={product.id}
              className="shrink-0 w-44 sm:w-48"
              style={{ scrollSnapAlign: 'start' }}
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>

        {/* Right scroll button */}
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 rounded-full bg-gray-900 border border-gray-700 shadow-lg text-gray-300 hover:text-gray-100 hover:bg-gray-800 transition-all opacity-0 group-hover/row:opacity-100 hidden sm:flex items-center justify-center"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </section>
  )
}


function EditorialSpotlight({ category, gradient, tagline }: { category: string; gradient: string; tagline: string }) {
  const navigate = useNavigate()
  const { data } = useQuery({
    queryKey: ['home-spotlight', category],
    queryFn: () => listProducts({ category, sort: 'rating', in_stock: true, per_page: 4 }),
    staleTime: 60_000,
  })

  if (!data?.length) return null

  return (
    <section className={clsx('rounded-2xl overflow-hidden bg-gradient-to-br p-4 sm:p-6', gradient)}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">{tagline}</p>
          <h2 className="text-base font-bold text-gray-100">{category}</h2>
        </div>
        <button
          onClick={() => navigate(`/category/${encodeURIComponent(category)}`)}
          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium shrink-0"
        >
          See more <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {data.slice(0, 4).map(product => (
          <button
            key={product.id}
            onClick={() => navigate(`/products/${product.id}`)}
            className="group bg-gray-900/60 border border-gray-800/80 rounded-xl overflow-hidden hover:border-gray-700 transition-all text-left"
          >
            <div className="aspect-square bg-gray-800 overflow-hidden">
              {product.images[0] ? (
                <img
                  src={product.images.find(i => i.is_primary)?.url ?? product.images[0].url}
                  alt={product.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">
                  {CATEGORY_ICONS[product.category] ?? '📦'}
                </div>
              )}
            </div>
            <div className="p-2">
              <p className="text-xs text-gray-300 font-medium line-clamp-1">{product.title}</p>
              <p className="text-xs text-brand-400 font-bold mt-0.5">{formatKes(product.price_kes)}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}


function LocationBanner() {
  const navigate        = useNavigate()
  const { country }     = useCountry()
  if (!country) return null
  return (
    <div className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
      <p className="text-xs text-gray-400">
        Showing items that ship to{' '}
        <span className="font-semibold text-gray-200">{countryName(country)}</span>
      </p>
      <button
        onClick={() => navigate('/browse')}
        className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
      >
        Change
      </button>
    </div>
  )
}


function TrustBar() {
  const items = [
    {
      icon: <Zap className="w-5 h-5 text-bitcoin" />,
      bg: 'bg-bitcoin/10',
      label: 'Lightning Payments',
      desc: 'Instant, borderless transfers',
    },
    {
      icon: <ShieldCheck className="w-5 h-5 text-purple-400" />,
      bg: 'bg-purple-900/40',
      label: 'Escrow Protection',
      desc: 'Coming soon',
      comingSoon: true,
    },
    {
      icon: <Globe className="w-5 h-5 text-brand-400" />,
      bg: 'bg-brand-500/10',
      label: 'Ships Worldwide',
      desc: 'Buyers & sellers everywhere',
    },
    {
      icon: <BadgeCheck className="w-5 h-5 text-emerald-400" />,
      bg: 'bg-emerald-900/30',
      label: 'Verified Sellers',
      desc: 'Identity-checked vendors',
    },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(({ icon, bg, label, desc, comingSoon }) => (
        <div
          key={label}
          className={clsx(
            'flex items-center gap-3 bg-gray-900 border rounded-xl px-4 py-3.5',
            comingSoon ? 'border-purple-800/40' : 'border-gray-800',
          )}
        >
          <div className={clsx('p-2 rounded-xl shrink-0', bg)}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-200 leading-snug">{label}</p>
            <p className={clsx('text-[10px] leading-snug mt-0.5', comingSoon ? 'text-purple-400 font-semibold' : 'text-gray-500')}>
              {desc}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}


export default function HomePage() {
  const { country } = useCountry()
  const label = country ? countryName(country) : undefined
  const { ids: followedIds } = useSellerFollow()

  const followedProductsQueries = useQueries({
    queries: followedIds.slice(0, 5).map(sellerId => ({
      queryKey: ['seller-products-home', sellerId],
      queryFn:  () => listProducts({ seller_id: sellerId, sort: 'newest', per_page: 6, in_stock: true }),
      staleTime: 120_000,
    })),
  })

  const followedProducts = followedProductsQueries
    .filter(q => q.data && q.data.length > 0)
    .flatMap(q => q.data as Product[])
    .slice(0, 12)

  const { data: topPicks } = useQuery({
    queryKey: ['home-top-picks', country],
    queryFn: () => listProducts({ sort: 'rating', country: country || undefined, in_stock: true, per_page: 12 }),
    staleTime: 60_000,
    enabled: !!country,
  })

  const { data: trending } = useQuery({
    queryKey: ['home-trending'],
    queryFn: () => listProducts({ sort: 'newest', in_stock: true, per_page: 12 }),
    staleTime: 60_000,
  })

  const { data: newArrivals } = useQuery({
    queryKey: ['home-new-arrivals', country],
    queryFn: () => listProducts({ sort: 'newest', country: country || undefined, in_stock: true, per_page: 12 }),
    staleTime: 60_000,
  })

  return (
    <div className="px-4 sm:px-6 py-5 space-y-6 max-w-screen-2xl mx-auto">

      {/* Location banner (only if country is set) */}
      <LocationBanner />

      {/* Hero carousel */}
      <HeroCarousel />

      {/* Trust bar */}
      <TrustBar />

      {/* Category department grid */}
      <CategoryGrid />

      {/* Top picks for your country */}
      {country && topPicks && topPicks.length > 0 && (
        <ProductRow
          title={`Top Picks for ${label}`}
          products={topPicks}
          viewAllLink={`/browse?country=${country}&sort=rating`}
        />
      )}

      {/* Trending / What's selling fast */}
      {trending && (
        <ProductRow
          title="What's Selling Fast 🔥"
          products={trending}
          viewAllLink="/browse?sort=rating"
        />
      )}

      {/* Editorial: Food & Agriculture spotlight */}
      <EditorialSpotlight
        category="Food & Groceries"
        gradient="from-green-950/60 to-gray-950"
        tagline="Fresh from the farm"
      />

      {/* New arrivals */}
      {newArrivals && (
        <ProductRow
          title="New on SokoPay ✨"
          products={newArrivals}
          viewAllLink="/browse?sort=newest"
        />
      )}

      {/* Electronics spotlight */}
      <EditorialSpotlight
        category="Electronics"
        gradient="from-blue-950/50 to-gray-950"
        tagline="Gear up"
      />

      {/* Agriculture spotlight */}
      <EditorialSpotlight
        category="Agriculture"
        gradient="from-yellow-950/40 to-gray-950"
        tagline="Tools & inputs for farmers"
      />

      {/* Fashion spotlight */}
      <EditorialSpotlight
        category="Fashion & Clothing"
        gradient="from-purple-950/50 to-gray-950"
        tagline="Look your best"
      />

      {/* Recently viewed */}
      <RecentlyViewedRow />

      {/* From sellers you follow */}
      {followedProducts.length > 0 && (
        <ProductRow
          title="From Sellers You Follow 💛"
          products={followedProducts}
          viewAllLink="/following"
        />
      )}

      {/* Top Sellers leaderboard */}
      <LeaderboardSection />

      {/* CTA banner: sell on SokoPay */}
      <SellCTABanner />
    </div>
  )
}


function RecentlyViewedRow() {
  const { ids, clear } = useRecentlyViewed()

  const results = useQueries({
    queries: ids.slice(0, 8).map(id => ({
      queryKey: ['product', id],
      queryFn:  () => getProduct(id),
      staleTime: 120_000,
    })),
  })

  const products = results
    .filter(r => r.data)
    .map(r => r.data as Product)

  if (products.length === 0) return null

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-100 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          Recently Viewed
        </h2>
        <button
          onClick={clear}
          className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {products.map(p => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  )
}


function SellCTABanner() {
  const navigate = useNavigate()
  return (
    <div className="rounded-2xl overflow-hidden relative bg-gray-900 border border-gray-800">
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-500/15 via-transparent to-transparent pointer-events-none" />
      <div className="relative px-6 sm:px-10 py-8 sm:py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
              <Store className="w-4 h-4 text-brand-400" />
            </div>
            <span className="section-eyebrow text-brand-500">Become a seller</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-gray-100">Sell to buyers worldwide</h3>
          <p className="text-sm text-gray-400 leading-relaxed">
            List products in minutes. Get paid instantly via Lightning — anywhere on Earth.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-1">
            {['Zero listing fees', 'Instant payouts', 'Lightning payments'].map(feat => (
              <span key={feat} className="flex items-center gap-1.5 text-xs text-gray-400">
                <Check className="w-3.5 h-3.5 text-brand-400 shrink-0" />
                {feat}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => navigate('/sell/new')}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-sm font-bold transition-colors shadow-lg shadow-brand-500/20 shrink-0"
        >
          Start Selling <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Package, ChevronDown, ChevronUp, ThumbsUp, AlertTriangle, XCircle } from 'lucide-react'
import {
  listOrders, updateOrderStatus, cancelOrder,
  formatKes, formatSats, ORDER_STATUS_LABELS,
} from '../api/client.ts'
import OrderStatusSteps from './OrderStatusSteps.tsx'
import clsx from 'clsx'
import type { Order } from '../types'

function OrderCard({ order }: { order: Order }) {
  const [expanded, setExpanded] = useState(false)
  const qc = useQueryClient()

  const advanceStatus = useMutation({
    mutationFn: (status: string) =>
      updateOrderStatus(order.id, { status: status as Order['status'] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders', 'buyer'] }),
  })

  const cancel = useMutation({
    mutationFn: () => cancelOrder(order.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders', 'buyer'] }),
  })

  const canConfirm = order.status === 'delivered'
  const canDispute = order.status === 'delivered'
  const canCancel = order.status === 'pending_payment'

  return (
    <div className="card overflow-hidden">
      {/* Summary row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 p-4 text-left hover:bg-gray-800/40 transition-colors"
      >
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-gray-100 truncate">{order.product_title}</p>
          <p className="text-xs text-gray-400">
            {order.quantity} {order.unit} · {formatKes(order.total_kes)}
            {order.total_sats ? ` · ${formatSats(order.total_sats)}` : ''}
          </p>
          <p className="text-xs text-gray-500">Seller: {order.seller_name}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className={clsx(
            'text-xs font-semibold px-2 py-1 rounded-full',
            order.status === 'confirmed'     && 'bg-mpesa/20 text-mpesa',
            order.status === 'cancelled'     && 'bg-red-900/20 text-red-400',
            order.status === 'disputed'      && 'bg-yellow-900/20 text-yellow-400',
            order.status === 'pending_payment' && 'bg-gray-700 text-gray-400',
            !['confirmed','cancelled','disputed','pending_payment'].includes(order.status) && 'bg-brand-500/20 text-brand-400',
          )}>
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-800 p-4 space-y-4">
          <OrderStatusSteps
            status={order.status}
            estimatedDate={order.estimated_delivery_date}
            sellerDate={order.seller_delivery_date}
          />

          {order.delivery_notes && (
            <div className="bg-gray-800/50 rounded-lg px-3 py-2 text-xs text-gray-300">
              <span className="font-medium text-gray-400">Seller note: </span>
              {order.delivery_notes}
            </div>
          )}

          {order.buyer_location_name && (
            <p className="text-xs text-gray-500">
              Delivery to: <span className="text-gray-300">{order.buyer_location_name}</span>
              {order.distance_km != null && (
                <> · {order.distance_km.toFixed(0)} km</>
              )}
            </p>
          )}

          {/* Buyer actions */}
          <div className="flex gap-2 flex-wrap">
            {canConfirm && (
              <button
                onClick={() => advanceStatus.mutate('confirmed')}
                disabled={advanceStatus.isPending}
                className="btn-success text-sm"
              >
                <ThumbsUp className="w-4 h-4" />
                Confirm Delivery
              </button>
            )}
            {canDispute && (
              <button
                onClick={() => advanceStatus.mutate('disputed')}
                disabled={advanceStatus.isPending}
                className="btn-secondary text-sm"
              >
                <AlertTriangle className="w-4 h-4" />
                Raise Dispute
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
                className="btn-danger text-sm"
              >
                <XCircle className="w-4 h-4" />
                Cancel Order
              </button>
            )}
          </div>

          <p className="text-[11px] text-gray-600">
            Order ID: {order.id} · {new Date(order.created_at).toLocaleString('en-KE')}
          </p>
        </div>
      )}
    </div>
  )
}

export default function BuyerOrders() {
  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ['orders', 'buyer'],
    queryFn: () => listOrders('buyer'),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const active = orders.filter(o => !['confirmed', 'cancelled'].includes(o.status))
  const past = orders.filter(o => ['confirmed', 'cancelled'].includes(o.status))

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-gray-100">My Orders</h1>
        <p className="text-sm text-gray-400 mt-0.5">Track your purchases and deliveries</p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="card h-16 skeleton" />)}
        </div>
      )}

      {isError && (
        <p className="text-sm text-red-400">Failed to load orders. Please refresh.</p>
      )}

      {!isLoading && !isError && orders.length === 0 && (
        <div className="text-center py-20 space-y-2">
          <Package className="w-12 h-12 text-gray-700 mx-auto" />
          <p className="text-gray-400 font-medium">No orders yet</p>
          <p className="text-sm text-gray-600">Browse the marketplace to get started</p>
        </div>
      )}

      {active.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Active</h2>
          {active.map(o => <OrderCard key={o.id} order={o} />)}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">History</h2>
          {past.map(o => <OrderCard key={o.id} order={o} />)}
        </section>
      )}
    </div>
  )
}

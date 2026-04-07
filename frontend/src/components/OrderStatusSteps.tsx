import { Check, Clock, Truck, Package, ThumbsUp, AlertTriangle, XCircle } from 'lucide-react'
import clsx from 'clsx'
import type { OrderStatus } from '../types'

interface Step {
  status: OrderStatus
  label: string
  icon: React.ReactNode
}

const STEPS: Step[] = [
  { status: 'pending_payment', label: 'Awaiting Payment', icon: <Clock className="w-4 h-4" /> },
  { status: 'paid',            label: 'Payment Received', icon: <Check className="w-4 h-4" /> },
  { status: 'processing',      label: 'Preparing',        icon: <Package className="w-4 h-4" /> },
  { status: 'in_transit',      label: 'On the Way',       icon: <Truck className="w-4 h-4" /> },
  { status: 'delivered',       label: 'Delivered',        icon: <Package className="w-4 h-4" /> },
  { status: 'confirmed',       label: 'Completed',        icon: <ThumbsUp className="w-4 h-4" /> },
]

const STATUS_ORDER: OrderStatus[] = [
  'pending_payment', 'paid', 'processing', 'in_transit', 'delivered', 'confirmed',
]

function currentIndex(status: OrderStatus): number {
  return STATUS_ORDER.indexOf(status)
}

interface OrderStatusStepsProps {
  status: OrderStatus
  estimatedDate?: string | null
  sellerDate?: string | null
}

export default function OrderStatusSteps({ status, estimatedDate, sellerDate }: OrderStatusStepsProps) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 text-red-400">
        <XCircle className="w-5 h-5 shrink-0" />
        <span className="text-sm font-medium">Order Cancelled</span>
      </div>
    )
  }

  if (status === 'disputed') {
    return (
      <div className="flex items-center gap-2 text-yellow-400">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <span className="text-sm font-medium">Under Review</span>
      </div>
    )
  }

  const activeIdx = currentIndex(status)
  const deliveryDate = sellerDate ?? estimatedDate

  return (
    <div className="space-y-3">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, idx) => {
          const done = idx < activeIdx
          const active = idx === activeIdx
          const last = idx === STEPS.length - 1

          return (
            <li key={step.status} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors',
                  done   && 'bg-brand-500 border-brand-500 text-white',
                  active && 'bg-brand-500/20 border-brand-500 text-brand-400',
                  !done && !active && 'bg-gray-800 border-gray-700 text-gray-600',
                )}>
                  {step.icon}
                </div>
                <span className={clsx(
                  'text-[10px] font-medium text-center leading-tight',
                  done   && 'text-brand-400',
                  active && 'text-brand-300',
                  !done && !active && 'text-gray-600',
                )}>
                  {step.label}
                </span>
              </div>
              {!last && (
                <div className={clsx(
                  'h-0.5 flex-1 mx-1 mb-4',
                  done ? 'bg-brand-500' : 'bg-gray-700',
                )} />
              )}
            </li>
          )
        })}
      </ol>

      {deliveryDate && (status as string) !== 'confirmed' && (status as string) !== 'cancelled' && (
        <p className="text-xs text-gray-400 text-center">
          {sellerDate ? 'Seller delivery date:' : 'Estimated delivery:'}{' '}
          <span className="font-medium text-gray-200">
            {new Date(deliveryDate + 'T00:00:00').toLocaleDateString('en-KE', {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
          </span>
        </p>
      )}
    </div>
  )
}

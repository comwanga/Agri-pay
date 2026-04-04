// ─── Auth ─────────────────────────────────────────────────────────────────────

export type Role = 'admin' | 'operator' | 'farmer'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  role: Role
  user_id: string
  farmer_id?: string
}

// ─── Farmer ───────────────────────────────────────────────────────────────────

export interface Farmer {
  id: string
  name: string
  phone: string
  cooperative: string
  created_at: string
}

export interface CreateFarmerPayload {
  name: string
  phone: string
  cooperative: string
  pin?: string
}

export interface UpdateFarmerPayload {
  name?: string
  cooperative?: string
  pin?: string
}

// ─── Balance & Wallet ─────────────────────────────────────────────────────────

export interface Balance {
  farmer_id: string
  available_sats: number
  locked_sats: number
  updated_at: string
}

export interface WithdrawRequest {
  amount_kes: string // Decimal as string
}

export interface Withdrawal {
  withdrawal_id: string
  farmer_id: string
  amount_sats: number
  amount_kes: string
  status: WithdrawalStatus
}

export type WithdrawalStatus =
  | 'pending'
  | 'processing'
  | 'disbursing_mpesa'
  | 'completed'
  | 'failed'

// ─── Payment ─────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | 'created'
  | 'invoice_created'
  | 'bitcoin_received'
  | 'credited_to_farmer'
  | 'failed'

export interface Payment {
  id: string
  farmer_id: string
  btcpay_invoice_id: string | null
  btcpay_payment_url: string | null
  amount_sats: number
  amount_kes: string
  rate_used: string
  status: PaymentStatus
  failure_reason: string | null
  crop_type: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PaymentWithFarmer extends Payment {
  farmer_name: string
  farmer_phone: string
}

export interface CreatePaymentPayload {
  farmer_id: string
  amount_kes: string // Decimal as string
  crop_type?: string
  notes?: string
}

export interface CreatePaymentResponse {
  payment: Payment
  btcpay_payment_url: string | null
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type OrderStatus = 'open' | 'filled' | 'cancelled'

export interface Order {
  id: string
  farmer_id: string
  farmer_name: string
  farmer_phone: string
  crop_type: string
  quantity_kg: string
  price_per_kg_sats: number
  status: OrderStatus
  created_at: string
  updated_at: string
}

export interface CreateOrderPayload {
  crop_type: string
  quantity_kg: string
  price_per_kg_sats: number
}

// ─── Exchange Rate ────────────────────────────────────────────────────────────

export interface ExchangeRate {
  btc_kes: string
  btc_usd: string
  fetched_at: string
  live: boolean
}

// ─── Crop types ───────────────────────────────────────────────────────────────

export const CROP_TYPES = ['Tea', 'Coffee', 'Flowers', 'Avocado', 'Other'] as const
export type CropType = (typeof CROP_TYPES)[number]

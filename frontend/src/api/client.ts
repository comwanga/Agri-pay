import type {
  Balance,
  CreateFarmerPayload,
  CreateOrderPayload,
  CreatePaymentPayload,
  CreatePaymentResponse,
  ExchangeRate,
  Farmer,
  LoginRequest,
  LoginResponse,
  Order,
  PaymentWithFarmer,
  UpdateFarmerPayload,
  Withdrawal,
  WithdrawRequest,
} from '../types'

const BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '')

// ─── Nostr / Fedi types (NIP-07 window.nostr injection) ──────────────────────

interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>
      signEvent(event: Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>): Promise<NostrEvent>
    }
  }
}

// ─── Token management ────────────────────────────────────────────────────────

const TOKEN_KEY = 'agri_pay_jwt'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

// ─── Core request helper ─────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`
  const token = getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, {
    ...options,
    headers,
  })

  if (res.status === 401) {
    clearToken()
    window.location.reload()  // re-triggers Nostr auto-auth in Fedi
    throw new Error('Session expired')
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}: ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
      else if (body?.message) message = body.message
    } catch {
      // ignore parse error, use default message
    }
    throw new Error(message)
  }

  return res.json() as Promise<T>
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const resp = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  setToken(resp.token)
  return resp
}

export function logout(): void {
  clearToken()
}

export async function nostrLogin(): Promise<LoginResponse> {
  if (!window.nostr) {
    throw new Error('No Nostr signer available')
  }

  const url = `${window.location.origin}/api/auth/nostr`
  const unsignedEvent = {
    kind: 27235,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['u', url],
      ['method', 'POST'],
    ],
    content: '',
  }

  const signedEvent = await window.nostr.signEvent(unsignedEvent)

  const res = await fetch(`${BASE}/auth/nostr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: signedEvent }),
  })

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error) message = body.error
    } catch { /* ignore */ }
    throw new Error(message)
  }

  const resp: LoginResponse = await res.json()
  setToken(resp.token)
  return resp
}

// ─── Farmers ─────────────────────────────────────────────────────────────────

export async function getFarmers(): Promise<Farmer[]> {
  return request<Farmer[]>('/farmers')
}

export async function createFarmer(payload: CreateFarmerPayload): Promise<Farmer> {
  return request<Farmer>('/farmers', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getFarmer(id: string): Promise<Farmer> {
  return request<Farmer>(`/farmers/${id}`)
}

export async function updateFarmer(id: string, payload: UpdateFarmerPayload): Promise<Farmer> {
  return request<Farmer>(`/farmers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteFarmer(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/farmers/${id}`, {
    method: 'DELETE',
  })
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function getPayments(
  page = 1,
  perPage = 50,
  farmerId?: string,
  status?: string,
): Promise<PaymentWithFarmer[]> {
  const params = new URLSearchParams({ page: String(page), per_page: String(perPage) })
  if (farmerId) params.set('farmer_id', farmerId)
  if (status) params.set('status', status)
  return request<PaymentWithFarmer[]>(`/payments?${params}`)
}

export async function createPayment(
  payload: CreatePaymentPayload,
): Promise<CreatePaymentResponse> {
  return request<CreatePaymentResponse>('/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function getPayment(id: string): Promise<PaymentWithFarmer> {
  return request<PaymentWithFarmer>(`/payments/${id}`)
}

// ─── Wallet ──────────────────────────────────────────────────────────────────

export async function getBalance(): Promise<Balance> {
  return request<Balance>('/wallet/balance')
}

export async function requestWithdrawal(payload: WithdrawRequest): Promise<Withdrawal> {
  return request<Withdrawal>('/wallet/withdraw', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function getOrders(): Promise<Order[]> {
  return request<Order[]>('/orders')
}

export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  return request<Order>('/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fillOrder(id: string): Promise<Order> {
  return request<Order>(`/orders/${id}/fill`, {
    method: 'PUT',
  })
}

export async function cancelOrder(id: string): Promise<{ cancelled: boolean }> {
  return request<{ cancelled: boolean }>(`/orders/${id}`, {
    method: 'DELETE',
  })
}

// ─── Oracle / Rate ────────────────────────────────────────────────────────────

export async function getRate(): Promise<ExchangeRate> {
  return request<ExchangeRate>('/oracle/rate')
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<{ status: string; version: string }> {
  return request<{ status: string; version: string }>('/health')
}

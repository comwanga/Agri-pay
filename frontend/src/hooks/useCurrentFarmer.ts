import { useQuery } from '@tanstack/react-query'
import { getProfile } from '../api/client.ts'
import type { Farmer } from '../types'

export function getTokenPayload(): { farmer_id?: string; role?: string } | null {
  const token = localStorage.getItem('agri_pay_jwt')
  if (!token) return null
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

export function useCurrentFarmer(): {
  farmer: Farmer | undefined
  farmerId: string | undefined
  isLoading: boolean
  needsSetup: boolean
} {
  const farmerId = getTokenPayload()?.farmer_id

  const { data: farmer, isLoading } = useQuery({
    queryKey: ['farmer-me', farmerId],
    queryFn: () => getProfile(farmerId!),
    enabled: !!farmerId,
    staleTime: 60_000,
  })

  return {
    farmer,
    farmerId,
    isLoading,
    needsSetup: !!farmer && !farmer.ln_address,
  }
}

import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import ReferralProgram from './ReferralProgram.tsx'
import ApiKeyManager from './ApiKeyManager.tsx'

export default function DeveloperSettings() {
  const navigate = useNavigate()

  return (
    <div className="p-6 max-w-lg space-y-8">
      {/* Back */}
      <button
        onClick={() => navigate('/profile')}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to profile
      </button>

      <div>
        <h1 className="text-xl font-bold text-gray-100">Developer & Referrals</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Referral tracking and API access for third-party integrations.
        </p>
      </div>

      <div className="border-b border-gray-800" />

      <ReferralProgram />

      <div className="border-b border-gray-800" />

      <ApiKeyManager />
    </div>
  )
}

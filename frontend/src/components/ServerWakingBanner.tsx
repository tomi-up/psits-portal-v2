import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { subscribeServerWaking } from '@/lib/serverWakeStore'

export default function ServerWakingBanner() {
  const [waking, setWaking] = useState(false)

  useEffect(() => subscribeServerWaking(setWaking), [])

  if (!waking) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 shadow-md">
      <Loader2 className="h-4 w-4 animate-spin" />
      Server is waking up, please wait a moment...
    </div>
  )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminFetch, getAdminUser } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Square,
  Play,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ScanLine,
  Users,
  LogIn,
  LogOut,
} from 'lucide-react'

type ScanResult = { type: 'success' | 'duplicate' | 'invalid'; message: string }
type ScanMode = 'IN' | 'OUT'


interface EventItem {
  id: string
  name: string
  venue: string | null
  event_date: string | null
}

interface Stats {
  checked_in: number
  currently_inside: number
  completed: number
}

export default function QRScannerPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [event, setEvent] = useState<EventItem | null>(null)
  const [eventOptions, setEventOptions] = useState<EventItem[]>([])
  const [loadingEvent, setLoadingEvent] = useState(true)

  // Refs (not state) for scan dedup: state updates are async and batched, so a
  // fast QR reader can fire several times before React re-renders with the new
  // "already scanned" value, causing rapid duplicate scans while a code sits in
  // frame. Refs are read/written synchronously, closing that race entirely.
  const lastScanRef = useRef<{ code: string; time: number } | null>(null)
  const processingRef = useRef(false)
  const modeRef = useRef<ScanMode>('IN')

  const [mode, setModeState] = useState<ScanMode>('IN')
  const setMode = (m: ScanMode) => {
    modeRef.current = m
    setModeState(m)
  }
  const [stats, setStats] = useState<Stats>({ checked_in: 0, currently_inside: 0, completed: 0 })

  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [scannedList, setScannedList] = useState<
    Array<{ id: string; name: string; timestamp: string; mode: ScanMode }>
  >([])
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [error, setError] = useState<string | null>(null)
  const [isScanning, setIsScanning] = useState(true)

  // No event in the URL: let the officer pick one instead of scanning into the void
  useEffect(() => {
    if (eventId) return
    setLoadingEvent(true)
    fetch(`${API}/events/`)
      .then((res) => res.json())
      .then((data) => setEventOptions(data.events ?? []))
      .catch(() => setEventOptions([]))
      .finally(() => setLoadingEvent(false))
  }, [eventId])

  // Event is in the URL: fetch its real name/venue for the header
  useEffect(() => {
    if (!eventId) return
    setLoadingEvent(true)
    fetch(`${API}/events/${eventId}`)
      .then((res) => {
        if (!res.ok) throw new Error('not found')
        return res.json()
      })
      .then((data) => setEvent(data))
      .catch(() => setEvent(null))
      .finally(() => setLoadingEvent(false))
  }, [eventId])

  // Live stats, shared across every officer scanning this event
  const refreshStats = useCallback(() => {
    if (!eventId) return
    adminFetch(`${API}/events/${eventId}/attendance/stats`)
      .then((res) => res.json())
      .then(setStats)
      .catch(() => {})
  }, [eventId])

  useEffect(() => {
    refreshStats()
    const interval = setInterval(refreshStats, 5000)
    return () => clearInterval(interval)
  }, [refreshStats])

  // Track online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Initialize camera
  useEffect(() => {
    if (!isScanning || !eventId) return

    const initCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            window.isSecureContext
              ? 'Camera API unavailable in this browser.'
              : 'This page must be loaded over HTTPS for camera access.'
          )
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })

        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Camera access denied')
      }
    }

    initCamera()

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach((track) => track.stop())
      }
    }
  }, [isScanning, eventId])

  // QR code scanning loop
  useEffect(() => {
    if (!isScanning || !eventId || !videoRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let animationFrameId: number

    const detector =
      'BarcodeDetector' in window ? new (window as any).BarcodeDetector({ formats: ['qr_code'] }) : null

    const scanQRCode = async () => {
      if (videoRef.current && ctx && detector && !processingRef.current) {
        canvas.width = videoRef.current.videoWidth
        canvas.height = videoRef.current.videoHeight

        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)

        try {
          const barcodes = await detector.detect(canvas)

          if (barcodes.length > 0) {
            const qrData = barcodes[0].rawValue
            const now = Date.now()
            const last = lastScanRef.current
            const stillCoolingDown = last && last.code === qrData && now - last.time < 3000

            if (qrData && !stillCoolingDown) {
              lastScanRef.current = { code: qrData, time: now }
              processingRef.current = true
              try {
                await handleScannedQR(qrData)
              } finally {
                processingRef.current = false
              }
            }
          }
        } catch (err) {
          console.warn('BarcodeDetector error:', err)
        }
      }

      if (isScanning) {
        animationFrameId = requestAnimationFrame(scanQRCode)
      }
    }

    animationFrameId = requestAnimationFrame(scanQRCode)

    return () => cancelAnimationFrame(animationFrameId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScanning, eventId])

  const handleScannedQR = async (qrData: string) => {
    if (!eventId) return
    const currentMode = modeRef.current
    const studentId = qrData.includes('-') ? qrData : qrData.slice(-10)
    const endpoint = currentMode === 'IN' ? 'scan-in' : 'scan-out'

    const showResult = (result: ScanResult) => {
      setScanResult(result)
      setTimeout(() => setScanResult(null), 2500)
    }

    if (!isOnline) {
      addScannedStudent(studentId, `Student ${studentId}`, currentMode)
      showResult({ type: 'success', message: 'Saved offline — will sync later' })
      return
    }

    try {
      const response = await adminFetch(`${API}/events/${eventId}/attendance/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          officer_id: getAdminUser()?.id ?? null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        showResult({ type: 'invalid', message: data.detail || 'Invalid QR code' })
        return
      }

      if (data.status === 'ALREADY_SCANNED_IN' || data.status === 'ALREADY_SCANNED_OUT') {
        // Not a new event - don't spam the Recent Scans list with repeats.
        showResult({
          type: 'duplicate',
          message: `${data.student_name} — already scanned ${currentMode === 'IN' ? 'in' : 'out'}`,
        })
      } else {
        showResult({ type: 'success', message: data.student_name })
        addScannedStudent(studentId, data.student_name, currentMode)
      }
      refreshStats()
    } catch (err) {
      console.warn('Network error, saving offline:', err)
      addScannedStudent(studentId, `Student ${studentId}`, currentMode)
      showResult({ type: 'success', message: 'Saved offline — will sync later' })
    }
  }

  const addScannedStudent = (id: string, name: string, scanMode: ScanMode) => {
    const newRecord = {
      id,
      name,
      timestamp: new Date().toLocaleTimeString(),
      mode: scanMode,
    }

    setScannedList((prev) => [newRecord, ...prev])

    const offline = JSON.parse(localStorage.getItem(`event-${eventId}-attendance`) || '[]')
    offline.push(newRecord)
    localStorage.setItem(`event-${eventId}-attendance`, JSON.stringify(offline))
  }

  const syncOfflineData = async () => {
    const offline: Array<{ id: string; mode: ScanMode }> = JSON.parse(
      localStorage.getItem(`event-${eventId}-attendance`) || '[]'
    )

    if (offline.length === 0) {
      setError('No offline records to sync')
      return
    }

    try {
      for (const record of offline) {
        const endpoint = record.mode === 'OUT' ? 'scan-out' : 'scan-in'
        await adminFetch(`${API}/events/${eventId}/attendance/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: record.id,
            officer_id: getAdminUser()?.id ?? null,
          }),
        })
      }

      localStorage.removeItem(`event-${eventId}-attendance`)
      setError(null)
      refreshStats()
    } catch (err) {
      setError(`Sync failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // No event selected yet: show a picker instead of scanning into the void
  if (!eventId) {
    return (
      <div className="min-h-screen bg-[#0b1b33] p-4 font-sans text-white">
        <div className="mx-auto max-w-lg py-16">
          <div className="flex items-center gap-2 text-sky-400">
            <ScanLine className="h-5 w-5" />
            <span className="text-sm font-medium">PSITS Scanner</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold">Select an event to scan</h1>
          <p className="mt-2 text-sm text-slate-400">
            Attendance is tied to a specific event. Pick one below, or open a scanner link shared
            from Admin Events.
          </p>

          <div className="mt-6 space-y-3">
            {loadingEvent && <div className="h-16 animate-pulse rounded-xl bg-white/5" />}
            {!loadingEvent && eventOptions.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center text-sm text-slate-400">
                No active events right now.
              </div>
            )}
            {eventOptions.map((e) => (
              <button
                key={e.id}
                onClick={() => navigate(`/scanner/${e.id}`)}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-sky-500 hover:bg-white/10"
              >
                <p className="font-medium">{e.name}</p>
                {e.venue && <p className="mt-0.5 text-sm text-slate-400">{e.venue}</p>}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0b1b33] p-4 font-sans text-white lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sky-400">
          <ScanLine className="h-5 w-5" />
          <span className="text-sm font-medium">PSITS Scanner</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">
          {loadingEvent ? 'Loading event...' : event ? event.name : 'Unknown event'}
        </h1>
        {event?.venue && <p className="mt-0.5 text-sm text-slate-400">{event.venue}</p>}

        {/* Status Indicators */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isOnline ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? 'Online' : 'Offline'}
          </div>
          {!isOnline && scannedList.length > 0 && (
            <button
              onClick={syncOfflineData}
              className="inline-flex items-center gap-1.5 rounded-full bg-sky-600 px-3 py-1 text-xs font-medium transition hover:bg-sky-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sync {scannedList.length} records
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-md">
          <StatPill label="Checked In" value={stats.checked_in} />
          <StatPill label="Currently Inside" value={stats.currently_inside} accent="amber" />
          <StatPill label="Completed" value={stats.completed} accent="emerald" />
        </div>

        {/* Mode toggle */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-md">
          <button
            onClick={() => setMode('IN')}
            className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
              mode === 'IN'
                ? 'bg-emerald-600 text-white'
                : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            <LogIn className="h-4 w-4" />
            Scan In
          </button>
          <button
            onClick={() => setMode('OUT')}
            className={`flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
              mode === 'OUT' ? 'bg-rose-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
            }`}
          >
            <LogOut className="h-4 w-4" />
            Scan Out
          </button>
        </div>
      </div>

      {/* Camera Feed */}
      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />

            {isScanning && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`h-[70%] w-[70%] rounded-2xl border-2 ${
                    mode === 'IN' ? 'border-emerald-400/70' : 'border-rose-400/70'
                  }`}
                />
              </div>
            )}

            {scanResult && (
              <div
                className={`absolute inset-0 flex items-center justify-center ${
                  scanResult.type === 'success'
                    ? 'bg-emerald-500/20'
                    : scanResult.type === 'duplicate'
                      ? 'bg-amber-500/20'
                      : 'bg-rose-500/20'
                }`}
              >
                <div
                  className={`flex max-w-[85%] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white ${
                    scanResult.type === 'success'
                      ? 'bg-emerald-500'
                      : scanResult.type === 'duplicate'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }`}
                >
                  {scanResult.type === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0" />}
                  {scanResult.type === 'duplicate' && <Clock className="h-5 w-5 shrink-0" />}
                  {scanResult.type === 'invalid' && <XCircle className="h-5 w-5 shrink-0" />}
                  <span className="truncate">
                    {scanResult.type === 'invalid'
                      ? 'Invalid QR'
                      : scanResult.type === 'duplicate'
                        ? 'Already Scanned'
                        : mode === 'IN'
                          ? 'Scanned In'
                          : 'Scanned Out'}
                    {' — '}
                    {scanResult.message}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-rose-950/85 p-4">
                <div className="text-center">
                  <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-rose-300" />
                  <p className="mb-3 text-sm font-medium text-rose-200">{error}</p>
                  <button
                    onClick={() => {
                      setError(null)
                      setIsScanning(true)
                    }}
                    className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold transition hover:bg-rose-700"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setIsScanning(!isScanning)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
                isScanning ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isScanning ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isScanning ? 'Stop Scanning' : 'Start Scanning'}
            </button>
          </div>
        </div>

        {/* Scanned List */}
        <div className="flex flex-col rounded-2xl bg-white/5 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold">Recent Scans ({scannedList.length})</h2>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto">
            {scannedList.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No students scanned yet</p>
            ) : (
              scannedList.map((record, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 text-sm">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      record.mode === 'IN'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {record.mode}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{record.name}</p>
                    <p className="text-xs text-slate-400">{record.id}</p>
                  </div>
                  <p className="shrink-0 text-xs text-slate-500">{record.timestamp}</p>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="text-xs text-slate-500">
              {isOnline ? 'Recording live' : 'Recording offline — will sync when back online'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatPill({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: 'amber' | 'emerald'
}) {
  const color = accent === 'amber' ? 'text-amber-400' : accent === 'emerald' ? 'text-emerald-400' : 'text-white'
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold ${color}`}>{value}</p>
    </div>
  )
}

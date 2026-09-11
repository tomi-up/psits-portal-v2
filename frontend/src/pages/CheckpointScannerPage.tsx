import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  LogOut,
  Play,
  ScanLine,
  Square,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { API } from '@/lib/apiBase'

/**
 * Officer-facing scanner for the 3-checkpoint attendance workflow.
 *
 * The officer never picks the checkpoint. The event's phase decides, this page
 * polls for it, and the backend records whatever is open at the moment of the
 * scan regardless of what this screen happens to be showing.
 */

const TOKEN_KEY = 'scanner_token'

interface Assignment {
  id: string
  course: string
  year_level: number
  section: string
}

interface ScannerContext {
  event_id: string
  event_name: string
  event_code: string | null
  officer_id: string
  officer_name: string
  assignment: Assignment
  attendance_phase: string
  current_checkpoint: 'IN' | 'MIDDLE' | 'OUT' | null
  scan_count: number
}

interface ScanResult {
  status: 'SCANNED' | 'ALREADY_SCANNED' | 'CROSS_SECTION_CONFIRM'
  checkpoint: string
  student_id: string
  student_name: string
  student_course: string | null
  student_year_level: number | null
  student_section: string | null
  cross_section: boolean
  message: string | null
}

type Banner = { type: 'success' | 'duplicate' | 'invalid'; message: string }

const CHECKPOINT_STYLES: Record<string, { dot: string; frame: string; label: string }> = {
  IN: { dot: 'bg-emerald-400', frame: 'border-emerald-400/70', label: 'text-emerald-400' },
  MIDDLE: { dot: 'bg-sky-400', frame: 'border-sky-400/70', label: 'text-sky-400' },
  OUT: { dot: 'bg-violet-400', frame: 'border-violet-400/70', label: 'text-violet-400' },
}

export default function CheckpointScannerPage() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY))
  const [context, setContext] = useState<ScannerContext | null>(null)
  const [banner, setBanner] = useState<Banner | null>(null)
  const [pending, setPending] = useState<ScanResult | null>(null)
  const [recent, setRecent] = useState<Array<{ id: string; name: string; checkpoint: string; at: string }>>([])
  const [isScanning, setIsScanning] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const lastScanRef = useRef<{ code: string; time: number } | null>(null)
  const processingRef = useRef(false)
  // The confirm dialog must halt the scan loop, and a ref is the only thing
  // the loop can read synchronously - state would lag a frame and re-fire.
  const pausedRef = useRef(false)

  const signOut = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setContext(null)
    setRecent([])
  }, [])

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      const res = await fetch(`${API}${path}`, { ...init, headers })
      if (res.status === 401) signOut()
      return res
    },
    [token, signOut]
  )

  // Poll the session for the current checkpoint, so an admin opening MIDDLE
  // reaches the officer without them logging in again.
  const refreshContext = useCallback(async () => {
    if (!token) return
    try {
      const res = await authFetch('/scanner/session')
      if (res.ok) setContext(await res.json())
    } catch {
      /* offline - keep showing the last known context */
    }
  }, [token, authFetch])

  useEffect(() => {
    void refreshContext()
    const interval = setInterval(() => void refreshContext(), 5000)
    return () => clearInterval(interval)
  }, [refreshContext])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Camera
  useEffect(() => {
    if (!isScanning || !token) return

    const init = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            window.isSecureContext
              ? 'Camera API unavailable in this browser.'
              : 'This page must be loaded over HTTPS for camera access.'
          )
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : 'Camera access denied')
      }
    }
    void init()

    const video = videoRef.current
    return () => {
      const stream = video?.srcObject as MediaStream | null
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [isScanning, token])

  const submitScan = useCallback(
    async (studentId: string, allowCrossSection: boolean) => {
      const show = (b: Banner) => {
        setBanner(b)
        setTimeout(() => setBanner(null), 2500)
      }

      try {
        const res = await authFetch('/scanner/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: studentId,
            allow_cross_section: allowCrossSection,
          }),
        })
        const data = await res.json()

        if (!res.ok) {
          show({ type: 'invalid', message: data.detail ?? 'Scan rejected' })
          return
        }

        const result = data as ScanResult

        if (result.status === 'CROSS_SECTION_CONFIRM') {
          pausedRef.current = true
          setPending(result)
          return
        }

        if (result.status === 'ALREADY_SCANNED') {
          show({ type: 'duplicate', message: result.message ?? result.student_name })
          return
        }

        show({
          type: 'success',
          message: `${result.student_name}${result.cross_section ? ' (cross-section)' : ''}`,
        })
        setRecent((prev) => [
          {
            id: result.student_id,
            name: result.student_name,
            checkpoint: result.checkpoint,
            at: new Date().toLocaleTimeString(),
          },
          ...prev,
        ])
        void refreshContext()
      } catch {
        show({ type: 'invalid', message: 'Network error — the scan was not recorded' })
      }
    },
    [authFetch, refreshContext]
  )

  // QR loop
  useEffect(() => {
    if (!isScanning || !token || !videoRef.current || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let frameId: number

    const detector =
      'BarcodeDetector' in window
        ? new (window as unknown as { BarcodeDetector: new (o: object) => { detect: (c: HTMLCanvasElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({
            formats: ['qr_code'],
          })
        : null

    const loop = async () => {
      if (videoRef.current && ctx && detector && !processingRef.current && !pausedRef.current) {
        canvas.width = videoRef.current.videoWidth
        canvas.height = videoRef.current.videoHeight
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)

        try {
          const codes = await detector.detect(canvas)
          if (codes.length > 0) {
            const raw = codes[0].rawValue
            const now = Date.now()
            const last = lastScanRef.current
            const coolingDown = last && last.code === raw && now - last.time < 3000

            if (raw && !coolingDown) {
              lastScanRef.current = { code: raw, time: now }
              processingRef.current = true
              try {
                await submitScan(raw.includes('-') ? raw : raw.slice(-10), false)
              } finally {
                processingRef.current = false
              }
            }
          }
        } catch {
          /* detector hiccup - next frame will retry */
        }
      }
      if (isScanning) frameId = requestAnimationFrame(loop)
    }

    frameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frameId)
  }, [isScanning, token, submitScan])

  if (!token) {
    return <ScannerLogin onSignedIn={(t) => {
      sessionStorage.setItem(TOKEN_KEY, t)
      setToken(t)
    }} />
  }

  const checkpoint = context?.current_checkpoint ?? null
  const style = checkpoint ? CHECKPOINT_STYLES[checkpoint] : null

  return (
    <div className="flex min-h-screen flex-col bg-[#0b1b33] p-4 font-sans text-white lg:p-8">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sky-400">
              <ScanLine className="h-5 w-5" />
              <span className="text-sm font-medium">PSITS Attendance Scanner</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{context?.event_name ?? 'Loading...'}</h1>
          </div>
          <button
            onClick={() => {
              void authFetch('/scanner/logout', { method: 'POST' })
              signOut()
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:max-w-lg sm:grid-cols-2">
          <InfoTile label="Officer" value={context?.officer_name ?? '—'} />
          <InfoTile
            label="Assignment"
            value={
              context
                ? `${context.assignment.course} · Year ${context.assignment.year_level} · ${context.assignment.section}`
                : '—'
            }
          />
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:max-w-lg">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Current Checkpoint
          </p>
          {checkpoint && style ? (
            <div className="mt-1.5 flex items-center gap-2.5">
              <span className={`h-3 w-3 rounded-full ${style.dot}`} />
              <span className={`text-2xl font-bold ${style.label}`}>{checkpoint}</span>
            </div>
          ) : (
            <div className="mt-1.5">
              <p className="text-lg font-semibold text-slate-400">No checkpoint open</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Waiting for an admin to open the next one. Scanning is disabled until they do.
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Scanned by you at this checkpoint:{' '}
            <span className="font-semibold text-slate-300">{context?.scan_count ?? 0}</span>
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              isOnline ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
            }`}
          >
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? 'Online' : 'Offline — scans cannot be recorded'}
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />

            {isScanning && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`h-[70%] w-[70%] rounded-2xl border-2 ${style?.frame ?? 'border-white/30'}`}
                />
              </div>
            )}

            {!checkpoint && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 p-4 text-center">
                <p className="text-sm font-medium text-slate-300">
                  No checkpoint is open right now.
                </p>
              </div>
            )}

            {banner && (
              <div
                className={`absolute inset-0 flex items-center justify-center ${
                  banner.type === 'success'
                    ? 'bg-emerald-500/20'
                    : banner.type === 'duplicate'
                      ? 'bg-amber-500/20'
                      : 'bg-rose-500/20'
                }`}
              >
                <div
                  className={`flex max-w-[85%] items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white ${
                    banner.type === 'success'
                      ? 'bg-emerald-500'
                      : banner.type === 'duplicate'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                  }`}
                >
                  {banner.type === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0" />}
                  {banner.type === 'duplicate' && <Clock className="h-5 w-5 shrink-0" />}
                  {banner.type === 'invalid' && <XCircle className="h-5 w-5 shrink-0" />}
                  <span className="truncate">{banner.message}</span>
                </div>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-rose-950/85 p-4">
                <div className="text-center">
                  <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-rose-300" />
                  <p className="mb-3 text-sm font-medium text-rose-200">{cameraError}</p>
                  <button
                    onClick={() => {
                      setCameraError(null)
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

          <button
            onClick={() => setIsScanning(!isScanning)}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition ${
              isScanning ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isScanning ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isScanning ? 'Stop Scanning' : 'Start Scanning'}
          </button>
        </div>

        <div className="flex flex-col rounded-2xl bg-white/5 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold">Recent Scans ({recent.length})</h2>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No students scanned yet</p>
            ) : (
              recent.map((r, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-white/5 p-3 text-sm">
                  <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold">
                    {r.checkpoint}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-slate-400">{r.id}</p>
                  </div>
                  <p className="shrink-0 text-xs text-slate-500">{r.at}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {pending && (
        <CrossSectionPrompt
          result={pending}
          assignment={context?.assignment}
          onCancel={() => {
            setPending(null)
            pausedRef.current = false
          }}
          onConfirm={async () => {
            const studentId = pending.student_id
            setPending(null)
            pausedRef.current = false
            await submitScan(studentId, true)
          }}
        />
      )}
    </div>
  )
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold">{value}</p>
    </div>
  )
}

function CrossSectionPrompt({
  result,
  assignment,
  onCancel,
  onConfirm,
}: {
  result: ScanResult
  assignment?: Assignment
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-[#12233f] p-6 text-white shadow-xl">
        <div className="flex items-center gap-2 text-amber-400">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-sm font-semibold">Not your assigned section</h2>
        </div>

        <p className="mt-3 text-lg font-semibold">{result.student_name}</p>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
            <span className="text-slate-400">Your assignment</span>
            <span className="font-semibold">
              {assignment
                ? `${assignment.course} · Year ${assignment.year_level} · ${assignment.section}`
                : '—'}
            </span>
          </div>
          <div className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
            <span className="text-slate-400">This student</span>
            <span className="font-semibold text-amber-300">
              {result.student_course ?? '?'} · Year {result.student_year_level ?? '?'} ·{' '}
              {result.student_section ?? '?'}
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          You can still scan them — the record is kept and flagged for the admin to review.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl bg-white/5 py-2.5 text-sm font-semibold transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-400"
          >
            Scan Anyway
          </button>
        </div>
      </div>
    </div>
  )
}

function ScannerLogin({ onSignedIn }: { onSignedIn: (token: string) => void }) {
  const [searchParams] = useSearchParams()
  // A shared scanner link/QR (see AdminEventsPage's Share Scanner modal) can
  // carry the event code so an officer only has to type their PIN.
  const [eventCode, setEventCode] = useState(() => (searchParams.get('code') ?? '').toUpperCase())
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (eventCode) pinRef.current?.focus()
  }, [])

  async function submit() {
    setError(null)
    if (!eventCode.trim() || !pin.trim()) {
      setError('Enter both the event code and your PIN.')
      return
    }

    setBusy(true)
    try {
      const res = await fetch(`${API}/scanner/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_code: eventCode.trim().toUpperCase(), pin: pin.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.detail === 'string' ? data.detail : 'Sign in failed.')
        return
      }
      // The PIN never leaves this function - only the session token is kept.
      setPin('')
      onSignedIn(data.token)
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1b33] p-4 font-sans text-white">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 text-sky-400">
          <ScanLine className="h-5 w-5" />
          <span className="text-sm font-medium">PSITS Attendance Scanner</span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold">Officer sign in</h1>
        <p className="mt-2 text-sm text-slate-400">
          Enter the event code shown on the admin's event page, and your own PIN.
        </p>

        <div className="mt-6 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Event Code</label>
            <input
              autoFocus={!eventCode}
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder="ABC123"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-lg font-semibold tracking-[0.3em] text-white placeholder:tracking-normal placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Your PIN</label>
            <input
              ref={pinRef}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-lg tracking-[0.4em] text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={() => void submit()}
            disabled={busy}
            className="w-full rounded-xl bg-sky-600 py-3 text-sm font-semibold transition hover:bg-sky-700 disabled:opacity-50"
          >
            {busy ? 'Signing in...' : 'Start Scanning'}
          </button>
        </div>
      </div>
    </div>
  )
}

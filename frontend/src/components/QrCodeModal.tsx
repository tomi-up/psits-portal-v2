import { useRef } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { Download } from 'lucide-react'

interface QrCodeModalProps {
  event: { name: string; is_checked_in: boolean } | null
  studentId: string
  onClose: () => void
}

export default function QrCodeModal({ event, studentId, onClose }: QrCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  if (!event) return null

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return

    const link = document.createElement('a')
    link.download = `psits-qr-${studentId}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">{event.name}</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {event.is_checked_in
            ? 'Show this to an officer when you leave to scan out.'
            : 'Show this to an officer to check in.'}
        </p>
        <div className="mt-4 flex justify-center rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-white">
          <QRCodeCanvas ref={canvasRef} value={studentId} size={200} />
        </div>
        <p className="mt-3 font-mono text-sm text-slate-600 dark:text-slate-300">{studentId}</p>
        <button
          onClick={handleSave}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          <Download className="h-4 w-4" />
          Save QR Code
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Close
        </button>
      </div>
    </div>
  )
}

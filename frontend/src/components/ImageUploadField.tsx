import { useRef, useState } from 'react'
import { Image as ImageIcon, LoaderCircle, Trash2, Upload } from 'lucide-react'
import { adminFetch } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'
import { notify } from '@/lib/toast'

interface ImageUploadFieldProps {
  label: string
  value: string
  purpose: 'payment-qr' | 'event-cover'
  onChange: (url: string) => void
  previewClassName?: string
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export default function ImageUploadField({
  label,
  value,
  purpose,
  onChange,
  previewClassName = 'aspect-video w-full',
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File | undefined) {
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      notify.error('Unsupported image', 'Choose a PNG, JPEG, or WebP image.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      notify.error('Image too large', 'Choose an image that is 5 MB or smaller.')
      return
    }

    const body = new FormData()
    body.append('purpose', purpose)
    body.append('file', file)
    setUploading(true)
    try {
      const response = await adminFetch(`${API}/officer/uploads/image`, {
        method: 'POST',
        body,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        notify.error('Upload failed', payload?.detail ?? 'Could not upload the image.')
        return
      }
      onChange(payload.url)
      notify.success('Image uploaded', file.name)
    } catch {
      notify.error('Network error', 'Could not upload the image.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(event) => void upload(event.target.files?.[0])}
      />

      {value ? (
        <div className="flex items-center gap-3">
          <div className={`overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 ${previewClassName}`}>
            <img src={value} alt={`${label} preview`} className="h-full w-full object-contain" />
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-50"
            >
              {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              disabled={uploading}
              title="Remove image"
              className="inline-flex items-center justify-center rounded-lg border border-rose-200 p-2 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm font-medium text-slate-600 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-sky-600 dark:hover:bg-sky-950/30 dark:hover:text-sky-400"
        >
          {uploading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ImageIcon className="h-5 w-5" />}
          {uploading ? 'Uploading...' : 'Upload image'}
        </button>
      )}
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">PNG, JPEG, or WebP up to 5 MB.</p>
    </div>
  )
}

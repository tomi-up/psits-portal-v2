import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { CalendarDays } from 'lucide-react'

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  error?: boolean
}

function parseValue(value: string): Date | undefined {
  if (!value) return undefined
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

function formatValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDisplay(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${d} / ${m} / ${date.getFullYear()}`
}

export default function DatePicker({ value, onChange, placeholder = 'Select date', error }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Date | undefined>(() => parseValue(value))
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = parseValue(value)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleOpen() {
    setDraft(selected)
    setOpen(true)
  }

  function handleSetDate() {
    if (draft) onChange(formatValue(draft))
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : handleOpen())}
          className={`w-full rounded-xl border py-2.5 pl-10 pr-4 text-left text-sm text-slate-900 transition focus:bg-white focus:outline-none focus:ring-2 ${
            error
              ? 'border-red-400 bg-red-50/50 focus:border-red-500 focus:ring-red-500/20'
              : 'border-slate-200 bg-slate-50 focus:border-sky-500 focus:ring-sky-500/20'
          }`}
        >
          {selected ? (
            selected.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </button>
      </div>

      {open && (
        <div className="absolute z-20 mt-2 w-[300px] rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="px-3 pt-3">
            <DayPicker
              mode="single"
              navLayout="around"
              weekStartsOn={1}
              selected={draft}
              defaultMonth={draft ?? new Date()}
              onSelect={(date) => setDraft(date)}
              formatters={{
                formatWeekdayName: (date) =>
                  date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2),
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <span className="text-xs text-slate-400">{draft ? formatDisplay(draft) : 'No date selected'}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSetDate}
                disabled={!draft}
                className="rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                Set Date
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

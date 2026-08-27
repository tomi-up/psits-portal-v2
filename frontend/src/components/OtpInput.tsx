import { useRef, type KeyboardEvent, type ClipboardEvent } from 'react'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  length?: number
  autoFocus?: boolean
}

export default function OtpInput({ value, onChange, length = 6, autoFocus }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  function setDigit(index: number, digit: string) {
    const chars = value.padEnd(length, ' ').split('')
    chars[index] = digit
    onChange(chars.join('').trimEnd())
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    setDigit(index, digit)
    if (digit && index < length - 1) inputRefs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (value[index]) {
        setDigit(index, '')
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        setDigit(index - 1, '')
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!digits) return
    onChange(digits)
    inputRefs.current[Math.min(digits.length, length - 1)]?.focus()
  }

  return (
    <div className="flex w-full justify-between gap-2">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="h-12 w-full min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 text-center text-lg font-semibold text-slate-900 transition focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />
      ))}
    </div>
  )
}

import { Check, X } from 'lucide-react'

export interface PasswordRuleResults {
  length: boolean
  uppercase: boolean
  lowercase: boolean
  digit: boolean
  symbol: boolean
}

export function checkPasswordStrength(password: string): PasswordRuleResults {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /\d/.test(password),
    symbol: /[^\w\s]/.test(password),
  }
}

export function isPasswordStrong(password: string): boolean {
  const results = checkPasswordStrength(password)
  return Object.values(results).every(Boolean)
}

const RULES: { key: keyof PasswordRuleResults; label: string }[] = [
  { key: 'length', label: 'At least 8 characters' },
  { key: 'uppercase', label: 'One uppercase letter' },
  { key: 'lowercase', label: 'One lowercase letter' },
  { key: 'digit', label: 'One number' },
  { key: 'symbol', label: 'One symbol (e.g. ! @ # $)' },
]

export default function PasswordStrengthChecklist({ password }: { password: string }) {
  const results = checkPasswordStrength(password)

  return (
    <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
      {RULES.map(({ key, label }) => {
        const met = results[key]
        return (
          <li
            key={key}
            className={`flex items-center gap-1.5 text-xs transition ${
              met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {met ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
            {label}
          </li>
        )
      })}
    </ul>
  )
}

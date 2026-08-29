import { DotLottieReact } from '@lottiefiles/dotlottie-react'

interface EmptyStateProps {
  title: string
  subtitle?: string
}

export default function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="h-40 w-40">
        <DotLottieReact
          src="https://lottie.host/b2c86abb-d996-4003-aa8b-3bd2c6582ab4/Lxizzc3f3C.lottie"
          loop
          autoplay
        />
      </div>
      <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
    </div>
  )
}

import type { ReactNode } from 'react'

export default function AuthLayout({
  children,
  tagline = 'Student Portal for the Philippine Society of Information Technology Students',
}: {
  children: ReactNode
  tagline?: string
}) {
  return (
    <div className="flex min-h-screen font-sans">
      {/* Form panel */}
      <div
        className="relative flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-20"
        style={{
          backgroundImage: 'radial-gradient(rgba(15,23,42,0.08) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        <div className="relative mx-auto w-full max-w-sm">{children}</div>
      </div>

      {/* Brand panel */}
      <div
        className="relative hidden overflow-hidden bg-[#0b1b33] lg:flex lg:w-1/2 lg:items-center lg:justify-center"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0b1b33] via-transparent to-[#0b1b33]" />
        <div className="relative flex flex-col items-center px-10 text-center">
          <img
            src="/psits-logo.png"
            alt="PSITS"
            className="mb-8 h-40 w-40 drop-shadow-[0_8px_24px_rgba(56,189,248,0.25)]"
          />
          <h2 className="text-2xl font-semibold text-white">PSITS Portal</h2>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-400">{tagline}</p>
        </div>
      </div>
    </div>
  )
}

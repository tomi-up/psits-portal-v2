import type { ReactNode } from 'react'

const BINARY_BG_SVG = `
  <svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>
    <text x='4' y='18' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.16)'>1</text>
    <text x='34' y='42' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.14)'>0</text>
    <text x='66' y='16' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.16)'>0</text>
    <text x='98' y='38' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.12)'>1</text>
    <text x='18' y='64' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.14)'>0</text>
    <text x='52' y='72' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.16)'>1</text>
    <text x='84' y='68' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.12)'>0</text>
    <text x='116' y='90' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.16)'>1</text>
    <text x='8' y='100' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.14)'>1</text>
    <text x='40' y='108' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.12)'>0</text>
    <text x='70' y='114' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.16)'>1</text>
    <text x='104' y='128' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.14)'>0</text>
    <text x='22' y='134' font-family='monospace' font-size='13' fill='rgba(56,189,248,0.12)'>0</text>
  </svg>
`
const BINARY_BG_URL = `url("data:image/svg+xml,${encodeURIComponent(BINARY_BG_SVG)}")`

export default function AuthLayout({
  children,
  tagline = 'Student Portal for the Philippine Society of Information Technology Students',
  forceLight = false,
}: {
  children: ReactNode
  tagline?: string
  /** Admin/legacy pages are intentionally out of dark-mode scope - their own
   * text colors assume a white background, so this keeps the panel light
   * regardless of the student side's (default-dark) theme setting instead
   * of inheriting the ambient `dark` class and going low-contrast. */
  forceLight?: boolean
}) {
  const lightDots = {
    backgroundImage: `radial-gradient(rgba(15,23,42,0.08) 1px, transparent 1px), ${BINARY_BG_URL}`,
    backgroundSize: '20px 20px, 140px 140px',
  }
  const darkDots = {
    backgroundImage: `radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), ${BINARY_BG_URL}`,
    backgroundSize: '20px 20px, 140px 140px',
  }

  return (
    <div className="flex min-h-screen font-sans">
      {/* Form panel */}
      <div
        className={`relative flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-20 ${
          forceLight ? 'bg-white' : 'bg-white dark:bg-slate-950'
        }`}
      >
        {forceLight ? (
          <div className="absolute inset-0" style={lightDots} />
        ) : (
          <>
            <div className="absolute inset-0 dark:hidden" style={lightDots} />
            <div className="absolute inset-0 hidden dark:block" style={darkDots} />
          </>
        )}
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

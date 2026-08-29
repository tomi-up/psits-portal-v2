import { useEffect, useRef } from 'react'
import { getStoredTheme } from '@/lib/theme'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

interface GoogleSignInButtonProps {
  onCredential: (idToken: string) => void
}

export default function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)
  const lastWidthRef = useRef(0)

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
    if (!clientId) return

    function draw() {
      const wrapper = wrapperRef.current
      const container = buttonRef.current
      if (!window.google || !wrapper || !container) return

      if (!initializedRef.current) {
        window.google!.accounts.id.initialize({
          client_id: clientId as string,
          callback: (response) => onCredential(response.credential),
        })
        initializedRef.current = true
      }

      // Google requires an exact pixel width (200-400) rather than
      // supporting a flexible/percentage size like Turnstile does.
      const measuredWidth = Math.min(400, Math.max(200, wrapper.offsetWidth || 300))
      lastWidthRef.current = measuredWidth

      // renderButton APPENDS an iframe rather than replacing one - without
      // clearing first, re-running this (React StrictMode double-invokes
      // effects in dev) stacks a second overlapping button on top of the first.
      container.innerHTML = ''
      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: getStoredTheme() === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        width: measuredWidth,
        text: 'continue_with',
      })
    }

    // GSI script loads async - poll briefly until it's ready.
    const loadInterval = window.google
      ? undefined
      : setInterval(() => {
          if (window.google) {
            clearInterval(loadInterval)
            draw()
          }
        }, 100)
    if (window.google) draw()

    // Redraw on actual viewport resize (orientation change, dev-tools device
    // toolbar, etc.) - deliberately NOT a ResizeObserver on our own elements:
    // clearing/repopulating the button's container changes ITS box size too
    // (auto height collapses to 0 then back), which a ResizeObserver watching
    // any ancestor of it would also see as "resized", triggering another
    // clear-and-redraw forever. Window resize is driven externally only.
    let resizeTimer: ReturnType<typeof setTimeout> | undefined
    function onWindowResize() {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const width = Math.min(400, Math.max(200, wrapperRef.current?.offsetWidth || 300))
        if (Math.abs(width - lastWidthRef.current) > 4) draw()
      }, 200)
    }
    window.addEventListener('resize', onWindowResize)

    return () => {
      if (loadInterval) clearInterval(loadInterval)
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', onWindowResize)
    }
  }, [onCredential])

  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null

  return (
    <div ref={wrapperRef} className="w-full">
      <div ref={buttonRef} />
    </div>
  )
}

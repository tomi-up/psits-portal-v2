// Render's free tier puts the backend to sleep after idle, so the first
// request after a gap can take 30-60s to come back while it wakes up. This
// tracks in-flight requests that are taking unusually long, so a banner can
// tell the user what's happening instead of leaving them staring at a
// frozen page wondering if it's broken.

const SLOW_THRESHOLD_MS = 4000

type Listener = (waking: boolean) => void

let pendingSlowCount = 0
const listeners = new Set<Listener>()

function notify() {
  const waking = pendingSlowCount > 0
  listeners.forEach((l) => l(waking))
}

export function subscribeServerWaking(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Wrap a fetch() promise so a slow response flips the "waking up" banner on. */
export function trackPossibleWakeUp<T>(promise: Promise<T>): Promise<T> {
  let countedAsSlow = false
  const timer = setTimeout(() => {
    countedAsSlow = true
    pendingSlowCount += 1
    notify()
  }, SLOW_THRESHOLD_MS)

  const settle = () => {
    clearTimeout(timer)
    if (countedAsSlow) {
      pendingSlowCount = Math.max(0, pendingSlowCount - 1)
      notify()
    }
  }

  return promise.then(
    (value) => {
      settle()
      return value
    },
    (err) => {
      settle()
      throw err
    },
  )
}

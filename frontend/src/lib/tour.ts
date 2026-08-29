import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'

const SEEN_KEY = 'psits_tour_seen'
const SEEN_EVENTS_KEY = 'psits_tour_events_seen'
const SEEN_SANCTIONS_KEY = 'psits_tour_sanctions_seen'

export function hasSeenTour(): boolean {
  return localStorage.getItem(SEEN_KEY) === '1'
}

function markSeen(key: string) {
  localStorage.setItem(key, '1')
}

/** Only include steps whose target element actually exists right now - some
 * targets (a required event's excuse button, an in-progress sanction's
 * choice cards) only render when relevant data exists, so a step pointing
 * at a missing element would otherwise silently do nothing. */
function existingSteps(steps: DriveStep[]): DriveStep[] {
  return steps.filter((step) => {
    if (typeof step.element !== 'string') return true
    return document.querySelector(step.element) !== null
  })
}

function isMobile(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
}

interface RunTourOptions {
  onDone?: () => void
  /** On mobile, the sidebar nav is an off-canvas drawer - these open/close
   * it around the sidebar-targeting steps so they're actually visible
   * instead of highlighting an element sitting off-screen. */
  openSidebar?: () => void
  closeSidebar?: () => void
  /** How many leading steps (in the original, unfiltered list) target the
   * sidebar - the drawer is closed right as the tour reaches the step after these. */
  sidebarStepCount?: number
}

function runTour(steps: DriveStep[], opts: RunTourOptions = {}) {
  const { onDone, openSidebar, closeSidebar, sidebarStepCount = 0 } = opts
  const mobile = isMobile()

  // Sidebar nav items are always in the DOM (just off-screen when the
  // drawer is closed), so this split by count stays accurate even after
  // existingSteps() filters out other, conditionally-rendered steps.
  const firstNonSidebarId = sidebarStepCount > 0 ? steps[sidebarStepCount]?.element : undefined
  const usable = existingSteps(steps)
  if (usable.length === 0) return

  if (mobile && closeSidebar && firstNonSidebarId) {
    const closeStep = usable.find((s) => s.element === firstNonSidebarId)
    if (closeStep) {
      const prev = closeStep.onHighlightStarted
      closeStep.onHighlightStarted = (...args) => {
        closeSidebar()
        prev?.(...args)
      }
    }
  }

  function start() {
    driver({
      showProgress: true,
      allowClose: true,
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Done',
      onDestroyed: () => {
        if (mobile) closeSidebar?.()
        onDone?.()
      },
      steps: usable,
    }).drive()
  }

  if (mobile && openSidebar) {
    openSidebar()
    // Wait out the drawer's slide-in transition (200ms) before driver.js
    // measures element positions, or it'll spotlight the mid-slide rect.
    setTimeout(start, 300)
  } else {
    start()
  }
}

/** Walks through the sidebar nav and header controls - the two things
 * present on every student page, so this is safe to launch from anywhere
 * without needing to navigate the student around first. */
export function startStudentTour(openSidebar?: () => void, closeSidebar?: () => void) {
  runTour(
    [
      {
        element: '#tour-nav-dashboard',
        popover: {
          title: 'Dashboard',
          description: 'Your at-a-glance summary: events attended, membership balance, and sanction status.',
        },
      },
      {
        element: '#tour-nav-events',
        popover: {
          title: 'Events',
          description: 'Browse upcoming events, register, and pull up your check-in QR code here.',
        },
      },
      {
        element: '#tour-nav-attendance',
        popover: {
          title: 'Attendance',
          description: 'Your full attendance history across every event you\'ve registered for.',
        },
      },
      {
        element: '#tour-nav-balance',
        popover: {
          title: 'Balance',
          description: 'See your membership dues per semester and submit a payment with a reference number.',
        },
      },
      {
        element: '#tour-nav-sanctions',
        popover: {
          title: 'Sanctions',
          description:
            'If you miss a required event without an approved excuse, settle it here - 2 hours of community service, or a donation in kind.',
        },
      },
      {
        element: '#tour-header-refresh',
        popover: {
          title: 'Refresh',
          description: 'Pull the latest data for the page you\'re on.',
        },
      },
      {
        element: '#tour-header-theme',
        popover: {
          title: 'Light / Dark Mode',
          description: 'Switch the portal\'s theme anytime - your choice is remembered on this device.',
        },
      },
      {
        element: '#tour-header-profile',
        popover: {
          title: 'Your Profile',
          description: 'View your profile, sign out, or replay this tour anytime from here.',
        },
      },
    ],
    { onDone: () => markSeen(SEEN_KEY), openSidebar, closeSidebar, sidebarStepCount: 5 }
  )
}

export function startStudentTourIfFirstVisit(openSidebar?: () => void, closeSidebar?: () => void) {
  if (hasSeenTour()) return
  // Let the page's own content finish rendering before spotlighting it.
  setTimeout(() => startStudentTour(openSidebar, closeSidebar), 400)
}

/** Events page: the row action buttons. The excuse-request step only shows
 * up if there's currently a required, un-excused event to point at. */
export function startEventsTour() {
  runTour(
    [
      {
        element: '#tour-events-view',
        popover: {
          title: 'View Details',
          description: 'See the full description, date, venue, and any sanction warning for an event.',
        },
      },
      {
        element: '#tour-events-excuse',
        popover: {
          title: 'Request an Excuse',
          description:
            'For a required event you can\'t attend, submit a reason here before it happens. If approved, you\'re marked Excused instead of Absent - no sanction.',
        },
      },
      {
        element: '#tour-events-action',
        popover: {
          title: 'Register / Check-In QR',
          description:
            'Register your intent to attend - this unlocks your personal QR code for an officer to scan at check-in.',
        },
      },
    ],
    { onDone: () => markSeen(SEEN_EVENTS_KEY) }
  )
}

export function startEventsTourIfFirstVisit() {
  if (localStorage.getItem(SEEN_EVENTS_KEY) === '1') return
  setTimeout(() => startEventsTour(), 400)
}

/** Sanctions page: the two settlement choice cards. Both only render when
 * there's actually something unsettled to choose a resolution for. */
export function startSanctionsTour() {
  runTour(
    [
      {
        element: '#tour-sanctions-community-service',
        popover: {
          title: 'Community Service',
          description:
            '2 hours per missed event. Once you commit, an admin logs your completed hours over time until the total is reached.',
        },
      },
      {
        element: '#tour-sanctions-donation',
        popover: {
          title: 'Donation in Kind',
          description:
            'Pick an item instead - the required quantity is calculated automatically from how many absences you have. An admin confirms once it\'s received.',
        },
      },
    ],
    { onDone: () => markSeen(SEEN_SANCTIONS_KEY) }
  )
}

export function startSanctionsTourIfFirstVisit() {
  if (localStorage.getItem(SEEN_SANCTIONS_KEY) === '1') return
  setTimeout(() => startSanctionsTour(), 400)
}

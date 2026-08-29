import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, ArrowRight, Mail, MessageCircle } from 'lucide-react'
import { API } from '@/lib/apiBase'

interface EventItem {
  id: string
  name: string
  venue: string | null
  description: string | null
  event_date: string | null
  cover_image_url: string | null
  attendance_required: boolean
}

interface NewsItem {
  id: string
  facebook_url: string
}

function facebookEmbedSrc(postUrl: string, width = 500) {
  return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(postUrl)}&show_text=true&width=${width}`
}

const NAV_LINKS = [
  { label: 'About', href: '#about' },
  { label: 'News', href: '#news' },
  { label: 'Events', href: '#events' },
]

export default function LandingPage() {
  const [events, setEvents] = useState<EventItem[] | null>(null)
  const [news, setNews] = useState<NewsItem[] | null>(null)

  useEffect(() => {
    fetch(`${API}/events/`)
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((data) => {
        const now = Date.now()
        const upcoming = (data.events as EventItem[])
          .filter((e) => !e.event_date || new Date(e.event_date).getTime() >= now)
          .sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
          .slice(0, 6)
        setEvents(upcoming)
      })
      .catch(() => setEvents([]))

    fetch(`${API}/news/`)
      .then((res) => (res.ok ? res.json() : { posts: [] }))
      .then((data) => setNews(data.posts))
      .catch(() => setNews([]))
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <img src="/psits-logo.png" alt="PSITS" className="h-8 w-8" />
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-white">PSITS-USM</span>
          </div>
          <nav className="hidden items-center gap-8 text-sm text-slate-300 sm:flex">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="transition hover:text-white">
                {link.label}
              </a>
            ))}
          </nav>
          <Link
            to="/login"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500"
          >
            Sign In
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-28">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-400">
            University of Southern Mindanao
          </p>
          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-black tracking-tight text-white sm:text-6xl">
            Philippine Society of Information Technology Students
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-400 sm:text-lg">
            One portal for membership activation, event attendance, dues, and everything else that keeps the
            PSITS-USM community connected.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-sky-500"
            >
              Sign In
            </Link>
            <a
              href="#events"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/5"
            >
              View Events
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>

        {/* News & Updates */}
        {news === null || news.length > 0 ? (
          <section id="news" className="scroll-mt-20 border-y border-white/10 bg-slate-900/40">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-400">Straight From Facebook</p>
                <h2 className="mt-3 text-3xl font-bold text-white">News &amp; Updates</h2>
                <p className="mt-2 text-slate-400">Recent posts from the PSITS-USM Facebook page.</p>
              </div>

              <div className="mt-10 flex flex-wrap justify-start gap-6">
                {news === null
                  ? [0, 1, 2].map((i) => (
                      <div key={i} className="h-[420px] w-[340px] max-w-full animate-pulse rounded-2xl bg-slate-900" />
                    ))
                  : news.map((post) => (
                      <div
                        key={post.id}
                        className="flex w-[340px] max-w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-lg shadow-black/20"
                      >
                        <div className="relative h-[360px] overflow-hidden">
                          <iframe
                            src={facebookEmbedSrc(post.facebook_url, 340)}
                            width="340"
                            height="360"
                            style={{ border: 'none' }}
                            scrolling="no"
                            frameBorder="0"
                            allowFullScreen
                            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                            title={`Facebook post ${post.id}`}
                          />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-white to-transparent" />
                        </div>
                        <a
                          href={post.facebook_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 border-t border-slate-100 bg-slate-50 py-2.5 text-xs font-semibold text-sky-700 transition hover:bg-slate-100"
                        >
                          View full post on Facebook
                          <ArrowRight className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* Mission, Vision, Objectives */}
        <section id="about" className="scroll-mt-20 border-y border-white/10 bg-slate-900/40">
          <div className="mx-auto max-w-7xl space-y-10 px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-400">About PSITS-USM</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Mission, Vision &amp; Objectives</h2>
              <p className="mt-4 text-slate-400">
                The Philippine Society of Information Technology Students at the University of Southern Mindanao is
                dedicated to fostering excellence, innovation, and leadership in information technology.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <article className="rounded-2xl border border-white/10 bg-slate-900 p-7">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-sm font-bold text-white">
                  M
                </div>
                <h3 className="mt-5 text-lg font-bold text-white">Our Mission</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  The Philippine Society of Information Technology Students (PSITS) - USM Chapter cultivates a
                  thriving and inclusive community where USM&apos;s IT students connect, collaborate, and grow. We
                  provide resources and opportunities that nurture academic excellence, professional skills, ethical
                  conduct, and a passion for using technology to make a positive impact within USM and beyond.
                </p>
              </article>

              <article className="rounded-2xl border border-white/10 bg-slate-900 p-7">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-sm font-bold text-white">
                  V
                </div>
                <h3 className="mt-5 text-lg font-bold text-white">Our Vision</h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  PSITS-USM envisions a future where its members are highly competent and ethical IT professionals,
                  actively contributing to USM&apos;s technological advancement, driving innovation, and making a
                  positive impact on the University, the local community, and the nation.
                </p>
              </article>

              <article className="rounded-2xl border border-white/10 bg-slate-900 p-7">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-sm font-bold text-white">
                  O
                </div>
                <h3 className="mt-5 text-lg font-bold text-white">Our Objectives</h3>
                <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm leading-6 text-slate-400">
                  <li>Uphold the rules and standards of USM, OSA, and CEIT.</li>
                  <li>Collaborate with USG and other recognized student organizations.</li>
                  <li>Promote academic excellence, research culture, and ethical IT practices.</li>
                  <li>Foster leadership, camaraderie, and civic engagement among BSCS, BSIS, and BLIS students.</li>
                  <li>Provide a platform for dialogue and joint action on IT education and community development.</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        {/* Upcoming Events */}
        <section id="events" className="scroll-mt-20 mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-400">What&apos;s Happening</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Upcoming Events</h2>
            <p className="mt-2 text-slate-400">Seminars, assemblies, and activities coming up for PSITS-USM members.</p>
          </div>

          <div className="mt-10">
            {events === null ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-64 animate-pulse rounded-2xl border border-white/10 bg-slate-900" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
                No upcoming events right now — check back soon.
              </div>
            ) : (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {events.map((event) => (
                  <article
                    key={event.id}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-slate-900 transition hover:border-sky-500/50"
                  >
                    <div className="relative h-40 w-full overflow-hidden bg-gradient-to-tr from-sky-900 to-indigo-900">
                      {event.cover_image_url ? (
                        <img
                          src={event.cover_image_url}
                          alt={event.name}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Calendar className="h-10 w-10 text-sky-300/60" />
                        </div>
                      )}
                      {event.attendance_required && (
                        <span className="absolute right-3 top-3 rounded-full bg-rose-500/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                          Required
                        </span>
                      )}
                    </div>
                    <div className="p-5">
                      <h3 className="text-base font-bold text-white">{event.name}</h3>
                      <div className="mt-2 space-y-1 text-xs text-slate-400">
                        {event.event_date && (
                          <p>
                            {new Date(event.event_date).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </p>
                        )}
                        {event.venue && (
                          <p className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            {event.venue}
                          </p>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-950">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <img src="/psits-logo.png" alt="PSITS-USM logo" className="h-10 w-10 rounded-xl bg-white p-1" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white">PSITS-USM</p>
                <p className="text-xs text-slate-500">University of Southern Mindanao</p>
              </div>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
              Philippine Society of Information Technology Students — membership activation, event attendance, dues,
              and everything else that keeps the chapter connected.
            </p>
            <a
              href="https://www.facebook.com/psitsusmmain"
              target="_blank"
              rel="noreferrer"
              title="PSITS-USM on Facebook"
              className="mt-4 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-400 transition hover:border-sky-500 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.459h-1.26c-1.243 0-1.63.771-1.63 1.562v1.875h2.773l-.443 2.91h-2.33V22c4.78-.756 8.437-4.92 8.437-9.94Z" />
              </svg>
            </a>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Explore</p>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="transition hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Account</p>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-400">
              <li>
                <Link to="/login" className="transition hover:text-white">
                  Sign in
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Contact Info</p>
            <ul className="mt-4 space-y-3 text-sm text-slate-400">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <span>CEIT, University of Southern Mindanao - Main Campus, Kabacan, Cotabato</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-slate-500" />
                <a href="mailto:usm.psits@usm.edu.ph" className="transition hover:text-white">
                  usm.psits@usm.edu.ph
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                <a
                  href="https://www.facebook.com/psitsusmmain"
                  target="_blank"
                  rel="noreferrer"
                  className="transition hover:text-white"
                >
                  Philippine Society of Information Technology Students - USM
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white">About the Developer</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              This portal was built by <span className="font-semibold text-slate-200">Tommie S. Tabol</span>, a USM
              alumnus and BS Computer Science graduate, cum laude. He currently works at the Mindanao Center for
              Disease Watch and Analytics, UP Mindanao, Mintal, Davao City, serving as Lead Developer for the
              Intelligence Referral Decision Support System (Project IRDSS).
            </p>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-slate-500 sm:px-6 lg:px-8">
            <p>&copy; {new Date().getFullYear()} PSITS-USM. All rights reserved.</p>
            <p>Built for the PSITS-USM chapter community.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

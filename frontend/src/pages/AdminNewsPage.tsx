import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Plus } from 'lucide-react'
import { notify } from '@/lib/toast'
import { confirmAction } from '@/lib/confirm'
import Sidebar, { MobileMenuButton } from '@/components/Sidebar'
import AdminProfileMenu from '@/components/AdminProfileMenu'
import { getAdminSidebarItems } from '@/lib/adminNav'
import EmptyState from '@/components/EmptyState'
import { adminFetch } from '@/lib/adminAuth'
import { API } from '@/lib/apiBase'

interface NewsRow {
  id: string
  facebook_url: string
  created_at: string
}

export default function AdminNewsPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [posts, setPosts] = useState<NewsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    void loadPosts()
  }, [])

  async function loadPosts() {
    setLoading(true)
    try {
      const res = await adminFetch(`${API}/officer/news/`)
      if (res.ok) setPosts((await res.json()).posts)
    } catch {
      notify.error('Network error', 'Could not load news posts.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    const url = newUrl.trim()
    if (!url) {
      notify.error('URL required', 'Please paste a Facebook post URL.')
      return
    }

    setAdding(true)
    try {
      const res = await adminFetch(`${API}/officer/news/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facebook_url: url }),
      })
      if (!res.ok) {
        const err = await res.json()
        notify.error('Could not add', err.detail || 'Please try again.')
        return
      }
      notify.success('Added', 'Post will now show on the landing page.')
      setNewUrl('')
      await loadPosts()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(post: NewsRow) {
    const confirmed = await confirmAction({
      title: 'Remove this post?',
      text: 'It will no longer show on the landing page.',
      confirmText: 'Remove',
      danger: true,
    })
    if (!confirmed) return

    setDeletingId(post.id)
    try {
      const res = await adminFetch(`${API}/officer/news/${post.id}`, { method: 'DELETE' })
      if (!res.ok) {
        notify.error('Could not remove', 'Please try again.')
        return
      }
      notify.success('Removed', 'Post taken down from the landing page.')
      await loadPosts()
    } catch {
      notify.error('Network error', 'Could not reach the server.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
      <Sidebar
        title="PSITS Admin"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={getAdminSidebarItems('news', navigate, () => navigate('/admin/events'))}
      />

      <div className="lg:pl-64">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <MobileMenuButton onClick={() => setMenuOpen(true)} />
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-white">News &amp; Updates</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Facebook posts shown in the landing page's News section</p>
            </div>
          </div>
          <AdminProfileMenu />
        </header>

        <main className="px-6 py-8 lg:px-10">
          <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Add a Post</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Paste the URL of a public post from the PSITS-USM Facebook page.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://www.facebook.com/PSITSUSM/posts/..."
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white transition focus:border-sky-500 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              />
              <button
                onClick={handleAdd}
                disabled={adding}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="border-b border-slate-100 dark:border-slate-800 p-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Current Posts</h2>
            </div>

            {loading ? (
              <div className="space-y-3 p-5">
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : posts.length === 0 ? (
              <EmptyState title="No posts added yet." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {posts.map((post) => (
                  <li key={post.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <a
                      href={post.facebook_url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm text-sky-700 dark:text-sky-400 hover:underline"
                    >
                      {post.facebook_url}
                    </a>
                    <button
                      onClick={() => handleDelete(post)}
                      disabled={deletingId === post.id}
                      title="Remove"
                      className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-rose-600 dark:text-rose-400 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

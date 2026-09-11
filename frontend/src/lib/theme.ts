const THEME_KEY = 'theme'

export type Theme = 'light' | 'dark'

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark' // default for first-time visitors, until they toggle it themselves
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem(THEME_KEY, theme)
}

export function initTheme() {
  applyTheme(getStoredTheme())
}

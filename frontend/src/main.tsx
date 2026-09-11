import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { initTheme } from './lib/theme'
import './index.css'

// Applies the stored (or default-dark) theme before the first paint, so the
// page never flashes light before a click-driven toggle would otherwise set it.
initTheme()

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)

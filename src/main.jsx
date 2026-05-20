import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// ─── Global error surfacing ───
// Catch promise rejections + uncaught errors that React's ErrorBoundary
// doesn't see (async, event handlers, agent fetches). Without this, failures
// in studyGuide / orchestrator / voice were going to the console and the
// user got no feedback. Components can read window.__mayaLastError and
// display a toast; we keep only the most recent so we don't grow forever.
if (typeof window !== 'undefined') {
  const recordError = (label, err) => {
    const msg = (err && (err.message || err.reason?.message)) || String(err)
    window.__mayaLastError = { label, msg, ts: Date.now() }
    // Keep noise out of prod — dev still sees the full stack
    if (import.meta.env.DEV) console.error(`[maya:${label}]`, err)
  }
  window.addEventListener('unhandledrejection', (e) => recordError('promise', e.reason))
  window.addEventListener('error', (e) => recordError('error', e.error || e.message))
}

// Register PWA service worker (production only — Vite hot-reload conflicts with SW in dev)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

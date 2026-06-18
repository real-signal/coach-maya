import { useNavigate, useLocation } from 'react-router-dom'
import { PRODUCT_MODE } from '../lib/profile'

// Vasco's 5-item nav covers his daily flow across the 48-route app.
const VASCO_ITEMS = [
  { icon: '🏠', label: 'Home', to: '/' },
  { icon: '📋', label: 'Briefing', to: '/briefing' },
  { icon: '🏆', label: 'Compete', to: '/competitions' },
  { icon: '🎙', label: 'Lesson', to: '/lesson' },
  { icon: '👤', label: 'Me', to: '/profile' },
]

// Product-mode nav matches the wedge: olympiad drill (kid daily) + weekly
// report (parent artifact). Must stay in sync with the allowlist in App.jsx.
const PRODUCT_ITEMS = [
  { icon: '🏠', label: 'Home', to: '/' },
  { icon: '🧮', label: 'Drill', to: '/olympiad' },
  { icon: '📊', label: 'Report', to: '/report' },
  { icon: '👤', label: 'Me', to: '/profile' },
]

const ITEMS = PRODUCT_MODE ? PRODUCT_ITEMS : VASCO_ITEMS

const HIDDEN_ROUTES = ['/onboarding', '/login', '/signup', '/children']

export default function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  if (HIDDEN_ROUTES.includes(location.pathname)) return null

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
      maxWidth: 480, margin: '0 auto',
      background: 'rgba(10, 10, 20, 0.75)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      padding: '6px 8px 10px',
      display: 'flex', justifyContent: 'space-around',
    }}>
      {ITEMS.map(it => {
        const active = location.pathname === it.to
        return (
          <button
            key={it.to}
            onClick={() => navigate(it.to)}
            style={{
              flex: 1, padding: '8px 4px',
              background: active ? 'rgba(45,212,191,0.08)' : 'transparent',
              border: 'none', borderRadius: 12,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2,
              cursor: 'pointer', fontFamily: "'IBM Plex Mono', monospace",
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{
              fontSize: 20,
              opacity: active ? 1 : 0.5,
              transform: active ? 'scale(1.1)' : 'scale(1)',
              transition: 'all 0.2s ease',
            }}>{it.icon}</div>
            <div style={{
              fontSize: 9,
              color: active ? '#2DD4BF' : '#6b6b8a',
              fontWeight: active ? 700 : 400,
            }}>{it.label}</div>
            {active && (
              <div style={{
                width: 4, height: 4, borderRadius: 2,
                background: '#2DD4BF', marginTop: 2,
                boxShadow: '0 0 8px rgba(45,212,191,0.5)',
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

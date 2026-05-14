/**
 * QuizHUD — floating banner shown when a quiz session is active.
 * Surfaces: topic, progress (X/N + dots), and a one-tap exit.
 *
 * The quiz session lives in localStorage (managed by orchestrator). Same-tab
 * storage events don't fire, so we re-read on every state.messages change
 * (every chat turn = potential quiz state change) + once on mount.
 */
import { useEffect, useState } from 'react'
import { useMaya } from '../context/MayaContext'

const C = {
  surface: 'rgba(20, 20, 32, 0.92)',
  border: 'rgba(45, 212, 191, 0.4)',
  teal: '#2DD4BF',
  text: '#f0f0f5',
  muted: '#6b6b8a',
  red: '#F87171',
  mono: "'IBM Plex Mono', monospace",
}

function readSession() {
  try {
    const raw = localStorage.getItem('maya_quiz_session')
    const s = raw ? JSON.parse(raw) : null
    if (!s || !Array.isArray(s.questions) || s.questions.length === 0) return null
    return s
  } catch {
    return null
  }
}

export default function QuizHUD() {
  const maya = useMaya()
  const [session, setSession] = useState(readSession)

  // Re-check whenever the chat history changes (quiz state mutates per turn).
  useEffect(() => {
    setSession(readSession())
  }, [maya.messages])

  if (!session) return null

  const total = session.questions.length
  const idx = Math.min(session.idx ?? 0, total - 1)
  const current = idx + 1
  const topic = session.topic || 'this'

  return (
    <div style={{
      position: 'fixed', left: 12, right: 12, top: 12,
      maxWidth: 460, margin: '0 auto', zIndex: 60,
      padding: '10px 12px', background: C.surface,
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      border: `1px solid ${C.border}`, borderRadius: 14,
      boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: C.mono, color: C.text, fontSize: 11,
      pointerEvents: 'auto',
    }}>
      <span style={{ fontSize: 16 }}>🎯</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, letterSpacing: 0.5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          Quiz · {current}/{total}
          <span style={{ color: C.muted, fontWeight: 400 }}> · {topic}</span>
        </div>
        <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
          {session.questions.map((_, i) => (
            <span key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i < idx ? C.teal
                : i === idx ? C.teal + 'aa'
                : 'rgba(255,255,255,0.1)',
              transition: 'background 200ms',
            }} />
          ))}
        </div>
      </div>
      <button
        onClick={() => {
          if (!confirm('End the quiz?')) return
          maya.endQuizSession()
        }}
        title="End quiz"
        style={{
          padding: '6px 10px', borderRadius: 8,
          background: 'transparent', border: `1px solid ${C.red}55`,
          color: C.red, fontSize: 10, fontFamily: C.mono,
          fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
        }}
      >
        ✕ END
      </button>
    </div>
  )
}

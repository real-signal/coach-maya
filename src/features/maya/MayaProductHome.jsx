/**
 * MayaProductHome — the post-setup home for PRODUCT_MODE.
 *
 * Replaces MayaDashboard at `/` for public-product builds. Vasco's deploy
 * still gets the 48-route dashboard; this page only shows the olympiad
 * wedge so a paying parent never sees the grab-bag UI.
 *
 * Mirrors ProductLanding's visual language (mono + Bebas, glass surfaces,
 * teal/gold accents) and the StatsBar/Stat patterns from MayaOlympiad so
 * the kid feels like they're inside one product, not three.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadProfile } from './lib/profile'

const C = {
  bg: '#0a0a14',
  surface: 'rgba(255,255,255,0.04)',
  surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)',
  text: '#f0f0f5',
  muted: '#6b6b8a',
  teal: '#2DD4BF',
  gold: '#FFD700',
  green: '#34D399',
  amber: '#FBBF24',
  mono: "'IBM Plex Mono', monospace",
  display: "'Bebas Neue', sans-serif",
}

function loadOlympiadState() {
  try {
    return JSON.parse(localStorage.getItem('maya_olympiad')) || { attempts: [], streak: 0, lastDate: null }
  } catch {
    return { attempts: [], streak: 0, lastDate: null }
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function greetingFor(hour) {
  if (hour < 5) return 'Up late'
  if (hour < 12) return 'Morning'
  if (hour < 17) return 'Afternoon'
  if (hour < 21) return 'Evening'
  return 'Late night'
}

export default function MayaProductHome() {
  const navigate = useNavigate()
  const profile = useMemo(() => loadProfile(), [])
  const state = useMemo(() => loadOlympiadState(), [])

  const attempts = state.attempts || []
  const streak = state.streak || 0
  const today = todayISO()
  const todayAttempts = attempts.filter(a => a.ts && a.ts.startsWith(today))
  const todayCorrect = todayAttempts.filter(a => a.correct).length
  const totalCorrect = attempts.filter(a => a.correct).length
  const allTimeAccuracy = attempts.length
    ? Math.round((totalCorrect / attempts.length) * 100)
    : null

  const firstName = (profile?.name || '').trim().split(' ')[0] || 'champ'
  const greeting = greetingFor(new Date().getHours())

  // The wedge product has one daily verb: drill. Everything on this page
  // pushes the kid toward that verb. The parent report is a secondary
  // affordance — a destination, not the main loop.
  const hasDoneToday = todayAttempts.length > 0
  const drillCtaLabel = hasDoneToday ? 'KEEP GOING →' : 'START TODAY\'S DRILL →'
  const drillSubtext = hasDoneToday
    ? `${todayCorrect}/${todayAttempts.length} so far — don't stop now.`
    : streak > 0
      ? `Don't break the ${streak}-day streak.`
      : 'AMC 8, 10, 12 — your call.'

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      color: C.text,
      fontFamily: C.mono,
      padding: '24px 20px 100px',
      maxWidth: 480,
      margin: '0 auto',
      position: 'relative',
    }}>
      {/* Ambient orb to match landing */}
      <div style={{
        position: 'fixed',
        top: -120, left: -80,
        width: 280, height: 280,
        background: 'radial-gradient(circle, rgba(45,212,191,0.14), transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Brand strip */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 24,
        }}>
          <div style={{
            fontFamily: C.display,
            fontSize: 14,
            letterSpacing: 4,
            color: C.teal,
          }}>
            COACH MAYA
          </div>
          <div style={{
            fontSize: 10,
            color: C.muted,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}>
            {greeting}, {firstName}
          </div>
        </div>

        {/* Streak / today headline */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            fontFamily: C.display,
            fontSize: 44,
            lineHeight: 1.0,
            margin: 0,
            letterSpacing: 1,
          }}>
            {streak > 0 ? (
              <>🔥 {streak}-DAY<br/><span style={{ color: C.gold }}>STREAK.</span></>
            ) : (
              <>READY TO<br/><span style={{ color: C.teal }}>DRILL?</span></>
            )}
          </h1>
          <p style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: C.muted,
            marginTop: 12,
            marginBottom: 0,
          }}>
            {hasDoneToday
              ? `You're already on the board today. Keep stacking.`
              : `One session a day. That's the whole game.`}
          </p>
        </div>

        {/* Primary CTA — the only verb that matters */}
        <button
          onClick={() => navigate('/olympiad')}
          style={{
            width: '100%',
            padding: '22px 20px',
            background: C.teal,
            color: '#06121a',
            border: 'none',
            borderRadius: 14,
            fontFamily: C.display,
            fontSize: 22,
            letterSpacing: 3,
            cursor: 'pointer',
            fontWeight: 700,
            textAlign: 'left',
            boxShadow: '0 8px 30px rgba(45,212,191,0.25)',
          }}
        >
          <div>{drillCtaLabel}</div>
          <div style={{
            fontFamily: C.mono,
            fontSize: 11,
            letterSpacing: 0.5,
            fontWeight: 400,
            marginTop: 6,
            opacity: 0.75,
          }}>
            {drillSubtext}
          </div>
        </button>

        {/* Stats grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 10,
          marginTop: 24,
        }}>
          <Stat label="Today" value={`${todayCorrect}/${todayAttempts.length}`} color={C.green} />
          <Stat label="All-time" value={allTimeAccuracy === null ? '—' : `${allTimeAccuracy}%`} color={C.teal} />
          <Stat label="Total solved" value={totalCorrect} color={C.gold} />
        </div>

        {/* Parent report — secondary */}
        <div style={{ marginTop: 28 }}>
          <div style={{
            fontFamily: C.display,
            fontSize: 11,
            letterSpacing: 3,
            color: C.muted,
            marginBottom: 10,
          }}>
            FOR PARENTS
          </div>
          <button
            onClick={() => navigate('/report')}
            style={{
              width: '100%',
              padding: 18,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderLeft: `4px solid ${C.gold}`,
              borderRadius: 12,
              color: C.text,
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: C.mono,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span>
              <div style={{
                fontFamily: C.display,
                fontSize: 18,
                letterSpacing: 2,
                color: C.gold,
              }}>
                WEEKLY REPORT
              </div>
              <div style={{
                fontSize: 11,
                color: C.muted,
                marginTop: 4,
                lineHeight: 1.4,
              }}>
                {attempts.length > 0
                  ? 'Screenshot it for the family chat.'
                  : 'Unlocks after the first drill.'}
              </div>
            </span>
            <span style={{ color: C.gold, fontSize: 18 }}>→</span>
          </button>
        </div>

        {/* Footer hint */}
        <div style={{
          textAlign: 'center',
          fontSize: 10,
          color: C.muted,
          marginTop: 40,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          One verb. One streak. One coach.
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{
      padding: '14px 8px',
      background: C.surface,
      borderRadius: 12,
      border: `1px solid ${C.border}`,
      textAlign: 'center',
      backdropFilter: 'blur(20px)',
    }}>
      <div style={{
        fontSize: 9,
        color: C.muted,
        textTransform: 'uppercase',
        letterSpacing: 1,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: C.display,
        fontSize: 22,
        fontWeight: 700,
        color,
        marginTop: 4,
        letterSpacing: 1,
      }}>
        {value}
      </div>
    </div>
  )
}

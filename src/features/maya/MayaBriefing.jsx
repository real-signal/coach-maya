/**
 * Daily Briefing — mission control for the day.
 * The page a competitor opens first thing in the morning.
 * Pulls from: competitions, prep plans, tasks, sleep, water, mood, streak.
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaya } from './context/MayaContext'
import { loadMoods } from './lib/moods'
import { focusesForToday, adherenceLastNDays, getTrack, loadCompassLog, toggleCompassFocus, todayDateKey } from './lib/compassTracks'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', glassBorder: 'rgba(255,255,255,0.14)',
  text: '#f0f0f5', muted: '#6b6b8a', dim: '#3a3a55',
  teal: '#2DD4BF', gold: '#FFD700', amber: '#FBBF24',
  green: '#34D399', red: '#F87171', blue: '#93C5FD',
  purple: '#A78BFA', pink: '#F472B6', orange: '#FB923C',
  glass: 'rgba(255,255,255,0.08)', blur: 'blur(20px)',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

function loadLS(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

export default function MayaBriefing() {
  const navigate = useNavigate()
  const maya = useMaya()
  const today = new Date().toISOString().slice(0, 10)
  const hour = new Date().getHours()
  const name = maya.profile?.name || 'Champ'

  // ─── Competitions ───
  const comps = useMemo(() => loadLS('maya_competitions') || [], [])
  const upcoming = comps.filter(c => c.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const nextComp = upcoming[0]
  const daysUntilNext = nextComp ? Math.ceil((new Date(nextComp.date) - new Date(today)) / 86400000) : null

  // ─── Prep Plans ───
  const preps = useMemo(() => loadLS('maya_prep_plans') || [], [])
  const activePreps = preps.filter(p => !p.compDate || p.compDate >= today)
  const todayPrepStatus = activePreps.map(p => {
    const done = p.log?.[today] || 0
    const hit = done >= p.dailyTarget
    return { ...p, todayDone: done, todayHit: hit, pct: Math.min(100, Math.round((done / (p.dailyTarget || 1)) * 100)) }
  })
  const allPrepsDone = todayPrepStatus.length > 0 && todayPrepStatus.every(p => p.todayHit)
  const prepsStarted = todayPrepStatus.some(p => p.todayDone > 0)

  // ─── Tasks ───
  const tasks = maya.tasks || []
  const completedTasks = tasks.filter(t => t.completed).length
  const totalTasks = tasks.length

  // ─── Parent compass ───
  const [compassTick, setCompassTick] = useState(0)
  const compass = maya.profile?.parentCompass
  const compassActive = !!compass?.track
  const compassTrackLabel = compassActive
    ? (compass.track === 'custom' && compass.customLabel ? compass.customLabel : (getTrack(compass.track)?.label || compass.track))
    : ''
  const compassFocuses = useMemo(() => compassActive ? focusesForToday(compass) : [], [compass, compassActive, compassTick])
  const compassLog = useMemo(() => compassActive ? loadCompassLog() : {}, [compassActive, compassTick])
  const todayKey = todayDateKey()
  const compassDoneIds = new Set((compassLog?.[todayKey] || []))
  const compassAllDone = compassFocuses.length > 0 && compassFocuses.every(f => compassDoneIds.has(f.id))
  const compassAdh = useMemo(() => compassActive ? adherenceLastNDays(compass, 7) : null, [compass, compassActive, compassTick])

  // ─── Vitals ───
  const sleepLogs = loadLS('maya_sleep') || []
  const lastSleep = sleepLogs.find(s => s.date === today || s.date === (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10) })())
  const waterData = loadLS('maya_water') || {}
  const todayWater = waterData[today] || 0
  const todayMood = maya.todayMood
  const streak = maya.profile?.currentStreak || 0

  // ─── Maya's briefing message ───
  const briefing = useMemo(() => {
    const parts = []

    // Time-based opener
    if (hour < 11) parts.push(`Morning, ${name}.`)
    else if (hour < 17) parts.push(`Afternoon, ${name}.`)
    else parts.push(`Evening, ${name}.`)

    // Streak
    if (streak > 0) parts.push(`Day ${streak} of the streak.`)

    // Competition urgency
    if (daysUntilNext === 0) parts.push(`${nextComp.name} is TODAY. Trust the prep.`)
    else if (daysUntilNext !== null && daysUntilNext <= 3) parts.push(`${nextComp.name} in ${daysUntilNext} days. Final prep mode.`)
    else if (daysUntilNext !== null && daysUntilNext <= 14) parts.push(`${daysUntilNext} days until ${nextComp.name}. Every session counts.`)

    // Prep status
    if (todayPrepStatus.length > 0 && !prepsStarted && hour >= 10) parts.push("Prep plans untouched today. Clock's ticking.")
    else if (allPrepsDone) parts.push("All prep targets hit. That's the standard.")

    // Parent compass — directive priority
    if (compassActive && compassFocuses.length > 0) {
      if (compassAllDone) parts.push("Compass cleared. That's the parent stack done.")
      else {
        const remaining = compassFocuses.filter(f => !compassDoneIds.has(f.id))
        const labels = remaining.slice(0, 2).map(f => f.label).join(' + ')
        parts.push(`Parent compass today: ${labels}. Top of the stack.`)
      }
    }

    // Tasks
    if (completedTasks === totalTasks && totalTasks > 0) parts.push("Task list is clean. Elite.")
    else if (completedTasks > 0) parts.push(`${completedTasks}/${totalTasks} tasks done.`)

    // Sleep
    if (lastSleep && lastSleep.hours < 7) parts.push(`${lastSleep.hours}h sleep. Your brain's running on fumes.`)

    return parts.join(' ')
  }, [name, hour, streak, daysUntilNext, todayPrepStatus, completedTasks, totalTasks, lastSleep, compassActive, compassFocuses, compassAllDone, compassTick])

  const catIcons = { math: '🧮', piano: '🎹', tennis: '🎾', coding: '💻', speech: '🎤', other: '🏅' }

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', color: C.text, fontFamily: C.mono, paddingBottom: 80, position: 'relative' }}>
      {/* Ambient */}
      <div style={{ position: 'fixed', top: -60, right: -40, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,212,191,0.4) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: 200, left: -40, width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,215,0,0.25) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />

      <Header onBack={() => navigate('/')} />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* Maya's briefing */}
        <div style={{
          padding: 16, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
          borderRadius: 16, border: `1px solid ${C.glassBorder}`, marginBottom: 16,
          borderLeft: `3px solid ${C.teal}`,
        }}>
          <div style={{ fontSize: 10, color: C.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            Maya's briefing
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>{briefing}</div>
        </div>

        {/* Parent compass — directive layer */}
        {compassActive && compassFocuses.length > 0 && (
          <div style={{
            padding: 14, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
            borderRadius: 14, border: `1px solid ${C.glassBorder}`, marginBottom: 16,
            borderLeft: `3px solid ${C.gold}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: C.gold, textTransform: 'uppercase', letterSpacing: 1 }}>
                From your parent · {compassTrackLabel}
              </div>
              {compassAdh && compassAdh.totalScheduled >= 3 && compassAdh.pct != null && (
                <div style={{
                  fontSize: 10, fontWeight: 700,
                  color: compassAdh.pct >= 80 ? C.green : compassAdh.pct >= 60 ? C.amber : C.red,
                }}>
                  7d · {compassAdh.pct}%
                </div>
              )}
            </div>
            {compass.northStar && (
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 1.4 }}>
                ★ {compass.northStar}
              </div>
            )}
            {compassFocuses.map(f => {
              const done = compassDoneIds.has(f.id)
              return (
                <div
                  key={f.id}
                  onClick={() => { toggleCompassFocus(f.id); setCompassTick(t => t + 1) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                    borderBottom: `1px solid rgba(255,255,255,0.04)`,
                    cursor: 'pointer', opacity: done ? 0.55 : 1,
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: 6,
                    border: `1.5px solid ${done ? C.green : C.muted}`,
                    background: done ? C.green : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, color: '#0a0a14', flexShrink: 0,
                  }}>{done ? '✓' : ''}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, textDecoration: done ? 'line-through' : 'none' }}>{f.label}</div>
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{f.minutes}m · {f.type}</div>
                  </div>
                </div>
              )
            })}
            {compassAllDone && (
              <div style={{ fontSize: 11, color: C.green, marginTop: 8, fontWeight: 600 }}>
                ✓ Compass cleared today.
              </div>
            )}
          </div>
        )}

        {/* Next competition */}
        {nextComp && (
          <div onClick={() => navigate('/competitions')} style={{
            padding: 16, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
            borderRadius: 16, border: `1px solid ${C.glassBorder}`, marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 16,
              background: (daysUntilNext <= 7 ? C.red : daysUntilNext <= 21 ? C.amber : C.teal) + '15',
              border: `1px solid ${(daysUntilNext <= 7 ? C.red : daysUntilNext <= 21 ? C.amber : C.teal)}44`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontFamily: C.display, fontSize: 26, color: daysUntilNext <= 7 ? C.red : daysUntilNext <= 21 ? C.amber : C.teal, lineHeight: 1 }}>
                {daysUntilNext}
              </div>
              <div style={{ fontSize: 7, color: C.muted, textTransform: 'uppercase' }}>days</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: C.gold, textTransform: 'uppercase', letterSpacing: 1 }}>Next event</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{catIcons[nextComp.category] || '🏅'} {nextComp.name}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{nextComp.date}</div>
            </div>
            <div style={{ color: C.muted }}>→</div>
          </div>
        )}

        {/* More upcoming */}
        {upcoming.length > 1 && (
          <div style={{
            padding: 12, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
            borderRadius: 12, border: `1px solid ${C.glassBorder}`, marginBottom: 16,
          }}>
            <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Coming up</div>
            {upcoming.slice(1, 4).map(c => {
              const d = Math.ceil((new Date(c.date) - new Date(today)) / 86400000)
              return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                  <span>{catIcons[c.category] || '🏅'} {c.name}</span>
                  <span style={{ color: d <= 14 ? C.amber : C.muted }}>{d}d</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Today's prep */}
        {todayPrepStatus.length > 0 && (
          <div style={{
            padding: 14, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
            borderRadius: 14, border: `1px solid ${C.glassBorder}`, marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: C.amber, textTransform: 'uppercase', letterSpacing: 1 }}>Today's prep</div>
              <button onClick={() => navigate('/prep')} style={{
                background: 'none', border: 'none', color: C.teal, fontSize: 10, fontFamily: C.mono, cursor: 'pointer',
              }}>Open →</button>
            </div>
            {todayPrepStatus.map(p => (
              <div key={p.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                  <span>{p.icon} {p.name}</span>
                  <span style={{ color: p.todayHit ? C.green : C.muted }}>
                    {p.todayDone}/{p.dailyTarget} {p.todayHit ? '✓' : ''}
                  </span>
                </div>
                <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${p.pct}%`,
                    background: p.todayHit ? C.green : `linear-gradient(90deg, ${C.teal}, ${C.blue})`,
                    borderRadius: 3, transition: 'width 300ms',
                  }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Vitals row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <VitalCard icon="🔥" label="Streak" value={`${streak}d`} color={streak >= 7 ? C.gold : streak > 0 ? C.amber : C.dim} />
          <VitalCard icon="😴" label="Sleep" value={lastSleep ? `${lastSleep.hours}h` : '—'} color={lastSleep?.hours >= 8 ? C.green : lastSleep?.hours >= 7 ? C.amber : lastSleep ? C.red : C.dim} />
          <VitalCard icon="💧" label="Water" value={`${todayWater}/8`} color={todayWater >= 8 ? C.blue : todayWater > 0 ? C.muted : C.dim} />
          <VitalCard icon="💜" label="Mood" value={todayMood || '—'} color={C.pink} small />
        </div>

        {/* Tasks */}
        <div style={{
          padding: 14, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
          borderRadius: 14, border: `1px solid ${C.glassBorder}`, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: C.teal, textTransform: 'uppercase', letterSpacing: 1 }}>Tasks</div>
            <div style={{ fontSize: 11, color: completedTasks === totalTasks && totalTasks > 0 ? C.green : C.muted }}>
              {completedTasks}/{totalTasks}
            </div>
          </div>
          {tasks.slice(0, 6).map(t => (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
              borderBottom: `1px solid rgba(255,255,255,0.04)`,
              opacity: t.skipped ? 0.4 : 1,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 9,
                border: `2px solid ${t.completed ? C.green : C.dim}`,
                background: t.completed ? C.green : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: t.completed ? C.bg : C.dim, flexShrink: 0,
              }}>{t.completed ? '✓' : ''}</div>
              <span style={{
                fontSize: 12, color: t.completed ? C.green : C.text,
                textDecoration: t.skipped ? 'line-through' : 'none', flex: 1,
              }}>{t.name}</span>
              <span style={{ fontSize: 10, color: C.dim }}>{t.duration}m</span>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <QuickAction icon="🏆" label="Competitions" onClick={() => navigate('/competitions')} color={C.gold} />
          <QuickAction icon="📊" label="Analytics" onClick={() => navigate('/analytics')} color={C.teal} />
          <QuickAction icon="🏅" label="Trophy Room" onClick={() => navigate('/trophies')} color={C.amber} />
          <QuickAction icon="📋" label="Weekly Report" onClick={() => navigate('/weekly')} color={C.purple} />
        </div>
      </div>
    </div>
  )
}

function VitalCard({ icon, label, value, color, small }) {
  return (
    <div style={{
      padding: 10, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      borderRadius: 12, border: `1px solid ${C.glassBorder}`, textAlign: 'center',
    }}>
      <div style={{ fontSize: 14 }}>{icon}</div>
      <div style={{ fontSize: small ? 10 : 14, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 7, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 1 }}>{label}</div>
    </div>
  )
}

function QuickAction({ icon, label, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      padding: '14px 12px', background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      borderRadius: 14, border: `1px solid ${C.glassBorder}`,
      color: C.text, fontFamily: C.mono, cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
      transition: 'all 0.2s ease',
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 11, color }}>{label}</span>
    </button>
  )
}

function Header({ onBack }) {
  return (
    <div style={{
      padding: '14px 16px', borderBottom: `1px solid ${C.glassBorder}`,
      background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 0 }}>←</button>
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2 }}>DAILY BRIEFING</div>
    </div>
  )
}

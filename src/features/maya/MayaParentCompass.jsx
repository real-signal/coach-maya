import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadProfile, saveProfile } from './lib/profile'
import { COMPASS_TRACKS, FOCUS_TYPES, DAY_LABELS, getTrack } from './lib/compassTracks'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171', amber: '#FBBF24',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

// Monday of current week, ISO date
function thisWeekMondayIso() {
  const d = new Date()
  const day = d.getDay() // 0..6, Sun=0
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function emptyFocus() {
  return {
    id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    type: 'homework',
    minutes: 30,
    days: [1, 2, 3, 4, 5], // weekdays default
  }
}

export default function MayaParentCompass() {
  const navigate = useNavigate()
  // Parent gate: rely on the existing /parent unlock token. If not unlocked,
  // bounce them to /parent which renders the PIN flow.
  const unlocked = typeof window !== 'undefined' && sessionStorage.getItem('parent_unlocked') === '1'
  useEffect(() => {
    if (!unlocked) navigate('/parent', { replace: true })
  }, [unlocked, navigate])

  const profile = useMemo(() => loadProfile(), [])
  const initialCompass = profile.parentCompass || {}
  const [track, setTrack] = useState(initialCompass.track || '')
  const [customLabel, setCustomLabel] = useState(initialCompass.customLabel || '')
  const [northStar, setNorthStar] = useState(initialCompass.northStar || '')
  const [focuses, setFocuses] = useState(Array.isArray(initialCompass.focuses) ? initialCompass.focuses : [])
  const [saved, setSaved] = useState(false)

  const selectedTrack = getTrack(track)

  const pickTrack = (id) => {
    setTrack(id)
    // First-time picking a preset → seed focuses from the track's suggestions.
    const t = getTrack(id)
    if (t && t.id !== 'custom' && focuses.length === 0) {
      setFocuses(t.suggestedFocuses.map(f => ({ ...f })))
      if (!northStar && t.suggestedNorthStar) setNorthStar(t.suggestedNorthStar)
    }
  }

  const addFocus = () => setFocuses(prev => [...prev, emptyFocus()])
  const updateFocus = (id, patch) => setFocuses(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
  const removeFocus = (id) => setFocuses(prev => prev.filter(f => f.id !== id))
  const toggleDay = (id, day) => {
    setFocuses(prev => prev.map(f => {
      if (f.id !== id) return f
      const days = Array.isArray(f.days) ? [...f.days] : []
      const i = days.indexOf(day)
      if (i >= 0) days.splice(i, 1)
      else days.push(day)
      days.sort()
      return { ...f, days }
    }))
  }

  const handleSave = () => {
    const validFocuses = focuses
      .filter(f => f.label.trim())
      .map(f => ({
        id: f.id,
        label: f.label.trim().slice(0, 80),
        type: f.type || 'homework',
        minutes: Math.max(5, Math.min(180, parseInt(f.minutes, 10) || 30)),
        days: Array.isArray(f.days) && f.days.length > 0 ? f.days : [1,2,3,4,5],
      }))
    const next = {
      ...profile,
      parentCompass: {
        track: track || '',
        customLabel: track === 'custom' ? customLabel.trim().slice(0, 50) : '',
        northStar: northStar.trim().slice(0, 200),
        focuses: validFocuses,
        weekStartIso: thisWeekMondayIso(),
        updatedAt: new Date().toISOString(),
      },
    }
    saveProfile(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  // ─── Styles ───
  const card = {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 12, padding: 14, marginBottom: 12,
    backdropFilter: 'blur(8px)',
  }
  const label = { fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }
  const input = {
    width: '100%', background: C.surfaceLight, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '10px 12px', color: C.text, fontFamily: C.mono, fontSize: 13,
    boxSizing: 'border-box',
  }
  const chip = (active) => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 11,
    background: active ? C.teal : C.surfaceLight,
    color: active ? '#000' : C.text,
    border: `1px solid ${active ? C.teal : C.border}`,
    cursor: 'pointer', fontFamily: C.mono, fontWeight: active ? 700 : 400,
  })
  const primary = {
    background: C.teal, color: '#000', border: 'none', borderRadius: 10,
    padding: '12px 18px', fontFamily: C.mono, fontWeight: 700, fontSize: 13,
    cursor: 'pointer', width: '100%',
  }
  const ghost = {
    background: 'transparent', color: C.muted, border: `1px dashed ${C.border}`,
    borderRadius: 10, padding: '10px 14px', fontFamily: C.mono, fontSize: 12,
    cursor: 'pointer',
  }

  if (!unlocked) {
    // Redirect handled by effect; render nothing meanwhile.
    return null
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 100 }}>
      {/* Ambient gradient */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(1200px 600px at 20% -10%, rgba(45,212,191,0.10), transparent 60%), radial-gradient(800px 400px at 80% 10%, rgba(251,191,36,0.06), transparent 60%)',
      }} />

      {/* Header */}
      <div style={{
        position: 'relative', zIndex: 1,
        padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
        background: C.surface, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => navigate('/parent')} style={{
          background: 'transparent', border: 'none', color: C.muted,
          fontSize: 18, cursor: 'pointer',
        }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2, lineHeight: 1 }}>
            PARENT COMPASS
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
            Set the specialization track + this week's priorities. Maya pushes them daily.
          </div>
        </div>
        <span style={{ fontSize: 14 }}>🔒</span>
      </div>

      <div style={{ position: 'relative', zIndex: 1, padding: 16, maxWidth: 520, margin: '0 auto' }}>
        {/* Track selector */}
        <div style={card}>
          <div style={label}>1 · Specialization track</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {COMPASS_TRACKS.map(t => (
              <button key={t.id} onClick={() => pickTrack(t.id)} style={chip(track === t.id)}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          {selectedTrack && (
            <div style={{ marginTop: 12, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              {selectedTrack.blurb}
            </div>
          )}
          {track === 'custom' && (
            <input
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              placeholder="Name this track (e.g. Pre-Med Foundation)"
              style={{ ...input, marginTop: 10 }}
              maxLength={50}
            />
          )}
        </div>

        {/* North Star */}
        <div style={card}>
          <div style={label}>2 · This week's north star</div>
          <textarea
            value={northStar}
            onChange={e => setNorthStar(e.target.value)}
            placeholder='One specific outcome by Sunday. "Master AMC10 casework", "Performance-ready Chopin Nocturne", etc.'
            style={{ ...input, minHeight: 72, resize: 'vertical' }}
            maxLength={200}
          />
          <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
            {200 - northStar.length} characters left
          </div>
        </div>

        {/* Daily focuses */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={label}>3 · Daily focuses ({focuses.length})</div>
            <button onClick={addFocus} style={{
              background: 'transparent', border: `1px solid ${C.teal}`, color: C.teal,
              borderRadius: 8, padding: '4px 10px', fontFamily: C.mono, fontSize: 11,
              cursor: 'pointer',
            }}>+ add</button>
          </div>

          {focuses.length === 0 && (
            <div style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
              No focuses yet. Pick a track above to auto-fill, or tap <span style={{ color: C.teal }}>+ add</span>.
            </div>
          )}

          {focuses.map((f, i) => (
            <div key={f.id} style={{
              marginTop: 12, padding: 12, borderRadius: 10,
              background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: C.muted, minWidth: 18 }}>#{i + 1}</div>
                <input
                  value={f.label}
                  onChange={e => updateFocus(f.id, { label: e.target.value })}
                  placeholder="What should they do? (e.g. 'Drill 5 algebra problems')"
                  style={{ ...input, flex: 1 }}
                  maxLength={80}
                />
                <button onClick={() => removeFocus(f.id)} style={{
                  background: 'transparent', border: 'none', color: C.red,
                  fontSize: 16, cursor: 'pointer', padding: '0 4px',
                }}>×</button>
              </div>

              {/* Type chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {FOCUS_TYPES.map(t => (
                  <button key={t.id} onClick={() => updateFocus(f.id, { type: t.id })}
                    style={{ ...chip(f.type === t.id), fontSize: 10, padding: '4px 8px' }}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </div>

              {/* Minutes */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Minutes</span>
                <input
                  type="number" min={5} max={180} step={5}
                  value={f.minutes}
                  onChange={e => updateFocus(f.id, { minutes: e.target.value })}
                  style={{ ...input, width: 80, padding: '6px 10px' }}
                />
              </div>

              {/* Days */}
              <div style={{ display: 'flex', gap: 4 }}>
                {DAY_LABELS.map((d, idx) => (
                  <button key={idx} onClick={() => toggleDay(f.id, idx)}
                    style={{
                      ...chip(Array.isArray(f.days) && f.days.includes(idx)),
                      padding: '4px 8px', fontSize: 10, minWidth: 32,
                    }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Save */}
        <button onClick={handleSave} style={{
          ...primary,
          background: saved ? C.amber : C.teal,
        }}>
          {saved ? 'Saved ✓' : 'Save compass — push to dashboard'}
        </button>

        <div style={{ fontSize: 10, color: C.muted, marginTop: 12, textAlign: 'center', lineHeight: 1.6 }}>
          Once saved, your kid sees a <span style={{ color: C.teal }}>"From your parent"</span> card on the dashboard
          with today's focuses. Adherence is tracked separately from XP so it doesn't game-ify your goals.
        </div>
      </div>
    </div>
  )
}

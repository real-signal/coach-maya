/**
 * Competition Tracker — upcoming events, past results, countdowns.
 * Covers math olympiads, piano competitions, tennis tournaments.
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadProfile } from './lib/profile'

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

const COMP_KEY = 'maya_competitions'

const CATEGORIES = [
  { id: 'math', label: 'Math', icon: '🧮', color: C.blue },
  { id: 'piano', label: 'Piano', icon: '🎹', color: C.purple },
  { id: 'tennis', label: 'Tennis', icon: '🎾', color: C.green },
  { id: 'coding', label: 'Coding', icon: '💻', color: C.teal },
  { id: 'speech', label: 'Speech', icon: '🎤', color: C.pink },
  { id: 'other', label: 'Other', icon: '🏅', color: C.amber },
]

const MEDAL_CONFIG = {
  gold: { emoji: '🥇', label: 'Gold', color: C.gold },
  silver: { emoji: '🥈', label: 'Silver', color: '#C0C0C0' },
  bronze: { emoji: '🥉', label: 'Bronze', color: '#CD7F32' },
  honour: { emoji: '🏅', label: 'Honour', color: C.purple },
  distinction: { emoji: '⭐', label: 'Distinction', color: C.amber },
  finalist: { emoji: '🎯', label: 'Finalist', color: C.teal },
  participant: { emoji: '✓', label: 'Participated', color: C.muted },
  none: { emoji: '', label: 'Upcoming', color: C.dim },
}

function loadComps() {
  try { return JSON.parse(localStorage.getItem(COMP_KEY)) || [] } catch { return [] }
}
function saveComps(data) {
  try { localStorage.setItem(COMP_KEY, JSON.stringify(data.slice(0, 500))) } catch {}
}

export default function MayaCompetitions() {
  const navigate = useNavigate()
  const [comps, setComps] = useState(loadComps())
  const [view, setView] = useState('upcoming') // upcoming | past | add
  const [form, setForm] = useState({ name: '', category: 'math', date: '', result: 'none', notes: '' })

  const persist = (next) => { setComps(next); saveComps(next) }

  // Only the seed user (Vasco) sees the CV-import button. Any other family
  // starts with an empty competitions tracker and adds entries manually.
  const isSeedUser = (loadProfile().name || '').trim().toLowerCase() === 'vasco'

  const today = new Date().toISOString().slice(0, 10)

  const upcoming = useMemo(() =>
    comps.filter(c => c.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
  [comps, today])

  const past = useMemo(() =>
    comps.filter(c => c.date < today).sort((a, b) => b.date.localeCompare(a.date)),
  [comps, today])

  const addComp = () => {
    if (!form.name.trim() || !form.date) return
    const entry = {
      id: `comp_${Date.now()}`,
      name: form.name.trim(),
      category: form.category,
      date: form.date,
      result: form.result,
      notes: form.notes.trim(),
    }
    persist([entry, ...comps])
    setForm({ name: '', category: 'math', date: '', result: 'none', notes: '' })
    setView(entry.date >= today ? 'upcoming' : 'past')
  }

  const removeComp = (id) => persist(comps.filter(c => c.id !== id))

  const updateResult = (id, result) => {
    persist(comps.map(c => c.id === id ? { ...c, result } : c))
  }

  const importFromCV = async () => {
    try {
      const { CV_ACHIEVEMENTS } = await import('./lib/cvData')
      if (!CV_ACHIEVEMENTS) return

      const existing = new Set(comps.map(c => `${c.name}_${c.date}`))
      const RESULT_MAP = {
        gold: 'gold', silver: 'silver', bronze: 'bronze', distinction: 'gold',
        honour: 'silver', merit: 'bronze', laureate: 'silver', winner: 'gold',
        scholarship: 'gold', second: 'silver', fourth: 'bronze', special: 'silver',
        platinum: 'gold', finalist: 'bronze', semifinal: 'bronze', quarterfinal: 'bronze',
        proficiency: 'bronze', honourable: 'bronze', participant: 'none',
      }
      const newComps = CV_ACHIEVEMENTS
        .map(a => {
          const date = `${a.year}-06-01`
          const key = `${a.name}_${date}`
          if (existing.has(key)) return null
          return {
            id: `cv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: a.name,
            category: a.cat === 'music_theory' ? 'piano' : a.cat === 'academic' ? 'math' : a.cat,
            date,
            result: RESULT_MAP[a.result] || 'none',
            notes: a.grade || '',
          }
        })
        .filter(Boolean)

      if (newComps.length === 0) { alert('All CV results already imported.'); return }
      persist([...comps, ...newComps])
      alert(`Imported ${newComps.length} results from your CV.`)
    } catch {
      alert('Could not import — CV data not available.')
    }
  }

  // Stats
  const totalMedals = comps.filter(c => ['gold', 'silver', 'bronze'].includes(c.result)).length
  const goldCount = comps.filter(c => c.result === 'gold').length
  const catCounts = {}
  comps.forEach(c => { catCounts[c.category] = (catCounts[c.category] || 0) + 1 })

  // Days until next competition
  const nextComp = upcoming[0]
  const daysUntilNext = nextComp
    ? Math.ceil((new Date(nextComp.date) - new Date(today)) / 86400000)
    : null

  const commentary = daysUntilNext === 0 ? "Competition day. Everything you've done led here. Trust it."
    : daysUntilNext !== null && daysUntilNext <= 7 ? `${daysUntilNext} days. Final prep. No new material — sharpen what you have.`
    : daysUntilNext !== null && daysUntilNext <= 30 ? `${daysUntilNext} days out. This is where the work compounds.`
    : upcoming.length === 0 ? "No upcoming competitions. Add your next one — the countdown focuses the mind."
    : `Next up: ${nextComp.name} in ${daysUntilNext} days. The clock is ticking.`

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', color: C.text, fontFamily: C.mono, paddingBottom: 80, position: 'relative' }}>
      <Header onBack={() => navigate('/')} />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <Stat label="Total" value={comps.length} color={C.teal} />
          <Stat label="Medals" value={totalMedals} color={C.gold} />
          <Stat label="Gold" value={goldCount} color={C.gold} />
        </div>

        {/* Countdown */}
        {nextComp && (
          <div style={{
            padding: 16, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
            borderRadius: 16, border: `1px solid ${C.glassBorder}`, marginBottom: 16,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Next competition</div>
            <div style={{ fontFamily: C.display, fontSize: 48, color: daysUntilNext <= 7 ? C.red : C.teal, lineHeight: 1, marginTop: 8 }}>
              {daysUntilNext}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>days until {nextComp.name}</div>
            <div style={{ fontSize: 10, color: CATEGORIES.find(c => c.id === nextComp.category)?.color || C.muted, marginTop: 4 }}>
              {CATEGORIES.find(c => c.id === nextComp.category)?.icon} {nextComp.date}
            </div>
          </div>
        )}

        {/* Maya says */}
        <div style={{
          padding: 12, background: C.surfaceLight, borderRadius: 10,
          borderLeft: `3px solid ${C.teal}`, marginBottom: 16,
          fontSize: 12, color: C.text, lineHeight: 1.5,
        }}>
          {commentary}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {['upcoming', 'past', 'add'].map(t => (
            <button key={t} onClick={() => setView(t)} style={{
              flex: 1, padding: 10,
              background: view === t ? 'rgba(45,212,191,0.08)' : C.surface,
              border: `1px solid ${view === t ? C.teal : C.border}`, borderRadius: 10,
              color: view === t ? C.teal : C.muted, fontSize: 11, fontFamily: C.mono,
              textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer',
            }}>{t === 'add' ? '+ Add' : t}</button>
          ))}
        </div>

        {/* Import from CV — only offered to the seed user (Vasco) */}
        {comps.length === 0 && isSeedUser && (
          <button onClick={importFromCV} style={{
            width: '100%', padding: 14, marginBottom: 12,
            background: C.gold + '12', border: `1px solid ${C.gold}44`, borderRadius: 14,
            color: C.gold, fontSize: 12, fontFamily: C.mono, fontWeight: 700, cursor: 'pointer',
          }}>🏅 Import 90+ results from CV</button>
        )}

        {/* Add form */}
        {view === 'add' && (
          <div style={{ padding: 16, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur, borderRadius: 14, border: `1px solid ${C.glassBorder}`, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: C.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>New competition</div>

            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Competition name" style={inp} />

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Date</div>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inp} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Category</div>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ ...inp, appearance: 'none' }}>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Result (for past competitions)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Object.entries(MEDAL_CONFIG).map(([key, cfg]) => (
                  <button key={key} onClick={() => setForm({ ...form, result: key })} style={{
                    padding: '6px 10px', background: form.result === key ? cfg.color + '22' : C.surface,
                    border: `1px solid ${form.result === key ? cfg.color : C.border}`, borderRadius: 8,
                    color: form.result === key ? cfg.color : C.muted, fontSize: 10, fontFamily: C.mono, cursor: 'pointer',
                  }}>{cfg.emoji} {cfg.label}</button>
                ))}
              </div>
            </div>

            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes (optional)" style={{ ...inp, marginTop: 10 }} />

            <button onClick={addComp} disabled={!form.name.trim() || !form.date} style={{
              width: '100%', marginTop: 12, padding: 12,
              background: C.teal, color: C.bg, border: 'none', borderRadius: 12,
              fontSize: 13, fontFamily: C.mono, fontWeight: 700, cursor: 'pointer',
              opacity: form.name.trim() && form.date ? 1 : 0.4,
            }}>Add Competition</button>
          </div>
        )}

        {/* Upcoming */}
        {view === 'upcoming' && (
          <>
            {upcoming.length === 0 && (
              <div style={{ textAlign: 'center', color: C.dim, fontSize: 12, marginTop: 32 }}>
                No upcoming competitions. Tap "+ Add" to add one.
              </div>
            )}
            {upcoming.map(comp => (
              <CompCard key={comp.id} comp={comp} today={today} onRemove={removeComp} onUpdateResult={updateResult} />
            ))}
          </>
        )}

        {/* Past */}
        {view === 'past' && (
          <>
            {past.length === 0 && (
              <div style={{ textAlign: 'center', color: C.dim, fontSize: 12, marginTop: 32 }}>
                No past competitions logged yet.
              </div>
            )}
            {/* Medal summary */}
            {past.length > 0 && (
              <div style={{
                display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'center',
              }}>
                {['gold', 'silver', 'bronze'].map(m => {
                  const count = past.filter(c => c.result === m).length
                  return (
                    <div key={m} style={{
                      padding: '8px 16px', background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
                      borderRadius: 12, border: `1px solid ${C.glassBorder}`,
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 20 }}>{MEDAL_CONFIG[m].emoji}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: MEDAL_CONFIG[m].color }}>{count}</div>
                    </div>
                  )
                })}
              </div>
            )}
            {past.map(comp => (
              <CompCard key={comp.id} comp={comp} today={today} onRemove={removeComp} onUpdateResult={updateResult} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function CompCard({ comp, today, onRemove, onUpdateResult }) {
  const cat = CATEGORIES.find(c => c.id === comp.category) || CATEGORIES[5]
  const medal = MEDAL_CONFIG[comp.result] || MEDAL_CONFIG.none
  const isUpcoming = comp.date >= today
  const daysAway = isUpcoming ? Math.ceil((new Date(comp.date) - new Date(today)) / 86400000) : null
  const [editing, setEditing] = useState(false)

  return (
    <div style={{
      padding: 14, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      borderRadius: 14, border: `1px solid ${C.glassBorder}`, marginBottom: 8,
      borderLeft: `3px solid ${medal.color || cat.color}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>{cat.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{comp.name}</span>
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
            {comp.date}
            {isUpcoming && daysAway !== null && (
              <span style={{ color: daysAway <= 7 ? C.red : daysAway <= 30 ? C.amber : C.teal, marginLeft: 8 }}>
                {daysAway === 0 ? 'TODAY' : `${daysAway}d away`}
              </span>
            )}
          </div>
          {comp.notes && <div style={{ fontSize: 10, color: C.dim, marginTop: 4 }}>{comp.notes}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {medal.emoji && <span style={{ fontSize: 20 }}>{medal.emoji}</span>}
          {!isUpcoming && (
            <button onClick={() => setEditing(!editing)} style={{
              background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 11, fontFamily: C.mono,
            }}>{editing ? '✓' : 'edit'}</button>
          )}
          <button onClick={() => onRemove(comp.id)} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      </div>
      {editing && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {Object.entries(MEDAL_CONFIG).filter(([k]) => k !== 'none').map(([key, cfg]) => (
            <button key={key} onClick={() => { onUpdateResult(comp.id, key); setEditing(false) }} style={{
              padding: '4px 8px', background: comp.result === key ? cfg.color + '22' : C.surface,
              border: `1px solid ${comp.result === key ? cfg.color : C.border}`, borderRadius: 6,
              color: cfg.color, fontSize: 9, fontFamily: C.mono, cursor: 'pointer',
            }}>{cfg.emoji} {cfg.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{
      padding: 14, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      borderRadius: 14, border: `1px solid ${C.glassBorder}`, textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
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
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.gold, letterSpacing: 2 }}>COMPETITIONS</div>
    </div>
  )
}

const inp = {
  width: '100%', padding: '10px 12px',
  background: '#0a0a14', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, color: '#f0f0f5', fontSize: 13,
  fontFamily: "'IBM Plex Mono', monospace", outline: 'none', boxSizing: 'border-box',
}

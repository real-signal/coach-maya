/**
 * Tennis — match journal + training log for junior tournament players.
 * Win/loss record, tactical notes, serve targets, tournament results.
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', glassBorder: 'rgba(255,255,255,0.14)',
  text: '#f0f0f5', muted: '#6b6b8a', dim: '#3a3a55',
  teal: '#2DD4BF', red: '#F87171', green: '#34D399',
  gold: '#FFD700', amber: '#FBBF24', blue: '#93C5FD',
  glass: 'rgba(255,255,255,0.08)', blur: 'blur(20px)',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

const TENNIS_KEY = 'maya_tennis'
function loadTennis() {
  try { return JSON.parse(localStorage.getItem(TENNIS_KEY)) || { sessions: [], matches: [] } }
  catch { return { sessions: [], matches: [] } }
}
function saveTennis(data) {
  try { localStorage.setItem(TENNIS_KEY, JSON.stringify(data)) } catch {}
}

const DRILL_TYPES = ['Serve practice', 'Baseline rallying', 'Net approach', 'Footwork', 'Return of serve', 'Match simulation', 'Fitness/conditioning', 'Strategy session', 'General practice']
const SURFACES = ['Hard', 'Clay', 'Grass', 'Indoor']

export default function MayaTennis() {
  const navigate = useNavigate()
  const [data, setData] = useState(loadTennis())
  const [tab, setTab] = useState('matches')
  const [addForm, setAddForm] = useState(null)
  const [addType, setAddType] = useState(null) // 'match' | 'session'

  const persist = (next) => { setData(next); saveTennis(next) }

  const addSession = () => {
    if (!addForm?.drill) return
    const session = {
      id: `ts_${Date.now()}`, date: addForm.date || new Date().toISOString().slice(0, 10),
      drill: addForm.drill, duration: parseInt(addForm.duration) || 60,
      notes: addForm.notes || '', intensity: addForm.intensity || 'medium',
      focus: addForm.focus || '',
    }
    persist({ ...data, sessions: [session, ...data.sessions].slice(0, 300) })
    setAddForm(null); setAddType(null)
  }

  const addMatch = () => {
    if (!addForm?.opponent) return
    const match = {
      id: `tm_${Date.now()}`, date: addForm.date || new Date().toISOString().slice(0, 10),
      opponent: addForm.opponent, score: addForm.score || '',
      result: addForm.result || 'win', tournament: addForm.tournament || '',
      surface: addForm.surface || 'Hard', round: addForm.round || '',
      whatWorked: addForm.whatWorked || '', whatToImprove: addForm.whatToImprove || '',
      notes: addForm.notes || '',
    }
    persist({ ...data, matches: [match, ...data.matches].slice(0, 200) })
    setAddForm(null); setAddType(null)
  }

  const removeMatch = (id) => persist({ ...data, matches: data.matches.filter(m => m.id !== id) })
  const removeSession = (id) => persist({ ...data, sessions: data.sessions.filter(s => s.id !== id) })

  // Stats
  const wins = data.matches.filter(m => m.result === 'win').length
  const losses = data.matches.filter(m => m.result === 'loss').length
  const totalMatches = data.matches.length
  const winPct = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0
  const totalTrainingHours = Math.round(data.sessions.reduce((s, x) => s + (x.duration || 0), 0) / 60 * 10) / 10

  // Recent form (last 5 matches)
  const recentForm = data.matches.slice(0, 5).map(m => m.result === 'win' ? 'W' : 'L')

  const commentary = winPct >= 70 ? "Dominant record. Keep the pressure on — tournament seedings notice this."
    : winPct >= 50 ? "Above .500. Every match point you convert in practice is one you'll close in tournament."
    : totalMatches >= 3 ? "Below .500. The talent's there — study the losses. What's the pattern?"
    : totalMatches === 0 ? "No matches logged. Start tracking — the data tells the story."
    : "Keep logging matches. Patterns emerge after 5+."

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', color: C.text, fontFamily: C.mono, paddingBottom: 80, position: 'relative' }}>
      <Header onBack={() => navigate('/')} />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <Stat label="W-L" value={`${wins}-${losses}`} color={winPct >= 50 ? C.green : C.red} />
          <Stat label="Win %" value={`${winPct}%`} color={winPct >= 60 ? C.green : winPct >= 40 ? C.amber : C.red} />
          <Stat label="Matches" value={totalMatches} color={C.teal} />
          <Stat label="Train hrs" value={totalTrainingHours} color={C.blue} />
        </div>

        {/* Recent form */}
        {recentForm.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12,
            padding: 8, background: C.glass, borderRadius: 10, border: `1px solid ${C.glassBorder}`,
          }}>
            <span style={{ fontSize: 10, color: C.muted, marginRight: 4 }}>Form:</span>
            {recentForm.map((r, i) => (
              <span key={i} style={{
                width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: r === 'W' ? C.green + '22' : C.red + '22',
                color: r === 'W' ? C.green : C.red, fontSize: 11, fontWeight: 700,
              }}>{r}</span>
            ))}
          </div>
        )}

        {/* Maya says */}
        <div style={{ padding: 12, background: C.surfaceLight, borderRadius: 10, borderLeft: `3px solid ${C.green}`, marginBottom: 16, fontSize: 12, lineHeight: 1.5 }}>
          {commentary}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {['matches', 'training'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: 10, background: tab === t ? C.green + '18' : C.surface,
              border: `1px solid ${tab === t ? C.green : C.border}`, borderRadius: 10,
              color: tab === t ? C.green : C.muted, fontSize: 11, fontFamily: C.mono,
              textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer',
            }}>{t}</button>
          ))}
        </div>

        {/* ─── Matches Tab ─── */}
        {tab === 'matches' && (
          <>
            {addType === 'match' ? (
              <div style={{ padding: 16, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur, borderRadius: 14, border: `1px solid ${C.glassBorder}`, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.green, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Log match</div>
                <Inp label="Opponent" value={addForm?.opponent || ''} onChange={v => setAddForm({ ...addForm, opponent: v })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Inp label="Score" value={addForm?.score || ''} onChange={v => setAddForm({ ...addForm, score: v })} placeholder="e.g. 6-4, 3-6, 6-2" />
                  <Inp label="Date" value={addForm?.date || ''} onChange={v => setAddForm({ ...addForm, date: v })} type="date" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Inp label="Tournament" value={addForm?.tournament || ''} onChange={v => setAddForm({ ...addForm, tournament: v })} placeholder="e.g. Spex U14" />
                  <Inp label="Round" value={addForm?.round || ''} onChange={v => setAddForm({ ...addForm, round: v })} placeholder="e.g. QF, SF" />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Result</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['win', 'loss'].map(r => (
                      <button key={r} onClick={() => setAddForm({ ...addForm, result: r })} style={{
                        flex: 1, padding: 10, background: addForm?.result === r ? (r === 'win' ? C.green : C.red) + '22' : C.surface,
                        border: `1px solid ${addForm?.result === r ? (r === 'win' ? C.green : C.red) : C.border}`, borderRadius: 8,
                        color: addForm?.result === r ? (r === 'win' ? C.green : C.red) : C.muted,
                        fontSize: 12, fontFamily: C.mono, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
                      }}>{r}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Surface</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {SURFACES.map(s => (
                      <button key={s} onClick={() => setAddForm({ ...addForm, surface: s })} style={{
                        padding: '5px 10px', background: addForm?.surface === s ? C.teal + '22' : C.surface,
                        border: `1px solid ${addForm?.surface === s ? C.teal : C.border}`, borderRadius: 6,
                        color: addForm?.surface === s ? C.teal : C.muted, fontSize: 9, fontFamily: C.mono, cursor: 'pointer',
                      }}>{s}</button>
                    ))}
                  </div>
                </div>
                <Inp label="What worked" value={addForm?.whatWorked || ''} onChange={v => setAddForm({ ...addForm, whatWorked: v })} placeholder="e.g. crosscourt forehand, net approach" />
                <Inp label="What to improve" value={addForm?.whatToImprove || ''} onChange={v => setAddForm({ ...addForm, whatToImprove: v })} placeholder="e.g. second serve under pressure" />
                <Inp label="Notes" value={addForm?.notes || ''} onChange={v => setAddForm({ ...addForm, notes: v })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setAddForm(null); setAddType(null) }} style={secBtn}>Cancel</button>
                  <button onClick={addMatch} style={primBtn}>Save</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setAddType('match'); setAddForm({ result: 'win', surface: 'Hard' }) }} style={{
                width: '100%', padding: 14, background: C.glass, border: `2px dashed ${C.glassBorder}`,
                borderRadius: 14, color: C.green, fontSize: 12, fontFamily: C.mono, cursor: 'pointer', marginBottom: 12,
              }}>+ Log match</button>
            )}

            {data.matches.map(match => (
              <div key={match.id} style={{
                padding: 14, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
                borderRadius: 14, border: `1px solid ${C.glassBorder}`, marginBottom: 8,
                borderLeft: `3px solid ${match.result === 'win' ? C.green : C.red}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      <span style={{ color: match.result === 'win' ? C.green : C.red, marginRight: 6 }}>
                        {match.result === 'win' ? 'W' : 'L'}
                      </span>
                      vs {match.opponent}
                    </div>
                    {match.score && <div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>{match.score}</div>}
                  </div>
                  <button onClick={() => removeMatch(match.id)} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 10, color: C.muted, flexWrap: 'wrap' }}>
                  <span>{match.date}</span>
                  {match.tournament && <span style={{ color: C.gold }}>🏆 {match.tournament}</span>}
                  {match.round && <span>({match.round})</span>}
                  {match.surface && <span>{match.surface}</span>}
                </div>
                {match.whatWorked && <div style={{ fontSize: 10, color: C.green, marginTop: 6 }}>✓ {match.whatWorked}</div>}
                {match.whatToImprove && <div style={{ fontSize: 10, color: C.amber, marginTop: 2 }}>△ {match.whatToImprove}</div>}
                {match.notes && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{match.notes}</div>}
              </div>
            ))}
            {data.matches.length === 0 && !addType && (
              <div style={{ textAlign: 'center', color: C.dim, fontSize: 12, marginTop: 24 }}>No matches logged yet.</div>
            )}
          </>
        )}

        {/* ─── Training Tab ─── */}
        {tab === 'training' && (
          <>
            {addType === 'session' ? (
              <div style={{ padding: 16, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur, borderRadius: 14, border: `1px solid ${C.glassBorder}`, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Log training</div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Type</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {DRILL_TYPES.map(d => (
                      <button key={d} onClick={() => setAddForm({ ...addForm, drill: d })} style={{
                        padding: '5px 10px', background: addForm?.drill === d ? C.teal + '22' : C.surface,
                        border: `1px solid ${addForm?.drill === d ? C.teal : C.border}`, borderRadius: 8,
                        color: addForm?.drill === d ? C.teal : C.muted, fontSize: 9, fontFamily: C.mono, cursor: 'pointer',
                      }}>{d}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Inp label="Duration (min)" value={addForm?.duration || ''} onChange={v => setAddForm({ ...addForm, duration: v })} type="number" />
                  <Inp label="Date" value={addForm?.date || ''} onChange={v => setAddForm({ ...addForm, date: v })} type="date" />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Intensity</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['light', 'medium', 'high'].map(i => (
                      <button key={i} onClick={() => setAddForm({ ...addForm, intensity: i })} style={{
                        flex: 1, padding: 8, background: addForm?.intensity === i ? C.teal + '22' : C.surface,
                        border: `1px solid ${addForm?.intensity === i ? C.teal : C.border}`, borderRadius: 8,
                        color: addForm?.intensity === i ? C.teal : C.muted, fontSize: 10, fontFamily: C.mono, cursor: 'pointer', textTransform: 'capitalize',
                      }}>{i}</button>
                    ))}
                  </div>
                </div>
                <Inp label="Focus / notes" value={addForm?.notes || ''} onChange={v => setAddForm({ ...addForm, notes: v })} placeholder="e.g. working on kick serve consistency" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setAddForm(null); setAddType(null) }} style={secBtn}>Cancel</button>
                  <button onClick={addSession} style={{ ...primBtn, background: C.teal }}>Save</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setAddType('session'); setAddForm({ intensity: 'medium' }) }} style={{
                width: '100%', padding: 14, background: C.glass, border: `2px dashed ${C.glassBorder}`,
                borderRadius: 14, color: C.teal, fontSize: 12, fontFamily: C.mono, cursor: 'pointer', marginBottom: 12,
              }}>+ Log training session</button>
            )}

            {data.sessions.map(s => (
              <div key={s.id} style={{
                padding: 12, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
                borderRadius: 12, border: `1px solid ${C.glassBorder}`, marginBottom: 6,
                borderLeft: `3px solid ${C.teal}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>🎾 {s.drill}</span>
                  <button onClick={() => removeSession(s.id)} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                  {s.duration}min · {s.intensity} · {s.date || new Date(s.date).toLocaleDateString()}
                </div>
                {s.notes && <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{s.notes}</div>}
              </div>
            ))}
            {data.sessions.length === 0 && !addType && (
              <div style={{ textAlign: 'center', color: C.dim, fontSize: 12, marginTop: 24 }}>No training sessions logged yet.</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ padding: 10, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur, borderRadius: 12, border: `1px solid ${C.glassBorder}`, textAlign: 'center' }}>
      <div style={{ fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
function Inp({ label, value, onChange, placeholder, type }) {
  return (
    <div style={{ marginBottom: 10, flex: 1 }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{label}</div>
      <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || ''} style={{
        width: '100%', padding: '10px 12px', background: '#0a0a14', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#f0f0f5', fontSize: 12, fontFamily: C.mono, outline: 'none', boxSizing: 'border-box',
      }} />
    </div>
  )
}
function Header({ onBack }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.glassBorder}`, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 0 }}>←</button>
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.green, letterSpacing: 2 }}>TENNIS</div>
    </div>
  )
}
const primBtn = { flex: 1, padding: '12px 18px', background: C.green, color: '#0a0a14', border: 'none', borderRadius: 12, fontSize: 13, fontFamily: C.mono, fontWeight: 700, cursor: 'pointer' }
const secBtn = { flex: 1, padding: '12px 18px', background: 'transparent', color: C.muted, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 13, fontFamily: C.mono, cursor: 'pointer' }

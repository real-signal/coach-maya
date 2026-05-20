import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaya } from './context/MayaContext'
import { loadProfile, saveProfile } from './lib/profile'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', gold: '#FFD700',
  green: '#34D399', red: '#F87171', amber: '#FBBF24', blue: '#93C5FD',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

const gradeColors = { S: C.gold, A: C.green, B: C.blue, C: C.amber, F: C.red, '-': C.dim }

// Simple hash for PIN — not cryptographic but prevents plaintext storage
async function hashPin(pin) {
  const encoder = new TextEncoder()
  const data = encoder.encode('maya_salt_' + pin)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

// Persisted PIN lockout — survives reload + localStorage clear of just `attempts`
const LOCK_KEY = 'maya_parent_lockout'
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000          // 5 min after 5 misses
const ESCALATED_LOCKOUT_MS = 60 * 60 * 1000 // 1 hr after 10 cumulative misses
function readLockout() {
  try { return JSON.parse(localStorage.getItem(LOCK_KEY) || '{}') } catch { return {} }
}
function writeLockout(v) {
  try { localStorage.setItem(LOCK_KEY, JSON.stringify(v)) } catch {}
}

function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [settingPin, setSettingPin] = useState(false)
  const [lockMsg, setLockMsg] = useState('')
  const profile = loadProfile()
  const hasPin = !!profile.parentPinHash

  const lockedNow = () => {
    const l = readLockout()
    if (l.until && Date.now() < l.until) return l.until
    return null
  }

  const checkPin = async () => {
    const until = lockedNow()
    if (until) {
      const sec = Math.ceil((until - Date.now()) / 1000)
      setLockMsg(`Locked. Try again in ${sec >= 60 ? Math.ceil(sec / 60) + ' min' : sec + 's'}.`)
      return
    }
    const hashed = await hashPin(pin)
    if (hashed === profile.parentPinHash) {
      sessionStorage.setItem('parent_unlocked', '1')
      writeLockout({}) // reset on success
      onUnlock()
    } else {
      const l = readLockout()
      const attempts = (l.attempts || 0) + 1
      const total = (l.total || 0) + 1
      const update = { attempts, total }
      if (attempts >= MAX_ATTEMPTS) {
        update.until = Date.now() + (total >= 10 ? ESCALATED_LOCKOUT_MS : LOCKOUT_MS)
        update.attempts = 0 // reset window counter, keep cumulative
        const mins = Math.ceil((update.until - Date.now()) / 60000)
        setLockMsg(`Locked. Try again in ${mins} min.`)
      }
      writeLockout(update)
      setError(true)
      setPin('')
      setTimeout(() => setError(false), 1500)
    }
  }

  const setNewPin = async () => {
    if (pin.length === 4) {
      const hashed = await hashPin(pin)
      saveProfile({ ...profile, parentPinHash: hashed, parentPin: undefined })
      sessionStorage.setItem('parent_unlocked', '1')
      onUnlock()
    }
  }

  if (!hasPin && !settingPin) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', fontFamily: C.mono, maxWidth: 320 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: C.teal, letterSpacing: 2, marginBottom: 12 }}>PARENT ACCESS</div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 24 }}>
            Set a 4-digit PIN to protect this section. Only you will need it.
          </div>
          <button onClick={() => setSettingPin(true)} style={{
            padding: '14px 28px', background: C.teal, color: C.bg,
            border: 'none', borderRadius: 12, fontSize: 14,
            fontFamily: C.mono, fontWeight: 700, cursor: 'pointer',
          }}>Set PIN</button>
          <div style={{ marginTop: 12 }}>
            <button onClick={onUnlock} style={{
              background: 'none', border: 'none', color: C.dim,
              fontSize: 10, fontFamily: C.mono, cursor: 'pointer', textDecoration: 'underline',
            }}>Skip for now</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', fontFamily: C.mono, maxWidth: 320 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: C.teal, letterSpacing: 2, marginBottom: 8 }}>PARENT ACCESS</div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 24 }}>
          {settingPin ? 'Choose a 4-digit PIN' : 'Enter your PIN'}
        </div>
        <input
          type="tel"
          maxLength={4}
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onKeyDown={e => e.key === 'Enter' && pin.length === 4 && (settingPin ? setNewPin() : checkPin())}
          autoFocus
          style={{
            width: 180, padding: '16px', background: C.surface,
            border: `2px solid ${error ? C.red : C.border}`, borderRadius: 16,
            color: C.text, fontSize: 32, fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: 16, textAlign: 'center', outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 200ms',
          }}
        />
        {error && !lockMsg && <div style={{ fontSize: 11, color: C.red, marginTop: 8 }}>Wrong PIN</div>}
        {lockMsg && <div style={{ fontSize: 11, color: C.red, marginTop: 8 }}>{lockMsg}</div>}
        <div style={{ marginTop: 16 }}>
          <button
            onClick={settingPin ? setNewPin : checkPin}
            disabled={pin.length !== 4}
            style={{
              padding: '12px 32px', background: C.teal, color: C.bg,
              border: 'none', borderRadius: 12, fontSize: 14,
              fontFamily: C.mono, fontWeight: 700, cursor: 'pointer',
              opacity: pin.length === 4 ? 1 : 0.4,
            }}
          >{settingPin ? 'Set PIN' : 'Unlock'}</button>
        </div>
      </div>
    </div>
  )
}

export default function MayaParent() {
  const navigate = useNavigate()
  const { getDailyReport, getWeeklyDigest, profile } = useMaya()
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('parent_unlocked') === '1')
  const report = getDailyReport()
  const digest = getWeeklyDigest?.()
  const [copied, setCopied] = useState(false)

  if (!unlocked && (profile?.parentPinHash || profile?.parentPin)) {
    return <PinGate onUnlock={() => setUnlocked(true)} />
  }
  if (!unlocked && !profile?.parentPinHash && !profile?.parentPin) {
    return <PinGate onUnlock={() => setUnlocked(true)} />
  }

  const reportText = () => {
    const lines = [
      `Coach Maya — ${profile?.name || 'Champ'} · ${report.date}`,
      ``,
      `Grade: ${report.grade} (${report.gradeLabel})`,
      `XP: ${report.xpEarned} · Level: ${report.level}`,
      `Tasks: ${report.tasksCompleted} done / ${report.tasksSkipped} skipped`,
      `Combo: ${report.combo}×`,
      report.mood && `Mood: ${report.mood}`,
      ``,
      `MVP Moment`,
      `  ${report.mvpMoment}`,
      report.concern && `\nOne concern`,
      report.concern && `  ${report.concern}`,
      ``,
      `Maya's recommendation`,
      `  ${report.recommendation}`,
      report.reflection && `\nReflection`,
      report.reflection && `  "${report.reflection}"`,
    ].filter(Boolean)
    return lines.join('\n')
  }

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(reportText())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const shareReport = async () => {
    const text = reportText()
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Coach Maya — ${profile?.name || 'Champ'} ${report.date}`,
          text,
        })
      } catch {}
    } else {
      copyReport()
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80 }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
        background: C.surface, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => navigate('/')} style={{
          background: 'transparent', border: 'none', color: C.muted,
          fontSize: 18, cursor: 'pointer',
        }}>←</button>
        <div>
          <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2, lineHeight: 1 }}>
            {(profile?.name || 'CHAMP').toUpperCase()}'S REPORT
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
            {report.date}
            {report.age ? ` · age ${report.age}` : ''}
            {report.schoolGrade ? ` · grade ${report.schoolGrade}` : ''}
            {report.location ? ` · ${report.location}` : ''}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={copyReport} style={{
            padding: '6px 10px', background: 'transparent',
            border: `1px solid ${C.border}`, borderRadius: 8,
            color: copied ? C.green : C.muted, fontSize: 10,
            fontFamily: C.mono, cursor: 'pointer',
          }}>{copied ? '✓ Copied' : 'Copy'}</button>
          <button onClick={shareReport} style={{
            padding: '6px 10px', background: C.teal,
            border: 'none', borderRadius: 8,
            color: C.bg, fontSize: 10, fontWeight: 700,
            fontFamily: C.mono, cursor: 'pointer',
          }}>Share</button>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        {/* Parent Compass entry — directive layer */}
        <button onClick={() => navigate('/parent/compass')} style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: 16, background: C.surface, borderRadius: 16,
          border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.teal}`,
          marginBottom: 16, color: C.text, fontFamily: C.mono,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 28 }}>🧭</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: C.teal, textTransform: 'uppercase', letterSpacing: 1.5 }}>
              {profile?.parentCompass?.track ? 'Compass — edit' : 'New: Parent Compass'}
            </div>
            <div style={{ fontSize: 13, marginTop: 2 }}>
              {profile?.parentCompass?.northStar
                ? `"${profile.parentCompass.northStar.slice(0, 60)}${profile.parentCompass.northStar.length > 60 ? '…' : ''}"`
                : 'Pick a specialization track. Set this week\'s goal. Maya pushes it daily.'}
            </div>
          </div>
          <div style={{ color: C.muted, fontSize: 18 }}>→</div>
        </button>

        {/* Headline grade */}
        <div style={{
          padding: 24, background: C.surface, borderRadius: 16,
          border: `1px solid ${C.border}`, textAlign: 'center', marginBottom: 16,
        }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
            Today's grade
          </div>
          <div style={{
            fontFamily: C.display, fontSize: 96, color: gradeColors[report.grade] || C.dim,
            lineHeight: 1, marginTop: 4,
          }}>{report.grade}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>{report.gradeLabel}</div>
        </div>

        {/* Weekly digest — only when there's enough history */}
        {digest && digest.daysLogged >= 3 && (
          <div style={{
            padding: 16, background: C.surface, borderRadius: 16,
            border: `1px solid ${C.border}`, marginBottom: 16,
            borderLeft: `3px solid ${C.teal}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: C.teal, textTransform: 'uppercase', letterSpacing: 1 }}>
                Last 7 days
              </div>
              {digest.xpDeltaPct !== null && (
                <div style={{
                  fontSize: 11, fontWeight: 700,
                  color: digest.xpDeltaPct >= 0 ? C.green : C.red,
                }}>
                  {digest.xpDeltaPct >= 0 ? '↑' : '↓'} {Math.abs(digest.xpDeltaPct)}% vs prior week
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 9, color: C.muted }}>AVG XP</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{digest.avgXP}</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.muted }}>FINISH</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{digest.finishRate}%</div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.muted }}>S/A DAYS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.gold }}>{digest.sDays}/{digest.aDays}</div>
              </div>
            </div>
            {digest.compass && digest.compass.scheduled >= 1 && (
              <div style={{
                marginTop: 4, marginBottom: 10, padding: '8px 10px',
                background: 'rgba(45,212,191,0.06)', borderRadius: 10,
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontSize: 9, color: C.teal, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Compass · {digest.compass.track}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: digest.compass.adherencePct >= 80 ? C.green
                         : digest.compass.adherencePct >= 60 ? C.amber : C.red,
                  }}>
                    {digest.compass.adherencePct}% ({digest.compass.completed}/{digest.compass.scheduled})
                  </div>
                </div>
                {digest.compass.northStar && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
                    ★ {digest.compass.northStar}
                  </div>
                )}
              </div>
            )}
            {digest.wins.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {digest.wins.map((w, i) => (
                  <div key={i} style={{ fontSize: 11, color: C.green, lineHeight: 1.5 }}>✓ {w}</div>
                ))}
              </div>
            )}
            {digest.flags.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                {digest.flags.map((f, i) => (
                  <div key={i} style={{ fontSize: 11, color: C.amber, lineHeight: 1.5 }}>⚠ {f}</div>
                ))}
              </div>
            )}
            <div style={{
              marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`,
              fontSize: 12, color: C.text, lineHeight: 1.5,
            }}>
              <span style={{ color: C.teal, fontWeight: 700 }}>Next:</span> {digest.nextAction}
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <Stat label="XP earned" value={report.xpEarned} color={C.teal} />
          <Stat label="Combo" value={`${report.combo}×`} color={report.combo >= 5 ? C.gold : report.combo >= 3 ? C.amber : C.muted} />
          <Stat label="Tasks done" value={`${report.tasksCompleted}/${report.tasksCompleted + report.tasksSkipped + report.tasksPending}`} color={C.green} />
          <Stat label="Skipped" value={report.tasksSkipped} color={report.tasksSkipped > 0 ? C.red : C.muted} />
        </div>

        {/* MVP moment */}
        <Card title="MVP moment" color={C.gold}>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{report.mvpMoment}</div>
        </Card>

        {/* Concern */}
        {report.concern && (
          <Card title="One concern" color={C.amber}>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{report.concern}</div>
          </Card>
        )}

        {/* Recommendation */}
        <Card title="Maya's recommendation" color={C.teal}>
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{report.recommendation}</div>
        </Card>

        {/* Mood */}
        {report.mood && (
          <Card title="Mood today">
            <div style={{ fontSize: 13 }}>{report.mood}</div>
          </Card>
        )}

        {/* Reflection */}
        {report.reflection && (
          <Card title="Reflection">
            <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', lineHeight: 1.5 }}>"{report.reflection}"</div>
          </Card>
        )}

        {/* Timeline */}
        {report.timeline.length > 0 && (
          <Card title="Timeline">
            {report.timeline.map((e, i) => (
              <div key={i} style={{
                padding: '6px 0',
                borderBottom: i < report.timeline.length - 1 ? `1px solid ${C.border}` : 'none',
                fontSize: 11, color: C.muted, display: 'flex', justifyContent: 'space-between',
              }}>
                <span>
                  <span style={{ color: e.type === 'task_complete' ? C.green : e.type === 'task_skip' ? C.red : C.blue, marginRight: 6 }}>
                    {e.type === 'task_complete' ? '✓' : e.type === 'task_skip' ? '✗' : '●'}
                  </span>
                  {e.label} {e.xp ? <span style={{ color: C.teal }}>+{e.xp} XP</span> : null}
                </span>
                <span>{new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{
      padding: 14, background: C.surface,
      borderRadius: 12, border: `1px solid ${C.border}`, textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Card({ title, color, children }) {
  return (
    <div style={{
      padding: 14, background: C.surface, borderRadius: 12,
      border: `1px solid ${C.border}`, marginBottom: 10,
      borderLeft: color ? `3px solid ${color}` : `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 9, color: color || C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

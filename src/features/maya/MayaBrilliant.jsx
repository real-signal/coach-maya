/**
 * Brilliant Companion — Maya's side log for Brilliant.org sessions.
 *
 * Brilliant is a separate service. This screen is just Maya's companion log:
 *   - Daily recommendation (deep link out)
 *   - Post-session debrief (kid's own words)
 *   - Streak co-pilot (kid types their Brilliant streak number)
 *   - "Walk Maya through it" — kid describes a problem in their OWN words,
 *     Maya coaches the approach (no Brilliant content ingested)
 *   - Recent sessions list
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaya } from './context/MayaContext'
import { loadProfile } from './lib/profile'
import { callClaude, canCallClaude, textFromResponse } from './lib/anthropicClient'
import { getCatalog } from './lib/brilliantCatalog'
import {
  logSession,
  getSessions,
  getInternalStreak,
  getReportedStreak,
  setReportedStreak,
  getWeeklyStats,
  recommendForToday,
  getSuspicionFlags,
  deleteSession,
  getCourseById,
} from './agents/brilliantLog'

const WALK_MAX = 300

// Detect obvious copy-paste of a problem (LaTeX, multi-line, etc.).
// Goal isn't to block — it's to nudge the kid to rephrase.
function looksPasted(s) {
  if (!s) return false
  const t = String(s)
  if (t.length > 250) return true
  if (/\\[a-z]+\{/i.test(t)) return true                      // LaTeX commands
  if ((t.match(/\n/g) || []).length >= 3) return true         // multi-line block
  if (/[∫∑∏√≤≥≠∞±∂π]/.test(t)) return true                    // math glyphs
  return false
}

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171', amber: '#fbbf24', purple: '#a78bfa',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-opus-4-6'])
function getModel() {
  try {
    const p = JSON.parse(localStorage.getItem('maya_profile') || '{}')
    if (p?.aiModel && ALLOWED_MODELS.has(p.aiModel)) return p.aiModel
  } catch {}
  return 'claude-sonnet-4-6'
}

export default function MayaBrilliant() {
  const navigate = useNavigate()
  const maya = useMaya()
  const profile = loadProfile()
  const catalog = getCatalog()

  const [sessions, setSessions] = useState(getSessions())
  const [weekStats, setWeekStats] = useState(getWeeklyStats())
  const [internalStreak, setInternalStreak] = useState(getInternalStreak())
  const [reportedStreak, setReportedStreakState] = useState(getReportedStreak())
  const [flags, setFlags] = useState(getSuspicionFlags())

  // Log form state
  const [logCourseId, setLogCourseId] = useState('')
  const [logMinutes, setLogMinutes] = useState(15)
  const [logClicked, setLogClicked] = useState('')
  const [logStuck, setLogStuck] = useState('')
  const [logRating, setLogRating] = useState(3)
  const [logSaved, setLogSaved] = useState(false)

  // Recommendation
  const rec = useMemo(() => {
    try { return recommendForToday({ profile, comps: maya.competitions || [] }) }
    catch { return null }
  }, [profile, maya.competitions])

  // "Walk Maya through it"
  const [walkProblem, setWalkProblem] = useState('')
  const [walkTried, setWalkTried] = useState('')
  const [walkResp, setWalkResp] = useState('')
  const [walking, setWalking] = useState(false)
  const [walkErr, setWalkErr] = useState('')

  const refresh = () => {
    setSessions(getSessions())
    setWeekStats(getWeeklyStats())
    setInternalStreak(getInternalStreak())
    setReportedStreakState(getReportedStreak())
    setFlags(getSuspicionFlags())
  }

  const submitLog = () => {
    if (!logCourseId) { alert('Pick a course first.'); return }
    if (!logMinutes || logMinutes <= 0) { alert('Add minutes spent.'); return }
    logSession({
      courseId: logCourseId,
      minutes: logMinutes,
      clicked: logClicked.trim(),
      stuck: logStuck.trim(),
      rating: logRating,
    })
    setLogSaved(true)
    setLogClicked('')
    setLogStuck('')
    refresh()
    setTimeout(() => setLogSaved(false), 2400)
  }

  const updateReported = (v) => {
    const n = setReportedStreak(v)
    setReportedStreakState(n)
  }

  const openBrilliant = (url) => {
    try { window.open(url, '_blank', 'noopener,noreferrer') } catch {}
  }

  const askMaya = async () => {
    setWalkErr('')
    setWalkResp('')
    const problem = walkProblem.trim()
    if (problem.length < 8) { setWalkErr('Describe the problem in your own words first.'); return }
    if (looksPasted(problem)) {
      setWalkErr('That looks pasted — rephrase it in your own words. Maya coaches your thinking, not the original problem.')
      return
    }
    if (!canCallClaude()) {
      setWalkResp(
        `Without my brain online I can only ask: where exactly does your approach break?\n\n` +
        `You said you tried: "${walkTried || '(nothing yet)'}"\n\n` +
        `Try this: write out the FIRST step that felt shaky. If you can name the shaky step, you're already halfway.`
      )
      return
    }
    setWalking(true)
    try {
      const name = profile?.name || 'kid'
      const hobbies = (profile?.hobbies || []).join(', ') || 'none listed'
      const system = `You are Maya, an elite junior-coach. ${name} is working through a problem on Brilliant.org. They described the problem and their attempt IN THEIR OWN WORDS — do not assume you've seen the original. Your job is to coach their THINKING, not solve the problem. Short, sharp, Socratic. 2-4 sentences max. Pose 1 sharp follow-up question. Hobbies for analogies if useful: ${hobbies}. Never lecture. Never give a full solution — guide the next step only.`
      const userPrompt = `Problem (in my words): ${problem}\n\nWhat I tried: ${walkTried || '(nothing yet)'}\n\nCoach me through the next step.`

      const data = await callClaude({
        model: getModel(),
        max_tokens: 350,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      })
      const text = textFromResponse(data)
      setWalkResp(text.trim() || '(empty response)')
    } catch (e) {
      setWalkErr(e?.message || 'Could not reach Maya.')
    } finally {
      setWalking(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 100 }}>
      <Header onBack={() => navigate('/')} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        {/* Disclaimer */}
        <div style={{
          padding: '8px 10px', background: C.surfaceLight, borderRadius: 8,
          border: `1px solid ${C.border}`, fontSize: 10, color: C.muted,
          lineHeight: 1.5, marginBottom: 14,
        }}>
          Brilliant is a separate service. This is just Maya's companion log — she helps you pick a course, debrief after, and coach your thinking. All Brilliant work happens at brilliant.org.
        </div>

        {/* Today's Pick */}
        <Section title="Today's Brilliant Pick">
          {rec ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 28 }}>🎯</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 1, lineHeight: 1.1 }}>
                    {rec.course.name}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                    {rec.reason}
                  </div>
                </div>
              </div>
              <button onClick={() => openBrilliant(rec.course.url)} style={primaryBtn}>
                OPEN ON BRILLIANT ↗
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              You've already logged a Brilliant session today. Pick a course below to log another, or come back tomorrow for a fresh pick.
            </p>
          )}
        </Section>

        {/* Suspicion flags — observe, don't punish */}
        {flags.length > 0 && (
          <Section title="Maya's Watching">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {flags.map((f, i) => (
                <div key={i} style={{
                  padding: 10, borderRadius: 8,
                  background: f.level === 'high' ? `${C.red}22` : `${C.amber}1a`,
                  border: `1px solid ${f.level === 'high' ? C.red : C.amber}55`,
                  fontSize: 11, lineHeight: 1.5,
                  color: f.level === 'high' ? C.red : C.amber,
                }}>
                  {f.text}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Stats */}
        <Section title="This Week">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <Stat label="SESSIONS" value={weekStats.sessions} color={C.text} />
            <Stat label="MINUTES" value={weekStats.minutes} color={C.teal} />
            <Stat label="COURSES" value={weekStats.uniqueCourses} color={C.purple} />
          </div>
        </Section>

        {/* Streak Co-Pilot */}
        <Section title="Streak Co-Pilot">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div style={{
              padding: 12, background: C.surfaceLight, borderRadius: 10,
              border: `1px solid ${C.border}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 6 }}>MAYA-SIDE</div>
              <div style={{ fontFamily: C.display, fontSize: 30, color: C.teal, lineHeight: 1 }}>{internalStreak}</div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>days logged here</div>
            </div>
            <div style={{
              padding: 12, background: C.surfaceLight, borderRadius: 10,
              border: `1px solid ${C.border}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 6 }}>YOUR BRILLIANT</div>
              <input
                type="number" min={0} max={9999} value={reportedStreak}
                onChange={(e) => updateReported(e.target.value)}
                style={{
                  fontFamily: C.display, fontSize: 30, color: C.amber, lineHeight: 1,
                  background: 'transparent', border: 'none', textAlign: 'center',
                  width: '100%', outline: 'none', padding: 0,
                }}
              />
              <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>tap to edit</div>
            </div>
          </div>
          {Math.min(internalStreak, reportedStreak) >= 14 && (
            <div style={{
              padding: 10, background: `${C.teal}1a`, border: `1px solid ${C.teal}55`,
              borderRadius: 8, fontSize: 11, color: C.teal, fontStyle: 'italic',
            }}>
              🏅 Dual streak unlocked — {Math.min(internalStreak, reportedStreak)} days of stacking both.
            </div>
          )}
        </Section>

        {/* Post-Session Debrief */}
        <Section title="Log a Session">
          {logSaved && (
            <div style={{
              padding: 8, background: `${C.teal}22`, border: `1px solid ${C.teal}66`,
              borderRadius: 6, fontSize: 11, color: C.teal, marginBottom: 10, textAlign: 'center',
            }}>
              Logged. Nice work.
            </div>
          )}

          <Label>Course</Label>
          <select value={logCourseId} onChange={(e) => setLogCourseId(e.target.value)} style={inputStyle}>
            <option value="">— pick a course —</option>
            {catalog.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <Label style={{ marginTop: 12 }}>Minutes: {logMinutes}</Label>
          <input
            type="range" min={5} max={90} step={5} value={logMinutes}
            onChange={(e) => setLogMinutes(Number(e.target.value))}
            style={{ width: '100%' }}
          />

          <Label style={{ marginTop: 12 }}>Difficulty (1 easy → 5 brutal): {logRating}</Label>
          <input
            type="range" min={1} max={5} step={1} value={logRating}
            onChange={(e) => setLogRating(Number(e.target.value))}
            style={{ width: '100%' }}
          />

          <Label style={{ marginTop: 12 }}>One concept that clicked</Label>
          <input
            type="text" value={logClicked}
            onChange={(e) => setLogClicked(e.target.value)}
            placeholder="e.g. Bayes' rule finally made sense"
            style={inputStyle}
            maxLength={200}
          />

          <Label style={{ marginTop: 12 }}>One concept that didn't (Maya will follow up)</Label>
          <input
            type="text" value={logStuck}
            onChange={(e) => setLogStuck(e.target.value)}
            placeholder="e.g. still confused by combinations vs permutations"
            style={inputStyle}
            maxLength={200}
          />

          <button onClick={submitLog} style={{ ...primaryBtn, marginTop: 14 }}>LOG SESSION</button>
        </Section>

        {/* Walk Maya through it */}
        <Section title="Walk Maya Through It">
          <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 0, marginBottom: 10 }}>
            Stuck on a problem? Describe it <strong style={{ color: C.text }}>in your own words</strong> — Maya coaches your thinking, not the problem itself.
          </p>

          <Label>Problem (in your words · {walkProblem.length}/{WALK_MAX})</Label>
          <textarea
            value={walkProblem}
            onChange={(e) => setWalkProblem(e.target.value.slice(0, WALK_MAX))}
            placeholder="e.g. We're picking 3 marbles out of 10, what's the chance two are red…"
            style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: C.mono }}
            maxLength={WALK_MAX}
          />
          {looksPasted(walkProblem) && (
            <div style={{ fontSize: 10, color: C.amber, marginTop: 4 }}>
              Looks pasted — rephrase in your own words first.
            </div>
          )}

          <Label style={{ marginTop: 12 }}>What you tried · {walkTried.length}/{WALK_MAX}</Label>
          <textarea
            value={walkTried}
            onChange={(e) => setWalkTried(e.target.value.slice(0, WALK_MAX))}
            placeholder="e.g. I tried 3/10 × 2/9 but I think I missed cases"
            style={{ ...inputStyle, minHeight: 50, resize: 'vertical', fontFamily: C.mono }}
            maxLength={WALK_MAX}
          />

          <button onClick={askMaya} disabled={walking} style={{ ...primaryBtn, marginTop: 14, opacity: walking ? 0.6 : 1 }}>
            {walking ? 'Maya is thinking…' : 'ASK MAYA'}
          </button>

          {walkErr && (
            <div style={{
              marginTop: 10, padding: 10, background: `${C.red}22`,
              border: `1px solid ${C.red}66`, borderRadius: 8, fontSize: 11, color: C.red,
            }}>{walkErr}</div>
          )}

          {walkResp && (
            <div style={{
              marginTop: 12, padding: 12, background: `${C.teal}11`,
              border: `1px solid ${C.teal}44`, borderRadius: 10,
              fontSize: 12, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap',
            }}>
              {walkResp}
            </div>
          )}
        </Section>

        {/* Recent sessions */}
        {sessions.length > 0 && (
          <Section title={`Recent Sessions (${sessions.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sessions.slice(0, 10).map((s) => {
                const course = getCourseById(s.courseId)
                return (
                  <div key={s.at} style={{
                    padding: 10, background: C.surfaceLight, borderRadius: 10,
                    border: `1px solid ${C.border}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <div style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>
                        {course?.name || s.courseId || 'session'}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted }}>{s.minutes} min · {s.date}</div>
                    </div>
                    {s.clicked && (
                      <div style={{ fontSize: 11, color: C.teal, marginTop: 6 }}>
                        ✓ {s.clicked}
                      </div>
                    )}
                    {s.stuck && (
                      <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>
                        ⚠ {s.stuck}
                      </div>
                    )}
                    <button onClick={() => { deleteSession(s.at); refresh() }} style={{
                      ...ghostBtn, marginTop: 8, padding: '4px 8px', fontSize: 9,
                    }}>
                      delete
                    </button>
                  </div>
                )
              })}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function Header({ onBack }) {
  return (
    <div style={{
      padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
      background: C.surface, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <button onClick={onBack} style={{
        background: 'transparent', border: 'none', color: C.muted,
        fontSize: 18, cursor: 'pointer', padding: 0,
      }}>←</button>
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2 }}>BRILLIANT COMPANION</div>
    </div>
  )
}

function Section({ title, right, children }) {
  return (
    <div style={{
      padding: 14, background: C.surface, borderRadius: 14,
      border: `1px solid ${C.border}`, marginBottom: 14,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, gap: 8,
      }}>
        <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5 }}>{title}</div>
        {right || null}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{
      padding: 10, background: C.surfaceLight, borderRadius: 8,
      border: `1px solid ${C.border}`, textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: C.display, fontSize: 22, color }}>{value}</div>
    </div>
  )
}

function Label({ children, style }) {
  return (
    <div style={{
      fontSize: 10, color: C.muted, letterSpacing: 1,
      textTransform: 'uppercase', marginBottom: 6, ...(style || {}),
    }}>{children}</div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px',
  background: C.surfaceLight, border: `1px solid ${C.border}`,
  borderRadius: 8, color: C.text, fontSize: 12, fontFamily: C.mono,
  outline: 'none', boxSizing: 'border-box',
}

const primaryBtn = {
  width: '100%', padding: '12px 14px', borderRadius: 8,
  background: C.teal, color: C.bg, border: 'none',
  fontFamily: C.mono, fontWeight: 700, fontSize: 12, letterSpacing: 1,
  cursor: 'pointer',
}

const ghostBtn = {
  padding: '6px 10px', borderRadius: 6,
  background: 'transparent', border: `1px solid ${C.border}`,
  color: C.muted, fontSize: 10, fontFamily: C.mono, fontWeight: 700,
  cursor: 'pointer', letterSpacing: 0.5,
}

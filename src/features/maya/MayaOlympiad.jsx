/**
 * Math Olympiad Drill — the wedge product for `mayaprep.com`.
 *
 * Flow:
 *   1. Pick level (AMC 8 / 10 / 12)
 *   2. Solve multiple-choice problems one at a time
 *   3. Maya gives a socratic walkthrough on misses (Claude API)
 *   4. Track accuracy, streak, per-topic stats — persisted to localStorage
 *
 * Adaptive: pickNextProblem() prioritizes unseen → recent miss → random.
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import sfx from './lib/sfx'
import { LEVELS, problemsForLevel, pickNextProblem } from './lib/olympiadProblems'
import { callClaude, canCallClaude, textFromResponse } from './lib/anthropicClient'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171',
  green: '#34D399', gold: '#FFD700', amber: '#FBBF24',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

const STATE_KEY = 'maya_olympiad'

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) || { attempts: [], streak: 0, lastDate: null } }
  catch { return { attempts: [], streak: 0, lastDate: null } }
}
function saveState(state) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)) } catch {}
}

function recordAttempt(state, problemId, level, correct) {
  const today = new Date().toISOString().slice(0, 10)
  const lastDate = state.lastDate
  let streak = state.streak || 0
  if (lastDate === today) {
    // already counted today
  } else if (lastDate) {
    const lastD = new Date(lastDate)
    const todayD = new Date(today)
    const diffDays = Math.round((todayD - lastD) / (1000 * 60 * 60 * 24))
    streak = diffDays === 1 ? streak + 1 : 1
  } else {
    streak = 1
  }
  const attempt = { problemId, level, correct, ts: new Date().toISOString() }
  const next = {
    attempts: [...(state.attempts || []), attempt].slice(-500),
    streak, lastDate: today,
  }
  saveState(next)
  return next
}

export default function MayaOlympiad() {
  const navigate = useNavigate()
  const [state, setState] = useState(loadState())
  const [level, setLevel] = useState(null)
  const [problem, setProblem] = useState(null)
  const [picked, setPicked] = useState(null) // 'A'|'B'|'C'|'D'|'E' before reveal
  const [revealed, setRevealed] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [explaining, setExplaining] = useState(false)

  // Per-session counters (reset when leaving / changing level)
  const [sessionCorrect, setSessionCorrect] = useState(0)
  const [sessionTotal, setSessionTotal] = useState(0)

  const attempts = state.attempts || []
  const levelAttempts = useMemo(
    () => level ? attempts.filter(a => a.level === level) : [],
    [attempts, level],
  )
  const allTimeAccuracy = useMemo(() => {
    if (levelAttempts.length === 0) return null
    const correct = levelAttempts.filter(a => a.correct).length
    return Math.round((correct / levelAttempts.length) * 100)
  }, [levelAttempts])

  const startLevel = (lvl) => {
    setLevel(lvl)
    setSessionCorrect(0)
    setSessionTotal(0)
    const next = pickNextProblem(lvl, attempts.filter(a => a.level === lvl))
    setProblem(next)
    setPicked(null)
    setRevealed(false)
    setExplanation('')
  }

  const submit = () => {
    if (!picked || !problem || revealed) return
    const correct = picked === problem.answer
    setRevealed(true)
    setSessionTotal(t => t + 1)
    if (correct) {
      setSessionCorrect(c => c + 1)
      sfx.ding()
    } else {
      sfx.miss()
    }
    const nextState = recordAttempt(state, problem.id, level, correct)
    setState(nextState)
    if (!correct) {
      requestExplanation()
    }
  }

  const requestExplanation = async () => {
    if (!problem) return
    setExplaining(true)
    setExplanation('')
    if (canCallClaude()) {
      try {
        const data = await callClaude({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          system: `You are Maya, a brutally direct but encouraging math olympiad coach. A student just attempted a competition problem and got it wrong. Your job:
- DO NOT just give the answer.
- Walk through the FIRST step they should have taken.
- Ask ONE leading question to make them re-engage.
- Keep it under 100 words. Use plain text, no markdown headers.
- Sarcasm is fine; condescension is not.
- End with: "Want the full solution? Hit Show solution."`,
          messages: [{
            role: 'user',
            content: `Problem: ${problem.text}\nChoices: A) ${problem.choices.A}  B) ${problem.choices.B}  C) ${problem.choices.C}  D) ${problem.choices.D}  E) ${problem.choices.E}\nCorrect answer: ${problem.answer}\nStudent picked: ${picked}\n\nGive a socratic hint.`,
          }],
        })
        setExplanation(textFromResponse(data))
      } catch {
        setExplanation("My brain's offline. The correct answer is " + problem.answer + ". Want me to walk you through it next time? Check Profile → Maya's Brain.")
      }
    } else {
      setExplanation(`The correct answer is ${problem.answer}. For a step-by-step walkthrough, add a Claude API key in Profile → Maya's Brain.`)
    }
    setExplaining(false)
  }

  const fullSolution = async () => {
    setExplaining(true)
    if (canCallClaude()) {
      try {
        const data = await callClaude({
          model: 'claude-sonnet-4-6',
          max_tokens: 700,
          system: 'You are a math olympiad coach. Give a complete, rigorous step-by-step solution to the problem. Use plain text. No markdown headers, just numbered steps. End with the answer letter.',
          messages: [{
            role: 'user',
            content: `Problem: ${problem.text}\nChoices: A) ${problem.choices.A}  B) ${problem.choices.B}  C) ${problem.choices.C}  D) ${problem.choices.D}  E) ${problem.choices.E}\nThe correct answer is ${problem.answer}. Show full solution.`,
          }],
        })
        setExplanation(textFromResponse(data))
      } catch {
        setExplanation("Couldn't reach Claude. The correct answer is " + problem.answer + ".")
      }
    } else {
      setExplanation(`Answer: ${problem.answer}. Full solutions need a Claude API key.`)
    }
    setExplaining(false)
  }

  const nextProblem = () => {
    const next = pickNextProblem(level, attempts.filter(a => a.level === level))
    setProblem(next)
    setPicked(null)
    setRevealed(false)
    setExplanation('')
  }

  const exit = () => {
    setLevel(null)
    setProblem(null)
    setRevealed(false)
    setPicked(null)
    setExplanation('')
  }

  // ---------- RENDER ----------

  // LEVEL PICKER
  if (!level) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80 }}>
        <Header onBack={() => navigate('/')} />
        <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 44, marginBottom: 4 }}>🏆</div>
            <div style={{ fontFamily: C.display, fontSize: 32, color: C.gold, letterSpacing: 2 }}>OLYMPIAD MODE</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Real AMC problems. Real prep. Pick your level.
            </div>
          </div>

          <StatsBar attempts={attempts} streak={state.streak || 0} />

          {attempts.length > 0 && (
            <button onClick={() => navigate('/report')} style={{
              width: '100%', marginTop: 12, padding: '12px 14px',
              background: C.surface, border: `1px solid ${C.gold}55`,
              borderLeft: `4px solid ${C.gold}`, borderRadius: 10,
              color: C.text, textAlign: 'left', cursor: 'pointer',
              fontFamily: C.mono, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>
                <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>📋 Parent Weekly Report</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Shareable. Screenshot it for the family chat.</div>
              </span>
              <span style={{ color: C.gold, fontSize: 16 }}>→</span>
            </button>
          )}

          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 8px' }}>
            Levels
          </div>
          {LEVELS.map(lvl => {
            const count = problemsForLevel(lvl.id).length
            const myAttempts = attempts.filter(a => a.level === lvl.id)
            const acc = myAttempts.length > 0
              ? Math.round((myAttempts.filter(a => a.correct).length / myAttempts.length) * 100)
              : null
            return (
              <button key={lvl.id} onClick={() => startLevel(lvl.id)} style={{
                width: '100%', padding: 16, marginBottom: 10,
                background: C.surface, border: `2px solid ${C.border}`,
                borderLeft: `4px solid ${lvl.color}`, borderRadius: 12,
                color: C.text, textAlign: 'left', cursor: 'pointer',
                fontFamily: C.mono,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div style={{ fontFamily: C.display, fontSize: 22, color: lvl.color, letterSpacing: 1 }}>{lvl.label}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{count} problems</div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{lvl.description}</div>
                {acc !== null && (
                  <div style={{ fontSize: 10, color: C.gold, marginTop: 6 }}>
                    You: {acc}% across {myAttempts.length} attempts
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // NO PROBLEMS LEFT (shouldn't happen with v1 bank, but defensive)
  if (!problem) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80 }}>
        <Header onBack={exit} title="OLYMPIAD" />
        <div style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 44 }}>🎉</div>
          <div style={{ fontSize: 16, color: C.gold, marginTop: 8 }}>No more problems at this level.</div>
          <button onClick={exit} style={btn}>Back</button>
        </div>
      </div>
    )
  }

  const currentLevel = LEVELS.find(l => l.id === level)

  // PROBLEM VIEW
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80 }}>
      <Header onBack={exit} title={currentLevel?.label || 'OLYMPIAD'} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        {/* Session bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginBottom: 12 }}>
          <span>Session: {sessionCorrect}/{sessionTotal}</span>
          <span style={{ color: C.gold }}>🔥 {state.streak || 0}d streak</span>
          {allTimeAccuracy !== null && <span style={{ color: C.teal }}>All-time: {allTimeAccuracy}%</span>}
        </div>

        {/* Difficulty + topic chips */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, fontSize: 10 }}>
          <span style={{ ...chip, color: C.amber, borderColor: C.amber + '55' }}>
            Difficulty {problem.difficulty}/5
          </span>
          <span style={{ ...chip, color: C.muted }}>{problem.topic.replace('_', ' ')}</span>
        </div>

        {/* Problem text */}
        <div style={{
          padding: 16, background: C.surfaceLight, borderRadius: 12,
          border: `1px solid ${C.border}`, fontSize: 13, lineHeight: 1.6,
          marginBottom: 16, whiteSpace: 'pre-wrap',
        }}>
          {problem.text}
        </div>

        {/* Choices */}
        {['A', 'B', 'C', 'D', 'E'].map(letter => {
          const isPicked = picked === letter
          const isCorrect = revealed && letter === problem.answer
          const isWrongPicked = revealed && isPicked && letter !== problem.answer
          let borderColor = C.border
          let bg = C.surface
          let textColor = C.text
          if (isCorrect) { borderColor = C.green; bg = C.green + '22'; textColor = C.green }
          else if (isWrongPicked) { borderColor = C.red; bg = C.red + '22'; textColor = C.red }
          else if (isPicked) { borderColor = C.teal; bg = C.teal + '22'; textColor = C.teal }
          return (
            <button
              key={letter}
              onClick={() => !revealed && setPicked(letter)}
              disabled={revealed}
              style={{
                width: '100%', padding: 12, marginBottom: 8,
                background: bg, border: `2px solid ${borderColor}`,
                borderRadius: 10, color: textColor,
                fontSize: 13, fontFamily: C.mono, textAlign: 'left',
                cursor: revealed ? 'default' : 'pointer',
                display: 'flex', gap: 10,
              }}
            >
              <span style={{ fontWeight: 700, minWidth: 16 }}>{letter}.</span>
              <span>{problem.choices[letter]}</span>
            </button>
          )
        })}

        {/* Submit / Next */}
        {!revealed && (
          <button onClick={submit} disabled={!picked} style={{
            ...btn,
            background: picked ? C.teal : C.dim,
            cursor: picked ? 'pointer' : 'not-allowed',
            marginTop: 12,
          }}>SUBMIT</button>
        )}

        {revealed && (
          <>
            <div style={{
              padding: 12, marginTop: 12, borderRadius: 10,
              background: picked === problem.answer ? C.green + '11' : C.red + '11',
              border: `1px solid ${picked === problem.answer ? C.green : C.red}55`,
              fontSize: 12, color: picked === problem.answer ? C.green : C.red,
            }}>
              {picked === problem.answer
                ? `✓ Correct. Answer is ${problem.answer}.`
                : `✗ Not quite. Answer is ${problem.answer}.`}
            </div>

            {(explaining || explanation) && (
              <div style={{
                padding: 14, marginTop: 12, borderRadius: 10,
                background: C.surfaceLight, border: `1px solid ${C.border}`,
                fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                <div style={{ fontSize: 9, color: C.teal, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Maya
                </div>
                {explaining && !explanation ? 'Thinking...' : explanation}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {picked === problem.answer && (
                <button onClick={requestExplanation} disabled={explaining} style={secBtn}>
                  {explaining ? '...' : 'Why?'}
                </button>
              )}
              <button onClick={fullSolution} disabled={explaining} style={secBtn}>
                {explaining ? '...' : 'Show solution'}
              </button>
              <button onClick={nextProblem} style={btn}>Next →</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatsBar({ attempts, streak }) {
  const today = new Date().toISOString().slice(0, 10)
  const todayAttempts = attempts.filter(a => a.ts.startsWith(today))
  const todayCorrect = todayAttempts.filter(a => a.correct).length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
      <Stat label="Total" value={attempts.length} color={C.teal} />
      <Stat label="Today" value={`${todayCorrect}/${todayAttempts.length}`} color={C.green} />
      <Stat label="Streak" value={`${streak}d`} color={C.gold} />
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ padding: 12, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Header({ onBack, title = 'OLYMPIAD' }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, background: C.surface, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 0 }}>←</button>
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.gold, letterSpacing: 2 }}>{title}</div>
    </div>
  )
}

const chip = {
  padding: '3px 8px', borderRadius: 999,
  border: `1px solid ${C.border}`, fontSize: 10, color: C.muted,
  textTransform: 'uppercase', letterSpacing: 1,
}
const btn = {
  flex: 1, padding: '14px 20px', background: C.teal, color: C.bg,
  border: 'none', borderRadius: 12, fontSize: 13, fontFamily: C.mono,
  fontWeight: 700, cursor: 'pointer',
}
const secBtn = {
  flex: 1, padding: '14px 20px', background: 'transparent', color: C.muted,
  border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 12,
  fontFamily: C.mono, cursor: 'pointer',
}

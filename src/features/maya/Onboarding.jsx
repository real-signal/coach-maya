/**
 * Conversational Onboarding — Maya asks 5 questions, kid answers naturally.
 * Profile is extracted from free text, schedule is auto-generated.
 * No forms, no dropdowns, no checkboxes. Just a chat.
 */
import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { loadProfile, saveProfile } from './lib/profile'
import { buildProfileFromChat, toAppProfile } from './agents/profileBuilder'
import { generateSchedule } from './agents/scheduleGenerator'

const MayaAvatar = lazy(() => import('./components/Maya3D'))

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', gold: '#FFD700',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

const MAYA_QUESTIONS = [
  {
    key: 'q1',
    text: "Hey! I'm Maya — your coach. What's your name, age, and where are you from?",
    placeholder: "e.g. I'm Alex, 11, from London (Year 7)",
  },
  {
    key: 'q2',
    text: null, // dynamically generated with name
    placeholder: "e.g. I play football and guitar, and I do coding club",
  },
  {
    key: 'q3',
    text: null,
    placeholder: "e.g. I like science and art but I hate maths",
  },
  {
    key: 'q4',
    text: null,
    placeholder: "e.g. around 9:30",
  },
  {
    key: 'q5',
    text: null,
    placeholder: "e.g. get better at maths / make the school team / learn piano",
  },
]

function getMayaQuestion(index, answers) {
  if (index === 0) return MAYA_QUESTIONS[0].text

  // Extract name from first answer for personalization
  const q1 = (answers.q1 || '').trim()
  const nameMatch = q1.match(/(?:i'?m|my name is|name'?s|call me)\s+(\w+)/i)
    || q1.match(/^(\w+)/)
  const name = nameMatch ? nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase() : 'you'

  const questions = [
    null, // q1 already handled
    `Nice to meet you, ${name}. What do you do after school? Any sports, instruments, clubs, hobbies?`,
    `Cool. What about school — any subjects you actually like? And any you can't stand?`,
    `What time do you usually go to bed?`,
    `Last one. What's one thing you want to get better at this year? Anything counts.`,
  ]
  return questions[index]
}

const DRAFT_KEY = 'maya_onboarding_draft'

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch { return null }
}

function saveDraft(draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
}

export default function Onboarding() {
  // Restore mid-flow state if user refreshed during onboarding.
  const draft = typeof window !== 'undefined' ? loadDraft() : null

  const [messages, setMessages] = useState(() => {
    if (draft?.messages?.length) return draft.messages
    return [{ from: 'maya', text: getMayaQuestion(0, {}) }]
  })
  const [input, setInput] = useState('')
  const [questionIndex, setQuestionIndex] = useState(draft?.questionIndex ?? 0)
  const [answers, setAnswers] = useState(draft?.answers ?? {})
  const [building, setBuilding] = useState(false)
  const [summary, setSummary] = useState(null)
  const [parentPin, setParentPin] = useState('')
  const [showPinStep, setShowPinStep] = useState(false)
  const [saveError, setSaveError] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [questionIndex, showPinStep])

  // Checkpoint progress to localStorage on each answered question so refresh
  // doesn't wipe the chat. Only persist while still in the Q&A phase — once
  // summary is built, finishSetup() will commit + clear the draft.
  useEffect(() => {
    if (summary || showPinStep) return
    if (questionIndex === 0 && Object.keys(answers).length === 0) return
    saveDraft({ messages, questionIndex, answers })
  }, [messages, questionIndex, answers, summary, showPinStep])

  const sendAnswer = async () => {
    const text = input.trim()
    if (!text) return

    const key = MAYA_QUESTIONS[questionIndex].key
    const newAnswers = { ...answers, [key]: text }
    setAnswers(newAnswers)
    setInput('')

    // Add user message
    setMessages(prev => [...prev, { from: 'user', text }])

    const nextIndex = questionIndex + 1

    if (nextIndex < MAYA_QUESTIONS.length) {
      // Ask next question
      setTimeout(() => {
        setMessages(prev => [...prev, {
          from: 'maya',
          text: getMayaQuestion(nextIndex, newAnswers),
        }])
        setQuestionIndex(nextIndex)
      }, 600)
    } else {
      // All questions answered — build profile
      setBuilding(true)
      setTimeout(() => {
        setMessages(prev => [...prev, {
          from: 'maya',
          text: "Give me a sec — building your world...",
        }])
      }, 400)

      try {
        const extracted = await buildProfileFromChat(newAnswers)
        const appProfile = toAppProfile(extracted)
        const schedule = generateSchedule(extracted)

        setSummary({ profile: appProfile, schedule, extracted })
        setBuilding(false)

        setTimeout(() => {
          setMessages(prev => [...prev, {
            from: 'maya',
            text: buildSummaryText(appProfile, schedule),
          }])
          // Ask for parent PIN
          setTimeout(() => {
            setMessages(prev => [...prev, {
              from: 'maya',
              text: "One more thing — pick a 4-digit PIN so your parent can check your progress. Only they'll need it.",
            }])
            setShowPinStep(true)
          }, 1200)
        }, 800)
      } catch {
        setBuilding(false)
        setMessages(prev => [...prev, {
          from: 'maya',
          text: "Something went wrong building your profile. Let's just get started — you can set things up later in Settings.",
        }])
        setTimeout(() => {
          try {
            saveProfile({ ...loadProfile(), setupComplete: true, setupAt: new Date().toISOString() })
          } catch {}
          clearDraft()
          window.location.href = '/'
        }, 2000)
      }
    }
  }

  const finishSetup = async () => {
    if (!summary) return

    const profile = {
      ...loadProfile(),
      ...summary.profile,
    }
    if (parentPin.length === 4 && /^\d{4}$/.test(parentPin)) {
      try {
        const encoder = new TextEncoder()
        const data = encoder.encode('maya_salt_' + parentPin)
        const hash = await crypto.subtle.digest('SHA-256', data)
        profile.parentPinHash = Array.from(new Uint8Array(hash))
          .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
      } catch {}
    }

    // Commit schedule first (less critical to revert), then profile.
    // If either throws (quota), surface an error instead of silently redirecting.
    try {
      localStorage.setItem('maya_schedule', JSON.stringify(summary.schedule))
      saveProfile(profile)
    } catch (e) {
      setSaveError(`Couldn't save your setup (${e?.name || 'storage error'}). Free up space and try again.`)
      return
    }

    clearDraft()

    setMessages(prev => [...prev, {
      from: 'maya',
      text: `Let's go, ${profile.name}. Day one starts now.`,
    }])

    setTimeout(() => {
      window.location.href = '/'
    }, 1200)
  }

  const isWaiting = building || (questionIndex >= MAYA_QUESTIONS.length && !summary && !showPinStep)

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: C.mono, display: 'flex', flexDirection: 'column',
    }}>
      {/* Maya avatar — smaller for chat mode */}
      <div style={{
        padding: '16px 0 8px', textAlign: 'center',
        background: `radial-gradient(ellipse at top, ${C.surfaceLight} 0%, ${C.bg} 70%)`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <Suspense fallback={<div style={{ height: 160 }} />}>
          <MayaAvatar state={building ? 'thinking' : summary ? 'celebrating' : 'speaking'} size={160} />
        </Suspense>
        <div style={{
          fontFamily: C.display, fontSize: 22, letterSpacing: 2,
          color: C.teal, marginTop: 4,
        }}>MEET MAYA</div>
      </div>

      {/* Chat messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px 16px 8px',
        maxWidth: 480, margin: '0 auto', width: '100%',
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            marginBottom: 12, display: 'flex',
            justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%', padding: '12px 16px',
              borderRadius: msg.from === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.from === 'user' ? C.teal + '22' : C.surfaceLight,
              border: `1px solid ${msg.from === 'user' ? C.teal + '33' : C.border}`,
              fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-line',
            }}>
              {msg.from === 'maya' && (
                <div style={{ fontSize: 9, color: C.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                  Maya
                </div>
              )}
              {msg.text}
            </div>
          </div>
        ))}

        {building && (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <div style={{
              display: 'inline-block', padding: '8px 16px',
              background: C.surfaceLight, borderRadius: 12,
              fontSize: 11, color: C.teal,
              animation: 'pulse 1.4s infinite',
            }}>
              analyzing...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '12px 16px 24px', borderTop: `1px solid ${C.border}`,
        background: C.surface, maxWidth: 480, margin: '0 auto', width: '100%',
      }}>
        {showPinStep ? (
          <div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                type="tel"
                maxLength={4}
                value={parentPin}
                onChange={e => setParentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4-digit PIN"
                onKeyDown={e => e.key === 'Enter' && (parentPin.length === 4 || parentPin.length === 0) && finishSetup()}
                style={{
                  ...inputStyle,
                  textAlign: 'center', fontSize: 24, letterSpacing: 12,
                  fontFamily: C.display,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={finishSetup} style={btnPrimary}>
                {parentPin.length === 4 ? "Let's go" : 'Skip PIN'}
              </button>
            </div>
            <div style={{ fontSize: 10, color: C.dim, textAlign: 'center', marginTop: 8 }}>
              {parentPin.length === 4 ? 'PIN set. Parent will use this to access reports.' : 'You can set a PIN later in settings.'}
            </div>
            {saveError && (
              <div style={{ fontSize: 11, color: '#F87171', textAlign: 'center', marginTop: 8 }}>
                {saveError}
              </div>
            )}
          </div>
        ) : !isWaiting && questionIndex < MAYA_QUESTIONS.length ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendAnswer()}
              placeholder={MAYA_QUESTIONS[questionIndex]?.placeholder || 'Type your answer...'}
              style={inputStyle}
            />
            <button onClick={sendAnswer} disabled={!input.trim()} style={{
              ...btnPrimary, flex: 'none', width: 64,
              opacity: input.trim() ? 1 : 0.4,
            }}>→</button>
          </div>
        ) : summary && !showPinStep ? null : (
          <div style={{ textAlign: 'center', fontSize: 11, color: C.dim, padding: 8 }}>
            Maya is thinking...
          </div>
        )}

        {/* Skip link */}
        {questionIndex === 0 && !building && !summary && (
          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button
              onClick={() => {
                try {
                  saveProfile({ ...loadProfile(), setupComplete: true, setupAt: new Date().toISOString() })
                } catch {}
                clearDraft()
                window.location.href = '/'
              }}
              style={{
                background: 'none', border: 'none', color: C.dim,
                fontSize: 10, fontFamily: C.mono, cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >Already set up? Skip to dashboard →</button>
          </div>
        )}
      </div>
    </div>
  )
}

function buildSummaryText(profile, schedule) {
  const lines = [`Here's what I've got, ${profile.name}:\n`]

  if (profile.hobbies.length > 0) {
    lines.push(`Activities: ${profile.hobbies.join(', ')}`)
  }
  if (profile.favoriteSubjects.length > 0) {
    lines.push(`Loves: ${profile.favoriteSubjects.join(', ')}`)
  }
  if (profile.hardSubjects.length > 0) {
    lines.push(`Needs work: ${profile.hardSubjects.join(', ')}`)
  }
  if (profile.bigGoals.length > 0) {
    lines.push(`Goal: ${profile.bigGoals[0]}`)
  }

  lines.push(`\nYour daily schedule (${schedule.length} tasks):`)
  schedule.forEach(t => {
    lines.push(`  ${t.name} — ${t.duration}min`)
  })

  lines.push(`\nYou can tweak this anytime in Schedule.`)
  return lines.join('\n')
}

const inputStyle = {
  flex: 1, padding: '14px 16px', background: C.bg,
  border: `1px solid ${C.border}`, borderRadius: 12,
  color: C.text, fontSize: 14, fontFamily: C.mono,
  outline: 'none', boxSizing: 'border-box',
}

const btnPrimary = {
  flex: 1, padding: '14px 20px', background: C.teal,
  color: C.bg, border: 'none', borderRadius: 12,
  fontSize: 14, fontFamily: C.mono, fontWeight: 700,
  cursor: 'pointer', letterSpacing: 0.5,
}

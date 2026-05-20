import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaya } from './context/MayaContext'
import { LEVELS, ACHIEVEMENTS } from './agents/gamification'
import { loadHistory as loadLessonHistory } from './agents/lessonAnalyst'
import { getMemoryStats } from './agents/memory'
import { weeklyInsights } from './agents/insights'
import { getSuggestion } from './agents/suggestions'
import { getActiveChallenge } from './agents/challenges'
import { getDailyFact, getDailyRiddle, getDailyQuote } from './agents/dailyContent'
import { getPersonalGreeting } from './agents/personalGreeting'
import { getPersonalInsight } from './agents/personalInsight'
import { getSmartNav, trackVisit } from './agents/smartNav'
import { getMorningBrief, dismissMorningBrief } from './agents/morningBrief'
import { EXCUSE_OPTIONS, logSkipReason, recordTaskOutcome } from './agents/intelligence'
import StreakHeatmap from './components/StreakHeatmap'
import { getApiKey } from './lib/secrets'
import {
  focusesForToday, loadCompassLog, toggleCompassFocus, todayDateKey, getTrack,
} from './lib/compassTracks'

// Lazy load 3D avatar (Three.js is ~800KB)
const MayaAvatar = lazy(() => import('./components/Maya3D'))

function AvatarFallback({ size }) {
  return (
    <div style={{
      width: size, height: size, margin: '0 auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size / 3),
    }}>🤖</div>
  )
}

const C = {
  bg: '#0a0a14',
  surface: 'rgba(255,255,255,0.04)',
  surfaceSolid: '#12121e',
  surfaceLight: 'rgba(255,255,255,0.07)',
  glass: 'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.14)',
  border: 'rgba(255,255,255,0.08)',
  borderLight: 'rgba(255,255,255,0.18)',
  text: '#f0f0f5',
  muted: '#6b6b8a',
  dim: '#3a3a55',
  gold: '#FFD700',
  amber: '#FBBF24',
  green: '#34D399',
  red: '#F87171',
  blue: '#93C5FD',
  teal: '#2DD4BF',
  purple: '#A78BFA',
  pink: '#F472B6',
  mono: "'IBM Plex Mono', monospace",
  display: "'Bebas Neue', sans-serif",
  blur: 'blur(20px)',
}

const gradeColors = { S: C.gold, A: C.green, B: C.blue, C: C.amber, F: C.red, '-': C.dim }

export default function MayaDashboard({ onOpenSearch }) {
  const maya = useMaya()
  const [chatInput, setChatInput] = useState('')
  const [spotCheckInput, setSpotCheckInput] = useState('')
  const [activeTab, setActiveTab] = useState('tasks')
  const [skipPending, setSkipPending] = useState(null) // task being skipped, waiting for reason
  const [showAnswer, setShowAnswer] = useState(false)
  const messagesEndRef = useRef(null)
  const navigate = useNavigate()

  const {
    gamification: gam, tasks, messages, comboTimeLeft, pendingSpotCheck,
    todayMood, voiceState, isListening, profile, streak,
  } = maya

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // First-mount-of-the-day greeting
  useEffect(() => {
    const todayKey = `maya_greeted_${new Date().toISOString().slice(0, 10)}`
    if (localStorage.getItem(todayKey)) return
    const t = setTimeout(() => {
      try {
        const g = getPersonalGreeting({
          profile: maya.profile,
          tasks: maya.tasks,
          todayMood: maya.todayMood,
          gamification: maya.gamification,
        })
        maya.speakText(`${g.headline} ${g.subline}`)
      } catch {
        const name = profile?.name || 'Champ'
        maya.speakText(`Hey ${name}. Let's get started.`)
      }
      localStorage.setItem(todayKey, '1')
    }, 1500)
    return () => clearTimeout(t)
  }, [])

  const completedCount = tasks.filter(t => t.completed).length
  const totalCount = tasks.length
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  // Avatar state — driven by voice + game state
  const avatarState = useMemo(() => {
    if (voiceState === 'speaking') return 'speaking'
    if (voiceState === 'listening') return 'thinking'
    const lastMsg = messages[messages.length - 1]
    if (lastMsg && lastMsg.type === 'achievement' && (Date.now() - new Date(lastMsg.timestamp).getTime()) < 6000) return 'celebrating'
    if (comboTimeLeft !== null && comboTimeLeft > 0 && comboTimeLeft <= 10) return 'urgent'
    if (completedCount === totalCount && totalCount > 0) return 'celebrating'
    const hour = new Date().getHours()
    if (hour < 6 || hour > 22) return 'sleeping'
    return 'idle'
  }, [voiceState, messages, comboTimeLeft, completedCount, totalCount])

  const personal = useMemo(
    () => getPersonalGreeting({ profile, tasks, todayMood, gamification: gam }),
    [profile, tasks, todayMood, gam]
  )
  const greeting = personal.headline

  return (
    <div style={{
      minHeight: '100vh',
      background: 'transparent',
      color: C.text,
      fontFamily: C.mono,
      paddingBottom: 80,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* ─── Ambient Orbs — bright colorful blobs behind glass ─── */}
      <div style={{
        position: 'fixed', top: -60, right: -40, width: 350, height: 350,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.6) 0%, rgba(167,139,250,0.2) 40%, transparent 70%)',
        filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', bottom: 120, left: -40, width: 300, height: 300,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,212,191,0.5) 0%, rgba(45,212,191,0.15) 40%, transparent 70%)',
        filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', top: '50%', right: -30, width: 250, height: 250,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,114,182,0.45) 0%, rgba(244,114,182,0.1) 40%, transparent 70%)',
        filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0,
      }} />
      <div style={{
        position: 'fixed', top: '20%', left: '30%', width: 200, height: 200,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,191,36,0.2) 0%, transparent 60%)',
        filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0,
      }} />

      {/* ─── Maya Avatar Hero ─── */}
      <div style={{
        background: `radial-gradient(ellipse at center top, rgba(167,139,250,0.12) 0%, transparent 60%)`,
        padding: '16px 0 8px',
        borderBottom: `1px solid ${C.glassBorder}`,
        position: 'relative',
      }}>
        <Suspense fallback={<AvatarFallback size={300} />}>
          <MayaAvatar state={avatarState} size={300} />
        </Suspense>

        {/* Voice control floating button */}
        <button
          onClick={isListening ? maya.stopListening : maya.startListening}
          style={{
            position: 'absolute',
            right: 16, top: 16,
            width: 44, height: 44, borderRadius: 22,
            background: isListening ? C.red : C.teal + '22',
            border: `1px solid ${isListening ? C.red : C.teal}`,
            color: isListening ? '#fff' : C.teal,
            fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isListening ? `0 0 16px ${C.red}88` : 'none',
            transition: 'all 200ms ease',
          }}
          title={isListening ? 'Stop listening' : 'Talk to Maya'}
        >🎤</button>

        {/* Greeting */}
        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <div style={{
            fontFamily: C.display,
            fontSize: 26,
            letterSpacing: 2.5,
            color: C.teal,
          }}>
            {greeting.toUpperCase()}
          </div>
          {(profile?.age || profile?.grade || profile?.location) && (
            <div style={{ fontSize: 11, color: '#A78BFA', marginTop: 4, fontWeight: 600 }}>
              {[
                profile?.age ? `Age ${profile.age}` : null,
                profile?.grade ? `Grade ${profile.grade}` : null,
                profile?.location || null,
              ].filter(Boolean).join(' · ')}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {avatarState === 'sleeping' ? 'Resting...' :
             avatarState === 'celebrating' ? 'LET\'S GO!' :
             avatarState === 'urgent' ? 'Combo at risk!' :
             avatarState === 'speaking' ? '● Speaking...' :
             avatarState === 'thinking' ? '● Listening...' :
             `Level ${gam.level?.level} · ${gam.level?.title}`}
          </div>
          {personal.subline && (
            <div style={{
              fontSize: 11, color: C.text, marginTop: 8,
              opacity: 0.85, lineHeight: 1.4, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto',
            }}>
              {personal.subline}
            </div>
          )}

          {/* Streak pill */}
          {(profile?.currentStreak || 0) > 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              marginTop: 8, padding: '4px 12px',
              background: C.surfaceLight, borderRadius: 999,
              border: `1px solid ${C.gold}44`,
            }}>
              <span style={{ fontSize: 12 }}>🔥</span>
              <span style={{ fontSize: 11, color: C.gold, fontWeight: 700 }}>
                {profile.currentStreak}-day streak
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Stats Header ─── */}
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${C.glassBorder}`,
        background: C.glass,
        backdropFilter: C.blur,
        WebkitBackdropFilter: C.blur,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{
              fontFamily: C.display,
              fontSize: 24,
              letterSpacing: 2,
              color: C.teal,
              lineHeight: 1,
              textShadow: '0 0 20px rgba(45,212,191,0.3)',
            }}>
              {(profile?.name || 'CHAMP').toUpperCase()}'S HQ
            </div>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22 }}>{gam.level?.icon}</div>
              <div style={{ fontSize: 9, color: C.muted }}>{gam.level?.title}</div>
            </div>
            <IconBtn onClick={() => onOpenSearch?.()} title="Search (⌘K)">🔍</IconBtn>
            <IconBtn onClick={() => navigate('/profile')} title="Profile">👤</IconBtn>
          </div>
        </div>

        {/* XP Bar */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginBottom: 4 }}>
            <span>LVL {gam.level?.level} — {gam.totalXP} XP</span>
            <span>{gam.level?.xpToNext > 0 ? `${gam.level.xpToNext} to next` : 'MAX'}</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(gam.level?.progress || 0) * 100}%`,
              background: `linear-gradient(90deg, ${C.teal}, ${C.purple})`,
              borderRadius: 3,
              transition: 'width 0.5s ease',
              boxShadow: '0 0 8px rgba(45,212,191,0.4)',
            }} />
          </div>
        </div>

        {/* Stats Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 8 }}>
          <StatBox label="Grade" value={gam.dayGrade?.grade || '-'} color={gradeColors[gam.dayGrade?.grade] || C.dim} />
          <StatBox label="Combo" value={`${gam.combo}×`} sub={gam.comboLabel} color={gam.combo >= 5 ? C.gold : gam.combo >= 3 ? C.amber : C.muted} />
          <StatBox label="Done" value={`${completedCount}/${totalCount}`} color={completedCount === totalCount && totalCount > 0 ? C.green : C.blue} />
          {comboTimeLeft !== null && comboTimeLeft > 0 && (
            <StatBox label="Timer" value={`${comboTimeLeft}m`} color={comboTimeLeft <= 10 ? C.red : C.amber} />
          )}
        </div>
      </div>

      {/* ─── Onboarding nudge (non-blocking) ─── */}
      {!profile?.setupComplete && (
        <div
          onClick={() => navigate('/onboarding')}
          style={{
            padding: '10px 16px', background: 'rgba(45,212,191,0.06)',
            borderBottom: `1px solid rgba(45,212,191,0.15)`,
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 16 }}>👋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: C.teal, fontWeight: 600 }}>Set up your profile</div>
            <div style={{ fontSize: 10, color: C.muted }}>Takes 30 seconds — Maya gets to know you</div>
          </div>
          <span style={{ color: C.teal, fontSize: 12 }}>→</span>
        </div>
      )}

      {/* ─── Activity Heatmap ─── */}
      <div style={{
        padding: '8px 16px 12px', borderBottom: `1px solid ${C.glassBorder}`,
        background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      }}>
        <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>90-day activity</div>
        <StreakHeatmap size={8} />
      </div>

      {/* ─── Morning briefing (first open of the day, mornings only) ─── */}
      <MorningBriefCard tasks={tasks} navigate={navigate} />

      {/* ─── Next Competition Countdown ─── */}
      <NextCompWidget navigate={navigate} />

      {/* ─── Weekly Challenge ─── */}
      <WeeklyChallenge />

      {/* ─── Daily content ─── */}
      <DailyContent profile={profile} />

      {/* ─── Personal insight (For You) ─── */}
      <ForYouCard navigate={navigate} profile={profile} gamification={gam} />

      {/* ─── Smart suggestion ─── */}
      <SuggestionCard navigate={navigate} maya={maya} />

      {/* ─── Quick nav scroll row (smart, personalised) ─── */}
      <NavRow navigate={navigate} profile={profile} />

      {/* ─── Lesson CTA — Maya's signature feature ─── */}
      <LessonCTA navigate={navigate} />

      {/* ─── Smart secondary CTAs (ritual + memory) ─── */}
      <SmartCTAs navigate={navigate} />

      {/* ─── Tab Bar ─── */}
      <div style={{
        display: 'flex', borderBottom: `1px solid ${C.glassBorder}`,
        background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
        padding: '0 4px',
      }}>
        {['tasks', 'stats', 'chat'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '12px 0',
              background: activeTab === tab ? 'rgba(45,212,191,0.08)' : 'none',
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${C.teal}` : '2px solid transparent',
              borderRadius: activeTab === tab ? '8px 8px 0 0' : 0,
              color: activeTab === tab ? C.teal : C.muted,
              fontSize: 11,
              fontFamily: C.mono,
              textTransform: 'uppercase',
              letterSpacing: 1,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >{tab}</button>
        ))}
      </div>

      {/* ─── Content ─── */}
      <div style={{ padding: '12px 16px' }}>
        {activeTab === 'tasks' && <TasksTab maya={maya} onSkipRequest={(task) => setSkipPending(task)} />}
        {activeTab === 'stats' && <StatsTab maya={maya} />}
        {activeTab === 'chat' && (
          <ChatTab
            maya={maya}
            chatInput={chatInput}
            setChatInput={setChatInput}
            messagesEndRef={messagesEndRef}
          />
        )}
      </div>

      {/* ─── Spot Check Overlay ─── */}
      {pendingSpotCheck && (
        <div style={{
          position: 'fixed',
          bottom: 70, left: 0, right: 0,
          maxWidth: 480, margin: '0 auto', padding: 16,
          background: C.surfaceLight,
          borderTop: `2px solid ${C.amber}`,
          zIndex: 100,
        }}>
          <div style={{ fontSize: 10, color: C.amber, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Quick Check
          </div>
          <div style={{ fontSize: 13, marginBottom: 10 }}>{pendingSpotCheck.question}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={spotCheckInput}
              onChange={e => setSpotCheckInput(e.target.value)}
              placeholder="Your answer..."
              style={{
                flex: 1, padding: '8px 12px', background: C.bg,
                border: `1px solid ${C.border}`, borderRadius: 8,
                color: C.text, fontSize: 13, fontFamily: C.mono, outline: 'none',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && spotCheckInput.trim()) {
                  maya.respondToSpotCheck(spotCheckInput)
                  setSpotCheckInput('')
                }
              }}
            />
            <button
              onClick={() => {
                if (spotCheckInput.trim()) {
                  maya.respondToSpotCheck(spotCheckInput)
                  setSpotCheckInput('')
                }
              }}
              style={{
                padding: '8px 16px', background: C.amber, color: C.bg,
                border: 'none', borderRadius: 8, fontSize: 12,
                fontFamily: C.mono, fontWeight: 600, cursor: 'pointer',
              }}
            >Send</button>
          </div>
        </div>
      )}

      {/* ─── Listening Overlay ─── */}
      {isListening && (
        <div style={{
          position: 'fixed',
          bottom: 70, left: 0, right: 0,
          maxWidth: 480, margin: '0 auto', padding: 16,
          background: C.surfaceLight,
          borderTop: `2px solid ${C.teal}`,
          zIndex: 110,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 12, height: 12, borderRadius: 6, background: C.red,
            animation: 'pulse 1.4s infinite',
          }} />
          <div style={{ fontSize: 12, color: C.text, flex: 1 }}>
            {maya.interimTranscript || 'Listening...'}
          </div>
          <button onClick={maya.stopListening} style={{
            padding: '6px 12px', background: 'transparent',
            border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.muted, fontSize: 11, fontFamily: C.mono, cursor: 'pointer',
          }}>Stop</button>
        </div>
      )}

      {/* ─── Excuse Picker (when skipping a task) ─── */}
      {skipPending && (
        <div style={{
          position: 'fixed', bottom: 70, left: 0, right: 0,
          maxWidth: 480, margin: '0 auto', padding: 16,
          background: C.surfaceLight, borderTop: `2px solid ${C.red}`,
          zIndex: 120,
        }}>
          <div style={{ fontSize: 10, color: C.red, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
            Skipping "{skipPending.name}" — why?
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {EXCUSE_OPTIONS.map(ex => (
              <button
                key={ex.id}
                onClick={() => {
                  logSkipReason(skipPending.type, ex.id)
                  recordTaskOutcome(skipPending.type, false)
                  maya.skipTask(skipPending.id)
                  setSkipPending(null)
                }}
                style={{
                  padding: '8px 12px', background: C.surface,
                  border: `1px solid ${C.border}`, borderRadius: 999,
                  color: C.text, fontSize: 11, fontFamily: C.mono,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <span>{ex.icon}</span> {ex.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSkipPending(null)}
            style={{
              marginTop: 8, background: 'none', border: 'none',
              color: C.muted, fontSize: 10, fontFamily: C.mono, cursor: 'pointer',
            }}
          >Cancel</button>
        </div>
      )}

      {/* ─── Mood Check ─── */}
      {!todayMood && completedCount >= 1 && activeTab === 'tasks' && !pendingSpotCheck && !isListening && !skipPending && (
        <MoodPicker maya={maya} />
      )}
    </div>
  )
}

// ─── Parent Compass card — surfaces today's parent-set focuses ───
// Lives above today's tasks. Adherence is tracked in maya_compass_log
// (separate from XP/gamification so the compass doesn't game itself).
function CompassCard({ profile }) {
  const compass = profile?.parentCompass
  const todays = focusesForToday(compass)
  const [, force] = useState(0)
  if (!compass || !compass.track || todays.length === 0) return null

  const log = loadCompassLog()
  const today = log[todayDateKey()] || {}
  const track = getTrack(compass.track)
  const trackLabel = compass.track === 'custom' && compass.customLabel
    ? compass.customLabel
    : (track?.label || 'Compass')

  const toggle = (focusId) => {
    toggleCompassFocus(focusId)
    force(x => x + 1)
  }

  const done = todays.filter(f => today[f.id]).length

  return (
    <div style={{
      padding: 14, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      borderRadius: 14, marginBottom: 14, border: `1px solid ${C.glassBorder}`,
      borderLeft: `3px solid ${C.teal}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 10, color: C.teal, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }}>
          🧭 From your parent · {trackLabel}
        </div>
        <div style={{ fontSize: 10, color: C.muted }}>{done}/{todays.length}</div>
      </div>
      {compass.northStar && (
        <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', marginBottom: 10, lineHeight: 1.4 }}>
          "{compass.northStar}"
        </div>
      )}
      {todays.map(f => {
        const isDone = !!today[f.id]
        return (
          <div key={f.id} onClick={() => toggle(f.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            padding: '8px 0', borderTop: `1px dashed ${C.glassBorder}`,
            opacity: isDone ? 0.5 : 1, transition: 'opacity 0.2s ease',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              border: `2px solid ${isDone ? C.green : C.dim}`,
              background: isDone ? C.green : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: C.bg, fontWeight: 700, flexShrink: 0,
            }}>{isDone ? '✓' : ''}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, color: C.text,
                textDecoration: isDone ? 'line-through' : 'none',
              }}>{f.label}</div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{f.minutes} min</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Tasks Tab ───
function TasksTab({ maya, onSkipRequest }) {
  const { tasks, completeTask, profile } = maya
  return (
    <div>
      <CompassCard profile={profile} />
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        Today's Tasks
      </div>
      {tasks.map((task, i) => (
        <div key={task.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 12px',
          background: task.completed ? 'rgba(52,211,153,0.06)' : C.glass,
          backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
          borderRadius: 14, marginBottom: 8,
          border: `1px solid ${task.completed ? 'rgba(52,211,153,0.2)' : C.glassBorder}`,
          opacity: task.skipped ? 0.4 : 1,
          transition: 'all 0.3s ease',
        }}>
          <button
            onClick={() => !task.completed && !task.skipped && completeTask(task.id)}
            disabled={task.completed || task.skipped}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              border: `2px solid ${task.completed ? C.green : C.dim}`,
              background: task.completed ? C.green : 'transparent',
              color: task.completed ? C.bg : C.dim, fontSize: 14,
              cursor: task.completed || task.skipped ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.2s',
            }}
          >{task.completed ? '✓' : i + 1}</button>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 14, fontWeight: 600,
              color: task.completed ? C.green : C.text,
              textDecoration: task.skipped ? 'line-through' : 'none',
            }}>{task.name}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {task.duration}min · {task.type}
              {task.completedAt && ` · done ${new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </div>
          </div>
          {!task.completed && !task.skipped && (
            <button
              onClick={() => onSkipRequest(task)}
              style={{
                padding: '4px 10px', background: 'transparent',
                border: `1px solid ${C.dim}`, borderRadius: 6,
                color: C.muted, fontSize: 10, fontFamily: C.mono, cursor: 'pointer',
              }}
            >Skip</button>
          )}
        </div>
      ))}
      {maya.messages.length > 0 && (
        <MayaMessageBubble message={maya.messages[maya.messages.length - 1]} />
      )}
    </div>
  )
}

// ─── Stats Tab ───
function StatsTab({ maya }) {
  const { gamification: gam, unlockedAchievements, dayLog } = maya
  return (
    <div>
      <div style={{ padding: 16, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur, borderRadius: 14, border: `1px solid ${C.glassBorder}`, marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Level Progress</div>
        {LEVELS.map(lvl => {
          const isActive = gam.level?.level === lvl.level
          const isUnlocked = gam.totalXP >= lvl.xpRequired
          return (
            <div key={lvl.level} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
              opacity: isUnlocked ? 1 : 0.35,
            }}>
              <span style={{ fontSize: 18 }}>{lvl.icon}</span>
              <span style={{ fontSize: 12, flex: 1, color: isActive ? C.teal : C.text }}>
                {lvl.title}{isActive && ' ←'}
              </span>
              <span style={{ fontSize: 10, color: C.muted }}>{lvl.xpRequired} XP</span>
            </div>
          )
        })}
      </div>

      <div style={{ padding: 16, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur, borderRadius: 14, border: `1px solid ${C.glassBorder}`, marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Achievements</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ACHIEVEMENTS.map(a => {
            const unlocked = unlockedAchievements?.includes(a.id)
            return (
              <div key={a.id} style={{
                padding: '8px 10px',
                background: unlocked ? C.surfaceLight : 'transparent',
                border: `1px solid ${unlocked ? C.gold + '44' : C.dim}`,
                borderRadius: 8, opacity: unlocked ? 1 : 0.3,
                textAlign: 'center', minWidth: 80,
              }}>
                <div style={{ fontSize: 20 }}>{a.icon}</div>
                <div style={{ fontSize: 9, color: unlocked ? C.gold : C.muted, marginTop: 2 }}>{a.title}</div>
              </div>
            )
          })}
        </div>
      </div>

      {dayLog && dayLog.length > 0 && (
        <div style={{ padding: 16, background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur, borderRadius: 14, border: `1px solid ${C.glassBorder}` }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Today's Activity</div>
          {dayLog.map((entry, i) => (
            <div key={i} style={{
              fontSize: 11, color: C.muted, padding: '4px 0',
              borderBottom: i < dayLog.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{ color: entry.type === 'task_complete' ? C.green : entry.type === 'task_skip' ? C.red : C.blue }}>
                {entry.type === 'task_complete' ? '✓' : entry.type === 'task_skip' ? '✗' : '●'}
              </span>
              {' '}{entry.task || entry.type}{' '}
              {entry.xp ? `+${entry.xp} XP` : ''}
              <span style={{ float: 'right', fontSize: 10 }}>
                {new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Chat Tab ───
function ChatTab({ maya, chatInput, setChatInput, messagesEndRef }) {
  const navigate = useNavigate()
  const hasApiKey = !!getApiKey('anthropic')
  const handleSend = () => {
    if (!chatInput.trim()) return
    maya.sendMessage(chatInput.trim())
    setChatInput('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 540px)', minHeight: 320 }}>
      {!hasApiKey && (
        <div
          onClick={() => navigate('/profile')}
          style={{
            padding: '10px 12px', background: C.amber + '11',
            border: `1px solid ${C.amber}44`, borderRadius: 10,
            marginBottom: 10, cursor: 'pointer',
            fontSize: 11, color: C.amber, lineHeight: 1.5,
          }}
        >
          ⚠️ Maya is in <b>fallback mode</b> — replies are pre-written templates. Add a Claude API key in Profile to unlock real conversation.
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 12 }}>
        {maya.messages.length === 0 && (
          <div style={{ textAlign: 'center', color: C.dim, fontSize: 12, marginTop: 40 }}>
            Talk to Maya. Tap the 🎤 to use your voice.
          </div>
        )}
        {maya.messages.map((msg, i) => (
          <div key={i} style={{
            marginBottom: 10, display: 'flex',
            justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px',
              borderRadius: msg.type === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: msg.type === 'user' ? C.blue + '22' : msg.type === 'achievement' ? C.gold + '22' : C.surfaceLight,
              border: `1px solid ${msg.type === 'user' ? C.blue + '33' : msg.type === 'achievement' ? C.gold + '33' : C.border}`,
              color: msg.type === 'achievement' ? C.gold : C.text,
              fontSize: 13, lineHeight: 1.5,
            }}>
              {msg.type !== 'user' && msg.type !== 'achievement' && (
                <div style={{ fontSize: 9, color: C.teal, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Maya
                </div>
              )}
              {msg.text}
              <div style={{ fontSize: 9, color: C.dim, marginTop: 4 }}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '12px 0', borderTop: `1px solid ${C.border}` }}>
        <input
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Talk to Maya..." maxLength={2000}
          style={{
            flex: 1, padding: '10px 14px', background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 10,
            color: C.text, fontSize: 13, fontFamily: C.mono, outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          style={{
            padding: '10px 18px', background: C.teal, color: C.bg,
            border: 'none', borderRadius: 10, fontSize: 13,
            fontFamily: C.mono, fontWeight: 600, cursor: 'pointer',
          }}
        >Send</button>
      </div>
    </div>
  )
}

function MayaMessageBubble({ message }) {
  if (!message || message.type === 'user') return null
  return (
    <div style={{
      marginTop: 16, padding: '14px 16px',
      background: C.surfaceLight, borderRadius: 12,
      borderLeft: `3px solid ${C.teal}`,
    }}>
      <div style={{ fontSize: 9, color: C.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Maya says
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5 }}>{message.text}</div>
    </div>
  )
}

function DailyContent({ profile }) {
  const fact = useMemo(() => getDailyFact(profile), [profile])
  const riddle = useMemo(() => getDailyRiddle(), [])
  const quote = useMemo(() => getDailyQuote(profile), [profile])
  const [showAnswer, setShowAnswer] = useState(false)

  return (
    <div style={{
      padding: '10px 16px 14px',
      borderBottom: `1px solid ${C.glassBorder}`,
      background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
    }}>
      {/* Quote */}
      <div style={{ fontSize: 12, color: C.text, fontStyle: 'italic', lineHeight: 1.5, marginBottom: 6 }}>
        "{quote.text}"
      </div>
      <div style={{ fontSize: 9, color: C.muted, marginBottom: 10 }}>— {quote.by}</div>

      {/* Fun fact */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>{fact.icon}</span>
        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, flex: 1 }}>{fact.text}</div>
      </div>

      {/* Riddle */}
      <div style={{
        padding: 10, background: C.surfaceLight, borderRadius: 8,
        border: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 9, color: C.amber, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Brain riddle
        </div>
        <div style={{ fontSize: 11, color: C.text, lineHeight: 1.5 }}>{riddle.q}</div>
        <button
          onClick={() => setShowAnswer(!showAnswer)}
          style={{
            marginTop: 6, padding: '4px 10px', background: 'transparent',
            border: `1px solid ${C.border}`, borderRadius: 6,
            color: C.muted, fontSize: 9, fontFamily: C.mono, cursor: 'pointer',
          }}
        >{showAnswer ? riddle.a : 'Reveal answer'}</button>
      </div>
    </div>
  )
}

function WeeklyChallenge() {
  const ch = useMemo(() => getActiveChallenge(), [])
  if (!ch) return null
  const pct = Math.min(100, Math.round((ch.progress / ch.target) * 100))
  return (
    <div style={{
      padding: '12px 16px',
      background: 'rgba(255,215,0,0.04)',
      backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      borderBottom: `1px solid ${C.glassBorder}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ fontSize: 24 }}>{ch.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, color: C.gold, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Weekly challenge {ch.completed ? '· DONE' : ''}
          </div>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 2 }}>{ch.title}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{ch.desc} · {ch.xp} XP</div>
          <div style={{ height: 5, background: C.dim, borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: ch.completed ? C.gold : `linear-gradient(90deg, ${C.gold}, ${C.amber})`,
              transition: 'width 400ms',
            }} />
          </div>
          <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>{ch.progress}/{ch.target}</div>
        </div>
      </div>
    </div>
  )
}

function NavRow({ navigate, profile }) {
  const [showMore, setShowMore] = useState(false)
  const { primary, overflow } = useMemo(
    () => getSmartNav({ profile }),
    [profile]
  )
  const go = (route) => { trackVisit(route); navigate(route) }

  return (
    <>
      <div style={{
        display: 'flex', gap: 8, padding: '10px 16px',
        overflowX: 'auto', borderBottom: `1px solid ${C.glassBorder}`,
        background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      }}>
        {primary.map(it => (
          <button
            key={it.to}
            onClick={() => go(it.to)}
            style={{
              flex: '0 0 auto', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 4,
              padding: '8px 12px', minWidth: 60,
              background: C.surfaceLight, border: `1px solid ${C.glassBorder}`,
              borderRadius: 14, color: C.text, fontFamily: C.mono, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ fontSize: 18 }}>{it.icon}</div>
            <div style={{ fontSize: 9, color: C.muted }}>{it.label}</div>
          </button>
        ))}
        <button
          onClick={() => setShowMore(true)}
          style={{
            flex: '0 0 auto', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 4,
            padding: '8px 12px', minWidth: 60,
            background: 'rgba(167,139,250,0.10)', border: `1px solid rgba(167,139,250,0.35)`,
            borderRadius: 14, color: C.text, fontFamily: C.mono, cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 18 }}>⋯</div>
          <div style={{ fontSize: 9, color: C.purple }}>More</div>
        </button>
      </div>

      {showMore && (
        <div
          onClick={() => setShowMore(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480, maxHeight: '70vh',
              background: '#12121e', borderTop: `1px solid ${C.glassBorder}`,
              borderTopLeftRadius: 20, borderTopRightRadius: 20,
              padding: 16, overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontFamily: C.display, fontSize: 18, color: C.teal, letterSpacing: 2 }}>ALL TOOLS</div>
              <button
                onClick={() => setShowMore(false)}
                style={{
                  background: 'transparent', border: 'none', color: C.muted,
                  fontSize: 18, cursor: 'pointer',
                }}
              >✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {overflow.map(it => (
                <button
                  key={it.to}
                  onClick={() => { go(it.to); setShowMore(false) }}
                  style={{
                    padding: 12, background: C.surfaceLight,
                    border: `1px solid ${C.glassBorder}`, borderRadius: 12,
                    color: C.text, fontFamily: C.mono, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}
                >
                  <div style={{ fontSize: 22 }}>{it.icon}</div>
                  <div style={{ fontSize: 9, color: C.muted }}>{it.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ForYouCard({ navigate, profile, gamification }) {
  const insight = useMemo(
    () => getPersonalInsight({ profile, gamification }),
    [profile, gamification]
  )
  if (!insight) return null
  return (
    <div
      onClick={() => navigate(insight.action)}
      style={{
        margin: '10px 16px 0',
        padding: 14,
        background: `linear-gradient(135deg, ${insight.color}18, rgba(255,255,255,0.04))`,
        border: `1px solid ${insight.color}55`,
        borderRadius: 14,
        backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
        display: 'flex', alignItems: 'center', gap: 14,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 26 }}>{insight.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 9, color: insight.color, textTransform: 'uppercase',
          letterSpacing: 2, marginBottom: 3, fontWeight: 700,
        }}>
          For You
        </div>
        <div style={{ fontSize: 13, color: C.text, fontWeight: 700, lineHeight: 1.3 }}>
          {insight.headline}
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>
          {insight.sub}
        </div>
      </div>
      <div style={{ fontSize: 16, color: insight.color, opacity: 0.7 }}>→</div>
    </div>
  )
}

function SuggestionCard({ navigate, maya }) {
  const s = useMemo(() => getSuggestion({
    tasks: maya.tasks,
    gamification: maya.gamification,
    todayMood: maya.todayMood,
    profile: maya.profile,
  }), [maya.tasks, maya.gamification, maya.todayMood, maya.profile])
  if (!s) return null
  return (
    <div
      onClick={() => navigate(s.action)}
      style={{
        padding: '12px 16px',
        background: 'rgba(167,139,250,0.05)',
        backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
        borderBottom: `1px solid ${C.glassBorder}`,
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 22 }}>{s.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: C.purple, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 }}>
          Maya suggests
        </div>
        <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{s.title}</div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{s.sub}</div>
      </div>
      <div style={{ fontSize: 14, color: C.muted }}>→</div>
    </div>
  )
}

function SmartCTAs({ navigate }) {
  const hour = new Date().getHours()
  const memStats = getMemoryStats()
  const isMorning = hour >= 5 && hour < 11
  const isEvening = hour >= 18 && hour < 23

  const ctas = []
  if (isMorning) ctas.push({ icon: '☀️', text: 'Morning ritual', sub: 'Set the day', go: '/ritual?mode=morning', color: '#FFA500' })
  if (isEvening) ctas.push({ icon: '🌙', text: 'Evening wrap', sub: 'Reflect & wrap', go: '/ritual?mode=evening', color: '#A78BFA' })
  if (memStats.dueToday > 0) ctas.push({ icon: '🧠', text: `${memStats.dueToday} concept${memStats.dueToday > 1 ? 's' : ''} due`, sub: 'Quick memory drill', go: '/memory', color: '#7db8e8' })
  ctas.push({ icon: '📈', text: 'Insights', sub: 'Weekly trends', go: '/insights', color: C.teal })

  if (ctas.length === 0) return null

  return (
    <div style={{
      padding: '8px 16px 14px',
      borderBottom: `1px solid ${C.glassBorder}`,
      background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      display: 'flex', gap: 8, overflowX: 'auto',
    }}>
      {ctas.map((c, i) => (
        <button
          key={i}
          onClick={() => navigate(c.go)}
          style={{
            flex: '0 0 auto',
            padding: '10px 14px',
            background: c.color + '15',
            border: `1px solid ${c.color}55`,
            borderRadius: 12,
            color: C.text,
            fontFamily: C.mono,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 0,
          }}
        >
          <div style={{ fontSize: 18 }}>{c.icon}</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: c.color, fontWeight: 700 }}>{c.text}</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{c.sub}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

function LessonCTA({ navigate }) {
  const lessons = loadLessonHistory()
  const today = new Date().toISOString().slice(0, 10)
  const todayLessons = lessons.filter(l => l.startedAt?.startsWith(today))
  const lastLesson = lessons[0]

  return (
    <div style={{
      padding: '14px 16px',
      background: 'rgba(45,212,191,0.04)',
      backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      borderBottom: `1px solid ${C.glassBorder}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, color: C.teal, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 }}>
            Maya's signature
          </div>
          <div style={{ fontSize: 14, color: C.text, fontWeight: 600, lineHeight: 1.3 }}>
            Sit through a lesson with me
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
            {todayLessons.length > 0
              ? `${todayLessons.length} lesson${todayLessons.length > 1 ? 's' : ''} today · last: ${lastLesson?.subject}`
              : lastLesson
                ? `Last lesson: ${lastLesson.subject} (${lastLesson.durationMin}m)`
                : "I'll listen and quiz you after"}
          </div>
        </div>
        <button
          onClick={() => navigate('/lesson')}
          style={{
            padding: '12px 16px',
            background: C.teal,
            color: C.bg,
            border: 'none',
            borderRadius: 12,
            fontSize: 13,
            fontFamily: C.mono,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            boxShadow: `0 4px 16px ${C.teal}44`,
          }}
        >🎙 Start</button>
      </div>
    </div>
  )
}

function StatBox({ label, value, sub, color }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '10px 4px',
      background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      borderRadius: 14, border: `1px solid ${C.glassBorder}`,
      transition: 'all 0.3s ease',
    }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || C.text, lineHeight: 1.2, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{sub}</div>}
    </div>
  )
}

function IconBtn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32, height: 32, borderRadius: 8,
        border: `1px solid ${C.border}`, background: 'transparent',
        color: C.muted, fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >{children}</button>
  )
}

function MorningBriefCard({ tasks, navigate }) {
  const brief = useMemo(() => getMorningBrief({ tasks }), [tasks])
  const [dismissed, setDismissed] = useState(false)
  if (!brief || dismissed) return null

  const dismiss = () => {
    dismissMorningBrief()
    setDismissed(true)
  }

  return (
    <div style={{
      margin: '10px 16px 0',
      padding: 16,
      background: `linear-gradient(135deg, rgba(255,165,0,0.16), rgba(167,139,250,0.10))`,
      border: `1px solid rgba(255,165,0,0.35)`,
      borderRadius: 16,
      backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      position: 'relative',
    }}>
      <button
        onClick={dismiss}
        style={{
          position: 'absolute', top: 8, right: 8,
          background: 'transparent', border: 'none',
          color: C.muted, fontSize: 14, cursor: 'pointer',
          width: 24, height: 24,
        }}
        title="Dismiss"
      >✕</button>
      <div style={{ fontSize: 9, color: '#FFA500', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>
        ☀ Morning brief
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 8 }}>
        {brief.greeting}
      </div>
      {brief.yesterdayWin && (
        <div style={{ fontSize: 11, color: C.green, marginBottom: 6 }}>
          ✓ Yesterday: {brief.yesterdayWin}
        </div>
      )}
      <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 6 }}>
        <span style={{ color: C.purple, fontWeight: 700 }}>Today:</span> {brief.focus}
      </div>
      <div style={{
        marginTop: 10, paddingTop: 10, borderTop: `1px solid rgba(255,255,255,0.08)`,
        fontSize: 12, color: C.text, fontStyle: 'italic', lineHeight: 1.4,
      }}>
        "{brief.mayaLine}"
      </div>
      {brief.today.firstTask && (
        <button
          onClick={() => navigate('/')}
          style={{
            marginTop: 12, padding: '8px 14px',
            background: '#FFA500', color: '#0a0a14',
            border: 'none', borderRadius: 10,
            fontSize: 12, fontFamily: C.mono, fontWeight: 700,
            cursor: 'pointer',
          }}
        >Start: {brief.today.firstTask} →</button>
      )}
    </div>
  )
}

function NextCompWidget({ navigate }) {
  const comps = useMemo(() => {
    try {
      const v = JSON.parse(localStorage.getItem('maya_competitions'))
      return Array.isArray(v) ? v : []
    } catch { return [] }
  }, [])
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = comps.filter(c => c && typeof c.date === 'string' && c.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const next = upcoming[0]
  if (!next) return null

  const daysLeft = Math.ceil((new Date(next.date) - new Date(today)) / 86400000)
  const catIcons = { math: '🧮', piano: '🎹', tennis: '🎾', coding: '💻', speech: '🎤', other: '🏅' }
  const urgentColor = daysLeft <= 7 ? C.red : daysLeft <= 21 ? C.amber : C.teal

  return (
    <div
      onClick={() => navigate('/competitions')}
      style={{
        padding: '12px 16px',
        background: `rgba(255,215,0,0.04)`,
        backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
        borderBottom: `1px solid ${C.glassBorder}`,
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: urgentColor + '15', border: `1px solid ${urgentColor}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: C.display, fontSize: 22, color: urgentColor,
      }}>{daysLeft}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9, color: C.gold, textTransform: 'uppercase', letterSpacing: 1.5 }}>
          Next competition
        </div>
        <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginTop: 2 }}>
          {catIcons[next.category] || '🏅'} {next.name}
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
          {next.date} · {daysLeft === 0 ? 'TODAY' : `${daysLeft} days away`}
        </div>
      </div>
      <div style={{ fontSize: 14, color: C.muted }}>→</div>
    </div>
  )
}

function MoodPicker({ maya }) {
  const moods = [
    { emoji: '🔥', label: 'Fired up' },
    { emoji: '😊', label: 'Good' },
    { emoji: '😐', label: 'Meh' },
    { emoji: '😤', label: 'Frustrated' },
    { emoji: '😴', label: 'Tired' },
  ]
  return (
    <div style={{
      position: 'fixed', bottom: 70, left: 0, right: 0,
      maxWidth: 480, margin: '0 auto', padding: '12px 16px',
      background: C.surfaceLight, borderTop: `1px solid ${C.border}`, zIndex: 90,
    }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
        How are you feeling?
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        {moods.map(m => (
          <button
            key={m.label}
            onClick={() => maya.setMood(m.label)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center', padding: '4px 8px' }}
          >
            <div style={{ fontSize: 24 }}>{m.emoji}</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{m.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

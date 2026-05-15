/**
 * Maya's Notes — her evolving coaching log + correlation insights +
 * inside-jokes archive + freeze-token wallet. Combines four signals into
 * one screen so the kid (and parent) can see how Maya's model of him is
 * developing over time.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaya } from './context/MayaContext'
import { generateCoachingMemo, getLatestMemo, getAllMemos } from './agents/coachingMemo'
import { getCorrelationInsights } from './agents/correlation'
import { getQuizStats } from './agents/quizHistory'
import { getTokens, getFreezeHistory, MAX_TOKENS, spendToken } from './agents/streakFreeze'
import { loadProfile } from './lib/profile'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171', amber: '#fbbf24',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

export default function MayaNotes() {
  const navigate = useNavigate()
  const maya = useMaya()
  const profile = loadProfile()

  const [latestMemo, setLatestMemo] = useState(getLatestMemo())
  const [history, setHistory] = useState(getAllMemos())
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [tokens, setTokens] = useState(getTokens())
  const [freezeLog, setFreezeLog] = useState(getFreezeHistory())
  const [showFreezeHistory, setShowFreezeHistory] = useState(false)

  const quizStats = getQuizStats()
  const correlations = getCorrelationInsights({ dayLog: maya.dayLog })
  const insideJokes = Array.isArray(profile.insideJokes) ? profile.insideJokes : []

  const generate = async () => {
    setError('')
    setGenerating(true)
    try {
      const memo = await generateCoachingMemo({
        tasks: maya.tasks,
        gamification: maya.gamification,
        dayLog: maya.dayLog,
        weeklyDigest: maya.getWeeklyDigest ? maya.getWeeklyDigest() : null,
      })
      setLatestMemo(memo)
      setHistory(getAllMemos())
    } catch (err) {
      setError(err?.message || 'Could not generate memo.')
    } finally {
      setGenerating(false)
    }
  }

  const refreshTokens = () => {
    setTokens(getTokens())
    setFreezeLog(getFreezeHistory())
  }

  const spend = () => {
    if (tokens <= 0) return
    if (!confirm('Spend 1 freeze token to protect today\'s streak?')) return
    spendToken('manual')
    refreshTokens()
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: C.mono, paddingBottom: 100,
    }}>
      <Header onBack={() => navigate('/')} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        {/* Freeze Tokens */}
        <Section title="Streak Freeze Wallet">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
            <div style={{ fontSize: 36 }}>🧊</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: C.display, fontSize: 28, color: C.teal, lineHeight: 1 }}>
                {tokens} / {MAX_TOKENS}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                Earn 1 token per perfect day or 7-day streak. Spend to protect a missed day.
              </div>
            </div>
            <button onClick={spend} disabled={tokens <= 0} style={{
              padding: '10px 14px', borderRadius: 8,
              background: tokens > 0 ? C.teal : 'rgba(255,255,255,0.06)',
              color: tokens > 0 ? C.bg : C.muted,
              border: 'none', fontFamily: C.mono, fontWeight: 700, fontSize: 11,
              cursor: tokens > 0 ? 'pointer' : 'not-allowed', letterSpacing: 0.5,
            }}>
              Spend 1
            </button>
          </div>
          <button onClick={() => setShowFreezeHistory(s => !s)} style={ghostBtn}>
            {showFreezeHistory ? 'Hide' : 'Show'} token history ({freezeLog.length})
          </button>
          {showFreezeHistory && freezeLog.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {freezeLog.slice(0, 10).map((e, i) => (
                <div key={i} style={{
                  fontSize: 10, color: C.muted,
                  display: 'flex', justifyContent: 'space-between',
                  padding: '6px 8px', borderRadius: 6, background: C.surfaceLight,
                }}>
                  <span>{e.type === 'earned' ? '+1' : '-1'} · {e.source.replace(/_/g, ' ')}</span>
                  <span>{new Date(e.at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Coaching Memo */}
        <Section title="Maya's Coaching Memo" right={
          <button onClick={generate} disabled={generating} style={pillBtn}>
            {generating ? '...' : latestMemo ? '↻ REGEN' : '✨ GENERATE'}
          </button>
        }>
          {!latestMemo && !generating && (
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              Maya hasn't written a memo yet. Hit GENERATE to have her write up what she's learned about you this week — strengths, gaps, what she's going to push on next.
            </p>
          )}
          {generating && (
            <p style={{ fontSize: 11, color: C.muted }}>Maya is writing her memo...</p>
          )}
          {error && (
            <div style={{
              marginTop: 10, padding: 10, background: `${C.red}22`,
              border: `1px solid ${C.red}66`, borderRadius: 8, fontSize: 11, color: C.red,
            }}>{error}</div>
          )}
          {latestMemo && !generating && <MemoCard memo={latestMemo} />}
        </Section>

        {/* Correlation Insights */}
        <Section title="Patterns Maya's Noticing">
          {correlations.length === 0 ? (
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              Not enough data yet. Complete more tasks, do some quizzes, log moods — Maya needs a few weeks of signal to spot patterns.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {correlations.map((c, i) => (
                <div key={i} style={{
                  padding: 10, background: C.surfaceLight, borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <div style={{ fontSize: 18 }}>{c.icon}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, flex: 1 }}>{c.text}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Quiz Snapshot */}
        {quizStats.total > 0 && (
          <Section title="Quiz Snapshot">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
              <Stat label="ATTEMPTS" value={quizStats.total} color={C.text} />
              <Stat label="ACCURACY" value={`${quizStats.accuracy}%`} color={C.teal} />
              <Stat label="MISSES" value={quizStats.misses} color={C.amber} />
            </div>
            {quizStats.weakSpots.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Weak topics — Maya's drilling these
                </div>
                {quizStats.weakSpots.map((w, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between',
                    padding: '8px 10px', background: C.surfaceLight, borderRadius: 8,
                    marginBottom: 4, fontSize: 11,
                  }}>
                    <span>{w.topic}</span>
                    <span style={{ color: C.amber }}>{Math.round(w.hitRate * 100)}% · {w.attempts}x</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Inside Jokes */}
        <Section title={`Inside Jokes (${insideJokes.length})`}>
          {insideJokes.length === 0 ? (
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              No bits yet. When you laugh at something Maya says, she remembers — those land here as callbacks.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {insideJokes.slice(-8).reverse().map((j, i) => (
                <div key={i} style={{
                  padding: 10, background: C.surfaceLight, borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  fontSize: 11, lineHeight: 1.5, fontStyle: 'italic',
                }}>
                  {typeof j === 'string' ? `"${j}"` : `"${j.text || j.line || JSON.stringify(j).slice(0, 100)}"`}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Past Memos */}
        {history.length > 1 && (
          <Section title="Past Memos">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.slice(1, 6).map((m, i) => (
                <details key={i} style={{
                  padding: 10, background: C.surfaceLight, borderRadius: 10,
                  border: `1px solid ${C.border}`,
                }}>
                  <summary style={{ cursor: 'pointer', fontSize: 11, color: C.muted }}>
                    {m.weekId} · {m.headline?.slice(0, 60) || 'Memo'}
                  </summary>
                  <div style={{ marginTop: 10 }}>
                    <MemoCard memo={m} compact />
                  </div>
                </details>
              ))}
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
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2 }}>MAYA'S NOTES</div>
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
        <div style={{
          fontSize: 10, color: C.muted, textTransform: 'uppercase',
          letterSpacing: 1.5,
        }}>{title}</div>
        {right || null}
      </div>
      {children}
    </div>
  )
}

function MemoCard({ memo, compact = false }) {
  if (!memo) return null
  return (
    <div>
      {!compact && (
        <div style={{
          fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: C.text,
          lineHeight: 1.4, marginBottom: 10,
        }}>{memo.headline}</div>
      )}
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>FOR VASCO</div>
      <div style={{
        padding: 10, background: 'rgba(45,212,191,0.08)', borderRadius: 8,
        border: `1px solid ${C.teal}33`,
        fontSize: 12, lineHeight: 1.6, marginBottom: 12, fontStyle: 'italic',
      }}>"{memo.kidVersion}"</div>

      {memo.whatsImproving?.length > 0 && (
        <Block title="What's improving" icon="📈" items={memo.whatsImproving} color={C.teal} />
      )}
      {memo.whatsStuck?.length > 0 && (
        <Block title="What's stuck" icon="⚠️" items={memo.whatsStuck} color={C.amber} />
      )}
      {memo.weekPush && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>
            🎯 Next week, Maya's pushing on
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>{memo.weekPush}</div>
        </div>
      )}
      <div style={{ fontSize: 9, color: C.dim, marginTop: 12 }}>
        Written {new Date(memo.at).toLocaleDateString()}
      </div>
    </div>
  )
}

function Block({ title, icon, items, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>
        {icon} {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>
        {items.map((t, i) => (
          <li key={i} style={{ color: C.text }}>{t}</li>
        ))}
      </ul>
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

const pillBtn = {
  padding: '5px 10px', borderRadius: 6,
  background: 'transparent', border: `1px solid ${C.teal}`,
  color: C.teal, fontSize: 10, fontFamily: C.mono, fontWeight: 700,
  cursor: 'pointer', letterSpacing: 0.5,
}

const ghostBtn = {
  padding: '6px 10px', borderRadius: 6,
  background: 'transparent', border: `1px solid ${C.border}`,
  color: C.muted, fontSize: 10, fontFamily: C.mono, fontWeight: 700,
  cursor: 'pointer', letterSpacing: 0.5,
}

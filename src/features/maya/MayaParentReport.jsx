/**
 * Parent Weekly Report — the viral artifact.
 *
 * One-screen summary of the past 7 days of olympiad work, designed to be
 * screenshot-shared by tiger parents in WhatsApp groups. Footer carries the
 * marketing hook ("Get yours at mayaprep.com").
 *
 * Pulls data from lib/weeklyReport.js. Maya's commentary is generated via
 * Claude, with a graceful template fallback when there's no API key.
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildWeeklyReport, topicLabel, levelLabel } from './lib/weeklyReport'
import { loadProfile } from './lib/profile'
import { callClaude, canCallClaude, textFromResponse } from './lib/anthropicClient'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171',
  green: '#34D399', gold: '#FFD700', amber: '#FBBF24',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

function fallbackCommentary(report, profile) {
  const name = profile?.name || 'Your kid'
  if (report.isEmpty) {
    // Day 1 / pre-first-session: Maya speaks to the parent in her voice,
    // not stats. Sets expectation for what the weekly note becomes once
    // data flows.
    return `Here's what I'll be watching for ${name}: focus, energy, the small habits that compound. The numbers on this page fill in once they start, but the read on ${name} as a whole kid — what's working, what's heavy, where to push and where to back off — that's what I'll bring you every week. Hand them the device when you're ready.`
  }
  const acc = report.accuracy
  const tone = acc >= 80 ? 'in a real groove' : acc >= 60 ? 'finding the rhythm' : 'doing the heavy lifting'
  const delta = report.accuracyDelta
  const deltaStr = delta === null
    ? ''
    : delta > 0
      ? ` Accuracy lifted ${delta} points from last week — that's the curve we want.`
      : delta < 0
        ? ` Accuracy dipped ${Math.abs(delta)} points — usually means harder problems landed on the desk. Not a worry.`
        : ''
  const focus = report.weakestTopic ? ` Next week I'll lean ${name} into ${topicLabel(report.weakestTopic)}.` : ''
  return `${name} is ${tone} this week. ${report.correct} solved out of ${report.totalAttempts} attempts across ${report.activeDays} days.${deltaStr}${focus}`
}

export default function MayaParentReport() {
  const navigate = useNavigate()
  const profile = useMemo(() => loadProfile(), [])
  const report = useMemo(() => buildWeeklyReport(), [])
  const [commentary, setCommentary] = useState('')
  const [commentaryLoading, setCommentaryLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!report) return
    // Empty report (no attempts yet) — don't burn an API call to describe
    // the absence of data. The fallback already says the right thing.
    if (report.isEmpty || !canCallClaude()) {
      setCommentary(fallbackCommentary(report, profile))
      return
    }
    let cancelled = false
    setCommentaryLoading(true)
    callClaude({
      model: 'claude-sonnet-4-6',
      max_tokens: 250,
      system: `You are Maya — a personal coach a mother built for her own son, now coaching this parent's kid across everything they're trying to be great at (math, music, sport, school, mood, sleep). You speak parent-to-parent, in the founder's voice: warm, specific, a real read on the kid as a whole person, not a stats dump.

Write a 3-4 sentence weekly note to the parent about what you noticed this week. Use the kid's name. Talk about them like you actually know them — what's working, what feels heavy, where to push and where to back off. The numbers below are real signal, but they're not the point — the point is helping this parent see their kid more clearly.

NO markdown, NO emojis. Plain text only. End by naming what you'll focus on for them next week.`,
      messages: [{
        role: 'user',
        content: `Kid: ${profile?.name || 'student'}, age ${profile?.age ?? 'unknown'}.
Week ${report.range.label}.
Attempts: ${report.totalAttempts} (${report.correct} correct, ${report.accuracy}% accuracy).
Last week: ${report.lastWeekAttempts} attempts, ${report.accuracyDelta === null ? 'no comparison' : (report.accuracyDelta > 0 ? '+' : '') + report.accuracyDelta + ' point accuracy change'}.
Active days: ${report.activeDays}/7.
Streak: ${report.streak} days.
By level: ${Object.entries(report.byLevel).map(([l, v]) => `${levelLabel(l)} ${v.correct}/${v.attempts}`).join(', ') || 'n/a'}.
By topic: ${Object.entries(report.byTopic).map(([t, v]) => `${topicLabel(t)} ${v.correct}/${v.attempts}`).join(', ') || 'n/a'}.
Hardest cracked: ${report.hardestCracked ? `${levelLabel(report.hardestCracked.level)} difficulty ${report.hardestCracked.difficulty}/5 (${topicLabel(report.hardestCracked.topic)})` : 'none yet'}.
Stretch miss: ${report.stretchMiss ? `${levelLabel(report.stretchMiss.level)} difficulty ${report.stretchMiss.difficulty}/5 (${topicLabel(report.stretchMiss.topic)})` : 'none'}.
Weakest topic: ${report.weakestTopic ? topicLabel(report.weakestTopic) : 'unclear'}.

Write the parent debrief now.`,
      }],
    })
      .then(data => { if (!cancelled) setCommentary(textFromResponse(data)) })
      .catch(() => { if (!cancelled) setCommentary(fallbackCommentary(report, profile)) })
      .finally(() => { if (!cancelled) setCommentaryLoading(false) })
    return () => { cancelled = true }
  }, [report, profile])

  // Defensive — buildWeeklyReport always returns a shape now (isEmpty for
  // zero-attempt case), but guard against a future regression.
  if (!report) return null

  const isEmpty = report.isEmpty
  const accColor = isEmpty
    ? C.muted
    : report.accuracy >= 70 ? C.green : report.accuracy >= 50 ? C.amber : C.red
  const deltaPositive = report.accuracyDelta !== null && report.accuracyDelta > 0
  const deltaNegative = report.accuracyDelta !== null && report.accuracyDelta < 0

  const shareText = isEmpty
    ? `Just set up Maya for ${profile?.name || 'my kid'} — a personal coach a mother built for her own son. Math, music, sport, the whole kid in one assistant.\n\n` +
      `mayaprep.com`
    : `Maya's weekly note on ${profile?.name || 'my kid'} (${report.range.label})\n` +
      `${report.totalAttempts} problems, ${report.accuracy}% accuracy, ${report.streak}-day streak${report.accuracyDelta !== null ? `, ${report.accuracyDelta > 0 ? '+' : ''}${report.accuracyDelta} pts vs last week` : ''}.\n` +
      `The personal coach a mother built for her own son.\n\n` +
      `mayaprep.com`

  const onShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Maya Weekly Report', text: shareText })
        return
      }
    } catch {}
    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80 }}>
      <Header onBack={() => navigate('/')} onShare={onShare} copied={copied} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>

        {/* Report card frame — screenshot-friendly */}
        <div id="report-card" style={{
          background: 'linear-gradient(180deg, rgba(45,212,191,0.06) 0%, rgba(10,10,20,1) 60%)',
          border: `1px solid ${C.border}`, borderRadius: 16,
          padding: 20, marginBottom: 16,
        }}>
          {/* Brand */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: C.teal, textTransform: 'uppercase', letterSpacing: 2, fontWeight: 700 }}>
              {isEmpty ? 'Maya · Day 1 — before the first session' : 'Maya · Weekly note for you'}
            </div>
            <div style={{ fontSize: 9, color: C.muted }}>{report.range.label}</div>
          </div>

          {/* Kid name */}
          <div style={{ fontFamily: C.display, fontSize: 32, color: C.text, letterSpacing: 1, marginTop: 4 }}>
            {profile?.name || 'Your Student'}
          </div>

          {/* Hero metric */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontFamily: C.display, fontSize: 56, color: accColor, lineHeight: 1 }}>
              {isEmpty ? '—' : `${report.accuracy}%`}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                {isEmpty ? 'First session pending' : 'Accuracy'}
              </div>
              {isEmpty ? (
                <div style={{ fontSize: 11, marginTop: 2, color: C.teal }}>
                  Real numbers land after problem #1.
                </div>
              ) : report.accuracyDelta !== null && (
                <div style={{
                  fontSize: 11, marginTop: 2,
                  color: deltaPositive ? C.green : deltaNegative ? C.red : C.muted,
                }}>
                  {deltaPositive ? '↑' : deltaNegative ? '↓' : '·'} {report.accuracyDelta > 0 ? '+' : ''}{report.accuracyDelta} pts vs last week
                </div>
              )}
            </div>
          </div>

          {/* Quick metrics row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
            <MetricCell label="Problems" value={report.totalAttempts} color={C.teal} />
            <MetricCell label="Active days" value={`${report.activeDays}/7`} color={C.amber} />
            <MetricCell label="Streak" value={`${report.streak}d`} color={C.gold} />
          </div>

          {/* By level */}
          {Object.keys(report.byLevel).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                By Level
              </div>
              {Object.entries(report.byLevel).map(([lvl, v]) => (
                <BarRow key={lvl} label={levelLabel(lvl)} correct={v.correct} total={v.attempts} color={C.teal} />
              ))}
            </div>
          )}

          {/* By topic */}
          {Object.keys(report.byTopic).length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                By Topic
              </div>
              {Object.entries(report.byTopic).map(([t, v]) => (
                <BarRow key={t} label={topicLabel(t)} correct={v.correct} total={v.attempts} color={C.amber} />
              ))}
            </div>
          )}

          {/* Highlight + stretch */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
            <HighlightCell
              icon="🏆"
              label="Hardest cracked"
              detail={report.hardestCracked ? `${levelLabel(report.hardestCracked.level)} · ${topicLabel(report.hardestCracked.topic)} · ${report.hardestCracked.difficulty}/5` : '—'}
              color={C.gold}
            />
            <HighlightCell
              icon="🎯"
              label="Stretch focus"
              detail={report.stretchMiss ? `${levelLabel(report.stretchMiss.level)} · ${topicLabel(report.stretchMiss.topic)} · ${report.stretchMiss.difficulty}/5` : '—'}
              color={C.amber}
            />
          </div>

          {/* Maya commentary */}
          <div style={{
            marginTop: 16, padding: 14, background: C.surface,
            border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.teal}`,
            borderRadius: 10, fontSize: 12, lineHeight: 1.6, color: C.text,
            minHeight: 60,
          }}>
            <div style={{ fontSize: 9, color: C.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Maya's note
            </div>
            {commentaryLoading && !commentary ? 'Maya is writing your week\'s debrief...' : commentary}
          </div>

          {/* Footer / viral hook */}
          <div style={{
            marginTop: 18, paddingTop: 12, borderTop: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 9, color: C.muted,
          }}>
            <span>Built by Maya · the AI olympiad coach</span>
            <span style={{ color: C.teal, fontWeight: 700, letterSpacing: 1 }}>mayaprep.com</span>
          </div>
        </div>

        {/* Action buttons (outside card so they don't show in screenshot).
            On Day 1 the parent's primary verb is "hand the device over" —
            that's the moment Maya enters the kid's life. Share is secondary
            until there's an actual week of data worth sharing. After Day 1
            the primary verb flips: now the report is the artifact, the
            handoff is a quick "back to coach" link. */}
        {isEmpty ? (
          <>
            <button onClick={() => navigate('/')} style={btn}>
              Hand the device to {profile?.name || 'your kid'} →
            </button>
            <button onClick={onShare} style={{ ...secBtn, marginTop: 8 }}>
              {copied ? '✓ Copied — paste anywhere' : '↗ Share that you started'}
            </button>
          </>
        ) : (
          <>
            <button onClick={onShare} style={btn}>
              {copied ? '✓ Copied — paste anywhere' : '↗ Share this week\'s note'}
            </button>
            <button onClick={() => navigate('/')} style={{ ...secBtn, marginTop: 8 }}>
              Back to {profile?.name || 'your kid'}'s coach
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function MetricCell({ label, value, color }) {
  return (
    <div style={{
      padding: 10, background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontFamily: C.display, fontSize: 22, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function HighlightCell({ icon, label, detail, color }) {
  return (
    <div style={{
      padding: 10, background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</span>
      </div>
      <div style={{ fontSize: 11, color, marginTop: 4, lineHeight: 1.4 }}>{detail}</div>
    </div>
  )
}

function BarRow({ label, correct, total, color }) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.text, marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: C.muted }}>{correct}/{total} · {pct}%</span>
      </div>
      <div style={{ height: 6, background: C.dim, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 300ms' }} />
      </div>
    </div>
  )
}

function Header({ onBack, onShare, copied }) {
  return (
    <div style={{
      padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
      background: C.surface, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 0 }}>←</button>
      <div style={{ flex: 1, fontFamily: C.display, fontSize: 20, color: C.gold, letterSpacing: 2 }}>MAYA'S NOTE</div>
      {onShare && (
        <button onClick={onShare} style={{
          background: 'transparent', border: `1px solid ${C.border}`,
          color: copied ? C.green : C.teal, padding: '6px 10px', borderRadius: 8,
          fontSize: 10, fontFamily: C.mono, cursor: 'pointer',
        }}>
          {copied ? '✓ Copied' : 'Share'}
        </button>
      )}
    </div>
  )
}

const btn = {
  width: '100%', padding: '14px 20px', background: C.teal, color: C.bg,
  border: 'none', borderRadius: 12, fontSize: 13, fontFamily: C.mono,
  fontWeight: 700, cursor: 'pointer',
}
const secBtn = {
  width: '100%', padding: '12px 18px', background: 'transparent', color: C.muted,
  border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 12,
  fontFamily: C.mono, cursor: 'pointer',
}

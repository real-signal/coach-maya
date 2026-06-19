/**
 * Weekly report aggregator — pulls olympiad attempt data from localStorage,
 * computes parent-facing stats for the past 7 days, and exposes helpers for
 * the report view to render.
 *
 * Read-only: never writes back. Safe to call from any component.
 */
import { PROBLEMS } from './olympiadProblems'

const STATE_KEY = 'maya_olympiad'

function loadOlympiad() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) || { attempts: [], streak: 0 } }
  catch { return { attempts: [], streak: 0 } }
}

const PROBLEM_BY_ID = Object.fromEntries(PROBLEMS.map(p => [p.id, p]))

/** Returns {start, end} ISO dates for the last 7 calendar days (inclusive of today). */
export function lastSevenDays() {
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 6)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
  }
}

/**
 * Build the full weekly report payload from localStorage.
 *
 * Always returns a usable report — even on day zero with no attempts.
 * The viral loop depends on the parent being able to share *something*
 * the first time they open this; an empty card is the wedge equivalent
 * of a 404. Empty reports flag `isEmpty: true` so the view can soften
 * copy ("Day 1") instead of showing "0% accuracy".
 */
export function buildWeeklyReport() {
  const { attempts = [], streak = 0 } = loadOlympiad()

  const { start, end, label } = lastSevenDays()

  if (attempts.length === 0) {
    return {
      isEmpty: true,
      range: { start, end, label },
      streak: 0,
      totalAttempts: 0,
      correct: 0,
      accuracy: null,
      accuracyDelta: null,
      activeDays: 0,
      byLevel: {},
      byTopic: {},
      hardestCracked: null,
      stretchMiss: null,
      weakestTopic: null,
      lastWeekAttempts: 0,
    }
  }

  const thisWeek = attempts.filter(a => {
    const d = a.ts.slice(0, 10)
    return d >= start && d <= end
  })

  // Previous week for delta comparison
  const prevStart = new Date(start)
  prevStart.setDate(prevStart.getDate() - 7)
  const prevStartStr = prevStart.toISOString().slice(0, 10)
  const lastWeek = attempts.filter(a => {
    const d = a.ts.slice(0, 10)
    return d >= prevStartStr && d < start
  })

  const correct = thisWeek.filter(a => a.correct).length
  const accuracy = thisWeek.length > 0 ? Math.round((correct / thisWeek.length) * 100) : 0
  const lastWeekAcc = lastWeek.length > 0 ? Math.round((lastWeek.filter(a => a.correct).length / lastWeek.length) * 100) : null
  const accuracyDelta = lastWeekAcc !== null ? accuracy - lastWeekAcc : null

  // Per-level breakdown
  const byLevel = {}
  for (const a of thisWeek) {
    if (!byLevel[a.level]) byLevel[a.level] = { attempts: 0, correct: 0 }
    byLevel[a.level].attempts++
    if (a.correct) byLevel[a.level].correct++
  }

  // Per-topic breakdown (joining with problem bank)
  const byTopic = {}
  for (const a of thisWeek) {
    const p = PROBLEM_BY_ID[a.problemId]
    if (!p) continue
    if (!byTopic[p.topic]) byTopic[p.topic] = { attempts: 0, correct: 0 }
    byTopic[p.topic].attempts++
    if (a.correct) byTopic[p.topic].correct++
  }

  // Days active in window
  const activeDays = new Set(thisWeek.map(a => a.ts.slice(0, 10))).size

  // Highlight: hardest problem cracked
  const correctThisWeek = thisWeek
    .filter(a => a.correct)
    .map(a => PROBLEM_BY_ID[a.problemId])
    .filter(Boolean)
  const hardestCracked = correctThisWeek.length > 0
    ? correctThisWeek.reduce((a, b) => (b.difficulty > a.difficulty ? b : a))
    : null

  // Stretch: hardest problem missed (focus area)
  const missedThisWeek = thisWeek
    .filter(a => !a.correct)
    .map(a => PROBLEM_BY_ID[a.problemId])
    .filter(Boolean)
  const stretchMiss = missedThisWeek.length > 0
    ? missedThisWeek.reduce((a, b) => (b.difficulty > a.difficulty ? b : a))
    : null

  // Weakest topic (lowest accuracy with >= 2 attempts)
  const topicEntries = Object.entries(byTopic).filter(([, v]) => v.attempts >= 2)
  const weakestTopic = topicEntries.length > 0
    ? topicEntries.reduce((a, b) => (a[1].correct / a[1].attempts < b[1].correct / b[1].attempts ? a : b))[0]
    : null

  return {
    isEmpty: false,
    range: { start, end, label },
    streak,
    totalAttempts: thisWeek.length,
    correct,
    accuracy,
    accuracyDelta,
    activeDays,
    byLevel, // { amc8: {attempts, correct}, ... }
    byTopic, // { algebra: {attempts, correct}, ... }
    hardestCracked,
    stretchMiss,
    weakestTopic,
    lastWeekAttempts: lastWeek.length,
  }
}

/** Format topic key for display: "number_theory" → "Number Theory" */
export function topicLabel(key) {
  return key.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

export function levelLabel(key) {
  return key === 'amc8' ? 'AMC 8' : key === 'amc10' ? 'AMC 10' : key === 'amc12' ? 'AMC 12' : key
}

/**
 * Correlation Agent — surfaces non-obvious patterns Maya spots in the data.
 * Examples:
 *  - "You serve 15% better after 8+ hrs of sleep."
 *  - "Focus scores drop 22% on days you skip breakfast."
 *  - "Math accuracy is 30% higher in morning sessions than evening."
 *
 * Pure stats — no AI call needed. Reads from intelligence + quizHistory +
 * moods + dayLog logs already collected by other agents.
 */

import { getQuizStats } from './quizHistory'

const QUIZ_KEY = 'maya_quiz_history'
const INTEL_KEY = 'maya_intelligence'
const MOOD_KEY = 'maya_moods_history'

function loadJSON(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null')
    return raw == null ? fallback : raw
  } catch { return fallback }
}

function dateKey(iso) {
  return String(iso || '').slice(0, 10)
}

// ─── Hour-of-day × performance ───
// Compares quiz hit-rate before vs after noon. Needs ≥6 attempts in each
// bucket before reporting (statistical hygiene — small samples lie).
function hourOfDayQuizInsight() {
  const hist = loadJSON(QUIZ_KEY, [])
  if (!Array.isArray(hist) || hist.length < 12) return null
  const morning = { hit: 0, total: 0 }
  const evening = { hit: 0, total: 0 }
  for (const e of hist) {
    const h = new Date(e.at).getHours()
    const bucket = h < 13 ? morning : evening
    bucket.total++
    if (e.grade === 'hit') bucket.hit++
  }
  if (morning.total < 6 || evening.total < 6) return null
  const mRate = morning.hit / morning.total
  const eRate = evening.hit / evening.total
  const diff = mRate - eRate
  if (Math.abs(diff) < 0.12) return null
  const pct = Math.round(Math.abs(diff) * 100)
  return diff > 0
    ? { icon: '🌅', text: `Your quiz hit-rate is ${pct}% higher in the morning (before noon) than the evening. Hard subjects, schedule them earlier.`, type: 'time_of_day' }
    : { icon: '🌙', text: `Your quiz hit-rate is ${pct}% higher in the evening than the morning. Schedule sharper subjects later.`, type: 'time_of_day' }
}

// ─── Mood × focus ───
// Cross-references same-day mood with focus scores. "On 😴 days your focus
// score drops X%."
function moodFocusInsight() {
  const focusLogs = loadJSON(INTEL_KEY, {})?.focusScores || []
  const moodLogs = loadJSON(MOOD_KEY, [])
  if (!Array.isArray(focusLogs) || focusLogs.length < 6) return null
  if (!Array.isArray(moodLogs) || moodLogs.length < 5) return null

  const moodByDay = {}
  for (const m of moodLogs) {
    const d = dateKey(m.date || m.at)
    if (d) moodByDay[d] = m.mood || m
  }

  // Tag each focus log with the day's mood, group by mood
  const byMood = {}
  for (const f of focusLogs) {
    const d = dateKey(f.date)
    const mood = moodByDay[d]
    if (!mood) continue
    const moodId = typeof mood === 'string' ? mood : (mood.id || mood.label || 'unknown')
    if (!byMood[moodId]) byMood[moodId] = []
    byMood[moodId].push(f.score)
  }
  const moods = Object.entries(byMood)
    .filter(([, scores]) => scores.length >= 3)
    .map(([id, scores]) => ({ id, avg: Math.round(scores.reduce((s, x) => s + x, 0) / scores.length), n: scores.length }))
  if (moods.length < 2) return null
  moods.sort((a, b) => b.avg - a.avg)
  const top = moods[0]
  const bottom = moods[moods.length - 1]
  const gap = top.avg - bottom.avg
  if (gap < 15) return null
  return {
    icon: '🎚',
    text: `Focus score swings ${gap} points based on mood — peaks on "${top.id}" days (${top.avg}%), bottoms out on "${bottom.id}" (${bottom.avg}%). Mood is leading indicator.`,
    type: 'mood_focus',
  }
}

// ─── Subject × time-since-meal-or-sleep (proxy: hour of day vs subject) ───
// Cheap heuristic: which subject is the kid strongest on early vs late?
function bestTimeForSubject() {
  const intel = loadJSON(INTEL_KEY, {})
  const subjects = intel.subjectScores || {}
  const entries = Object.entries(subjects)
  if (entries.length < 1) return null
  const insights = []
  for (const [subject, scores] of entries) {
    if (!Array.isArray(scores) || scores.length < 6) continue
    const morning = scores.filter(s => new Date(s.date).getHours() < 13).map(s => s.score)
    const evening = scores.filter(s => new Date(s.date).getHours() >= 13).map(s => s.score)
    if (morning.length < 3 || evening.length < 3) continue
    const mAvg = morning.reduce((a, b) => a + b, 0) / morning.length
    const eAvg = evening.reduce((a, b) => a + b, 0) / evening.length
    const diff = mAvg - eAvg
    if (Math.abs(diff) < 8) continue
    insights.push({
      icon: '📊',
      text: diff > 0
        ? `${subject} scores avg ${Math.round(diff)} pts higher in the morning. Move ${subject} earlier in the day.`
        : `${subject} scores avg ${Math.round(-diff)} pts higher in the evening. Don't fight your rhythm.`,
      type: 'subject_timing',
    })
  }
  return insights[0] || null
}

// ─── Streak velocity ───
// Reads dayLog entries from maya_state (passed in) — counts completion rate
// across last 7 vs prior 7 days. Used by Maya to call out trajectory.
function streakVelocityInsight(dayLog = []) {
  if (!Array.isArray(dayLog) || dayLog.length < 8) return null
  const byDay = {}
  for (const e of dayLog) {
    if (e.type !== 'task_complete' && e.type !== 'task_skip') continue
    const d = dateKey(e.date || e.at || e.timestamp)
    if (!d) continue
    if (!byDay[d]) byDay[d] = { done: 0, skipped: 0 }
    if (e.type === 'task_complete') byDay[d].done++
    else byDay[d].skipped++
  }
  const days = Object.keys(byDay).sort()
  if (days.length < 8) return null
  const last7 = days.slice(-7)
  const prior7 = days.slice(-14, -7)
  if (prior7.length < 5) return null
  const rate = (subset) => {
    let done = 0, total = 0
    for (const d of subset) { done += byDay[d].done; total += byDay[d].done + byDay[d].skipped }
    return total > 0 ? done / total : 0
  }
  const recent = rate(last7)
  const prior = rate(prior7)
  const diff = recent - prior
  if (Math.abs(diff) < 0.1) return null
  const pct = Math.round(Math.abs(diff) * 100)
  return diff > 0
    ? { icon: '📈', text: `Completion rate up ${pct} points from last week. Don't ease off — that's how regressions start.`, type: 'velocity' }
    : { icon: '📉', text: `Completion rate down ${pct} points from last week. Maya's noticing. What changed?`, type: 'velocity' }
}

// ─── Weak-spot retest reminder ───
function weakSpotInsight() {
  const stats = getQuizStats()
  if (!stats?.weakSpots?.length) return null
  const top = stats.weakSpots[0]
  return {
    icon: '🎯',
    text: `Weakest topic: ${top.topic} — ${Math.round(top.hitRate * 100)}% hit rate across ${top.attempts} attempts. We're drilling this.`,
    type: 'weak_spot',
  }
}

/**
 * Top-level: returns array of all insights worth showing right now.
 * @param {object} ctx — { dayLog }
 */
function getCorrelationInsights(ctx = {}) {
  const all = [
    hourOfDayQuizInsight(),
    moodFocusInsight(),
    bestTimeForSubject(),
    streakVelocityInsight(ctx.dayLog || []),
    weakSpotInsight(),
  ].filter(Boolean)
  return all
}

export {
  getCorrelationInsights,
  hourOfDayQuizInsight,
  moodFocusInsight,
  bestTimeForSubject,
  streakVelocityInsight,
  weakSpotInsight,
}

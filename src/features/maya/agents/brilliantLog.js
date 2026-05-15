/**
 * Brilliant Log — companion logger for Brilliant.org sessions.
 *
 * Stores ONLY the kid's own data: course slug (factual identifier), self-
 * reported minutes, what clicked / what didn't (typed in kid's own words),
 * and an optional self-rated difficulty. No Brilliant content ingested.
 *
 * Also exposes a daily recommender that picks one course based on:
 *   - imminent comp topic match
 *   - recent quiz weak spots
 *   - variety (skip recently-logged courses)
 *   - difficulty matched to current streak energy
 */

import { getCatalog, getCourseById, getTopicsForKeyword } from '../lib/brilliantCatalog'
import { getQuizStats } from './quizHistory'

const LOG_KEY = 'maya_brilliant_log'
const STREAK_KEY = 'maya_brilliant_external_streak'
const MAX_ENTRIES = 200

function loadLog() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}
function saveLog(arr) {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(arr.slice(-MAX_ENTRIES))) } catch {}
}

function todayStr() { return new Date().toISOString().slice(0, 10) }

// Deterministic per-day jitter for the recommender — same kid + same day
// always sees the same pick. Hash courseId × date → small offset.
function seededJitter(seedStr) {
  let h = 2166136261
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Map to [0, 5)
  return ((h >>> 0) % 1000) / 200
}

/**
 * Log a Brilliant session.
 * @param {object} s — { courseId, minutes, clicked, stuck, rating }
 *   - clicked / stuck: kid's own words ("Bayes finally made sense")
 *   - rating: 1-5 self-rated difficulty (optional)
 */
function logSession(s = {}) {
  const log = loadLog()
  const entry = {
    courseId: String(s.courseId || '').slice(0, 50),
    minutes: Math.max(0, Math.min(180, Number(s.minutes) || 0)),
    clicked: String(s.clicked || '').slice(0, 500),
    stuck: String(s.stuck || '').slice(0, 500),
    rating: s.rating != null ? Math.max(1, Math.min(5, Number(s.rating))) : null,
    date: todayStr(),
    at: new Date().toISOString(),
  }
  log.push(entry)
  saveLog(log)
  return entry
}

function getSessions(limit = 50) {
  const log = loadLog()
  return log.slice(-limit).reverse()
}

/** Internal Brilliant-companion streak: consecutive days with ≥1 logged session */
function getInternalStreak() {
  const log = loadLog()
  if (!log.length) return 0
  const dates = new Set(log.map(e => e.date))
  let streak = 0
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    if (dates.has(d)) streak++
    else if (i === 0) continue   // today not logged yet → don't break
    else break
  }
  return streak
}

/** Kid-reported actual Brilliant streak (from their Brilliant profile) */
function getReportedStreak() {
  try {
    const raw = localStorage.getItem(STREAK_KEY)
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch { return 0 }
}
function setReportedStreak(n) {
  const v = Math.max(0, Math.min(9999, Number(n) || 0))
  try { localStorage.setItem(STREAK_KEY, String(v)) } catch {}
  return v
}

function getWeeklyStats() {
  const log = loadLog()
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
  const week = log.filter(e => e.date >= cutoff)
  const totalMin = week.reduce((s, e) => s + (e.minutes || 0), 0)
  const courses = new Set(week.map(e => e.courseId))
  return {
    sessions: week.length,
    minutes: totalMin,
    uniqueCourses: courses.size,
  }
}

/**
 * Pick today's Brilliant recommendation.
 * @param {object} ctx — { profile, comps }
 * @returns {{ course, reason }} or null if catalog empty
 */
function recommendForToday({ profile = {}, comps = [] } = {}) {
  const catalog = getCatalog()
  if (!catalog.length) return null
  const log = loadLog()
  const today = todayStr()

  // Already logged today? Then no new pick needed.
  if (log.some(e => e.date === today)) return null

  // Routes recently logged (last 4 days) — penalize for variety
  const recentCourseIds = new Set(
    log.filter(e => e.date >= new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10))
       .map(e => e.courseId)
  )

  // Pull weak-spot topics from quiz history
  const quiz = getQuizStats()
  const weakTopicTags = new Set()
  ;(quiz?.weakSpots || []).forEach(w => {
    getTopicsForKeyword(w.topic).forEach(t => weakTopicTags.add(t))
  })

  // Imminent comp topic tags
  const compTags = new Set()
  const todayD = today
  ;(Array.isArray(comps) ? comps : []).forEach(c => {
    if (!c?.date || c.date < todayD) return
    const days = Math.ceil((new Date(c.date) - new Date(todayD)) / 86400000)
    if (days <= 14) {
      const tags = getTopicsForKeyword(c.subject || c.name || '')
      tags.forEach(t => compTags.add(t))
    }
  })

  // Difficulty target — fresh streaks can handle harder material
  const streak = Number(profile.currentStreak || 0)
  const targetDifficulty = streak >= 7 ? 3 : streak >= 3 ? 2 : 1

  const scored = catalog.map(c => {
    let score = 0
    const reasons = []

    // Topic matches
    for (const t of c.topics) {
      if (compTags.has(t)) { score += 60; reasons.push('comp soon') }
      if (weakTopicTags.has(t)) { score += 45; reasons.push('weak spot') }
    }

    // Hobby match
    const hobbies = (profile.hobbies || []).map(h => String(h).toLowerCase())
    if (hobbies.some(h => c.topics.includes('math') && /math/.test(h))) score += 15

    // Variety
    if (recentCourseIds.has(c.id)) score -= 40

    // Difficulty fit
    score -= Math.abs(c.difficulty - targetDifficulty) * 8

    // Deterministic per-day jitter so picks vary day to day but stay stable
    // within a day (no flicker on re-render, no re-roll spam by the kid).
    score += seededJitter(`${c.id}|${today}`)

    // Penalize same-difficulty repeats more strongly than before
    const lastFew = log.slice(-3)
    if (lastFew.some(e => {
      const prev = catalog.find(x => x.id === e.courseId)
      return prev?.difficulty === c.difficulty
    })) score -= 10

    return { ...c, _score: score, _reasons: reasons }
  })

  scored.sort((a, b) => b._score - a._score)
  const top = scored[0]
  const reason = top._reasons.length
    ? `${top._reasons[0]} · ${top.minutes} min`
    : `variety pick · ${top.minutes} min`

  return { course: top, reason }
}

/**
 * Anti-gaming pass. Looks for impossible patterns. Never punishes —
 * just returns flags the UI can render so the kid sees Maya noticed.
 * Mirrors antiGaming.js philosophy: observe, don't punish.
 */
function getSuspicionFlags() {
  const log = loadLog()
  const flags = []
  const today = todayStr()
  const todays = log.filter(e => e.date === today)

  const todayMin = todays.reduce((s, e) => s + (e.minutes || 0), 0)
  if (todayMin > 180) {
    flags.push({ level: 'high', text: `${todayMin} min logged today — that's more than 3 hours. Sure?` })
  }
  if (todays.length >= 5) {
    flags.push({ level: 'med', text: `${todays.length} sessions logged today — quality over quantity.` })
  }

  // Three+ back-to-back >60 min entries in a single day = suspicious
  const big = todays.filter(e => (e.minutes || 0) >= 60)
  if (big.length >= 3) {
    flags.push({ level: 'med', text: `${big.length} sessions of 60+ min today — Maya's skeptical.` })
  }

  // Every recent log has no clicked/stuck text = drive-by logging
  const recent = log.slice(-7)
  if (recent.length >= 5 && recent.every(e => !e.clicked && !e.stuck)) {
    flags.push({ level: 'low', text: 'No notes on your last 5+ sessions. Where did your brain go?' })
  }

  return flags
}

function deleteSession(at) {
  const log = loadLog()
  const next = log.filter(e => e.at !== at)
  saveLog(next)
}

function clearLog() {
  try {
    localStorage.removeItem(LOG_KEY)
    localStorage.removeItem(STREAK_KEY)
  } catch {}
}

export {
  logSession,
  getSessions,
  getInternalStreak,
  getReportedStreak,
  setReportedStreak,
  getWeeklyStats,
  recommendForToday,
  getSuspicionFlags,
  deleteSession,
  clearLog,
  getCourseById,
}

/**
 * Parent Compass — preset specialization tracks.
 *
 * Each track describes a competitive/academic pathway with recommended daily
 * focuses. The parent picks a track and Maya treats its focuses as priority
 * for the kid. Custom track lets parents define their own.
 *
 * Focus shape: { id, label, type, minutes, days }
 *   - type maps to task templates in scheduleGenerator.js where possible
 *   - days uses ISO day-of-week (0 = Sunday, 6 = Saturday)
 */

export const COMPASS_TRACKS = [
  {
    id: 'math_olympiad',
    label: 'Math Olympiad',
    emoji: '📐',
    blurb: 'AMC / AIME / Olympiad pathway — daily problem sets + theory.',
    suggestedNorthStar: 'Solve 5 AMC10 problems per day with 80%+ accuracy',
    suggestedFocuses: [
      { id: 'mo_drill', label: 'AMC drill set (5 problems)', type: 'maths', minutes: 30, days: [1,2,3,4,5] },
      { id: 'mo_theory', label: 'Theory review (one technique)', type: 'maths', minutes: 20, days: [1,3,5] },
      { id: 'mo_postmortem', label: 'Mistake postmortem journal', type: 'reflection', minutes: 10, days: [2,4,6] },
    ],
  },
  {
    id: 'competition_piano',
    label: 'Competition Piano',
    emoji: '🎹',
    blurb: 'ABRSM / Trinity grade 6+ — repertoire + technique + theory.',
    suggestedNorthStar: 'Performance-ready run of competition piece by Sunday',
    suggestedFocuses: [
      { id: 'pi_rep', label: 'Repertoire (full passes)', type: 'piano', minutes: 30, days: [1,2,3,4,5,6,0] },
      { id: 'pi_tech', label: 'Scales + arpeggios', type: 'piano', minutes: 15, days: [1,2,3,4,5] },
      { id: 'pi_sight', label: 'Sight-reading new piece', type: 'piano', minutes: 10, days: [2,4,6] },
    ],
  },
  {
    id: 'itf_tennis',
    label: 'ITF Tennis',
    emoji: '🎾',
    blurb: 'Junior ITF pathway — court time + fitness + match prep.',
    suggestedNorthStar: 'Win one practice set vs higher-ranked player this week',
    suggestedFocuses: [
      { id: 'te_court', label: 'On-court session', type: 'tennis', minutes: 60, days: [1,3,5] },
      { id: 'te_fitness', label: 'Speed + footwork', type: 'exercise', minutes: 30, days: [2,4] },
      { id: 'te_film', label: 'Match film review', type: 'reflection', minutes: 15, days: [6] },
    ],
  },
  {
    id: 'coding_olympiad',
    label: 'Coding / CS Olympiad',
    emoji: '💻',
    blurb: 'USACO / IOI / IOI pathway — daily algorithmic problems.',
    suggestedNorthStar: 'Promote to next USACO division by next contest',
    suggestedFocuses: [
      { id: 'co_solve', label: 'Solve 2 problems (timed)', type: 'homework', minutes: 45, days: [1,2,3,4,5] },
      { id: 'co_editorial', label: 'Read editorial of one missed problem', type: 'reading', minutes: 15, days: [2,4,6] },
      { id: 'co_contest', label: 'Mock contest', type: 'homework', minutes: 90, days: [6] },
    ],
  },
  {
    id: 'standardized_testing',
    label: 'Standardized Testing',
    emoji: '📝',
    blurb: 'SAT / ACT / IB / AP — pacing + content review + section drills.',
    suggestedNorthStar: 'Hit target section score on next full practice test',
    suggestedFocuses: [
      { id: 'st_section', label: 'Timed section drill', type: 'homework', minutes: 30, days: [1,2,3,4,5] },
      { id: 'st_review', label: 'Error log review', type: 'revision', minutes: 15, days: [1,3,5] },
      { id: 'st_full', label: 'Full practice test', type: 'homework', minutes: 180, days: [6] },
    ],
  },
  {
    id: 'creative_writing',
    label: 'Creative Writing',
    emoji: '✍️',
    blurb: 'Competition essays / short fiction / scholastic submissions.',
    suggestedNorthStar: 'First draft of one short piece complete by Sunday',
    suggestedFocuses: [
      { id: 'cw_write', label: 'Write 500 words', type: 'writing', minutes: 30, days: [1,2,3,4,5] },
      { id: 'cw_read', label: 'Read & annotate one model piece', type: 'reading', minutes: 20, days: [2,4] },
      { id: 'cw_edit', label: 'Edit pass on this week\'s draft', type: 'writing', minutes: 30, days: [6] },
    ],
  },
  {
    id: 'custom',
    label: 'Custom Track',
    emoji: '⭐',
    blurb: 'Define your own specialization — no presets, you own the focuses.',
    suggestedNorthStar: '',
    suggestedFocuses: [],
  },
]

export function getTrack(id) {
  return COMPASS_TRACKS.find(t => t.id === id) || null
}

export const FOCUS_TYPES = [
  { id: 'maths',      label: 'Maths',       emoji: '📐' },
  { id: 'reading',    label: 'Reading',     emoji: '📖' },
  { id: 'writing',    label: 'Writing',     emoji: '✍️' },
  { id: 'science',    label: 'Science',     emoji: '🔬' },
  { id: 'homework',   label: 'Homework',    emoji: '📚' },
  { id: 'piano',      label: 'Music',       emoji: '🎹' },
  { id: 'tennis',     label: 'Tennis',      emoji: '🎾' },
  { id: 'exercise',   label: 'Exercise',    emoji: '🏃' },
  { id: 'revision',   label: 'Revision',    emoji: '📚' },
  { id: 'reflection', label: 'Reflection',  emoji: '🪞' },
]

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Helper: return today's compass focuses (filtered by day-of-week).
 * Returns [] if no compass set up.
 */
export function focusesForToday(parentCompass) {
  if (!parentCompass || !Array.isArray(parentCompass.focuses)) return []
  const today = new Date().getDay() // 0 = Sun
  return parentCompass.focuses.filter(f => {
    if (!Array.isArray(f.days) || f.days.length === 0) return true
    return f.days.includes(today)
  })
}

/**
 * Compass log — separate from gamification, lives in maya_compass_log.
 * Tracks which compass focuses the kid checked off each day.
 * Shape: { '2026-05-20': { 'mo_drill': true, 'mo_theory': false } }
 */
const LOG_KEY = 'maya_compass_log'

export function loadCompassLog() {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveCompassLog(log) {
  try {
    // Keep last 90 days only
    const dates = Object.keys(log).sort()
    if (dates.length > 90) {
      const trimmed = {}
      for (const d of dates.slice(-90)) trimmed[d] = log[d]
      localStorage.setItem(LOG_KEY, JSON.stringify(trimmed))
      return trimmed
    }
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
    return log
  } catch { return log }
}

export function todayDateKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function toggleCompassFocus(focusId) {
  const log = loadCompassLog()
  const key = todayDateKey()
  if (!log[key]) log[key] = {}
  log[key][focusId] = !log[key][focusId]
  return saveCompassLog(log)
}

/**
 * Compute compass adherence for the last N days.
 * Returns { totalScheduled, totalCompleted, pct }.
 */
export function adherenceLastNDays(parentCompass, n = 7) {
  if (!parentCompass || !Array.isArray(parentCompass.focuses) || parentCompass.focuses.length === 0) {
    return { totalScheduled: 0, totalCompleted: 0, pct: null }
  }
  const log = loadCompassLog()
  let scheduled = 0
  let completed = 0
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const dow = d.getDay()
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const dayLog = log[key] || {}
    for (const f of parentCompass.focuses) {
      const active = !Array.isArray(f.days) || f.days.length === 0 || f.days.includes(dow)
      if (active) {
        scheduled += 1
        if (dayLog[f.id]) completed += 1
      }
    }
  }
  return {
    totalScheduled: scheduled,
    totalCompleted: completed,
    pct: scheduled > 0 ? Math.round((completed / scheduled) * 100) : null,
  }
}

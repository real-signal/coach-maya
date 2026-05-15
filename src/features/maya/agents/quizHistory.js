/**
 * Quiz History — logs every Q+A from drill sessions so we can:
 *  1. Resurface flunked questions later (spaced re-test, mixed into reviews)
 *  2. Show the kid what he's mastered vs still wobbly on
 *  3. Feed weekly insights ("you keep stumbling on integration by parts")
 *
 * Self-graded heuristic: we tag answers as 'hit' / 'miss' / 'partial' based on
 * a tiny rule set (length, hedge words, "i don't know"). It's not perfect —
 * the real signal will come later from Claude's reaction text, which we
 * also store verbatim so a future pass can re-grade.
 */

const HISTORY_KEY = 'maya_quiz_history'
const MAX_ENTRIES = 500

function nowISO() { return new Date().toISOString() }

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

function saveHistory(arr) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(-MAX_ENTRIES)))
  } catch {}
}

// Rough quality heuristic on the kid's free-text answer. Returns
// 'miss' | 'partial' | 'hit'. Cheap signal; refined later by Maya's reaction.
function gradeAnswer(answer, mayaReaction = '') {
  const a = String(answer || '').trim().toLowerCase()
  if (!a || a.length < 4) return 'miss'
  if (/^(idk|i don'?t know|no idea|pass|skip|not sure|dunno)\b/.test(a)) return 'miss'

  // Maya's reaction text gives us a stronger signal when present
  const r = String(mayaReaction || '').toLowerCase()
  if (/\b(wrong|no\.|not quite|incorrect|missed|hand-wav|buzzword)\b/.test(r)) return 'miss'
  if (/\b(partial|close|kind of|almost|on the right track|missing)\b/.test(r)) return 'partial'
  if (/\b(right|exactly|sharp|solid|nailed|correct|yes\b)/.test(r)) return 'hit'

  // No reaction signal — fall back on answer length / hedge density
  const hedges = (a.match(/\b(maybe|i think|probably|sort of|kind of|i guess)\b/g) || []).length
  if (hedges >= 2) return 'partial'
  if (a.length < 20) return 'partial'
  return 'hit'
}

/**
 * Log a single quiz Q+A turn.
 * @param {object} entry
 *   - topic: string
 *   - question: string
 *   - answer: string  (the kid's reply)
 *   - mayaReaction: string  (the coach response; used for heuristic grading)
 *   - sessionId: string (groups turns from one drill)
 *   - origin: 'chat' | 'notebook'
 */
function logQuizTurn({ topic, question, answer, mayaReaction = '', sessionId = '', origin = 'chat' }) {
  if (!question || !answer) return null
  const hist = loadHistory()
  const grade = gradeAnswer(answer, mayaReaction)
  const entry = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    topic: String(topic || 'general').slice(0, 80),
    question: String(question).slice(0, 600),
    answer: String(answer).slice(0, 600),
    mayaReaction: String(mayaReaction).slice(0, 600),
    grade,
    sessionId,
    origin,
    at: nowISO(),
    reviewCount: 0,
    lastReviewedAt: null,
  }
  hist.push(entry)
  saveHistory(hist)
  return entry
}

// Surface questions to re-test:
//   - misses are re-test eligible after 2 days
//   - partials after 4 days
//   - hits don't come back unless the kid asks
// Returns up to `n` distinct questions, oldest-eligible first.
function getRetestQueue(n = 3) {
  const hist = loadHistory()
  const now = Date.now()
  const eligible = hist.filter(e => {
    if (e.grade === 'hit') return false
    const last = e.lastReviewedAt ? Date.parse(e.lastReviewedAt) : Date.parse(e.at)
    const daysSince = (now - last) / (24 * 60 * 60 * 1000)
    const wait = e.grade === 'miss' ? 2 : 4
    return daysSince >= wait
  })
  // De-dupe by question text — only keep the most recent attempt per Q
  const seen = new Map()
  for (const e of eligible) {
    const key = e.question.toLowerCase().slice(0, 80)
    const prev = seen.get(key)
    if (!prev || Date.parse(e.at) > Date.parse(prev.at)) seen.set(key, e)
  }
  return Array.from(seen.values())
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .slice(0, n)
}

// Mark a re-test entry as reviewed (called when the kid encounters it again).
function markReviewed(entryId, newGrade) {
  const hist = loadHistory()
  const idx = hist.findIndex(e => e.id === entryId)
  if (idx < 0) return
  hist[idx] = {
    ...hist[idx],
    reviewCount: (hist[idx].reviewCount || 0) + 1,
    lastReviewedAt: nowISO(),
    grade: newGrade || hist[idx].grade,
  }
  saveHistory(hist)
}

// Aggregate stats for the insights page / coaching memo
function getQuizStats() {
  const hist = loadHistory()
  const total = hist.length
  if (!total) return { total: 0, hits: 0, partials: 0, misses: 0, accuracy: 0, byTopic: {}, weakSpots: [] }
  const hits = hist.filter(e => e.grade === 'hit').length
  const partials = hist.filter(e => e.grade === 'partial').length
  const misses = hist.filter(e => e.grade === 'miss').length
  const byTopic = {}
  for (const e of hist) {
    if (!byTopic[e.topic]) byTopic[e.topic] = { hits: 0, partials: 0, misses: 0 }
    byTopic[e.topic][e.grade + 's']++
  }
  // Weakest topics: lowest hit-rate among those with ≥3 attempts
  const weakSpots = Object.entries(byTopic)
    .map(([topic, t]) => {
      const n = t.hits + t.partials + t.misses
      return { topic, attempts: n, hitRate: n > 0 ? t.hits / n : 0 }
    })
    .filter(t => t.attempts >= 3 && t.hitRate < 0.6)
    .sort((a, b) => a.hitRate - b.hitRate)
    .slice(0, 5)
  return {
    total,
    hits, partials, misses,
    accuracy: Math.round((hits / total) * 100),
    byTopic,
    weakSpots,
  }
}

function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY) } catch {}
}

export {
  logQuizTurn,
  getRetestQueue,
  markReviewed,
  getQuizStats,
  clearHistory,
  gradeAnswer,
}

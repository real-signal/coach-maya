/**
 * Coaching Memo — Maya writes her own evolving notes about the kid.
 *
 * Once a week (or on-demand), Maya generates a private memo summarizing what
 * she's learned about how Vasco actually works: what's improving, what's
 * sticking, what excuses repeat, where she's going to push harder.
 *
 * The memo is shown to the parent (and to the kid in a softened version)
 * in Profile → Maya's Notes. Lets you see her evolving model.
 *
 * Stored separately from quiz/intelligence data so it can be pruned/inspected
 * without losing the underlying signal.
 */

import { getApiKey } from '../lib/secrets'
import { loadProfile } from '../lib/profile'
import { getIntelSummary } from './intelligence'
import { getQuizStats } from './quizHistory'

const MEMO_KEY = 'maya_coaching_memos'
const MAX_MEMOS = 20

function loadMemos() {
  try {
    const raw = JSON.parse(localStorage.getItem(MEMO_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}

function saveMemos(arr) {
  try { localStorage.setItem(MEMO_KEY, JSON.stringify(arr.slice(-MAX_MEMOS))) } catch {}
}

function getLatestMemo() {
  const all = loadMemos()
  return all.length ? all[all.length - 1] : null
}

function getAllMemos() {
  return loadMemos().slice().reverse()
}

// Whitelist matches mayaCore so memo generation honours the chosen model.
const ALLOWED_MODELS = new Set(['claude-sonnet-4-5', 'claude-opus-4-5'])
function getModel() {
  try {
    const p = JSON.parse(localStorage.getItem('maya_profile') || '{}')
    if (p?.aiModel && ALLOWED_MODELS.has(p.aiModel)) return p.aiModel
  } catch {}
  return 'claude-sonnet-4-5'
}

/**
 * Generate a coaching memo. Pulls intel + quiz stats, hands them to Claude,
 * gets back a structured note. Falls back to a template if no API key.
 *
 * @param {object} opts — { tasks, gamification, dayLog, weeklyDigest }
 */
async function generateCoachingMemo(opts = {}) {
  const profile = loadProfile()
  const intel = getIntelSummary(opts.tasks || [])
  const quiz = getQuizStats()
  const name = profile?.name || 'the kid'

  const facts = buildFactSheet({ profile, intel, quiz, ...opts })

  const apiKey = getApiKey('anthropic')
  if (!apiKey) {
    return persistMemo(buildTemplateMemo({ name, facts, quiz, intel }))
  }

  const system = `You are Maya, an elite junior-athlete / academic coach. You're writing a private weekly memo about ${name} — not to ${name}, but for your own coaching log. Tone: clear-eyed, specific, no fluff, no warm-up. Like a tennis coach's notebook between sessions.

Output JSON only, no prose around it:
{
  "headline": "1-line read on the week (max 90 chars)",
  "whatsImproving": ["specific observation 1", "specific observation 2"],
  "whatsStuck": ["specific gap or pattern 1", "specific gap or pattern 2"],
  "weekPush": "what I'm going to push on next week — 1 sentence",
  "kidVersion": "the same memo but rewritten in Maya's voice, talking TO ${name}, max 3 sentences — sharp and direct"
}

Use the facts below. If a category is empty, omit that array. Never invent details.`

  const userPrompt = `Facts about ${name} this week:\n\n${facts}\n\nWrite the memo.`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: 800,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) throw new Error(`Claude ${res.status}`)
    const data = await res.json()
    const text = data.content?.[0]?.text || ''
    const memo = parseMemoJson(text) || buildTemplateMemo({ name, facts, quiz, intel })
    return persistMemo(memo)
  } catch {
    return persistMemo(buildTemplateMemo({ name, facts, quiz, intel }))
  }
}

function persistMemo(memo) {
  const all = loadMemos()
  const stamped = {
    ...memo,
    at: new Date().toISOString(),
    weekId: getWeekId(),
  }
  // Replace this week's memo if one already exists
  const filtered = all.filter(m => m.weekId !== stamped.weekId)
  filtered.push(stamped)
  saveMemos(filtered)
  return stamped
}

function getWeekId() {
  const d = new Date()
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${week}`
}

// Pack the relevant signal as a short text block for Claude
function buildFactSheet({ profile = {}, intel = {}, quiz = {}, gamification = {}, weeklyDigest = null }) {
  const lines = []
  if (profile.age) lines.push(`Age: ${profile.age}`)
  if (profile.grade) lines.push(`Grade: ${profile.grade}`)
  if (gamification?.totalXP != null) lines.push(`XP: ${gamification.totalXP}`)
  if (gamification?.combo != null) lines.push(`Current combo: ${gamification.combo}`)
  if (profile?.currentStreak != null) lines.push(`Streak: ${profile.currentStreak} day(s)`)

  if (quiz?.total) {
    lines.push(`Quiz attempts (all-time): ${quiz.total}, accuracy ${quiz.accuracy}%`)
    if (quiz.weakSpots?.length) {
      lines.push(`Weak topics: ${quiz.weakSpots.map(w => `${w.topic} (${Math.round(w.hitRate * 100)}%)`).join(', ')}`)
    }
  }

  if (intel?.focusStats?.avg) lines.push(`Avg focus score: ${intel.focusStats.avg}%`)
  if (intel?.skipPatterns?.topReasons?.length) {
    lines.push(`Top skip reasons: ${intel.skipPatterns.topReasons.slice(0, 3).map(([r, n]) => `${r} (${n})`).join(', ')}`)
  }
  if (intel?.predictions?.length) {
    lines.push(`Predicted skips today: ${intel.predictions.slice(0, 3).map(p => `${p.taskName} (${p.skipRate}%)`).join('; ')}`)
  }
  if (intel?.subjectDepth) {
    const subjects = Object.entries(intel.subjectDepth).map(([s, d]) => `${s} ${d.avg}/100 (trend ${d.trend >= 0 ? '+' : ''}${d.trend})`)
    if (subjects.length) lines.push(`Subjects: ${subjects.join(', ')}`)
  }

  if (weeklyDigest?.summary) lines.push(`Week digest: ${weeklyDigest.summary}`)
  return lines.join('\n')
}

// Defensive JSON parse — Claude occasionally wraps in markdown
function parseMemoJson(text) {
  let t = String(text || '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const s = t.indexOf('{')
  const e = t.lastIndexOf('}')
  if (s < 0 || e <= s) return null
  try {
    const parsed = JSON.parse(t.slice(s, e + 1))
    if (!parsed || typeof parsed !== 'object') return null
    return {
      headline: String(parsed.headline || '').slice(0, 200),
      whatsImproving: Array.isArray(parsed.whatsImproving) ? parsed.whatsImproving.slice(0, 6).map(x => String(x).slice(0, 200)) : [],
      whatsStuck: Array.isArray(parsed.whatsStuck) ? parsed.whatsStuck.slice(0, 6).map(x => String(x).slice(0, 200)) : [],
      weekPush: String(parsed.weekPush || '').slice(0, 300),
      kidVersion: String(parsed.kidVersion || '').slice(0, 400),
    }
  } catch { return null }
}

// Template fallback when no API key (or call fails). Still useful.
function buildTemplateMemo({ name, quiz, intel }) {
  const improving = []
  const stuck = []
  if (intel?.focusStats?.avg >= 80) improving.push(`Focus score holding at ${intel.focusStats.avg}% — strong.`)
  if (intel?.focusStats?.avg && intel.focusStats.avg < 60) stuck.push(`Focus score at ${intel.focusStats.avg}% — rushing through tasks.`)
  if (quiz?.weakSpots?.length) stuck.push(`Weak topics: ${quiz.weakSpots.map(w => w.topic).join(', ')}.`)
  if (quiz?.accuracy >= 70) improving.push(`Quiz accuracy at ${quiz.accuracy}%.`)
  if (intel?.skipPatterns?.topReasons?.[0]) {
    const [reason, n] = intel.skipPatterns.topReasons[0]
    stuck.push(`Top excuse this week: "${reason}" (${n} times).`)
  }

  return {
    headline: improving.length > stuck.length
      ? `${name} is trending up — execution holding.`
      : `${name} has gaps — pattern's clear.`,
    whatsImproving: improving,
    whatsStuck: stuck,
    weekPush: stuck.length
      ? `Drill the weak spots. No more hand-waving.`
      : `Push complexity. ${name} is ready for harder material.`,
    kidVersion: stuck.length
      ? `Heads up — I'm watching the gaps. Sharp on some things, sloppy on others. We're fixing it this week.`
      : `Solid week. You executed. Now I'm raising the bar.`,
  }
}

function clearMemos() {
  try { localStorage.removeItem(MEMO_KEY) } catch {}
}

export {
  generateCoachingMemo,
  getLatestMemo,
  getAllMemos,
  clearMemos,
}

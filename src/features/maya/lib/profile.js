/**
 * Profile storage — kid's identity and preferences.
 * The personality learner adds to this over time.
 */

import { focusesForToday, adherenceLastNDays, getTrack } from './compassTracks'

const PROFILE_KEY = 'maya_profile'
const PROFILE_VERSION = 3

const DEFAULT_PROFILE = {
  version: PROFILE_VERSION,
  // Identity — defaults to Vasco's known profile so any fresh device load
  // (including the public coachmaya.vercel.app deploy) lands directly on his
  // setup instead of an empty 12yo placeholder.
  name: 'Vasco',
  age: 14,
  grade: '9',
  location: 'Singapore',
  timezone: '',        // IANA timezone (auto-detected on first save)
  pronouns: 'he/him',
  // Goals & motivation
  bigGoals: [
    'Math olympiad medals',
    'Piano competition wins',
    'Top junior tennis ranking',
  ],
  hobbies: ['Tennis', 'Piano', 'Math'],
  favoriteSubjects: ['Maths', 'Science'],
  hardSubjects: [],
  // Personality dials
  humorStyle: 'sarcastic',     // sarcastic | playful | dry | wholesome
  pushIntensity: 'hard',       // light | medium | hard
  motivationDriver: 'competition', // competition | identity | mastery | autonomy
  // Voice & avatar
  voiceEnabled: true,
  voiceAutoSpeak: true,
  systemVoice: null,           // chosen system voice name (null = auto-pick best)
  // API keys live in maya_secrets (see lib/secrets.js) — NOT in profile.
  elevenLabsVoiceId: 'sMeMiS36FkhlOd721w9P',  // chosen ElevenLabs voice id (Vasco's coach)
  notificationsEnabled: false, // Web Notifications opt-in
  wakeWordEnabled: true,       // "hey maya" always-listen (hands-free engage)
  presenceDetectionEnabled: true,  // camera-based "walked in" greeting (default-on for Vasco's device)
  aiModel: 'claude-sonnet-4-6',    // 'claude-sonnet-4-6' (fast) | 'claude-opus-4-6' (deeper)
  toughMode: false,                // raise rigor bar across all Maya responses
  voiceBargeIn: true,              // speaking during Maya's TTS interrupts her
  avatarStyle: 'pixar',
  themeAccent: '#2DD4BF',
  // Personality model (learner-managed)
  insideJokes: [],     // ["the floppy disk thing"]
  worksOn: [],         // tactics that landed
  avoids: [],          // tactics that backfired
  patterns: {},        // {wednesday_reading: "tends to skip"}
  // Parent access
  parentPin: '',
  // Parent Compass — directive layer above the kid's day.
  // Parent picks a specialization track, this week's North Star, and 1-3
  // daily focuses. Maya treats these as priority and the dashboard surfaces
  // them with a "From your parent" badge.
  parentCompass: {
    track: '',              // preset id (see lib/compassTracks.js) or 'custom'
    customLabel: '',        // shown if track === 'custom'
    northStar: '',          // this week's outcome ("Master AMC10 casework")
    focuses: [],            // [{ id, label, type, minutes, days:[0..6] }]
    weekStartIso: '',       // monday of the week the goals belong to
    updatedAt: null,        // ISO timestamp of last save
  },
  // Onboarding — pre-completed since defaults are already Vasco's identity.
  setupComplete: true,
  setupAt: null,
  // Streak
  longestStreak: 0,
  currentStreak: 0,
  lastActiveDay: null,
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return { ...DEFAULT_PROFILE }
    const parsed = JSON.parse(raw)
    // Strip legacy plaintext parentPin — older versions stored it un-hashed.
    // Once parentPinHash exists, the plaintext is never needed again.
    let mutated = false
    if (parsed && typeof parsed === 'object' && parsed.parentPin) {
      delete parsed.parentPin
      mutated = true
    }
    // Strip legacy API key fields if they leaked into profile.
    // Real keys live in maya_secrets (see lib/secrets.js).
    for (const k of ['anthropicApiKey', 'openaiApiKey', 'elevenLabsApiKey']) {
      if (parsed && Object.prototype.hasOwnProperty.call(parsed, k)) {
        delete parsed[k]
        mutated = true
      }
    }
    if (mutated) {
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(parsed)) } catch {}
    }
    return { ...DEFAULT_PROFILE, ...parsed, version: PROFILE_VERSION }
  } catch {
    return { ...DEFAULT_PROFILE }
  }
}

/**
 * Wipe all API keys from the profile. Useful before handing off the device
 * or sharing a screenshot of localStorage. Doesn't touch other profile fields.
 */
function clearApiKeys() {
  // Legacy compat — real keys are now wiped via lib/secrets clearAllApiKeys().
  // Re-saving the profile is enough to flush any stale fields the migration missed.
  try {
    const p = loadProfile()
    saveProfile(p)
  } catch {}
}

function detectTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { return '' }
}

function saveProfile(profile) {
  try {
    // Auto-fill timezone if missing — used for cross-device consistency
    const next = profile.timezone ? profile : { ...profile, timezone: detectTimezone() }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
  } catch {}
}

function updateProfile(patch) {
  const current = loadProfile()
  const next = { ...current, ...patch }
  saveProfile(next)
  return next
}

function safeLS(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

/**
 * Build the personality_context string injected into Maya's system prompt.
 * This is what makes Maya feel like she KNOWS this kid.
 * Pulls live signals (next competition, mood pattern, completion rate) so
 * Maya can reference them naturally without us hard-coding examples.
 */
function buildPersonalityContext(profile) {
  if (!profile) return ''
  const lines = []
  const today = new Date().toISOString().slice(0, 10)

  // ── Identity ──
  const idBits = [
    `Name: ${profile.name || 'Champ'}`,
    profile.age ? `age ${profile.age}` : null,
    profile.grade ? `Grade ${profile.grade}` : null,
    profile.location || null,
  ].filter(Boolean)
  lines.push(idBits.join(', ') + '.')

  if (profile.bigGoals?.length) lines.push(`Big goals: ${profile.bigGoals.join('; ')}.`)
  if (profile.hobbies?.length) lines.push(`Hobbies: ${profile.hobbies.join(', ')}.`)
  if (profile.favoriteSubjects?.length) lines.push(`Loves: ${profile.favoriteSubjects.join(', ')}.`)
  if (profile.hardSubjects?.length) lines.push(`Struggles with: ${profile.hardSubjects.join(', ')}.`)
  lines.push(`Humor style: ${profile.humorStyle}. Push intensity: ${profile.pushIntensity}. Main driver: ${profile.motivationDriver}.`)
  if (profile.currentStreak) lines.push(`Current streak: ${profile.currentStreak} days. Longest: ${profile.longestStreak}.`)

  // ── Live: upcoming competitions ──
  const comps = safeLS('maya_competitions') || []
  const upcoming = comps.filter(c => c?.date && c.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3)
  if (upcoming.length > 0) {
    const compStrs = upcoming.map(c => {
      const days = Math.ceil((new Date(c.date) - new Date(today)) / 86400000)
      return `${c.name} in ${days}d`
    })
    lines.push(`Upcoming competitions: ${compStrs.join('; ')}.`)
  }

  // ── Live: recent mood pattern (last 5 entries) ──
  const moods = safeLS('maya_moods') || []
  if (Array.isArray(moods) && moods.length >= 3) {
    const recent = moods.slice(-5).map(m => m.mood).filter(Boolean)
    if (recent.length >= 3) {
      const dominant = mostFrequent(recent)
      if (dominant) lines.push(`Recent mood pattern: mostly ${dominant} (last ${recent.length} check-ins).`)
    }
  }

  // ── Live: 7-day completion rate ──
  const state = safeLS('maya_state')
  if (state?.dayLog && Array.isArray(state.dayLog)) {
    const sevenDays = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const recentEvents = state.dayLog.filter(e => (e.time || '').slice(0, 10) >= sevenDays)
    const done = recentEvents.filter(e => e.type === 'task_complete').length
    const skipped = recentEvents.filter(e => e.type === 'task_skip').length
    if (done + skipped >= 3) {
      const pct = Math.round((done / (done + skipped)) * 100)
      lines.push(`Last 7 days: ${done} completed, ${skipped} skipped (${pct}% finish rate).`)
    }
  }

  // ── Parent Compass — top-priority directive layer ──
  // Maya should know that the parent has set explicit goals so she can
  // weave references like "your mum wants 5 AMC problems today" naturally.
  // Kept tight so prompts don't bloat.
  if (profile.parentCompass && profile.parentCompass.track) {
    const c = profile.parentCompass
    const track = getTrack(c.track)
    const trackLabel = c.track === 'custom' && c.customLabel ? c.customLabel : (track?.label || c.track)
    const compassBits = [`Parent's compass (priority above normal day): ${trackLabel}.`]
    if (c.northStar) compassBits.push(`This week's north star (set by parent): "${c.northStar}".`)
    const todayFocuses = focusesForToday(c)
    if (todayFocuses.length > 0) {
      const focusStrs = todayFocuses.map(f => `${f.label} (${f.minutes}m)`)
      compassBits.push(`Today's parent-set focuses: ${focusStrs.join('; ')}.`)
    }
    const adh = adherenceLastNDays(c, 7)
    if (adh.pct != null && adh.totalScheduled >= 5) {
      compassBits.push(`Compass adherence last 7d: ${adh.pct}% (${adh.totalCompleted}/${adh.totalScheduled}).`)
    }
    lines.push(compassBits.join(' '))
  }

  if (profile.insideJokes?.length) lines.push(`Inside jokes you've earned: ${profile.insideJokes.join(' | ')}.`)
  if (profile.worksOn?.length) lines.push(`Tactics that work: ${profile.worksOn.slice(-5).join('; ')}.`)
  if (profile.avoids?.length) lines.push(`Don't do: ${profile.avoids.slice(-5).join('; ')}.`)
  return lines.join(' ')
}

function mostFrequent(arr) {
  const counts = {}
  for (const v of arr) counts[v] = (counts[v] || 0) + 1
  let max = 0, pick = null
  for (const [k, n] of Object.entries(counts)) {
    if (n > max) { max = n; pick = k }
  }
  // Only return if it's truly dominant (>=50%)
  return max / arr.length >= 0.5 ? pick : null
}

export {
  DEFAULT_PROFILE,
  loadProfile,
  saveProfile,
  updateProfile,
  buildPersonalityContext,
  clearApiKeys,
}

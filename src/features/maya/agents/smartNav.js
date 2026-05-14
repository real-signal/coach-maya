/**
 * Smart Nav Agent
 * Picks the 8 most relevant nav tiles for THIS kid, RIGHT NOW.
 *
 * Replaces the old 36-item scroll row that overwhelmed users with everything.
 * Selection signals:
 *   - time of day (morning → ritual; evening → reflection/journal)
 *   - profile hobbies (tennis player → tennis tile up top)
 *   - imminent competition (≤14d → prep + comps prominent)
 *   - recent activity (used in last 14d → stays in rotation)
 *   - streak status (broken → memory/easy wins)
 *   - core essentials (always show: Insights, Profile)
 *
 * Returns { primary: [...8 items], overflow: [...rest] }
 */

const ALL_ITEMS = [
  { icon: '🎙', label: 'Vault',     to: '/lessons',     tags: ['always'] },
  { icon: '🧠', label: 'Memory',    to: '/memory',      tags: ['always', 'recovery'] },
  { icon: '🎯', label: 'Goals',     to: '/goals',       tags: ['always'] },
  { icon: '📝', label: 'Homework',  to: '/homework',    tags: ['academic'] },
  { icon: '🃏', label: 'Flash',     to: '/flashcards',  tags: ['academic'] },
  { icon: '🎾', label: 'Tennis',    to: '/tennis',      tags: ['hobby:tennis'] },
  { icon: '🎹', label: 'Piano',     to: '/piano',       tags: ['hobby:piano', 'hobby:music'] },
  { icon: '📖', label: 'Reading',   to: '/reading',     tags: ['academic', 'hobby:reading'] },
  { icon: '💡', label: 'Explain',   to: '/explain',     tags: ['academic'] },
  { icon: '📓', label: 'Notebook',  to: '/notebook',    tags: ['academic', 'core'] },
  { icon: '⏲',  label: 'Timer',     to: '/timer',       tags: ['focus'] },
  { icon: '📱', label: 'Screen',    to: '/screentime',  tags: ['health'] },
  { icon: '🔤', label: 'Vocab',     to: '/vocab',       tags: ['academic'] },
  { icon: '✅', label: 'Habits',    to: '/habits',      tags: ['always'] },
  { icon: '🧮', label: 'Math',      to: '/mathdrill',   tags: ['academic', 'hobby:math'] },
  { icon: '⌨️', label: 'Typing',    to: '/typing',      tags: ['skill'] },
  { icon: '😴', label: 'Sleep',     to: '/sleep',       tags: ['health', 'recovery'] },
  { icon: '💧', label: 'Water',     to: '/water',       tags: ['health'] },
  { icon: '🏋️', label: 'Workout',  to: '/workout',     tags: ['health', 'hobby:fitness'] },
  { icon: '💜', label: 'Moods',     to: '/moods',       tags: ['always'] },
  { icon: '📋', label: 'Weekly',    to: '/weekly',      tags: ['always:sunday'] },
  { icon: '📋', label: 'Briefing',  to: '/briefing',    tags: ['always:morning'] },
  { icon: '🏆', label: 'Comps',     to: '/competitions',tags: ['comp'] },
  { icon: '🏅', label: 'Trophies',  to: '/trophies',    tags: ['comp'] },
  { icon: '🎯', label: 'Prep',      to: '/prep',        tags: ['comp:imminent'] },
  { icon: '📊', label: 'Analytics', to: '/analytics',   tags: ['always'] },
  { icon: '🧿', label: 'Intel',     to: '/intel',       tags: ['skill'] },
  { icon: '🏋️', label: 'Records',  to: '/records',     tags: ['skill'] },
  { icon: '📰', label: 'News',      to: '/news',        tags: ['skill'] },
  { icon: '⏱',  label: 'Focus',     to: '/focus',       tags: ['focus'] },
  { icon: '📈', label: 'Insights',  to: '/insights',    tags: ['core'] },
  { icon: '📜', label: 'Story',     to: '/story',       tags: ['skill'] },
  { icon: '📓', label: 'Journal',   to: '/journal',     tags: ['always:evening'] },
  { icon: '🛒', label: 'Shop',      to: '/shop',        tags: ['skill'] },
  { icon: '👪', label: 'Parent',    to: '/parent',      tags: ['core'] },
  { icon: '⚙',  label: 'Schedule', to: '/schedule',    tags: ['skill'] },
  { icon: '?',  label: 'Help',      to: '/help',        tags: ['skill'] },
]

const HOBBY_ALIASES = {
  tennis: ['tennis'],
  piano: ['piano', 'music'],
  music: ['music', 'piano'],
  guitar: ['music'],
  violin: ['music'],
  drums: ['music'],
  reading: ['reading'],
  math: ['math'],
  maths: ['math'],
  running: ['fitness'],
  workout: ['fitness'],
  gym: ['fitness'],
  swimming: ['fitness'],
  football: ['fitness'],
  basketball: ['fitness'],
}

function todayStr() { return new Date().toISOString().slice(0, 10) }
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) }

/**
 * @param {object} args
 * @param {object} args.profile
 * @param {Date}   [args.now]
 * @returns {{primary: Array, overflow: Array}}
 */
function getSmartNav({ profile = {}, now } = {}) {
  const t = now || new Date()
  const hour = t.getHours()
  const dow = t.getDay() // 0 = Sun
  const isMorning = hour >= 5 && hour < 11
  const isEvening = hour >= 18 && hour < 23
  const isSunday = dow === 0

  // Resolve hobby tags from profile
  const hobbyTagSet = new Set()
  ;(profile.hobbies || []).forEach(h => {
    const key = String(h).toLowerCase().trim()
    const tags = HOBBY_ALIASES[key] || [key]
    tags.forEach(x => hobbyTagSet.add(`hobby:${x}`))
  })

  // Recent activity → which routes were visited recently
  let recentRoutes = new Set()
  try {
    const visits = JSON.parse(localStorage.getItem('maya_route_visits') || '{}')
    const cutoff = daysAgo(14)
    for (const [route, lastSeen] of Object.entries(visits)) {
      if (typeof lastSeen === 'string' && lastSeen >= cutoff) recentRoutes.add(route)
    }
  } catch {}

  // Imminent competition
  let hasImminentComp = false
  try {
    const compsRaw = JSON.parse(localStorage.getItem('maya_competitions') || '[]')
    const comps = Array.isArray(compsRaw) ? compsRaw : []
    const today = todayStr()
    hasImminentComp = comps.some(c => {
      if (!c?.date || c.date < today) return false
      const days = Math.ceil((new Date(c.date) - new Date(today)) / 86400000)
      return days <= 14
    })
  } catch {}

  // Streak broken?
  const streakBroken = (profile.currentStreak || 0) === 0 && (profile.longestStreak || 0) >= 5

  // Notebook activity — boost the tile while sources are loaded so the kid
  // doesn't lose track of an active study corpus.
  let notebookActive = false
  try {
    const raw = JSON.parse(localStorage.getItem('maya_sources') || '[]')
    notebookActive = Array.isArray(raw) && raw.length > 0
  } catch {}

  // ── Score every item ──
  const scored = ALL_ITEMS.map(item => {
    let score = 0
    const tags = item.tags || []

    if (tags.includes('core')) score += 100  // Insights, Parent always relevant
    if (tags.includes('always')) score += 30

    // Time-of-day gates
    if (tags.includes('always:morning') && isMorning) score += 80
    if (tags.includes('always:evening') && isEvening) score += 80
    if (tags.includes('always:sunday') && isSunday) score += 80

    // Hobby match
    for (const tag of tags) {
      if (tag.startsWith('hobby:') && hobbyTagSet.has(tag)) score += 60
    }

    // Comp prominence
    if (tags.includes('comp:imminent') && hasImminentComp) score += 70
    if (tags.includes('comp') && hasImminentComp) score += 40

    // Recovery boost
    if (tags.includes('recovery') && streakBroken) score += 50

    // Recent visit boost
    if (recentRoutes.has(item.to)) score += 20

    // Notebook with sources loaded — keep it top of mind
    if (item.to === '/notebook' && notebookActive) score += 55

    // Tiny tiebreaker so stable order
    score += Math.random() * 0.01

    return { ...item, _score: score }
  })

  scored.sort((a, b) => b._score - a._score)

  const primary = scored.slice(0, 8).map(({ _score, tags, ...rest }) => rest)
  const primarySet = new Set(primary.map(p => p.to))
  const overflow = ALL_ITEMS.filter(i => !primarySet.has(i.to))
    .map(({ tags, ...rest }) => rest)

  return { primary, overflow }
}

/**
 * Lightweight visit tracker — call from dashboard navigation handlers
 * so smartNav can boost recently-used routes.
 */
function trackVisit(route) {
  if (!route) return
  try {
    const visits = JSON.parse(localStorage.getItem('maya_route_visits') || '{}')
    visits[route] = todayStr()
    // Cap to 60 routes
    const entries = Object.entries(visits)
    if (entries.length > 60) {
      entries.sort((a, b) => (b[1] || '').localeCompare(a[1] || ''))
      const trimmed = Object.fromEntries(entries.slice(0, 60))
      localStorage.setItem('maya_route_visits', JSON.stringify(trimmed))
    } else {
      localStorage.setItem('maya_route_visits', JSON.stringify(visits))
    }
  } catch {}
}

export { getSmartNav, trackVisit }

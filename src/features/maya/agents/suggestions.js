/**
 * Smart Suggestions Engine
 * Looks at live state + competitions + prep plans to recommend what to do next.
 */

import { getMemoryStats } from './memory'
import { loadHistory } from './lessonAnalyst'
import { focusesForToday, loadCompassLog, todayDateKey, adherenceLastNDays, getTrack } from '../lib/compassTracks'

function loadLS(key) {
  try { return JSON.parse(localStorage.getItem(key)) } catch { return null }
}

function getSuggestion({ tasks = [], gamification = {}, todayMood, profile }) {
  const hour = new Date().getHours()
  const completed = tasks.filter(t => t.completed)
  const remaining = tasks.filter(t => !t.completed && !t.skipped)
  const memStats = getMemoryStats()
  const today = new Date().toISOString().slice(0, 10)
  const todayLessons = loadHistory().filter(l => (l.startedAt || '').startsWith(today))

  // Competition + prep context
  const comps = loadLS('maya_competitions') || []
  const upcoming = comps.filter(c => c.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const nextComp = upcoming[0]
  const daysUntilNext = nextComp ? Math.ceil((new Date(nextComp.date) - new Date(today)) / 86400000) : null

  const preps = loadLS('maya_prep_plans') || []
  const activePreps = preps.filter(p => !p.compDate || p.compDate >= today)
  const unfinishedPreps = activePreps.filter(p => (p.log?.[today] || 0) < p.dailyTarget)

  const candidates = []

  // 0. Competition TODAY
  if (daysUntilNext === 0) {
    candidates.push({
      title: `${nextComp.name} is TODAY`,
      sub: 'Trust the prep. Go perform.',
      action: '/competitions',
      icon: '🏆',
      priority: 100,
    })
  }

  // 1. Competition in ≤3 days + prep not done
  if (daysUntilNext !== null && daysUntilNext <= 3 && daysUntilNext > 0 && unfinishedPreps.length > 0) {
    candidates.push({
      title: `${daysUntilNext}d until ${nextComp.name}`,
      sub: `${unfinishedPreps.length} prep plan${unfinishedPreps.length > 1 ? 's' : ''} incomplete today`,
      action: '/prep',
      icon: '⚡',
      priority: 96,
    })
  }

  // 2. Tired/frustrated mood → soft suggestion
  if (todayMood === 'Tired' || todayMood === 'Frustrated') {
    candidates.push({
      title: 'Take a break, then come back',
      sub: "I'll be here. No pressure.",
      action: '/',
      icon: '☕',
      priority: 95,
    })
  }

  // 3. All tasks done → celebration
  if (tasks.length > 0 && remaining.length === 0) {
    candidates.push({
      title: 'Crushed it all',
      sub: unfinishedPreps.length > 0 ? 'Now hit your prep plans' : 'Spend that XP in the shop',
      action: unfinishedPreps.length > 0 ? '/prep' : '/shop',
      icon: '🏆',
      priority: 92,
    })
  }

  // 4. Prep plans incomplete today (no imminent competition)
  if (unfinishedPreps.length > 0 && hour >= 10) {
    const p = unfinishedPreps[0]
    const done = p.log?.[today] || 0
    candidates.push({
      title: `Prep: ${p.name}`,
      sub: `${done}/${p.dailyTarget} ${p.unit} today${daysUntilNext !== null ? ` · ${daysUntilNext}d to comp` : ''}`,
      action: '/prep',
      icon: '🎯',
      priority: daysUntilNext !== null && daysUntilNext <= 14 ? 88 : 78,
    })
  }

  // 4b. Parent compass — pending focuses today
  const compass = profile?.parentCompass
  if (compass?.track) {
    const todays = focusesForToday(compass)
    if (todays.length > 0) {
      const log = loadCompassLog()
      const done = log[todayDateKey()] || {}
      const pending = todays.filter(f => !done[f.id])
      const track = getTrack(compass.track)
      const trackLabel = compass.track === 'custom' && compass.customLabel
        ? compass.customLabel
        : (track?.label || 'Compass')
      if (pending.length > 0 && hour >= 9) {
        // Higher priority later in the day — the compass is the parent's stack.
        const urgency = hour >= 17 ? 91 : hour >= 14 ? 87 : 83
        candidates.push({
          title: `Parent compass: ${pending[0].label}`,
          sub: `${pending.length} focus${pending.length > 1 ? 'es' : ''} left · ${trackLabel}`,
          action: '/briefing',
          icon: '🧭',
          priority: urgency,
        })
      } else if (pending.length === 0 && todays.length > 0) {
        // Compass cleared — celebrate it, but with low priority so it
        // doesn't drown out other suggestions.
        const adh = adherenceLastNDays(compass, 7)
        if (adh.pct != null && adh.pct >= 80) {
          candidates.push({
            title: `Compass on lock`,
            sub: `${adh.pct}% adherence · ${trackLabel}`,
            action: '/insights',
            icon: '🌟',
            priority: 55,
          })
        }
      }
    }
  }

  // 5. Morning + nothing done → briefing
  if (hour < 11 && completed.length === 0 && tasks.length > 0) {
    candidates.push({
      title: 'Daily briefing',
      sub: 'See the full picture for today',
      action: '/briefing',
      icon: '☀️',
      priority: 90,
    })
  }

  // 6. Competition in ≤14 days — nudge
  if (daysUntilNext !== null && daysUntilNext <= 14 && daysUntilNext > 3) {
    candidates.push({
      title: `${nextComp.name} in ${daysUntilNext} days`,
      sub: 'Check your prep status',
      action: '/briefing',
      icon: '📅',
      priority: 82,
    })
  }

  // 7. Combo at risk
  if (gamification.combo >= 3) {
    candidates.push({
      title: `Protect that ${gamification.combo}× combo`,
      sub: 'Knock out the next task',
      action: '/',
      icon: '🔥',
      priority: 85,
    })
  }

  // 8. Lessons
  if (todayLessons.length === 0 && hour >= 9 && hour <= 18) {
    candidates.push({
      title: 'Sit through a lesson with me',
      sub: "I'll listen and quiz you after",
      action: '/lesson',
      icon: '🎙',
      priority: 80,
    })
  }

  // 9. Memory drill
  if (memStats.dueToday > 0) {
    candidates.push({
      title: `${memStats.dueToday} concept${memStats.dueToday > 1 ? 's' : ''} due for review`,
      sub: 'Quick memory drill — 2 min',
      action: '/memory',
      icon: '🧠',
      priority: 75,
    })
  }

  // 10. Remaining tasks midday
  if (remaining.length > 0 && hour >= 12 && hour < 18) {
    candidates.push({
      title: `${remaining.length} task${remaining.length > 1 ? 's' : ''} left`,
      sub: `Next up: ${remaining[0].name}`,
      action: '/',
      icon: '📋',
      priority: 70,
    })
  }

  // 11. Evening wrap
  if (hour >= 18 && hour < 23 && completed.length > 0) {
    candidates.push({
      title: 'Time to wrap the day',
      sub: 'Reflect + reveal your grade',
      action: '/ritual?mode=evening',
      icon: '🌙',
      priority: 88,
    })
  }

  // 12. Default — journal
  if (candidates.length === 0) {
    candidates.push({
      title: 'Journal something',
      sub: 'Quick reflection',
      action: '/journal',
      icon: '📓',
      priority: 50,
    })
  }

  candidates.sort((a, b) => b.priority - a.priority)
  return candidates[0]
}

export { getSuggestion }

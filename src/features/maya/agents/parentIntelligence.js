/**
 * Agent 6: Parent Intelligence
 * Generates structured daily + weekly reports for the parent.
 * Personalised with the child's name, grade, location, and streak.
 */

import { dailySummary } from './personalityLearner'
import { loadProfile } from '../lib/profile'
import { adherenceLastNDays, getTrack, focusesForToday } from '../lib/compassTracks'

function generateDailyReport({ dayLog, gamification, tasks, mood, reflection, spotChecks }) {
  const summary = dailySummary(dayLog)
  const profile = summary?.profile || loadProfile() || {}
  const completed = tasks.filter(t => t.completed)
  const skipped = tasks.filter(t => t.skipped)
  const pending = tasks.filter(t => !t.completed && !t.skipped)
  const childName = profile?.name || 'Champ'

  // MVP moment — references the child by name
  const mvpMoment = (() => {
    if (gamification.combo >= 5) return `${childName} hit a ${gamification.combo}× combo — that's elite focus.`
    if (gamification.combo >= 3) return `${childName} chained a ${gamification.combo}× combo today.`
    if (completed.length > 0) return `${childName} opened the day with ${completed[0].name}.`
    return `Nothing to highlight yet.`
  })()

  // One concern
  const concern = (() => {
    if (skipped.length >= 2) return `Skipped ${skipped.length} tasks: ${skipped.map(s => s.name).join(', ')}.`
    if (mood === 'Frustrated' || mood === 'Tired') return `Mood was "${mood}" — energy may be low. Worth a check-in.`
    const shallow = spotChecks?.filter(s => s.depth === 'shallow' || s.depth === 'minimal')
    if (shallow?.length) return `${shallow.length} spot-check answer(s) were shallow — comprehension to verify.`
    if ((profile.currentStreak || 0) === 0 && (profile.longestStreak || 0) >= 5) {
      return `Streak broke. Previous best was ${profile.longestStreak} days — small comeback today helps.`
    }
    return null
  })()

  // One recommendation — slightly tailored
  const recommendation = (() => {
    if (skipped.length >= 2) return `Front-load the hard tasks earlier — ${childName} fades by late afternoon.`
    if (gamification.combo === 0 && completed.length > 0) return `Combo reset — small consecutive wins help build momentum back.`
    if (gamification.dayGrade?.grade === 'S') return `Perfect day. Ride the momentum into tomorrow.`
    if ((profile.currentStreak || 0) >= 7) return `${profile.currentStreak}-day streak. Protect tomorrow morning — it's the keystone.`
    return `Stay the course — consistency over intensity.`
  })()

  // ── Parent compass — today's directives + adherence ──
  const compass = (() => {
    if (!profile.parentCompass?.track) return null
    const c = profile.parentCompass
    const track = getTrack(c.track)
    const trackLabel = c.track === 'custom' && c.customLabel ? c.customLabel : (track?.label || c.track)
    const todayFocuses = focusesForToday(c)
    const adh = adherenceLastNDays(c, 7)
    return {
      track: trackLabel,
      northStar: c.northStar || '',
      todayFocuses: todayFocuses.map(f => ({ id: f.id, label: f.label, minutes: f.minutes })),
      adherence7d: adh.pct,
      completed7d: adh.totalCompleted,
      scheduled7d: adh.totalScheduled,
    }
  })()

  return {
    date: new Date().toISOString().slice(0, 10),
    childName,
    grade: gamification.dayGrade?.grade || '-',
    gradeLabel: gamification.dayGrade?.label || '',
    schoolGrade: profile.grade || '',
    location: profile.location || '',
    age: profile.age || null,
    currentStreak: profile.currentStreak || 0,
    longestStreak: profile.longestStreak || 0,
    xpEarned: gamification.totalXP || 0,
    level: gamification.level?.title || 'Rookie',
    tasksCompleted: completed.length,
    tasksSkipped: skipped.length,
    tasksPending: pending.length,
    combo: gamification.combo,
    mood,
    reflection,
    mvpMoment,
    concern,
    recommendation,
    compass,
    timeline: dayLog.map(e => ({
      time: e.time,
      type: e.type,
      label: e.task || e.type,
      xp: e.xp,
    })),
  }
}

/**
 * Weekly digest — narrative summary of the past 7 days vs the prior 7.
 * Designed to be glanceable: "what improved, what slipped, what to do next."
 */
function generateWeeklyDigest(history) {
  if (!history?.length) return null
  const profile = loadProfile() || {}
  const childName = profile?.name || 'Champ'

  const last7 = history.slice(-7)
  const prior7 = history.slice(-14, -7)

  const sumXP = arr => arr.reduce((s, d) => s + (d.xpEarned || 0), 0)
  const avgXP = arr => arr.length ? Math.round(sumXP(arr) / arr.length) : 0
  const sumDone = arr => arr.reduce((s, d) => s + (d.tasksCompleted || 0), 0)
  const sumSkip = arr => arr.reduce((s, d) => s + (d.tasksSkipped || 0), 0)

  const thisAvgXP = avgXP(last7)
  const priorAvgXP = avgXP(prior7)
  const xpDelta = priorAvgXP > 0 ? Math.round(((thisAvgXP - priorAvgXP) / priorAvgXP) * 100) : null

  const thisDone = sumDone(last7)
  const thisSkipped = sumSkip(last7)
  const finishRate = thisDone + thisSkipped > 0
    ? Math.round((thisDone / (thisDone + thisSkipped)) * 100)
    : 0

  const grades = last7.map(d => d.grade).filter(Boolean)
  const sCount = grades.filter(g => g === 'S').length
  const aCount = grades.filter(g => g === 'A').length

  const bestDay = last7.reduce((best, d) => (d.xpEarned > (best?.xpEarned || 0) ? d : best), null)

  // ── Narrative bullets ──
  const wins = []
  const flags = []

  if (xpDelta !== null && xpDelta >= 15) wins.push(`XP up ${xpDelta}% week over week`)
  if (xpDelta !== null && xpDelta <= -15) flags.push(`XP down ${Math.abs(xpDelta)}% week over week`)
  if (sCount >= 3) wins.push(`${sCount} S-grade days`)
  if (finishRate >= 85) wins.push(`${finishRate}% finish rate`)
  if (finishRate < 60 && (thisDone + thisSkipped) >= 5) flags.push(`${finishRate}% finish rate — task load may be too high`)
  if ((profile.currentStreak || 0) >= 7) wins.push(`${profile.currentStreak}-day streak active`)
  if ((profile.currentStreak || 0) === 0 && (profile.longestStreak || 0) >= 5) {
    flags.push(`Streak broke (was ${profile.longestStreak})`)
  }

  // ── Parent compass adherence ──
  let compassBlock = null
  if (profile.parentCompass?.track) {
    const c = profile.parentCompass
    const track = getTrack(c.track)
    const trackLabel = c.track === 'custom' && c.customLabel ? c.customLabel : (track?.label || c.track)
    const adh = adherenceLastNDays(c, 7)
    compassBlock = {
      track: trackLabel,
      northStar: c.northStar || '',
      adherencePct: adh.pct,
      completed: adh.totalCompleted,
      scheduled: adh.totalScheduled,
    }
    if (adh.totalScheduled >= 5) {
      if (adh.pct >= 90) wins.push(`Compass adherence ${adh.pct}% (${adh.totalCompleted}/${adh.totalScheduled})`)
      else if (adh.pct < 60) flags.push(`Compass adherence ${adh.pct}% — parent directives slipping`)
    }
  }

  // What to do next — single concrete suggestion
  const nextAction = (() => {
    if (compassBlock && compassBlock.scheduled >= 5 && compassBlock.adherencePct < 60) {
      return `Compass at ${compassBlock.adherencePct}%. Pick one focus this week and protect it — drop the rest if needed.`
    }
    if (flags.length === 0 && wins.length >= 2) return `Protect what's working. Don't add new tasks this week.`
    if (finishRate < 60) return `Trim the schedule. ${childName} is being asked to do too much.`
    if ((profile.currentStreak || 0) === 0 && (profile.longestStreak || 0) >= 5) {
      return `Tomorrow: one easy win to restart the streak. Don't pile on.`
    }
    if (xpDelta !== null && xpDelta <= -20) return `Energy dip. Check sleep + ask what's getting in the way.`
    return `Steady week. Stay the course.`
  })()

  return {
    weekOf: last7[0]?.date,
    childName,
    daysLogged: last7.length,
    avgXP: thisAvgXP,
    priorAvgXP,
    xpDeltaPct: xpDelta,
    finishRate,
    grades,
    sDays: sCount,
    aDays: aCount,
    bestDay,
    wins,
    flags,
    compass: compassBlock,
    nextAction,
  }
}

// Backwards-compat alias
const generateWeeklyReport = generateWeeklyDigest

export { generateDailyReport, generateWeeklyDigest, generateWeeklyReport }

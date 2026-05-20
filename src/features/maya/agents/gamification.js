/**
 * Agent 4: Gamification Engine
 * Pure logic — no AI needed. Deterministic rules for XP, combos, grades, achievements.
 */

// ─── Level Definitions ───
const LEVELS = [
  { level: 1, xpRequired: 0,    title: 'Rookie',            icon: '🌱' },
  { level: 2, xpRequired: 100,  title: 'Rising Star',       icon: '⭐' },
  { level: 3, xpRequired: 300,  title: 'Focused Mind',      icon: '🎯' },
  { level: 4, xpRequired: 600,  title: 'Discipline Builder', icon: '🔨' },
  { level: 5, xpRequired: 1000, title: 'Resilient Spirit',  icon: '🔥' },
  { level: 6, xpRequired: 1500, title: 'Peak Performer',    icon: '⚡' },
  { level: 7, xpRequired: 2200, title: 'Champion',          icon: '🏆' },
  { level: 8, xpRequired: 3000, title: 'Legend',             icon: '👑' },
]

// ─── Combo Multipliers ───
function getComboMultiplier(consecutive) {
  if (consecutive >= 7) return { multiplier: 3, label: 'MEGA 🔥' }
  if (consecutive >= 5) return { multiplier: 2, label: 'SUPER ⚡' }
  if (consecutive >= 3) return { multiplier: 1.5, label: 'COMBO ✨' }
  return { multiplier: 1, label: 'Building...' }
}

// ─── XP Per Task Type ───
const BASE_XP = {
  maths: 25,
  reading: 20,
  science: 25,
  writing: 20,
  tennis: 20,
  piano: 20,
  chores: 15,
  reflection: 15,
  homework: 25,
  revision: 20,
  exercise: 20,
  default: 20,
}

function getBaseXP(taskType) {
  return BASE_XP[taskType?.toLowerCase()] || BASE_XP.default
}

// ─── Level Calculation ───
function getLevel(totalXP) {
  let current = LEVELS[0]
  for (const level of LEVELS) {
    if (totalXP >= level.xpRequired) current = level
    else break
  }
  const nextLevel = LEVELS.find(l => l.level === current.level + 1)
  const xpToNext = nextLevel ? nextLevel.xpRequired - totalXP : 0
  const progress = nextLevel
    ? (totalXP - current.xpRequired) / (nextLevel.xpRequired - current.xpRequired)
    : 1
  return { ...current, xpToNext, progress: Math.min(1, Math.max(0, progress)), nextLevel }
}

// ─── Daily Grade ───
function getDayGrade(tasksCompleted, totalTasks, hasMood, hasReflection) {
  if (totalTasks === 0) return { grade: '-', color: '#888' }
  const pct = tasksCompleted / totalTasks

  if (tasksCompleted === totalTasks && hasMood && hasReflection) {
    return { grade: 'S', color: '#FFD700', label: 'Perfect Day' }
  }
  if (tasksCompleted === totalTasks || (pct >= 0.8 && hasReflection)) {
    return { grade: 'A', color: '#34D399', label: 'Great Day' }
  }
  if (pct >= 0.6) return { grade: 'B', color: '#93C5FD', label: 'Solid Day' }
  if (pct >= 0.4) return { grade: 'C', color: '#FBBF24', label: 'OK Day' }
  return { grade: 'F', color: '#F87171', label: 'Rough Day' }
}

// ─── Process Task Completion ───
function processTaskComplete(state, taskType) {
  const combo = state.combo + 1
  const { multiplier, label: comboLabel } = getComboMultiplier(combo)
  const base = getBaseXP(taskType)
  const earned = Math.round(base * multiplier)
  const totalXP = state.totalXP + earned
  const level = getLevel(totalXP)
  const tasksCompleted = state.tasksCompleted + 1
  const dayGrade = getDayGrade(tasksCompleted, state.totalTasks, state.hasMood, state.hasReflection)

  return {
    ...state,
    combo,
    comboMultiplier: multiplier,
    comboLabel,
    totalXP,
    level,
    tasksCompleted,
    dayGrade,
    lastTaskXP: earned,
    lastTaskBase: base,
    lastTaskBonus: earned - base,
  }
}

// ─── Process Parent Compass Focus Completion ───
// Parent compass focuses live separately from regular tasks (different log,
// different lifecycle). Award a flat "parent priority" bonus so checking
// them off is visibly rewarded, but DO NOT touch combo or tasksCompleted —
// those belong to the schedule. This keeps the two systems independent and
// prevents reward-hacking when a focus overlaps with a daily task.
const COMPASS_FOCUS_XP = 15

function processCompassFocusComplete(state) {
  const earned = COMPASS_FOCUS_XP
  const totalXP = state.totalXP + earned
  const level = getLevel(totalXP)
  return {
    ...state,
    totalXP,
    level,
    lastTaskXP: earned,
    lastTaskBase: earned,
    lastTaskBonus: 0,
  }
}

// ─── Process Task Skip / Miss ───
function processTaskSkip(state) {
  return {
    ...state,
    combo: 0,
    comboMultiplier: 1,
    comboLabel: 'Building...',
    dayGrade: getDayGrade(state.tasksCompleted, state.totalTasks, state.hasMood, state.hasReflection),
  }
}

// ─── Achievements ───
const ACHIEVEMENTS = [
  { id: 'first_task', title: 'First Step', desc: 'Complete your first task', icon: '🎯', check: s => s.tasksCompleted >= 1 },
  { id: 'combo_3', title: 'Combo Starter', desc: 'Hit a 3× combo', icon: '✨', check: s => s.combo >= 3 },
  { id: 'combo_5', title: 'Super Streak', desc: 'Hit a 5× combo', icon: '⚡', check: s => s.combo >= 5 },
  { id: 'combo_7', title: 'Mega Mode', desc: 'Hit a 7× combo', icon: '🔥', check: s => s.combo >= 7 },
  { id: 'level_3', title: 'Focused Mind', desc: 'Reach Level 3', icon: '🎯', check: s => s.level?.level >= 3 },
  { id: 'level_5', title: 'Resilient', desc: 'Reach Level 5', icon: '🔥', check: s => s.level?.level >= 5 },
  { id: 'level_8', title: 'Legendary', desc: 'Reach Level 8', icon: '👑', check: s => s.level?.level >= 8 },
  { id: 's_grade', title: 'Perfect Day', desc: 'Get an S grade', icon: '💎', check: s => s.dayGrade?.grade === 'S' },
  { id: 'xp_500', title: 'XP Hunter', desc: 'Earn 500 total XP', icon: '🏅', check: s => s.totalXP >= 500 },
  { id: 'xp_1000', title: 'XP Machine', desc: 'Earn 1000 total XP', icon: '🏆', check: s => s.totalXP >= 1000 },
  // Parent-compass adherence streaks — state.compassStreak is set by
  // completeCompassFocus before calling checkAchievements.
  { id: 'compass_3', title: 'On the Compass', desc: '3-day perfect compass streak', icon: '🧭', check: s => (s.compassStreak || 0) >= 3 },
  { id: 'compass_7', title: 'Compass Locked', desc: '7-day perfect compass streak', icon: '🧭', check: s => (s.compassStreak || 0) >= 7 },
  { id: 'compass_14', title: 'Compass Master', desc: '14-day perfect compass streak', icon: '🌟', check: s => (s.compassStreak || 0) >= 14 },
  { id: 'compass_30', title: 'North Star', desc: '30-day perfect compass streak', icon: '✨', check: s => (s.compassStreak || 0) >= 30 },
]

function checkAchievements(state, unlockedIds = []) {
  const newAchievements = []
  for (const a of ACHIEVEMENTS) {
    if (!unlockedIds.includes(a.id) && a.check(state)) {
      newAchievements.push(a)
    }
  }
  return newAchievements
}

// ─── Create Initial State ───
function createInitialState(totalTasks = 0) {
  const state = {
    totalXP: 0,
    combo: 0,
    comboMultiplier: 1,
    comboLabel: 'Building...',
    tasksCompleted: 0,
    totalTasks,
    hasMood: false,
    hasReflection: false,
    dayGrade: { grade: '-', color: '#888' },
    lastTaskXP: 0,
    lastTaskBase: 0,
    lastTaskBonus: 0,
    level: getLevel(0),
  }
  return state
}

export {
  LEVELS,
  ACHIEVEMENTS,
  BASE_XP,
  getComboMultiplier,
  getBaseXP,
  getLevel,
  getDayGrade,
  processTaskComplete,
  processCompassFocusComplete,
  processTaskSkip,
  COMPASS_FOCUS_XP,
  checkAchievements,
  createInitialState,
}

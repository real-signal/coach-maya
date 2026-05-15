/**
 * Streak Freeze — token economy that protects streaks on rough days.
 *
 * Why: binary streaks are brittle. One sick day, one travel day, one bad
 * exam week and the whole habit chain breaks. Tokens let the kid earn
 * resilience by being consistent — and spend it deliberately when life hits.
 *
 * Earn rules (deterministic):
 *   - Every 7-day clean streak → +1 token
 *   - Perfect day (S-grade) → +1 token, capped at 1/day
 *   - Max wallet: 5 tokens (so they don't hoard)
 *
 * Spend rules:
 *   - 1 token = freeze 1 missed day (streak counter doesn't reset)
 *   - Auto-prompt at end of day if streak would break and tokens ≥ 1
 *   - User can also manually spend from Profile to protect a planned off-day
 */

const FREEZE_KEY = 'maya_streak_freeze'
const MAX_TOKENS = 5

function loadFreeze() {
  try {
    const raw = JSON.parse(localStorage.getItem(FREEZE_KEY) || 'null')
    if (!raw) return defaultFreeze()
    return {
      tokens: Math.max(0, Math.min(MAX_TOKENS, parseInt(raw.tokens) || 0)),
      lastPerfectDay: raw.lastPerfectDay || null,
      lastStreakAward: raw.lastStreakAward || 0,
      history: Array.isArray(raw.history) ? raw.history.slice(-50) : [],
    }
  } catch { return defaultFreeze() }
}

function defaultFreeze() {
  return { tokens: 0, lastPerfectDay: null, lastStreakAward: 0, history: [] }
}

function saveFreeze(f) {
  try { localStorage.setItem(FREEZE_KEY, JSON.stringify(f)) } catch {}
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Award a token for hitting a perfect day. Idempotent per calendar day.
 * Returns { awarded, tokens }.
 */
function awardPerfectDay() {
  const f = loadFreeze()
  const today = todayKey()
  if (f.lastPerfectDay === today) return { awarded: false, tokens: f.tokens, reason: 'already_awarded_today' }
  if (f.tokens >= MAX_TOKENS) {
    f.lastPerfectDay = today
    saveFreeze(f)
    return { awarded: false, tokens: f.tokens, reason: 'wallet_full' }
  }
  f.tokens += 1
  f.lastPerfectDay = today
  f.history.push({ type: 'earned', source: 'perfect_day', delta: +1, at: new Date().toISOString() })
  saveFreeze(f)
  return { awarded: true, tokens: f.tokens }
}

/**
 * Award a token when the kid hits a multiple-of-7 streak. Won't double-award
 * across resets — tracked via lastStreakAward.
 */
function awardStreakMilestone(currentStreak) {
  const f = loadFreeze()
  const n = parseInt(currentStreak) || 0
  if (n < 7 || n % 7 !== 0) return { awarded: false, tokens: f.tokens }
  if (n <= f.lastStreakAward) return { awarded: false, tokens: f.tokens, reason: 'already_awarded' }
  if (f.tokens >= MAX_TOKENS) {
    f.lastStreakAward = n
    saveFreeze(f)
    return { awarded: false, tokens: f.tokens, reason: 'wallet_full' }
  }
  f.tokens += 1
  f.lastStreakAward = n
  f.history.push({ type: 'earned', source: `streak_${n}`, delta: +1, at: new Date().toISOString() })
  saveFreeze(f)
  return { awarded: true, tokens: f.tokens, streak: n }
}

/**
 * Spend one token to freeze a day. Returns { spent, tokens, error? }.
 */
function spendToken(reason = 'manual') {
  const f = loadFreeze()
  if (f.tokens <= 0) return { spent: false, tokens: 0, error: 'no_tokens' }
  f.tokens -= 1
  f.history.push({ type: 'spent', source: reason, delta: -1, at: new Date().toISOString() })
  saveFreeze(f)
  return { spent: true, tokens: f.tokens }
}

function getTokens() {
  return loadFreeze().tokens
}

function getFreezeHistory() {
  return loadFreeze().history.slice().reverse()
}

function resetFreeze() {
  saveFreeze(defaultFreeze())
}

export {
  awardPerfectDay,
  awardStreakMilestone,
  spendToken,
  getTokens,
  getFreezeHistory,
  resetFreeze,
  MAX_TOKENS,
}

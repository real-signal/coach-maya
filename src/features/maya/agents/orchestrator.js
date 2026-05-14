/**
 * The Orchestrator
 * Routes events to the right agent(s) and assembles the final output.
 * Every user action triggers a specific flow.
 */

import { processTaskComplete, processTaskSkip, checkAchievements, getDayGrade } from './gamification'
import { evaluateSchedule, getDebrief, getMorningBriefing } from './scheduler'
import { generateMessage, MESSAGE_TYPES } from './mayaCore'
import { shouldSpotCheck, generateSpotCheckQuestion, createSpotCheckRecord } from './antiGaming'
import { recordInsideJoke } from './personalityLearner'

// ─── Event Types ───
const EVENTS = {
  TASK_COMPLETE: 'task_complete',
  TASK_SKIP: 'task_skip',
  SCHEDULE_TICK: 'schedule_tick',
  MORNING_START: 'morning_start',
  EVENING_END: 'evening_end',
  USER_CHAT: 'user_chat',
  MOOD_CHECK: 'mood_check',
  REFLECTION: 'reflection',
  SPOT_CHECK_RESPONSE: 'spot_check_response',
}

/**
 * Process a task completion event
 * Flow: Gamification → Anti-Gaming (30%) → Schedule → Maya Core → Log
 */
async function handleTaskComplete(task, state, personalityContext) {
  const result = { events: [], messages: [], state: { ...state } }

  // 1. Gamification Engine
  result.state.gamification = processTaskComplete(state.gamification, task.type)
  result.events.push({ agent: 'gamification', action: 'task_complete', data: result.state.gamification })

  // 2. Check for new achievements
  const newAchievements = checkAchievements(result.state.gamification, state.unlockedAchievements || [])
  if (newAchievements.length > 0) {
    result.state.unlockedAchievements = [
      ...(state.unlockedAchievements || []),
      ...newAchievements.map(a => a.id),
    ]
    result.events.push({ agent: 'gamification', action: 'achievements_unlocked', data: newAchievements })
  }

  // 3. Anti-Gaming Sentinel (30% chance)
  let spotCheck = null
  if (shouldSpotCheck()) {
    const question = generateSpotCheckQuestion(task)
    spotCheck = { taskId: task.id, question, pending: true }
    result.state.pendingSpotCheck = spotCheck
    result.events.push({ agent: 'anti_gaming', action: 'spot_check', data: spotCheck })
  }

  // 4. Schedule Conductor — get debrief
  const debrief = getDebrief(task, result.state.gamification)
  result.events.push({ agent: 'scheduler', action: 'debrief', data: debrief })

  // 5. Maya Core — generate celebration message
  const mayaMsg = await generateMessage(MESSAGE_TYPES.TASK_DEBRIEF, {
    taskName: task.name,
    xpEarned: result.state.gamification.lastTaskXP,
    combo: result.state.gamification.combo,
    comboLabel: result.state.gamification.comboLabel,
    dayGrade: result.state.gamification.dayGrade.grade,
    mood: state.todayMood,
    streak: state.profile?.currentStreak,
  }, personalityContext)
  result.messages.push(mayaMsg)

  // 5b. If spot check, add the question as a follow-up message
  if (spotCheck) {
    result.messages.push({
      text: spotCheck.question,
      type: 'spot_check',
      timestamp: new Date().toISOString(),
      taskId: task.id,
    })
  }

  // 5c. If new achievements, announce them
  for (const achievement of newAchievements) {
    result.messages.push({
      text: `${achievement.icon} Achievement Unlocked: ${achievement.title} — ${achievement.desc}`,
      type: 'achievement',
      timestamp: new Date().toISOString(),
    })
  }

  // 6. Update last activity time
  result.state.lastActivityTime = new Date().toISOString()

  // 7. Log for parent intelligence
  result.state.dayLog = [
    ...(state.dayLog || []),
    {
      type: 'task_complete',
      task: task.name,
      taskType: task.type,
      xp: result.state.gamification.lastTaskXP,
      combo: result.state.gamification.combo,
      time: new Date().toISOString(),
    },
  ]

  return result
}

/**
 * Process a task skip
 * Flow: Gamification (reset combo) → Maya Core (message)
 */
async function handleTaskSkip(task, state, personalityContext) {
  const result = { events: [], messages: [], state: { ...state } }

  result.state.gamification = processTaskSkip(state.gamification)
  result.events.push({ agent: 'gamification', action: 'task_skip', data: result.state.gamification })

  // Maya doesn't nag about skips — just states facts
  const mayaMsg = await generateMessage(MESSAGE_TYPES.OVERDUE_WARNING, {
    taskName: task.name,
    minutesOverdue: 0,
    combo: 0,
    comboAtRisk: false,
  }, personalityContext)
  result.messages.push(mayaMsg)

  result.state.dayLog = [
    ...(state.dayLog || []),
    { type: 'task_skip', task: task.name, time: new Date().toISOString() },
  ]

  return result
}

/**
 * Schedule tick — check for nudges
 * Flow: Schedule Conductor → Maya Core for any triggered nudges
 */
async function handleScheduleTick(state, personalityContext) {
  const result = { events: [], messages: [], state: { ...state } }

  const nudges = evaluateSchedule({
    tasks: state.tasks || [],
    currentTime: new Date(),
    combo: state.gamification?.combo || 0,
    lastActivityTime: state.lastActivityTime,
  })

  for (const nudge of nudges) {
    let msgType
    let ctx = {}

    switch (nudge.type) {
      case 'pre_task':
        msgType = MESSAGE_TYPES.PRE_TASK_NUDGE
        ctx = { taskName: nudge.task.name, minutesUntil: nudge.minutesUntil, combo: state.gamification?.combo || 0 }
        break
      case 'overdue':
        msgType = MESSAGE_TYPES.OVERDUE_WARNING
        ctx = { taskName: nudge.task.name, minutesOverdue: nudge.minutesOverdue, combo: state.gamification?.combo || 0, comboAtRisk: nudge.comboAtRisk }
        break
      case 'combo_warn':
        msgType = MESSAGE_TYPES.COMBO_WARNING
        ctx = { combo: nudge.combo, minutesLeft: nudge.minutesLeft }
        break
      case 'idle_nudge':
        msgType = MESSAGE_TYPES.IDLE_NUDGE
        ctx = { idleMinutes: nudge.idleMinutes }
        break
      case 'day_complete':
        msgType = MESSAGE_TYPES.DAY_COMPLETE
        ctx = {
          dayGrade: state.gamification?.dayGrade?.grade || '-',
          totalXP: state.gamification?.totalXP || 0,
          combo: state.gamification?.combo || 0,
        }
        break
      default:
        continue
    }

    const msg = await generateMessage(msgType, ctx, personalityContext)
    result.messages.push(msg)
    result.events.push({ agent: 'scheduler', action: nudge.type, data: nudge })
  }

  return result
}

// Detect when Vasco wants a real lesson, not a snappy reply.
// Returns 'quiz' | 'explain' | null.
function detectTeachingIntent(message) {
  const m = String(message || '').toLowerCase()
  // Quiz-style requests
  if (/\b(quiz|test|drill)\s+(me|us)\b/.test(m)) return 'quiz'
  if (/\b(give|ask|throw|hit)\s+me\s+(\d+|a\s+few|some|a\s+bunch|a\s+set)\b.*\b(question|problem|exercise)/.test(m)) return 'quiz'
  if (/\b\d+\s+(questions?|problems?|exercises?)\b/.test(m)) return 'quiz'
  if (/\bquestions?\s+(on|about|for)\b/.test(m)) return 'quiz'
  // Explanation-style requests
  if (/\b(explain|teach|walk\s+me\s+through|break\s+down|how\s+does|what\s+is|why\s+does)\b/.test(m) && m.length > 30) return 'explain'
  return null
}

// ─── Quiz session: drill one question at a time ───
const QUIZ_SESSION_KEY = 'maya_quiz_session'

function loadQuizSession() {
  try {
    const raw = JSON.parse(localStorage.getItem(QUIZ_SESSION_KEY) || 'null')
    if (!raw || !Array.isArray(raw.questions) || raw.questions.length === 0) return null
    return raw
  } catch { return null }
}
function saveQuizSession(s) {
  try { localStorage.setItem(QUIZ_SESSION_KEY, JSON.stringify(s)) } catch {}
}
function clearQuizSession() {
  try { localStorage.removeItem(QUIZ_SESSION_KEY) } catch {}
}

// Parse a numbered list ("1. ...", "2) ...", "**1.** ...", "Q1: ...") out of
// Maya's quiz response. Joins continuation lines onto the current question.
// Handles markdown-bolded numbers because Claude often emits "**1.**" for lists.
function parseNumberedQuestions(text) {
  const lines = String(text || '').split('\n')
  const items = []
  let current = null
  const startRe = /^\s*(?:\*\*)?\s*(?:Q\.?\s*)?(\d+)\s*[\.\):]\s*(?:\*\*)?\s*(.+?)\s*$/i
  for (const line of lines) {
    const m = line.match(startRe)
    if (m) {
      if (current) items.push(current.trim())
      current = m[2].replace(/\*\*/g, '').trim()
    } else if (current && line.trim() && !line.match(/^\s*[—–-]{2,}/)) {
      // Continuation. Stop on horizontal rules / Maya's closing line.
      current += ' ' + line.replace(/\*\*/g, '').trim()
    } else if (current && !line.trim()) {
      // Blank line — usually ends the list section. Push and stop appending.
      items.push(current.trim())
      current = null
    }
  }
  if (current) items.push(current.trim())
  // Strip any item that looks like Maya's closing one-liner (no question mark, short)
  return items.filter(q => q.length > 10)
}

// Detect "I want out of this quiz" — clean exit
function isQuizExit(message) {
  const m = String(message || '').toLowerCase().trim()
  return /^(stop|quit|cancel|exit|nevermind|never mind|no more|done|skip\s*all|end quiz)\b/.test(m)
}

// Pull the actual subject out of the user's request, so Maya can name it
// naturally instead of repeating "the topic you asked about".
function extractTopic(message) {
  const m = String(message || '')
  // "questions on quantum physics" → "quantum physics"
  // "quiz me on euclidean geometry" → "euclidean geometry"
  // "5 problems in calculus" → "calculus"
  const patterns = [
    /(?:questions?|problems?|exercises?|quiz)\s+(?:me\s+)?(?:on|about|in|for)\s+(.+?)(?:[\.,?!]|$)/i,
    /(?:quiz|test|drill)\s+me\s+(?:on|about|in)\s+(.+?)(?:[\.,?!]|$)/i,
    /(?:on|about)\s+(.+?)(?:[\.,?!]|$)/i,
  ]
  for (const re of patterns) {
    const m2 = m.match(re)
    if (m2 && m2[1]) return m2[1].trim().replace(/^the\s+/i, '').slice(0, 60)
  }
  return 'this'
}

// Varied openers so the first question doesn't always sound the same.
// Picks one based on count + topic — feels like a real coach starting a drill.
function pickOpener(count, topic) {
  const openers = [
    `Alright. ${count} on ${topic} — first one:`,
    `Yeah. ${count} coming at you, ${topic}. Easy starter:`,
    `Right. ${count} questions, mix of conceptual and edge cases. Start:`,
    `${count} on ${topic}. Take 'em one at a time.`,
    `Locked in. ${count} questions, ${topic}. Go:`,
  ]
  return openers[Math.floor(Math.random() * openers.length)]
}

/**
 * Handle free chat from Vasco — with last 10 turns of history for context
 */
async function handleUserChat(message, state, personalityContext) {
  // Build Claude-compatible history from recent messages (excluding the one just sent)
  const recent = (state.messages || []).slice(-20)
  // Precedence: m.text must always be truthy. Without the parens around the
  // type-check, the right side bypassed the text guard and let messages with
  // undefined .text reach Claude as { content: undefined } → 400 errors.
  const ASSISTANT_TYPES = new Set([undefined, 'task_debrief', 'pre_task_nudge', 'free_chat', 'maya', 'quiz_question', 'quiz_turn'])
  const history = recent
    .filter(m => m && m.text && (m.type === 'user' || ASSISTANT_TYPES.has(m.type)))
    .map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: m.text,
    }))
    // Collapse consecutive same-role messages (Claude API requirement)
    .reduce((acc, m) => {
      const last = acc[acc.length - 1]
      if (last && last.role === m.role) {
        last.content += '\n' + m.content
      } else {
        acc.push({ ...m })
      }
      return acc
    }, [])
    .slice(-10)

  // ── Active quiz session: treat user message as their answer to the
  //    current question, react naturally in Maya voice, then ask the next.
  const session = loadQuizSession()
  if (session) {
    if (isQuizExit(message)) {
      clearQuizSession()
      return {
        events: [{ agent: 'maya_core', action: 'quiz_exit' }],
        messages: [{
          text: `Done. We bailed on ${session.topic} at Q${session.idx + 1}/${session.questions.length}. Pick it up later.`,
          type: 'maya', timestamp: new Date().toISOString(),
        }],
        state,
      }
    }

    const currentQuestion = session.questions[session.idx]
    const isLast = session.idx + 1 >= session.questions.length

    if (isLast) {
      const finale = await generateMessage(MESSAGE_TYPES.QUIZ_FINALE, {
        topic: session.topic,
        currentQuestion,
        userAnswer: message,
      }, personalityContext, history)
      clearQuizSession()
      return {
        events: [{ agent: 'maya_core', action: 'quiz_finale' }],
        messages: [finale],
        state,
      }
    }

    const nextQuestion = session.questions[session.idx + 1]
    const turnMsg = await generateMessage(MESSAGE_TYPES.QUIZ_TURN, {
      topic: session.topic,
      questionNumber: session.idx + 1,
      currentQuestion,
      userAnswer: message,
      nextQuestion,
    }, personalityContext, history)
    saveQuizSession({ ...session, idx: session.idx + 1 })
    return {
      events: [{ agent: 'maya_core', action: 'quiz_turn', data: { idx: session.idx + 1 } }],
      messages: [turnMsg],
      state,
    }
  }

  const intent = detectTeachingIntent(message)
  const msgType = intent === 'quiz' ? MESSAGE_TYPES.QUIZ_REQUEST
                : intent === 'explain' ? MESSAGE_TYPES.DEEP_EXPLAIN
                : MESSAGE_TYPES.FREE_CHAT
  const mayaMsg = await generateMessage(msgType, {
    userMessage: message,
  }, personalityContext, history)

  // ── Quiz request: parse the numbered list, save remaining for one-at-a-time
  //    drill, lead with the first question conversationally — no "Q1." prefix,
  //    no scripted instructions. Just start drilling, like a real coach.
  if (msgType === MESSAGE_TYPES.QUIZ_REQUEST) {
    const questions = parseNumberedQuestions(mayaMsg.text)
    if (questions.length >= 2) {
      const topic = extractTopic(message)
      saveQuizSession({
        questions,
        idx: 0,
        topic,
        startedAt: new Date().toISOString(),
      })
      const opener = pickOpener(questions.length, topic)
      // Single fluid message — opener + first question, so TTS reads it as
      // one coaching beat instead of "instructions then question".
      const firstMessage = `${opener} ${questions[0]}`
      return {
        events: [{ agent: 'maya_core', action: 'quiz_start', data: { count: questions.length } }],
        messages: [
          { text: firstMessage, type: 'quiz_question', timestamp: new Date().toISOString() },
        ],
        state,
      }
    }
  }

  // Inside-joke detection: if kid laughed at something, save the prior Maya
  // line they're reacting to (the most recent assistant message before this turn).
  try {
    const lastMaya = [...(state.messages || [])]
      .reverse()
      .find(m => m && m.text && m.type !== 'user')
    if (lastMaya?.text) {
      recordInsideJoke(message, lastMaya.text)
    }
  } catch {}

  return {
    events: [{ agent: 'maya_core', action: 'free_chat' }],
    messages: [mayaMsg],
    state,
  }
}

/**
 * Morning briefing
 */
async function handleMorningStart(state, personalityContext) {
  const briefing = getMorningBriefing(state.tasks || [], state.streak || 0)
  const mayaMsg = await generateMessage(MESSAGE_TYPES.MORNING_BRIEFING, {
    totalTasks: briefing.totalTasks,
    taskNames: briefing.taskNames,
    streak: briefing.streak,
    firstTask: briefing.firstTask?.name || 'your first task',
  }, personalityContext)

  return {
    events: [{ agent: 'scheduler', action: 'morning_briefing', data: briefing }],
    messages: [mayaMsg],
    state,
  }
}

/**
 * Handle mood check-in
 */
async function handleMoodCheck(mood, state) {
  const result = { events: [], messages: [], state: { ...state } }
  result.state.gamification = { ...state.gamification, hasMood: true }
  result.state.gamification.dayGrade = getDayGrade(
    result.state.gamification.tasksCompleted,
    result.state.gamification.totalTasks,
    true,
    result.state.gamification.hasReflection
  )
  result.state.todayMood = mood
  result.state.dayLog = [
    ...(state.dayLog || []),
    { type: 'mood', mood, time: new Date().toISOString() },
  ]
  return result
}

/**
 * Handle reflection
 */
async function handleReflection(text, state, personalityContext) {
  const result = { events: [], messages: [], state: { ...state } }
  result.state.gamification = { ...state.gamification, hasReflection: true }
  result.state.gamification.dayGrade = getDayGrade(
    result.state.gamification.tasksCompleted,
    result.state.gamification.totalTasks,
    result.state.gamification.hasMood,
    true
  )
  result.state.dayLog = [
    ...(state.dayLog || []),
    { type: 'reflection', text, time: new Date().toISOString() },
  ]

  const mayaMsg = await generateMessage(MESSAGE_TYPES.FREE_CHAT, {
    userMessage: `End-of-day reflection: "${text}". Respond briefly — acknowledge what was said, point out one specific thing to be proud of today.`,
  }, personalityContext)
  result.messages.push(mayaMsg)

  return result
}

export {
  EVENTS,
  handleTaskComplete,
  handleTaskSkip,
  handleScheduleTick,
  handleUserChat,
  handleMorningStart,
  handleMoodCheck,
  handleReflection,
}

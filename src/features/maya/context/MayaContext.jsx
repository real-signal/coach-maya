import { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from 'react'
import { createInitialState, processCompassFocusComplete, checkAchievements, COMPASS_FOCUS_XP } from '../agents/gamification'
import { toggleCompassFocus, loadCompassLog, todayDateKey, focusesForToday, adherenceStreak } from '../lib/compassTracks'
import { getComboTimeLeft } from '../agents/scheduler'
import { evaluateResponse, createSpotCheckRecord } from '../agents/antiGaming'
import { recordEvent } from '../agents/personalityLearner'
import { generateDailyReport, generateWeeklyDigest } from '../agents/parentIntelligence'
import { loadProfile, saveProfile, buildPersonalityContext } from '../lib/profile'
import { speak, cancelSpeech, listen, isSTTSupported, isAnySpeechActive } from '../lib/voice'
import { notify } from '../lib/notifications'
import { startWatchdog, stopWatchdog } from '../lib/scheduler'
import { WakeWordDetector } from '../lib/wakeWord'
import sfx from '../lib/sfx'
import { recordTaskOutcome, logFocusScore, logSubjectScore } from '../agents/intelligence'
import { startPresenceWatch, stopPresenceWatch, buildArrivalLine } from '../agents/presence'
import { saveMood as saveMoodToHistory } from '../lib/moods'
import { generateDefaultSchedule } from '../agents/scheduleGenerator'
import {
  handleTaskComplete,
  handleTaskSkip,
  handleScheduleTick,
  handleUserChat,
  handleMorningStart,
  handleMoodCheck,
  handleReflection,
} from '../agents/orchestrator'

const MayaContext = createContext(null)

const STORAGE_KEY = 'maya_state'
const SCHEDULE_KEY = 'maya_schedule'
const HISTORY_KEY = 'maya_history'

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}
function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    // Quota exceeded — prune oldest messages/dayLog and retry once
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
      try {
        const pruned = {
          ...data,
          messages: Array.isArray(data?.messages) ? data.messages.slice(-50) : [],
          dayLog: Array.isArray(data?.dayLog) ? data.dayLog.slice(-100) : [],
          spotChecks: Array.isArray(data?.spotChecks) ? data.spotChecks.slice(-25) : [],
        }
        localStorage.setItem(key, JSON.stringify(pruned))
      } catch {}
    }
  }
}

const DEFAULT_SCHEDULE = generateDefaultSchedule()

// Bounds prevent localStorage QuotaExceededError on long sessions
const MAX_MESSAGES = 200
const MAX_DAY_LOG = 500
const MAX_SPOT_CHECKS = 100

function capArr(arr, max) {
  return arr.length > max ? arr.slice(arr.length - max) : arr
}

function mayaReducer(state, action) {
  switch (action.type) {
    case 'SET_STATE': return { ...state, ...action.payload }
    case 'ADD_MESSAGE': return { ...state, messages: capArr([...state.messages, action.payload], MAX_MESSAGES) }
    case 'ADD_MESSAGES': return { ...state, messages: capArr([...state.messages, ...action.payload], MAX_MESSAGES) }
    case 'COMPLETE_TASK': {
      const tasks = state.tasks.map(t =>
        t.id === action.payload.id ? { ...t, completed: true, completedAt: new Date().toISOString() } : t
      )
      return { ...state, tasks }
    }
    case 'SKIP_TASK': {
      const tasks = state.tasks.map(t =>
        t.id === action.payload.id ? { ...t, skipped: true } : t
      )
      return { ...state, tasks }
    }
    case 'SET_TASKS': return { ...state, tasks: action.payload }
    case 'SET_GAMIFICATION': return { ...state, gamification: action.payload }
    case 'SET_PENDING_SPOT_CHECK': return { ...state, pendingSpotCheck: action.payload }
    case 'CLEAR_SPOT_CHECK': return { ...state, pendingSpotCheck: null }
    case 'SET_MOOD': return { ...state, todayMood: action.payload }
    case 'ADD_SPOT_CHECK': return { ...state, spotChecks: capArr([...(state.spotChecks || []), action.payload], MAX_SPOT_CHECKS) }
    case 'SET_PROFILE': return { ...state, profile: action.payload, personalityContext: buildPersonalityContext(action.payload) }
    case 'SET_VOICE_STATE': return { ...state, voiceState: action.payload }
    case 'RESET_DAY': {
      const tasks = state.tasks.map(t => ({ ...t, completed: false, skipped: false, completedAt: null }))
      return {
        ...state, tasks, messages: [], dayLog: [], todayMood: null,
        pendingSpotCheck: null, spotChecks: [],
        gamification: createInitialState(tasks.length),
      }
    }
    default: return state
  }
}

function MayaProvider({ children }) {
  const savedState = loadFromStorage(STORAGE_KEY, null)
  const savedSchedule = loadFromStorage(SCHEDULE_KEY, DEFAULT_SCHEDULE)
  const initialProfile = loadProfile()

  const safeSchedule = Array.isArray(savedSchedule) ? savedSchedule : DEFAULT_SCHEDULE
  const initialTasks = safeSchedule.map(t => ({ ...t, completed: false, skipped: false }))
  const safeTasks = Array.isArray(savedState?.tasks) ? savedState.tasks : initialTasks
  const initialState = {
    tasks: safeTasks,
    gamification: savedState?.gamification && typeof savedState.gamification === 'object' ? savedState.gamification : createInitialState(initialTasks.length),
    messages: Array.isArray(savedState?.messages) ? savedState.messages : [],
    dayLog: Array.isArray(savedState?.dayLog) ? savedState.dayLog : [],
    unlockedAchievements: savedState?.unlockedAchievements || [],
    lastActivityTime: savedState?.lastActivityTime || null,
    pendingSpotCheck: savedState?.pendingSpotCheck || null,
    spotChecks: savedState?.spotChecks || [],
    todayMood: savedState?.todayMood || null,
    streak: savedState?.streak || initialProfile.currentStreak || 0,
    profile: initialProfile,
    personalityContext: buildPersonalityContext(initialProfile),
    voiceState: 'idle', // idle | speaking | listening
  }

  const [state, dispatch] = useReducer(mayaReducer, initialState)
  const tickRef = useRef(null)
  const lastSpokenIdRef = useRef(null)
  const stopListenRef = useRef(null)
  const wakeRef = useRef(null)
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [liveLesson, setLiveLesson] = useState(null) // { subject, startedAt }

  // Persist (with bounds to avoid quota errors)
  useEffect(() => {
    const { profile, personalityContext, voiceState, ...rest } = state
    const bounded = {
      ...rest,
      messages: capArr(rest.messages || [], MAX_MESSAGES),
      dayLog: capArr(rest.dayLog || [], MAX_DAY_LOG),
      spotChecks: capArr(rest.spotChecks || [], MAX_SPOT_CHECKS),
    }
    saveToStorage(STORAGE_KEY, bounded)
  }, [state])

  // One-time migration: ensure voice is ON for the v54+ Vasco-default build.
  // The previous v1 migration force-DISABLED voice; this v2 migration reverses
  // it once per device so existing installs pick up the ElevenLabs coach voice
  // without the user having to manually flip the toggle.
  useEffect(() => {
    try {
      const key = 'maya_voice_enabled_v2'
      if (!localStorage.getItem(key)) {
        const p = loadProfile()
        if (!p.voiceAutoSpeak || !p.voiceEnabled) {
          const next = { ...p, voiceAutoSpeak: true, voiceEnabled: true }
          saveProfile(next)
          dispatch({ type: 'SET_PROFILE', payload: next })
        }
        localStorage.setItem(key, '1')
      }
    } catch {}
  }, [])

  // Audio unlock — browsers refuse audio.play() until the tab has received a
  // user gesture. The arrival greeting fires from presence detection, not from
  // a click, so without this primer the speech is silently rejected. On the
  // first pointer/key/touch event we play a near-silent buffer; that single
  // gesture unlocks audio for the rest of the session, so when Vasco walks
  // back in Maya can actually speak.
  useEffect(() => {
    const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAVFYAAFRWAAABAAgAZGF0YQAAAAA='
    let unlocked = false
    const unlock = () => {
      if (unlocked) return
      unlocked = true
      try {
        const a = new Audio(SILENT_WAV)
        a.volume = 0
        a.play().catch(() => {})
      } catch {}
      try { window.speechSynthesis?.resume() } catch {}
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchstart', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  // One-time migration: turn presence detection ON for existing devices.
  // Browser will prompt for camera once; granted state persists forever after.
  useEffect(() => {
    try {
      const key = 'maya_presence_enabled_v1'
      if (!localStorage.getItem(key)) {
        const p = loadProfile()
        if (!p.presenceDetectionEnabled) {
          const next = { ...p, presenceDetectionEnabled: true }
          saveProfile(next)
          dispatch({ type: 'SET_PROFILE', payload: next })
        }
        localStorage.setItem(key, '1')
      }
    } catch {}
  }, [])

  // One-time migration: turn wake word ("hey maya") ON for existing devices
  // so Maya is hands-free engageable from app boot without a mic-button tap.
  // Browser will prompt for mic permission once; granted state persists after.
  useEffect(() => {
    try {
      const key = 'maya_wake_word_enabled_v1'
      if (!localStorage.getItem(key)) {
        const p = loadProfile()
        if (!p.wakeWordEnabled) {
          const next = { ...p, wakeWordEnabled: true }
          saveProfile(next)
          dispatch({ type: 'SET_PROFILE', payload: next })
        }
        localStorage.setItem(key, '1')
      }
    } catch {}
  }, [])

  // URL-driven profile patcher: ?fixProfile=age:14,name:Vasco,grade:9
  // Strips the query param after applying so it doesn't re-run.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const raw = params.get('fixProfile')
      if (!raw) return
      const ALLOWED_KEYS = new Set(['age', 'name', 'grade', 'location', 'voiceAutoSpeak', 'voiceEnabled'])
      const patch = {}
      for (const pair of raw.split(',')) {
        const [k, v] = pair.split(':').map(s => s?.trim())
        if (!k || v == null || !ALLOWED_KEYS.has(k)) continue
        if (k === 'age') {
          const n = parseInt(v)
          if (Number.isFinite(n) && n >= 4 && n <= 22) patch.age = n
        } else if (k === 'voiceAutoSpeak' || k === 'voiceEnabled') {
          patch[k] = v === 'true' || v === '1'
        } else {
          patch[k] = String(v).slice(0, 60)
        }
      }
      if (Object.keys(patch).length) {
        const p = loadProfile()
        const merged = { ...p, ...patch }
        saveProfile(merged)
        dispatch({ type: 'SET_PROFILE', payload: merged })
      }
      params.delete('fixProfile')
      const qs = params.toString()
      const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
      window.history.replaceState({}, '', url)
    } catch {}
  }, [])

  // Auto-speak Maya messages + send notification if backgrounded
  useEffect(() => {
    const last = state.messages[state.messages.length - 1]
    if (!last || last.type === 'user') return
    const id = last.timestamp + (last.text?.slice(0, 20) || '')
    if (lastSpokenIdRef.current === id) return
    lastSpokenIdRef.current = id

    if (state.profile?.voiceAutoSpeak) {
      dispatch({ type: 'SET_VOICE_STATE', payload: 'speaking' })
      let bargeStop = null
      // ── Voice barge-in: while Maya speaks, run a light listener. Any
      //    detected speech (final transcript) cancels TTS + sends it as input.
      //    Default-on; users can disable via profile.voiceBargeIn = false.
      if (state.profile?.voiceBargeIn !== false && isSTTSupported()) {
        try {
          bargeStop = listen({
            onResult: (transcript, isFinal) => {
              if (!isFinal || !transcript || !transcript.trim()) return
              // Cancel Maya mid-sentence so she gets out of the way.
              try { cancelSpeech() } catch {}
              dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' })
              try { bargeStop?.() } catch {}
              bargeStop = null
              sendMessage(transcript.trim())
            },
            onError: () => { try { bargeStop?.() } catch {}; bargeStop = null },
            onEnd: () => { bargeStop = null },
          })
        } catch {}
      }
      speak(last.text, {
        onEnd: () => {
          try { bargeStop?.() } catch {}
          bargeStop = null
          dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' })
          // Re-read quiz state at TTS-end time (not render time) so we don't
          // reopen the mic after the user already hit ✕ END mid-speech.
          let stillMidQuiz = false
          try {
            const s = JSON.parse(localStorage.getItem('maya_quiz_session') || 'null')
            stillMidQuiz = !!(s && Array.isArray(s.questions) && s.questions.length > 0)
          } catch {}
          // startListening is idempotent — prior recognizer is torn down first.
          if (stillMidQuiz && isSTTSupported()) {
            // Small delay so the final TTS audio fully clears before mic opens
            setTimeout(() => { try { startListening() } catch {} }, 350)
          }
        },
        onError: () => {
          try { bargeStop?.() } catch {}
          bargeStop = null
          dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' })
        },
      })
    }

    // If page is hidden + notifications enabled, nudge
    if (state.profile?.notificationsEnabled && document.hidden) {
      const isUrgent = ['combo_warn', 'overdue', 'achievement'].includes(last.type)
      notify('Coach Maya', last.text, { tag: last.type, requireInteraction: isUrgent })
    }
  }, [state.messages, state.profile])

  // ─── Actions ───
  // Helper: surface async-handler failures so a network/Claude blip doesn't
  // leave the UI in an inconsistent state without telling the user.
  const noteHandlerError = useCallback((label, err) => {
    if (typeof window !== 'undefined') {
      window.__mayaLastError = { label, msg: err?.message || String(err), ts: Date.now() }
    }
    dispatch({ type: 'ADD_MESSAGE', payload: {
      text: "Hit a snag syncing that. Your action saved, but stats might be a tick off. Try again in a sec.",
      type: 'maya', timestamp: new Date().toISOString(), tag: 'system_warning',
    }})
  }, [])

  const completeTask = useCallback(async (taskId) => {
    const task = state.tasks.find(t => t.id === taskId)
    if (!task || task.completed) return
    sfx.taskComplete()
    dispatch({ type: 'COMPLETE_TASK', payload: { id: taskId } })

    let result
    try {
      result = await handleTaskComplete(task, {
        gamification: state.gamification,
        unlockedAchievements: state.unlockedAchievements,
        lastActivityTime: state.lastActivityTime,
        dayLog: state.dayLog,
        tasks: state.tasks,
      }, state.personalityContext)
    } catch (e) { noteHandlerError('completeTask', e); return }

    dispatch({ type: 'SET_STATE', payload: {
      gamification: result.state.gamification,
      unlockedAchievements: result.state.unlockedAchievements,
      lastActivityTime: result.state.lastActivityTime,
      dayLog: result.state.dayLog,
      pendingSpotCheck: result.state.pendingSpotCheck || null,
    }})
    if (result.messages.length > 0) {
      dispatch({ type: 'ADD_MESSAGES', payload: result.messages })
      // Combo + achievement sounds
      if (result.messages.some(m => m.type === 'achievement')) sfx.achievement()
      else if (result.state.gamification?.combo >= 3) sfx.combo()
    }

    // Personality learner
    const updated = recordEvent({ type: 'task_complete', payload: { taskType: task.type } })
    dispatch({ type: 'SET_PROFILE', payload: updated })

    // Intelligence layer
    recordTaskOutcome(task.type, true)
  }, [state])

  // Parent compass focus check-off. Awards a flat parent-priority XP bonus
  // when going from unchecked → checked (no XP returned on un-checking).
  // Compass log itself is owned by lib/compassTracks (separate storage), so
  // this only mutates gamification + dayLog.
  const completeCompassFocus = useCallback((focusId, focusLabel) => {
    const todayKey = todayDateKey()
    const before = !!(loadCompassLog()?.[todayKey]?.[focusId])
    toggleCompassFocus(focusId)
    const after = !!(loadCompassLog()?.[todayKey]?.[focusId])
    if (after && !before) {
      sfx.taskComplete()
      const nextGam = processCompassFocusComplete(state.gamification)
      const dayLogEntry = {
        type: 'compass_complete',
        task: focusLabel || 'Compass focus',
        focusId,
        xp: COMPASS_FOCUS_XP,
        time: new Date().toISOString(),
      }
      // Check compass-streak achievements. adherenceStreak reads the log
      // we just wrote, so it reflects the new completion.
      const compass = state.profile?.parentCompass
      const compassStreak = compass?.track ? adherenceStreak(compass) : 0
      const newAchievements = checkAchievements(
        { ...nextGam, compassStreak },
        state.unlockedAchievements || []
      )
      const payload = {
        gamification: nextGam,
        dayLog: [...(state.dayLog || []), dayLogEntry],
        lastActivityTime: new Date().toISOString(),
      }
      if (newAchievements.length > 0) {
        payload.unlockedAchievements = [
          ...(state.unlockedAchievements || []),
          ...newAchievements.map(a => a.id),
        ]
        sfx.achievement()
      }
      dispatch({ type: 'SET_STATE', payload })
      if (newAchievements.length > 0) {
        // Format must match the regex in components/AchievementModal.jsx:
        //   /^(.{1,2})\s+Achievement Unlocked: (.+?) — (.+)$/
        // — same format used by orchestrator.js for task-driven unlocks.
        dispatch({ type: 'ADD_MESSAGES', payload: newAchievements.map(a => ({
          text: `${a.icon} Achievement Unlocked: ${a.title} — ${a.desc}`,
          type: 'achievement',
          timestamp: new Date().toISOString(),
          achievement: a,
        })) })
      }
    } else if (!after && before) {
      // Uncheck — keep XP (don't claw back; the kid earned the moment).
      // Just drop the dayLog entry to keep the timeline honest.
      dispatch({ type: 'SET_STATE', payload: {
        dayLog: (state.dayLog || []).filter(e => !(e.type === 'compass_complete' && e.focusId === focusId && e.time?.slice(0,10) === todayKey)),
      }})
    }
    return after
  }, [state])

  const skipTask = useCallback(async (taskId) => {
    const task = state.tasks.find(t => t.id === taskId)
    if (!task) return
    dispatch({ type: 'SKIP_TASK', payload: { id: taskId } })

    let result
    try {
      result = await handleTaskSkip(task, {
        gamification: state.gamification,
        dayLog: state.dayLog,
      }, state.personalityContext)
    } catch (e) { noteHandlerError('skipTask', e); return }

    dispatch({ type: 'SET_STATE', payload: { gamification: result.state.gamification, dayLog: result.state.dayLog } })
    if (result.messages.length > 0) {
      dispatch({ type: 'ADD_MESSAGES', payload: result.messages })
    }
    const updated = recordEvent({ type: 'task_skip', payload: { taskType: task.type } })
    dispatch({ type: 'SET_PROFILE', payload: updated })
  }, [state])

  const sendMessage = useCallback(async (text) => {
    dispatch({ type: 'ADD_MESSAGE', payload: { text, type: 'user', timestamp: new Date().toISOString() } })
    let result
    try {
      result = await handleUserChat(text, state, state.personalityContext)
    } catch (e) { noteHandlerError('sendMessage', e); return }
    if (result.messages.length > 0) {
      dispatch({ type: 'ADD_MESSAGES', payload: result.messages })
    }
    const updated = recordEvent({ type: 'chat_user', payload: { text } })
    dispatch({ type: 'SET_PROFILE', payload: updated })
  }, [state])

  const setMood = useCallback(async (mood) => {
    let result
    try {
      result = await handleMoodCheck(mood, state)
    } catch (e) { noteHandlerError('setMood', e); return }
    dispatch({ type: 'SET_STATE', payload: {
      gamification: result.state.gamification,
      todayMood: result.state.todayMood,
      dayLog: result.state.dayLog,
    }})
    dispatch({ type: 'SET_MOOD', payload: mood })
    saveMoodToHistory(mood)
    const updated = recordEvent({ type: 'mood', payload: { mood } })
    dispatch({ type: 'SET_PROFILE', payload: updated })
  }, [state])

  const submitReflection = useCallback(async (text) => {
    let result
    try {
      result = await handleReflection(text, state, state.personalityContext)
    } catch (e) { noteHandlerError('submitReflection', e); return }
    dispatch({ type: 'SET_STATE', payload: {
      gamification: result.state.gamification,
      dayLog: result.state.dayLog,
    }})
    if (result.messages.length > 0) {
      dispatch({ type: 'ADD_MESSAGES', payload: result.messages })
    }
  }, [state])

  const updateSchedule = useCallback((newTasks) => {
    saveToStorage(SCHEDULE_KEY, newTasks)
    const tasks = newTasks.map(t => ({ ...t, completed: false, skipped: false }))
    dispatch({ type: 'SET_TASKS', payload: tasks })
    dispatch({ type: 'SET_STATE', payload: { gamification: createInitialState(tasks.length) } })
  }, [])

  const resetDay = useCallback(() => dispatch({ type: 'RESET_DAY' }), [])

  const updateProfile = useCallback((patch) => {
    const next = { ...state.profile, ...patch }
    saveProfile(next)
    dispatch({ type: 'SET_PROFILE', payload: next })
  }, [state.profile])

  const respondToSpotCheck = useCallback((response) => {
    if (!state.pendingSpotCheck) return
    const evaluation = evaluateResponse(response)
    const record = createSpotCheckRecord(
      { id: state.pendingSpotCheck.taskId, name: state.pendingSpotCheck.taskName, type: state.pendingSpotCheck.taskType },
      state.pendingSpotCheck.question, response, evaluation
    )
    dispatch({ type: 'ADD_SPOT_CHECK', payload: record })
    dispatch({ type: 'CLEAR_SPOT_CHECK' })
  }, [state.pendingSpotCheck])

  // ─── Voice: listen for user voice input ───
  const startListening = useCallback(() => {
    if (!isSTTSupported()) {
      alert('Voice input not supported in this browser. Try Chrome or Safari.')
      return
    }
    // Idempotent: if a recognizer is already running (e.g. auto-listen fired
    // while user already had the mic open), tear it down before starting a
    // new one. Otherwise the old instance leaks and we get two transcripts.
    if (stopListenRef.current) {
      try { stopListenRef.current() } catch {}
      stopListenRef.current = null
    }
    cancelSpeech()
    setIsListening(true)
    setInterimTranscript('')
    dispatch({ type: 'SET_VOICE_STATE', payload: 'listening' })
    stopListenRef.current = listen({
      onResult: (transcript, isFinal) => {
        setInterimTranscript(transcript)
        if (isFinal && transcript) {
          sendMessage(transcript)
          setInterimTranscript('')
        }
      },
      onEnd: () => {
        setIsListening(false)
        dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' })
      },
      onError: () => {
        setIsListening(false)
        dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' })
      },
    })
  }, [sendMessage])

  const stopListening = useCallback(() => {
    if (stopListenRef.current) stopListenRef.current()
    setIsListening(false)
    dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' })
  }, [])

  const stopSpeaking = useCallback(() => {
    cancelSpeech()
    dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' })
  }, [])

  const speakText = useCallback((text) => {
    // Only speak if user has opted in (voice is off by default now)
    if (!state.profile?.voiceAutoSpeak) return
    dispatch({ type: 'SET_VOICE_STATE', payload: 'speaking' })
    speak(text, {
      onEnd: () => dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' }),
      onError: () => dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' }),
    })
  }, [state.profile])

  const getDailyReport = useCallback(() => {
    const report = generateDailyReport({
      dayLog: state.dayLog,
      gamification: state.gamification,
      tasks: state.tasks,
      mood: state.todayMood,
      reflection: state.dayLog.find(e => e.type === 'reflection')?.text,
      spotChecks: state.spotChecks,
    })
    // Snapshot one report per day so weekly digest has history to draw on.
    try {
      const history = loadFromStorage('maya_daily_reports', [])
      const arr = Array.isArray(history) ? history : []
      const idx = arr.findIndex(r => r.date === report.date)
      if (idx >= 0) arr[idx] = report
      else arr.push(report)
      saveToStorage('maya_daily_reports', arr.slice(-60))
    } catch {}
    return report
  }, [state])

  const getWeeklyDigest = useCallback(() => {
    const history = loadFromStorage('maya_daily_reports', [])
    return generateWeeklyDigest(Array.isArray(history) ? history : [])
  }, [])

  // ─── Quiz session: end-from-anywhere ───
  // The orchestrator manages quiz state in localStorage. The HUD needs a way
  // to bail out without typing "stop" in chat. Clears the session + drops a
  // Maya-voice closing line so the chat history reflects the exit.
  const endQuizSession = useCallback(() => {
    try {
      const raw = localStorage.getItem('maya_quiz_session')
      const s = raw ? JSON.parse(raw) : null
      const topic = s?.topic || 'that'
      const at = s?.idx != null && Array.isArray(s?.questions)
        ? `Q${s.idx + 1}/${s.questions.length}`
        : ''
      localStorage.removeItem('maya_quiz_session')
      dispatch({ type: 'ADD_MESSAGE', payload: {
        text: `Done. We bailed on ${topic}${at ? ` at ${at}` : ''}. Pick it up later.`,
        type: 'maya', timestamp: new Date().toISOString(),
      }})
    } catch {
      try { localStorage.removeItem('maya_quiz_session') } catch {}
    }
  }, [])

  // Presence detection — engage Vasco when he walks back in
  useEffect(() => {
    if (!state.profile?.presenceDetectionEnabled) {
      stopPresenceWatch()
      return
    }
    let cancelled = false
    ;(async () => {
      const res = await startPresenceWatch(() => {
        // Don't barge in on an active conversation or speech
        if (state.voiceState === 'speaking' || state.voiceState === 'listening') return
        // 1.2s settle delay — lets him sit down before Maya speaks, so it
        // feels like noticing rather than ambushing.
        setTimeout(() => {
          if (cancelled) return
          if (state.voiceState === 'speaking' || state.voiceState === 'listening') return
          const line = buildArrivalLine({ profile: state.profile })
          const msg = { text: line, type: 'maya', timestamp: new Date().toISOString(), tag: 'presence_arrive' }
          dispatch({ type: 'ADD_MESSAGE', payload: msg })
          if (state.profile?.voiceAutoSpeak) {
            dispatch({ type: 'SET_VOICE_STATE', payload: 'speaking' })
            speak(line, {
              onEnd: () => dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' }),
              onError: () => dispatch({ type: 'SET_VOICE_STATE', payload: 'idle' }),
            })
          }
        }, 1200)
      })
      if (!res.ok && !cancelled) {
        console.warn('Presence watch failed:', res.error)
      }
    })()
    return () => { cancelled = true; stopPresenceWatch() }
  }, [state.profile?.presenceDetectionEnabled])

  // Wake word — "hey maya"
  useEffect(() => {
    if (!state.profile?.wakeWordEnabled) {
      wakeRef.current?.stop()
      wakeRef.current = null
      return
    }
    if (wakeRef.current) return
    wakeRef.current = new WakeWordDetector({
      onWake: (rest) => {
        if (rest) {
          sendMessage(rest)
        } else {
          // Just the trigger — open active listening
          startListening()
        }
      },
      onError: (e) => console.warn('wake word error', e),
    })
    wakeRef.current.start()
    return () => { wakeRef.current?.stop() }
  }, [state.profile?.wakeWordEnabled])

  // Start notification watchdog (1-min cadence, fires desktop nudges)
  useEffect(() => {
    const getState = () => ({
      tasks: state.tasks,
      gamification: state.gamification,
      lastActivityTime: state.lastActivityTime,
      profile: state.profile,
    })
    if (state.profile?.notificationsEnabled) {
      startWatchdog(getState)
    } else {
      stopWatchdog()
    }
    return () => stopWatchdog()
  }, [state.profile?.notificationsEnabled, state.tasks, state.gamification, state.lastActivityTime, state.profile])

  // Schedule Tick (every 5 min)
  useEffect(() => {
    tickRef.current = setInterval(async () => {
      // Wrap the async body: a Claude API blip here would otherwise fire an
      // unhandledRejection every 5 minutes for the rest of the session.
      try {
        const result = await handleScheduleTick({
          tasks: state.tasks,
          gamification: state.gamification,
          lastActivityTime: state.lastActivityTime,
        }, state.personalityContext)
        if (result.messages.length > 0) {
          dispatch({ type: 'ADD_MESSAGES', payload: result.messages })
        }
      } catch (err) {
        noteHandlerError('scheduleTick', err)
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(tickRef.current)
  }, [state.tasks, state.gamification, state.lastActivityTime, state.personalityContext])

  const comboTimeLeft = getComboTimeLeft(state.lastActivityTime)

  const value = {
    tasks: state.tasks,
    gamification: state.gamification,
    messages: state.messages,
    dayLog: state.dayLog,
    unlockedAchievements: state.unlockedAchievements,
    pendingSpotCheck: state.pendingSpotCheck,
    spotChecks: state.spotChecks,
    todayMood: state.todayMood,
    streak: state.streak,
    profile: state.profile,
    voiceState: state.voiceState,
    isListening,
    interimTranscript,
    liveLesson,
    setLiveLesson,
    comboTimeLeft,
    completeTask,
    completeCompassFocus,
    skipTask,
    sendMessage,
    setMood,
    submitReflection,
    updateSchedule,
    resetDay,
    respondToSpotCheck,
    updateProfile,
    startListening,
    stopListening,
    stopSpeaking,
    speakText,
    getDailyReport,
    getWeeklyDigest,
    endQuizSession,
  }

  return <MayaContext.Provider value={value}>{children}</MayaContext.Provider>
}

function useMaya() {
  const ctx = useContext(MayaContext)
  if (!ctx) throw new Error('useMaya must be used within MayaProvider')
  return ctx
}

export { MayaProvider, useMaya }

import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  startLessonCapture, stopLessonCapture,
  generateQuiz, extractKeyPoints, extractConcepts, saveLesson,
} from './agents/lessonAnalyst'
import { addConceptsFromLesson } from './agents/memory'
import { generateStudyGuide } from './agents/studyGuide'
import { gradeQuiz } from './agents/quizGrader'
import { LessonRecorder, putAudio } from './lib/audioStore'
import { MicLevel } from './lib/micLevel'
import { listen, isSTTSupported } from './lib/voice'
import { transcribeWithWhisper } from './lib/whisper'
import { TabAudioRecorder } from './lib/tabAudio'
import { loadProfile } from './lib/profile'
import { getApiKey } from './lib/secrets'
import { useMaya } from './context/MayaContext'
const MayaAvatar = lazy(() => import('./components/Maya3D'))
const AvatarFallback = ({ size = 200 }) => <div style={{ width: size, height: size }} />

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171',
  green: '#34D399', gold: '#FFD700', amber: '#FBBF24',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

const SUBJECTS = ['Maths', 'Science', 'English', 'History', 'Languages', 'Coding', 'Art', 'Other']

// Phase: pick → live → review → quiz → done
export default function MayaLesson() {
  const navigate = useNavigate()
  const maya = useMaya()
  const [phase, setPhase] = useState('pick')
  const [paused, setPaused] = useState(false)
  const [captureMode, setCaptureMode] = useState('tab') // 'tab' | 'mic'
  const tabRecorderRef = useRef(null)
  const [askMaya, setAskMaya] = useState(false)
  const [askInput, setAskInput] = useState('')
  const [askAnswer, setAskAnswer] = useState('')
  const [askLoading, setAskLoading] = useState(false)
  const [draft, setDraft] = useState(() => {
    try {
      const raw = localStorage.getItem('maya_lesson_draft')
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  })
  const [subject, setSubject] = useState('Maths')
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [keyPoints, setKeyPoints] = useState([])
  const [quiz, setQuiz] = useState([])
  const [answers, setAnswers] = useState({})
  const [lessonResult, setLessonResult] = useState(null)
  const [grading, setGrading] = useState(null)
  const [studyGuide, setStudyGuide] = useState(null)
  const [guideLoading, setGuideLoading] = useState(false)
  const startedAtRef = useRef(null)
  const timerRef = useRef(null)
  const lastNudgeRef = useRef(0)
  const recorderRef = useRef(null)
  const micLevelRef = useRef(null)
  const [micLevel, setMicLevel] = useState(0)
  const [micError, setMicError] = useState(null)
  const [micTesting, setMicTesting] = useState(false)
  const [sttTest, setSttTest] = useState({ active: false, transcript: '', error: '' })

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (phase === 'live') stopLessonCapture()
  }, [])

  // Auto-save draft every 15s while live
  useEffect(() => {
    if (phase !== 'live') return
    const i = setInterval(() => {
      try {
        localStorage.setItem('maya_lesson_draft', JSON.stringify({
          subject, transcript, elapsed,
          startedAt: startedAtRef.current,
          savedAt: Date.now(),
        }))
      } catch {}
    }, 15000)
    return () => clearInterval(i)
  }, [phase, subject, transcript, elapsed])

  const clearDraft = () => {
    try { localStorage.removeItem('maya_lesson_draft') } catch {}
    setDraft(null)
  }

  // ─── Mic test (pre-flight) ───
  const testMic = async () => {
    setMicTesting(true)
    setMicError(null)
    try {
      const ml = new MicLevel()
      await ml.start((lvl) => setMicLevel(lvl))
      micLevelRef.current = ml
    } catch (e) {
      setMicError(e.message || 'Mic blocked')
      setMicTesting(false)
    }
  }
  const stopMicTest = () => {
    micLevelRef.current?.stop()
    micLevelRef.current = null
    setMicTesting(false)
    setMicLevel(0)
  }

  // ─── Speech Recognition test (separate from mic level) ───
  const testSpeech = () => {
    if (!isSTTSupported()) {
      setSttTest({ active: false, transcript: '', error: 'SpeechRecognition not supported in this browser. Use Chrome desktop.' })
      return
    }
    setSttTest({ active: true, transcript: '', error: '' })
    const stop = listen({
      continuous: true,
      onResult: (text, isFinal) => {
        setSttTest(s => ({ ...s, transcript: text }))
      },
      onError: (e) => {
        setSttTest(s => ({ ...s, active: false, error: e?.error || e?.message || 'Unknown error' }))
      },
      onEnd: () => {
        setSttTest(s => ({ ...s, active: false }))
      },
    })
    // Auto-stop after 8 seconds
    setTimeout(() => { try { stop?.() } catch {} }, 8000)
  }

  // ─── Phase: live capture ───
  const start = async () => {
    setTranscript('')
    setInterim('')
    setElapsed(0)
    setMicError(null)
    startedAtRef.current = Date.now()

    // TAB AUDIO MODE — capture a browser tab's audio directly
    if (captureMode === 'tab') {
      try {
        tabRecorderRef.current = new TabAudioRecorder()
        await tabRecorderRef.current.start()
      } catch (e) {
        setMicError(e.message || 'Tab audio capture failed')
        maya.speakText("Tab capture failed. Check the picker instructions.")
        return
      }
      setPhase('live')
      maya.setLiveLesson?.({ subject, startedAt: new Date().toISOString() })
      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startedAtRef.current) / 1000)
        setElapsed(secs)
        const min = Math.floor(secs / 60)
        if (min > 0 && min % 12 === 0 && lastNudgeRef.current !== min) {
          lastNudgeRef.current = min
          maya.speakText('Still locked in? You got this.')
        }
      }, 1000)
      return
    }

    // MIC MODE — original path
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
      probe.getTracks().forEach(t => t.stop())
    } catch (e) {
      setMicError('Mic permission denied. Click the lock icon in your browser address bar to allow microphone access, then try again.')
      maya.speakText("I can't access the microphone. Check the browser permissions.")
      return
    }

    setPhase('live')

    try {
      micLevelRef.current = new MicLevel()
      await micLevelRef.current.start((lvl) => setMicLevel(lvl))
    } catch (e) {
      console.warn('Mic level meter failed:', e)
    }

    try {
      recorderRef.current = new LessonRecorder()
      await recorderRef.current.start()
    } catch (e) {
      console.warn('Recording disabled:', e)
    }

    startLessonCapture({
      subject,
      onInterim: (t) => setInterim(t),
      onFinal: (text, full) => { setTranscript(full); setInterim('') },
      onError: (e) => console.warn('Lesson capture error:', e),
    })
    maya.setLiveLesson?.({ subject, startedAt: new Date().toISOString() })

    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setElapsed(secs)
      // Maya focus check-ins every ~12 minutes
      const min = Math.floor(secs / 60)
      if (min > 0 && min % 12 === 0 && lastNudgeRef.current !== min) {
        lastNudgeRef.current = min
        const nudges = [
          'Still locked in? You got this.',
          "Halfway through. Don't drift.",
          'Eyes on the teacher. I\'m still listening.',
          "You're doing great — keep going.",
        ]
        const text = nudges[Math.floor(Math.random() * nudges.length)]
        maya.speakText(text)
      }
    }, 1000)
  }

  const stop = async () => {
    if (timerRef.current) clearInterval(timerRef.current)
    micLevelRef.current?.stop()
    micLevelRef.current = null

    // Handle tab audio OR mic audio
    let audioBlob = null
    let result = null

    if (captureMode === 'tab' && tabRecorderRef.current) {
      // Tab audio path
      try {
        audioBlob = await tabRecorderRef.current.stop()
      } catch (e) { console.warn('tab recorder stop failed', e) }
      tabRecorderRef.current = null
      // Build a synthetic result since we didn't use Web Speech
      result = {
        id: `lesson_${Date.now()}`,
        subject,
        startedAt: new Date(startedAtRef.current).toISOString(),
        endedAt: new Date().toISOString(),
        durationMin: Math.round((Date.now() - startedAtRef.current) / 60000),
        fullTranscript: '',
        wordCount: 0,
        snippetCount: 0,
      }
    } else {
      // Mic path
      result = stopLessonCapture()
      if (recorderRef.current) {
        try {
          audioBlob = await recorderRef.current.stop()
        } catch (e) { console.warn('audio stop failed', e) }
        recorderRef.current = null
      }
    }

    // Persist audio blob
    let audioId = null
    if (audioBlob && result?.id) {
      audioId = result.id
      try { await putAudio(audioId, audioBlob) } catch (e) { console.warn('audio save failed', e) }
    }

    // ─── Whisper transcription ───
    // Tab mode: REQUIRED (no live transcript).
    // Mic mode: optional override of Web Speech.
    const profile = loadProfile()
    const openaiKey = getApiKey('openai')
    let whisperTranscript = null
    if (audioBlob && audioBlob.size > 1000) {
      if (!openaiKey) {
        if (captureMode === 'tab') {
          setPhase('pick')
          maya.setLiveLesson?.(null)
          setMicError('Tab mode needs an OpenAI API key to transcribe. Add one in Profile.')
          maya.speakText('I need an OpenAI key to transcribe the tab audio.')
          return
        }
      } else {
        try {
          setPhase('transcribing')
          maya.speakText('Transcribing the lesson with Whisper. One sec.')
          whisperTranscript = await transcribeWithWhisper(audioBlob, openaiKey, {
            prompt: `This is a ${subject} lesson for a ${profile.age || 12}-year-old student.`,
            language: 'en',
          })
        } catch (e) {
          console.error('Whisper failed:', e)
          setMicError(`Whisper failed: ${e.message}`)
          if (captureMode === 'tab') {
            setPhase('pick')
            maya.setLiveLesson?.(null)
            maya.speakText('Whisper failed. Check your OpenAI key and billing.')
            return
          }
        }
      }
    }

    // Use Whisper transcript if available, else fall back to Web Speech
    if (result && whisperTranscript) {
      result.fullTranscript = whisperTranscript
      result.wordCount = whisperTranscript.split(/\s+/).filter(Boolean).length
    }

    if (!result || !result.fullTranscript || result.wordCount < 3) {
      setPhase('pick')
      maya.setLiveLesson?.(null)
      const msg = !result?.fullTranscript
        ? (openaiKey
          ? "I caught zero audio even with Whisper. The mic isn't picking up sound at all."
          : "I caught zero audio. Add an OpenAI API key in Profile for reliable Whisper transcription, or check your mic.")
        : `Only caught ${result.wordCount} words. ${openaiKey ? 'Try moving closer to the speaker.' : 'Add an OpenAI key in Profile for Whisper — way more reliable.'}`
      setMicError(msg)
      maya.speakText(msg)
      return
    }
    result.audioId = audioId
    setLessonResult(result)
    maya.setLiveLesson?.(null)
    const points = extractKeyPoints(result.fullTranscript, 3)
    setKeyPoints(points)
    setPhase('review')

    // Maya narrates the recap one beat at a time
    setTimeout(() => {
      const intro = `Lesson done. Here's what stuck out from your ${subject} session.`
      maya.speakText(intro)
      // Then read each key point with a delay so user can follow
      points.forEach((p, i) => {
        setTimeout(() => maya.speakText(`Point ${i + 1}. ${p}`), (i + 1) * 4500)
      })
    }, 400)
  }

  const buildStudyGuide = async () => {
    setGuideLoading(true)
    try {
      const guide = await generateStudyGuide(lessonResult.fullTranscript, subject)
      setStudyGuide(guide)
    } catch (e) {
      console.warn('Study guide failed:', e)
    }
    setGuideLoading(false)
    setPhase('study')
  }

  const startQuiz = () => {
    const q = generateQuiz(lessonResult.fullTranscript, subject)
    setQuiz(q)
    setAnswers({})
    setPhase('quiz')
  }

  const copyForNotebookLM = async () => {
    const text = [
      `# ${subject} Lesson Transcript`,
      `Date: ${new Date(lessonResult.startedAt).toLocaleString()}`,
      `Duration: ${lessonResult.durationMin} min`,
      '',
      lessonResult.fullTranscript,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      window.open('https://notebooklm.google.com/', '_blank')
    } catch {
      // Fallback
      window.open('https://notebooklm.google.com/', '_blank')
    }
  }

  const submitQuiz = async () => {
    setPhase('grading')
    maya.speakText('Grading your answers. One sec.')

    const filledQuiz = quiz.map((q, i) => ({ q: q.q, a: answers[i] || '' }))
    let graded
    try {
      graded = await gradeQuiz(filledQuiz, lessonResult.fullTranscript, subject)
    } catch {
      graded = { overallScore: 50, feedback: 'Grading unavailable.', perQuestion: [] }
    }

    // XP based on actual score
    const xpBase = Math.round(30 + (graded.overallScore / 100) * 50)

    const lessonRecord = {
      ...lessonResult,
      keyPoints,
      quiz: filledQuiz,
      grading: graded,
      xpEarned: xpBase,
      completedAt: new Date().toISOString(),
    }
    saveLesson(lessonRecord)
    clearDraft()

    // Feed concepts into memory
    const concepts = extractConcepts(lessonResult.fullTranscript)
    addConceptsFromLesson(lessonResult, concepts)

    setGrading(graded)
    setPhase('done')

    // Speak the feedback
    setTimeout(() => maya.speakText(graded.feedback), 400)

    // Push summary into chat
    const summary = `Finished a ${lessonResult.durationMin}-min ${subject} lesson. Score: ${graded.overallScore}/100. Takeaway: ${keyPoints[0] || 'reviewed core concepts'}.`
    maya.sendMessage(summary)

    setTimeout(() => navigate('/'), 5000)
  }

  const cancel = () => {
    if (phase === 'live') stopLessonCapture()
    if (timerRef.current) clearInterval(timerRef.current)
    navigate('/')
  }

  // ─── Render ───
  const sendAskMaya = async () => {
    if (!askInput.trim()) return
    setAskLoading(true)
    setAskAnswer('')
    try {
      // Use Claude via maya core directly
      const { generateMessage, MESSAGE_TYPES } = await import('./agents/mayaCore')
      const ctx = {
        userMessage: `Context — I'm currently in a ${subject} lesson. Here's what the teacher has said so far: "${transcript.slice(-1500)}". My question is: ${askInput}`,
      }
      const msg = await generateMessage(MESSAGE_TYPES.FREE_CHAT, ctx, maya.personalityContext || '', [])
      setAskAnswer(msg.text)
      maya.speakText(msg.text)
    } catch (e) {
      setAskAnswer("Can't reach my brain right now. Try again in a sec.")
    } finally {
      setAskLoading(false)
    }
  }

  const closeAsk = () => {
    setAskMaya(false)
    setAskInput('')
    setAskAnswer('')
    // Resume lesson capture
    if (phase === 'live' && !paused) {
      startLessonCapture({
        subject,
        onInterim: (t) => setInterim(t),
        onFinal: (text, full) => { setTranscript(full); setInterim('') },
      })
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80 }}>
      <Header onBack={cancel} title={phase === 'live' ? 'Lesson Live' : phase === 'review' ? 'Recap' : phase === 'quiz' ? 'Quiz' : 'Lesson Mode'} />

      {/* Ask Maya overlay */}
      {askMaya && (
        <div
          onClick={closeAsk}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(6,12,24,0.9)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 440,
              background: C.surface, border: `1px solid ${C.teal}44`,
              borderRadius: 16, padding: 20,
            }}
          >
            <div style={{ fontSize: 10, color: C.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Ask Maya — she has the transcript
            </div>
            <textarea
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              placeholder="I don't get what the teacher just said about..."
              autoFocus
              style={{
                width: '100%', padding: '12px', background: C.bg,
                border: `1px solid ${C.border}`, borderRadius: 10,
                color: C.text, fontSize: 13, fontFamily: C.mono, outline: 'none',
                minHeight: 80, resize: 'vertical', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={closeAsk} style={{
                padding: '10px 16px', background: 'transparent',
                border: `1px solid ${C.border}`, borderRadius: 10,
                color: C.muted, fontSize: 12, fontFamily: C.mono, cursor: 'pointer',
              }}>Cancel</button>
              <button
                onClick={sendAskMaya}
                disabled={askLoading || !askInput.trim()}
                style={{
                  flex: 1, padding: '10px 16px',
                  background: askLoading ? C.dim : C.teal,
                  border: 'none', borderRadius: 10,
                  color: C.bg, fontSize: 12, fontWeight: 700,
                  fontFamily: C.mono, cursor: 'pointer',
                }}
              >{askLoading ? 'Thinking...' : 'Ask'}</button>
            </div>
            {askAnswer && (
              <div style={{
                marginTop: 14, padding: 12,
                background: C.surfaceLight, borderRadius: 10,
                borderLeft: `3px solid ${C.teal}`,
                fontSize: 13, color: C.text, lineHeight: 1.5,
              }}>
                {askAnswer}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        {/* PICK PHASE */}
        {phase === 'pick' && (
          <>
            {draft && draft.transcript && (
              <div style={{
                padding: 14, background: C.surfaceLight,
                borderLeft: `3px solid ${C.amber}`, borderRadius: 10,
                marginBottom: 14,
              }}>
                <div style={{ fontSize: 10, color: C.amber, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                  Unfinished lesson
                </div>
                <div style={{ fontSize: 12, color: C.text, marginBottom: 8 }}>
                  {draft.subject} · {Math.round(draft.elapsed / 60)}m · {(draft.transcript || '').split(/\s+/).length} words
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      setSubject(draft.subject)
                      setTranscript(draft.transcript)
                      setElapsed(draft.elapsed)
                      startedAtRef.current = Date.now() - draft.elapsed * 1000
                      setPhase('live')
                      startLessonCapture({
                        subject: draft.subject,
                        onInterim: (t) => setInterim(t),
                        onFinal: (text, full) => { setTranscript(full); setInterim('') },
                      })
                      timerRef.current = setInterval(() => {
                        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
                      }, 1000)
                      clearDraft()
                    }}
                    style={{ ...primary, marginBottom: 0, flex: 1 }}
                  >Resume</button>
                  <button
                    onClick={clearDraft}
                    style={{
                      padding: '12px 18px', background: 'transparent',
                      border: `1px solid ${C.border}`, borderRadius: 12,
                      color: C.muted, fontSize: 12, fontFamily: C.mono, cursor: 'pointer',
                    }}
                  >Discard</button>
                </div>
              </div>
            )}
            <Suspense fallback={<AvatarFallback size={220} />}><MayaAvatar state="speaking" size={220} /></Suspense>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16, marginTop: 8, textAlign: 'center' }}>
              I'll sit through your lesson, listen to the key parts, and quiz you afterward to lock it in.
            </p>
            <Section title="What lesson?">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SUBJECTS.map(s => (
                  <button key={s} onClick={() => setSubject(s)} style={chip(subject === s)}>{s}</button>
                ))}
              </div>
            </Section>
            {/* Capture mode selector */}
            <Section title="How should I listen?">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => setCaptureMode('tab')}
                  style={{
                    padding: '14px 16px', textAlign: 'left',
                    background: captureMode === 'tab' ? C.teal + '15' : C.surface,
                    border: `2px solid ${captureMode === 'tab' ? C.teal : C.border}`,
                    borderRadius: 12, cursor: 'pointer', fontFamily: C.mono,
                  }}
                >
                  <div style={{ fontSize: 13, color: captureMode === 'tab' ? C.teal : C.text, fontWeight: 700 }}>
                    🖥 Capture browser tab audio ⭐
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>
                    Best for lessons playing on this computer. I'll grab the audio straight from your tab — no mic needed. Works with YouTube, Zoom, Google Meet, etc.
                  </div>
                </button>
                <button
                  onClick={() => setCaptureMode('mic')}
                  style={{
                    padding: '14px 16px', textAlign: 'left',
                    background: captureMode === 'mic' ? C.teal + '15' : C.surface,
                    border: `2px solid ${captureMode === 'mic' ? C.teal : C.border}`,
                    borderRadius: 12, cursor: 'pointer', fontFamily: C.mono,
                  }}
                >
                  <div style={{ fontSize: 13, color: captureMode === 'mic' ? C.teal : C.text, fontWeight: 700 }}>
                    🎤 Microphone
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>
                    Best for in-person teaching or lessons on a different device. I'll listen through this device's mic.
                  </div>
                </button>
              </div>
            </Section>

            <div style={{ padding: 12, background: C.surfaceLight, borderRadius: 10, marginBottom: 12, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              {captureMode === 'tab'
                ? '💡 When you tap Start Lesson, a browser picker will open. Pick "Chrome Tab" → pick the lesson tab → ✅ CHECK "Share tab audio" → Share.'
                : '💡 Put me near the speaker so I can hear the teacher clearly. I\'ll check in on you every 12 min.'}
            </div>

            {/* Mic test — only shown in mic mode */}
            {captureMode === 'mic' && (
            <div style={{
              padding: 14, background: C.surface, borderRadius: 12,
              border: `1px solid ${C.border}`, marginBottom: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: C.teal, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Test microphone first
                </div>
                <button
                  onClick={micTesting ? stopMicTest : testMic}
                  style={{
                    padding: '6px 12px',
                    background: micTesting ? C.red : C.teal + '22',
                    border: `1px solid ${micTesting ? C.red : C.teal}`,
                    borderRadius: 6,
                    color: micTesting ? '#fff' : C.teal,
                    fontSize: 10, fontFamily: C.mono, cursor: 'pointer',
                  }}
                >{micTesting ? 'Stop' : '🎤 Test'}</button>
              </div>
              <MicMeter level={micLevel} />
              <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
                {micTesting
                  ? micLevel < 5
                    ? '⚠️ Mic too quiet — speak up or move closer to the speaker'
                    : micLevel < 25
                      ? '✓ Mic working but quiet'
                      : '✓ Mic loud and clear — ready to go'
                  : 'Tap test, then say something or play your lesson audio'}
              </div>
              {micError && (
                <div style={{ marginTop: 8, padding: 8, background: C.red + '11', border: `1px solid ${C.red}44`, borderRadius: 6, fontSize: 10, color: C.red }}>
                  {micError}
                </div>
              )}

              {/* Speech recognition test */}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Speech recognition test
                  </div>
                  <button
                    onClick={testSpeech}
                    disabled={sttTest.active}
                    style={{
                      padding: '5px 10px', background: sttTest.active ? C.amber : C.teal,
                      border: 'none', borderRadius: 6,
                      color: C.bg, fontSize: 10, fontFamily: C.mono,
                      fontWeight: 700, cursor: sttTest.active ? 'wait' : 'pointer',
                    }}
                  >{sttTest.active ? 'Listening 8s...' : '▶ Test STT'}</button>
                </div>
                {sttTest.transcript && (
                  <div style={{
                    padding: 8, background: '#22C55E11',
                    border: `1px solid #22C55E44`, borderRadius: 6,
                    fontSize: 11, color: C.text, lineHeight: 1.4,
                  }}>
                    ✓ Heard: "{sttTest.transcript}"
                  </div>
                )}
                {sttTest.error && (
                  <div style={{
                    padding: 8, background: C.red + '11',
                    border: `1px solid ${C.red}44`, borderRadius: 6,
                    fontSize: 10, color: C.red, fontFamily: 'monospace',
                  }}>
                    ❌ {sttTest.error}
                  </div>
                )}
                <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
                  Tests if your browser actually transcribes audio. Speak after tapping.
                </div>
              </div>
            </div>
            )}

            {/* Whisper key warning for tab mode */}
            {captureMode === 'tab' && !getApiKey('openai') && (
              <div style={{
                padding: 12, background: C.amber + '11',
                border: `1px solid ${C.amber}55`, borderRadius: 10,
                marginBottom: 12, fontSize: 11, color: C.amber, lineHeight: 1.5,
              }}>
                ⚠️ Tab audio needs <b>OpenAI Whisper</b> to transcribe. Add your OpenAI API key in Profile first, or switch to Microphone mode.
              </div>
            )}

            <button onClick={start} style={primary}>🎙 Start Lesson</button>
          </>
        )}

        {/* LIVE PHASE */}
        {phase === 'live' && (
          <>
            <div style={{
              padding: 20, background: C.surface, borderRadius: 16,
              border: `1px solid ${C.red}44`, textAlign: 'center', marginBottom: 12,
              position: 'relative',
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 36,
                background: C.red, margin: '0 auto 8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, animation: 'pulse 1.6s infinite',
                boxShadow: `0 0 24px ${C.red}66`,
              }}>🎙️</div>
              <div style={{ fontFamily: C.display, fontSize: 38, color: C.red, lineHeight: 1, letterSpacing: 1 }}>
                {formatTime(elapsed)}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                Listening to {subject}
              </div>
              <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                {transcript.split(/\s+/).filter(Boolean).length} words captured
              </div>
              {captureMode === 'mic' && (
                <div style={{ marginTop: 10 }}>
                  <MicMeter level={micLevel} compact />
                  <div style={{ fontSize: 9, color: micLevel < 5 ? C.red : C.muted, marginTop: 4 }}>
                    {micLevel < 5
                      ? '⚠️ Mic silent — check volume / move closer'
                      : `Mic level: ${micLevel}%`}
                  </div>
                </div>
              )}
              {captureMode === 'tab' && (
                <div style={{
                  marginTop: 10, padding: 8, background: C.teal + '11',
                  borderRadius: 6, fontSize: 10, color: C.teal, textAlign: 'center',
                }}>
                  🖥 Capturing tab audio — no mic needed
                </div>
              )}
            </div>

            <div style={{
              padding: 14, background: C.surface, borderRadius: 12,
              border: `1px solid ${C.border}`, marginBottom: 12,
              minHeight: 140, maxHeight: 240, overflowY: 'auto',
            }}>
              <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                Live transcript
              </div>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                {transcript || <span style={{ color: C.dim }}>Waiting for the teacher to start...</span>}
                {interim && <span style={{ color: C.muted }}> {interim}</span>}
              </div>
            </div>

            {/* Ask Maya mid-lesson */}
            <button
              onClick={() => {
                setAskMaya(true)
                // Pause transcription while asking
                stopLessonCapture()
              }}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'transparent', border: `1px solid ${C.teal}`,
                borderRadius: 10, color: C.teal, fontSize: 12,
                fontFamily: C.mono, cursor: 'pointer', marginBottom: 10,
              }}
            >💬 Ask Maya about the lesson</button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => {
                  if (paused) {
                    // Resume
                    setPaused(false)
                    startedAtRef.current = Date.now() - elapsed * 1000
                    startLessonCapture({
                      subject,
                      onInterim: (t) => setInterim(t),
                      onFinal: (text, full) => { setTranscript(full); setInterim('') },
                    })
                    timerRef.current = setInterval(() => {
                      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
                    }, 1000)
                    maya.speakText('And we are back.')
                  } else {
                    setPaused(true)
                    stopLessonCapture()
                    if (timerRef.current) clearInterval(timerRef.current)
                    maya.speakText('Paused. Take your break.')
                  }
                }}
                style={{ ...primary, flex: 1, background: paused ? C.green : C.amber }}
              >
                {paused ? '▶ Resume' : '⏸ Pause'}
              </button>
              <button onClick={stop} style={{ ...primary, flex: 1, background: C.red }}>End</button>
            </div>
          </>
        )}

        {/* REVIEW PHASE */}
        {phase === 'review' && (
          <>
            <Suspense fallback={<AvatarFallback size={200} />}><MayaAvatar state="speaking" size={200} /></Suspense>
            <div style={{
              padding: 14, background: C.surface, borderRadius: 12,
              border: `1px solid ${C.border}`, marginBottom: 12, marginTop: 8,
            }}>
              <div style={{ fontSize: 10, color: C.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Lesson stats
              </div>
              <Stats lesson={lessonResult} />
            </div>

            {keyPoints.length > 0 && (
              <div style={{
                padding: 14, background: C.surface, borderRadius: 12,
                border: `1px solid ${C.border}`, marginBottom: 12,
              }}>
                <div style={{ fontSize: 10, color: C.gold, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  Key takeaways
                </div>
                {keyPoints.map((pt, i) => (
                  <div key={i} style={{
                    padding: '10px 12px',
                    background: C.surfaceLight,
                    borderLeft: `3px solid ${C.gold}`,
                    borderRadius: 6,
                    marginBottom: 6,
                    fontSize: 12, color: C.text, lineHeight: 1.5,
                  }}>
                    <span style={{ color: C.gold, marginRight: 6 }}>{i + 1}.</span>{pt}
                  </div>
                ))}
              </div>
            )}

            <button onClick={buildStudyGuide} disabled={guideLoading} style={primary}>
              {guideLoading ? 'Generating study guide...' : '📚 Study Guide + Quiz'}
            </button>
            <button onClick={copyForNotebookLM} style={{
              ...secondary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              📋 Copy to NotebookLM
            </button>
            <button onClick={startQuiz} style={secondary}>Skip guide — straight to quiz</button>
          </>
        )}

        {/* STUDY GUIDE PHASE */}
        {phase === 'study' && studyGuide && (
          <>
            <div style={{ fontSize: 11, color: C.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Study Guide · {subject}
            </div>

            {/* Maya's note */}
            {studyGuide.mayaNote && (
              <div style={{
                padding: 14, background: C.surfaceLight, borderRadius: 12,
                borderLeft: `3px solid ${C.teal}`, marginBottom: 12,
                fontSize: 13, color: C.text, lineHeight: 1.5,
              }}>{studyGuide.mayaNote}</div>
            )}

            {/* Summary */}
            <Card title="Summary" color={C.teal}>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{studyGuide.summary}</div>
            </Card>

            {/* Key concepts */}
            {studyGuide.keyConcepts?.length > 0 && (
              <Card title="Key concepts" color={C.gold}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {studyGuide.keyConcepts.map((c, i) => (
                    <span key={i} style={{
                      padding: '5px 10px', borderRadius: 999,
                      background: C.gold + '22', border: `1px solid ${C.gold}44`,
                      fontSize: 11, color: C.gold,
                    }}>{c}</span>
                  ))}
                </div>
              </Card>
            )}

            {/* Study questions */}
            {studyGuide.studyQuestions?.length > 0 && (
              <Card title="Study questions">
                {studyGuide.studyQuestions.map((q, i) => (
                  <div key={i} style={{
                    padding: '8px 0',
                    borderBottom: i < studyGuide.studyQuestions.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}>
                    <span style={{
                      fontSize: 9, color: q.type === 'recall' ? C.green : q.type === 'understand' ? C.teal : C.amber,
                      textTransform: 'uppercase', letterSpacing: 1, marginRight: 6,
                    }}>{q.type}</span>
                    <span style={{ fontSize: 12, color: C.text }}>{q.q}</span>
                  </div>
                ))}
              </Card>
            )}

            {/* Common mistakes */}
            {studyGuide.commonMistakes?.length > 0 && (
              <Card title="Watch out for" color={C.red}>
                {studyGuide.commonMistakes.map((m, i) => (
                  <div key={i} style={{ fontSize: 12, color: C.text, padding: '4px 0', lineHeight: 1.5 }}>
                    ⚠️ {m}
                  </div>
                ))}
              </Card>
            )}

            {/* Explain challenge */}
            {studyGuide.explainChallenge && (
              <Card title="30-second challenge" color={C.amber}>
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{studyGuide.explainChallenge}</div>
              </Card>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={startQuiz} style={primary}>Take the quiz</button>
              <button onClick={copyForNotebookLM} style={secondary}>📋 NotebookLM</button>
            </div>
          </>
        )}

        {/* QUIZ PHASE */}
        {phase === 'quiz' && (
          <>
            <div style={{ fontSize: 11, color: C.teal, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              {subject} · {quiz.length} questions
            </div>
            {quiz.map((q, i) => (
              <div key={i} style={{
                padding: 14, background: C.surface, borderRadius: 12,
                border: `1px solid ${C.border}`, marginBottom: 10,
              }}>
                <div style={{ fontSize: 13, color: C.text, marginBottom: 8, lineHeight: 1.5 }}>
                  <span style={{ color: C.teal, marginRight: 6 }}>{i + 1}.</span>{q.q}
                </div>
                <textarea
                  value={answers[i] || ''}
                  onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                  placeholder="Your answer..."
                  style={{
                    width: '100%', padding: '10px 12px', background: C.bg,
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    color: C.text, fontSize: 12, fontFamily: C.mono, outline: 'none',
                    minHeight: 60, resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
            <button onClick={submitQuiz} style={primary}>Submit & Earn XP</button>
          </>
        )}

        {/* TRANSCRIBING PHASE */}
        {phase === 'transcribing' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Suspense fallback={<AvatarFallback size={220} />}><MayaAvatar state="thinking" size={220} /></Suspense>
            <div style={{ fontFamily: C.display, fontSize: 28, color: C.teal, marginTop: 12, letterSpacing: 1.5 }}>
              TRANSCRIBING...
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
              Whisper is reading every word. ~10-30 sec.
            </div>
          </div>
        )}

        {/* GRADING PHASE */}
        {phase === 'grading' && (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Suspense fallback={<AvatarFallback size={220} />}><MayaAvatar state="thinking" size={220} /></Suspense>
            <div style={{ fontFamily: C.display, fontSize: 28, color: C.teal, marginTop: 12, letterSpacing: 1.5 }}>
              GRADING...
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
              Maya's reading your answers against the lesson.
            </div>
          </div>
        )}

        {/* DONE PHASE */}
        {phase === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 8px' }}>
            <Suspense fallback={<AvatarFallback size={200} />}><MayaAvatar state={grading?.overallScore >= 70 ? 'celebrating' : 'idle'} size={200} /></Suspense>
            {grading && (
              <>
                <div style={{
                  fontFamily: C.display, fontSize: 72, lineHeight: 1,
                  color: grading.overallScore >= 80 ? C.gold : grading.overallScore >= 60 ? C.green : grading.overallScore >= 40 ? C.amber : C.red,
                  marginTop: 8,
                }}>{grading.overallScore}</div>
                <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>/ 100</div>
                <div style={{
                  fontSize: 13, color: C.text, lineHeight: 1.5,
                  padding: '14px 10px', marginTop: 10,
                  background: C.surface, borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  textAlign: 'left',
                }}>
                  {grading.feedback}
                </div>
                {grading.perQuestion?.length > 0 && (
                  <div style={{ marginTop: 12, textAlign: 'left' }}>
                    {grading.perQuestion.map((pq, i) => (
                      <div key={i} style={{
                        padding: '8px 10px', background: C.surfaceLight,
                        borderRadius: 8, marginBottom: 4,
                        fontSize: 11, display: 'flex', gap: 10,
                      }}>
                        <div style={{
                          minWidth: 32, fontWeight: 700,
                          color: pq.score >= 70 ? C.green : pq.score >= 40 ? C.amber : C.red,
                        }}>{pq.score}</div>
                        <div style={{ color: C.text, flex: 1 }}>{pq.note}</div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {!grading && (
              <>
                <div style={{ fontFamily: C.display, fontSize: 32, color: C.gold, marginTop: 12, letterSpacing: 1.5 }}>
                  LOCKED IN
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                  That lesson is now part of you.
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Stats({ lesson }) {
  if (!lesson?.fullTranscript) return null
  const concepts = extractConcepts(lesson.fullTranscript).slice(0, 3)
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Stat label="Duration" value={`${lesson.durationMin}m`} />
        <Stat label="Words" value={lesson.wordCount} />
      </div>
      {concepts.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, marginTop: 6 }}>
            Top concepts
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {concepts.map((c, i) => (
              <span key={i} style={{
                padding: '4px 10px', borderRadius: 999,
                background: C.teal + '22', border: `1px solid ${C.teal}44`,
                fontSize: 11, color: C.teal,
              }}>{c.phrase}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Card({ title, color, children }) {
  return (
    <div style={{
      padding: 14, background: C.surface, borderRadius: 12,
      border: `1px solid ${C.border}`, marginBottom: 10,
      borderLeft: color ? `3px solid ${color}` : `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 9, color: color || C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function MicMeter({ level, compact }) {
  const color = level >= 25 ? '#34D399' : level >= 5 ? '#FBBF24' : '#F87171'
  return (
    <div style={{
      width: '100%',
      height: compact ? 6 : 10,
      background: 'rgba(255,255,255,0.12)',
      borderRadius: 5,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div style={{
        height: '100%',
        width: `${level}%`,
        background: `linear-gradient(90deg, ${color}, ${color}cc)`,
        transition: 'width 80ms linear',
        boxShadow: level > 5 ? `0 0 8px ${color}66` : 'none',
      }} />
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{
      flex: 1, padding: 10, background: C.surfaceLight,
      borderRadius: 8, textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Header({ onBack, title }) {
  return (
    <div style={{
      padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
      background: C.surface, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <button onClick={onBack} style={{
        background: 'transparent', border: 'none', color: C.muted,
        fontSize: 18, cursor: 'pointer', padding: 0,
      }}>←</button>
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2 }}>{title}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function formatTime(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const chip = (active) => ({
  padding: '8px 14px', borderRadius: 999,
  border: `1px solid ${active ? C.teal : C.border}`,
  background: active ? C.teal + '22' : 'transparent',
  color: active ? C.teal : C.text,
  fontSize: 12, fontFamily: C.mono, cursor: 'pointer',
})

const primary = {
  width: '100%', padding: '14px 20px', background: C.teal,
  color: C.bg, border: 'none', borderRadius: 12,
  fontSize: 14, fontFamily: C.mono, fontWeight: 700, cursor: 'pointer',
  marginBottom: 8,
}
const secondary = {
  width: '100%', padding: '12px 20px', background: 'transparent',
  color: C.muted, border: `1px solid ${C.border}`, borderRadius: 12,
  fontSize: 13, fontFamily: C.mono, cursor: 'pointer',
}

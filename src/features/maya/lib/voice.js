/**
 * Voice Service — Maya speaks and listens.
 * TTS: ElevenLabs (premium) → Web Speech API (free fallback)
 * STT: Web Speech webkitSpeechRecognition
 */

import { loadProfile } from './profile'
import { getApiKey } from './secrets'

// ─── TTS: Maya Speaking ───
let voicesCache = null
let currentUtterance = null

function getVoices() {
  if (voicesCache) return voicesCache
  const voices = window.speechSynthesis?.getVoices() || []
  voicesCache = voices
  return voices
}

// Wait for voices to load (Chrome async loads them)
function waitForVoices() {
  return new Promise((resolve) => {
    const v = window.speechSynthesis?.getVoices() || []
    if (v.length) { voicesCache = v; resolve(v); return }
    const handler = () => {
      voicesCache = window.speechSynthesis.getVoices()
      window.speechSynthesis.removeEventListener('voiceschanged', handler)
      resolve(voicesCache)
    }
    window.speechSynthesis?.addEventListener('voiceschanged', handler)
    // Failsafe timeout
    setTimeout(() => resolve(window.speechSynthesis?.getVoices() || []), 1000)
  })
}

function pickMayaVoice() {
  const profile = loadProfile()
  const voices = getVoices()
  if (!voices.length) return null

  // 1. User-picked voice from profile
  if (profile?.systemVoice) {
    const picked = voices.find(v => v.name === profile.systemVoice)
    if (picked) return picked
  }

  // 2. Premium English voices, ranked
  const preferences = [
    'Samantha',           // macOS premium female
    'Ava (Premium)',      // macOS premium
    'Allison',            // macOS premium
    'Karen',              // macOS Australian
    'Moira',              // macOS Irish
    'Tessa',              // macOS S. African
    'Google US English',  // Chrome
    'Microsoft Aria',     // Edge premium
    'Microsoft Jenny',
  ]
  for (const name of preferences) {
    const v = voices.find(v => v.name.includes(name))
    if (v) return v
  }
  return voices.find(v => v.lang?.startsWith('en') && /female|woman|samantha|aria|jenny|karen/i.test(v.name))
    || voices.find(v => v.lang?.startsWith('en'))
    || voices[0]
}

function listAllVoices() {
  return getVoices().filter(v => v.lang?.startsWith('en'))
}

// ─── ElevenLabs (premium) ───
let currentAudio = null
let speechGen = 0           // monotonic counter — bumped on every speak()/cancel
let currentAbort = null     // aborts an in-flight fetch when superseded

async function speakElevenLabs(text, profile, callbacks = {}) {
  const apiKey = getApiKey('elevenlabs')
  // Default to Vasco's picked coach voice if key set but no voice chosen yet
  const voiceId = profile.elevenLabsVoiceId?.trim() || 'sMeMiS36FkhlOd721w9P'
  if (!apiKey) throw new Error('No ElevenLabs API key')

  // Capture this call's generation. If a newer speak() runs while we're
  // awaiting fetch/blob, our generation will be stale → bail before playing.
  const myGen = ++speechGen
  const ac = new AbortController()
  currentAbort = ac

  callbacks.onStart?.()
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    signal: ac.signal,
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      // multilingual_v2 is the most expressive/natural model
      // (turbo trades quality for latency — too robotic for coaching)
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.35,           // lower = more emotional variation
        similarity_boost: 0.85,    // higher = closer to source voice
        style: 0.55,               // higher = more expressive delivery
        use_speaker_boost: true,
      },
    }),
  })
  if (myGen !== speechGen) return   // superseded during fetch
  if (!res.ok) {
    let details = ''
    try { details = await res.text() } catch {}
    throw new Error(`ElevenLabs ${res.status}: ${details.slice(0, 200)}`)
  }
  const blob = await res.blob()
  if (myGen !== speechGen) return   // superseded during blob read
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  currentAudio = audio
  audio.onended = () => {
    URL.revokeObjectURL(url)
    if (currentAudio === audio) currentAudio = null
    callbacks.onEnd?.()
  }
  audio.onerror = (e) => {
    if (currentAudio === audio) currentAudio = null
    callbacks.onError?.(e)
  }
  await audio.play()
}

/**
 * Speak text as Maya. Returns a promise that resolves when finished.
 * Calls onBoundary(charIndex) and onEnd() so the avatar can lip-sync.
 */
async function speak(text, { onStart, onBoundary, onEnd, onError } = {}) {
  cancelSpeech()
  const profile = loadProfile()

  // Try ElevenLabs first if configured
  const elevenKey = getApiKey('elevenlabs')
  if (elevenKey && profile?.elevenLabsVoiceId) {
    try {
      await speakElevenLabs(text, profile, { onStart, onEnd, onError })
      return
    } catch (e) {
      // Surface the error visibly via a toast-style notification
      try {
        if (typeof window !== 'undefined') {
          window.__mayaVoiceError = e?.message || String(e)
        }
      } catch {}
    }
  }

  if (!('speechSynthesis' in window)) {
    onError?.(new Error('SpeechSynthesis not supported'))
    return
  }
  await waitForVoices()

  // Add subtle natural pauses + slight randomization for human feel
  const humanizedText = text
    .replace(/([.!?])\s+/g, '$1 ... ')   // longer pause after sentences
    .replace(/,\s+/g, ', ')                // tighter commas

  const utter = new SpeechSynthesisUtterance(humanizedText)
  const voice = pickMayaVoice()
  if (voice) utter.voice = voice
  // Slightly slower + natural pitch + small variation per call
  utter.rate = 0.96 + (Math.random() * 0.06)
  utter.pitch = 1.02 + (Math.random() * 0.06)
  utter.volume = 1

  utter.onstart = () => onStart?.()
  utter.onboundary = (e) => onBoundary?.(e.charIndex, e.charLength)
  utter.onend = () => { currentUtterance = null; onEnd?.() }
  utter.onerror = (e) => { currentUtterance = null; onError?.(e) }

  currentUtterance = utter
  window.speechSynthesis.speak(utter)
}

function cancelSpeech() {
  // Bump generation so any in-flight ElevenLabs fetch bails before play()
  speechGen++
  if (currentAbort) {
    try { currentAbort.abort() } catch {}
    currentAbort = null
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    currentUtterance = null
  }
  if (currentAudio) {
    try { currentAudio.pause() } catch {}
    try { currentAudio.src = '' } catch {}
    currentAudio = null
  }
}

function isSpeaking() {
  return !!(window.speechSynthesis?.speaking)
}

// ─── STT: Maya Listening ───
function isSTTSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/**
 * Start listening. Returns a stop() function.
 * Creates a FRESH recognition instance every call so the auto-restart loop
 * doesn't reuse a dead object.
 */
function listen({ onStart, onResult, onEnd, onError, continuous = false } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SR) {
    onError?.(new Error('SpeechRecognition not supported'))
    return () => {}
  }

  const r = new SR()
  r.continuous = continuous
  r.interimResults = true
  r.lang = 'en-US'
  r.maxAlternatives = 1

  let stopped = false

  r.onstart = () => onStart?.()
  r.onresult = (ev) => {
    let transcript = ''
    let isFinal = false
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      transcript += ev.results[i][0].transcript
      if (ev.results[i].isFinal) isFinal = true
    }
    onResult?.(transcript.trim(), isFinal)
  }
  r.onend = () => { if (!stopped) onEnd?.() }
  r.onerror = (e) => {
    // Surface real errors. 'no-speech' means silence — let onEnd handle restart.
    if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') {
      onError?.(e)
    } else {
      onEnd?.()
    }
  }

  try { r.start() } catch (e) { onError?.(e) }

  return () => {
    stopped = true
    try { r.stop() } catch {}
    try { r.abort() } catch {}
  }
}

export {
  speak,
  cancelSpeech,
  isSpeaking,
  listen,
  isSTTSupported,
  pickMayaVoice,
  listAllVoices,
  waitForVoices,
}

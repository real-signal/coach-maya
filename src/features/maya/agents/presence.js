/**
 * Presence Agent
 * Detects when Vasco walks into the room (via webcam motion) and triggers
 * Maya to engage him naturally — like a coach noticing him sit down.
 *
 * Privacy: opt-in via profile.presenceDetectionEnabled. No frames are stored
 * or sent anywhere — pixel diffs are computed locally and discarded.
 *
 * Detection model:
 *   - 320×240 webcam stream, ~3fps
 *   - Per-frame mean-absolute-pixel-diff vs previous frame
 *   - "Motion" = diff above threshold for ≥2 consecutive frames
 *   - "Present" = motion seen in last PRESENT_WINDOW_MS
 *   - "Absent" = no motion for ≥ABSENT_WINDOW_MS
 *   - "Arrive" = transition absent→present (only fires once per absence)
 *
 * Cooldown: even on rapid arrive transitions, greetings are throttled to
 * one per 8 minutes so Maya doesn't nag if Vasco walks in and out.
 */

import { getPersonalGreeting } from './personalGreeting'

const FRAME_INTERVAL_MS = 350           // ~3fps
const MOTION_THRESHOLD = 8              // mean abs diff (0–255). Tuned for indoor light.
const MOTION_CONFIRM_FRAMES = 2         // must beat threshold this many in a row
const PRESENT_WINDOW_MS = 30 * 1000     // 30s of activity = "present"
const ABSENT_WINDOW_MS = 2 * 60 * 1000  // 2min idle = "absent"
const GREETING_COOLDOWN_MS = 8 * 60 * 1000

let stream = null
let video = null
let canvas = null
let ctx2d = null
let prevPixels = null
let timer = null
let consecutiveMotion = 0
let lastMotionAt = 0
let isPresent = false
let lastGreetingAt = 0
let onArriveCb = null
let running = false

function createHidden() {
  video = document.createElement('video')
  video.autoplay = true
  video.playsInline = true
  video.muted = true
  video.style.display = 'none'
  document.body.appendChild(video)

  canvas = document.createElement('canvas')
  canvas.width = 80   // downsampled for cheap diff
  canvas.height = 60
  ctx2d = canvas.getContext('2d', { willReadFrequently: true })
}

function teardownHidden() {
  try { video?.remove() } catch {}
  video = null
  canvas = null
  ctx2d = null
}

function frameDiff() {
  if (!ctx2d || !video || video.readyState < 2) return 0
  ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height)
  const cur = ctx2d.getImageData(0, 0, canvas.width, canvas.height).data
  if (!prevPixels) {
    prevPixels = new Uint8ClampedArray(cur)
    return 0
  }
  let sum = 0
  // Sample every 4th pixel (every 16 bytes incl. RGBA) for speed
  for (let i = 0; i < cur.length; i += 16) {
    sum += Math.abs(cur[i] - prevPixels[i])
    sum += Math.abs(cur[i + 1] - prevPixels[i + 1])
    sum += Math.abs(cur[i + 2] - prevPixels[i + 2])
  }
  prevPixels.set(cur)
  return sum / (cur.length / 16) / 3
}

function tick() {
  if (!running) return
  const diff = frameDiff()
  const now = Date.now()

  if (diff > MOTION_THRESHOLD) {
    consecutiveMotion++
    if (consecutiveMotion >= MOTION_CONFIRM_FRAMES) {
      lastMotionAt = now
    }
  } else {
    consecutiveMotion = 0
  }

  const wasPresent = isPresent
  if (lastMotionAt && now - lastMotionAt < PRESENT_WINDOW_MS) {
    isPresent = true
  } else if (!lastMotionAt || now - lastMotionAt > ABSENT_WINDOW_MS) {
    isPresent = false
  }

  // Arrive transition: was absent (or first time) → now present
  if (!wasPresent && isPresent) {
    if (now - lastGreetingAt > GREETING_COOLDOWN_MS) {
      lastGreetingAt = now
      try { onArriveCb?.() } catch {}
    }
  }
}

/**
 * Start watching for presence. Asks for camera permission on first call.
 * @param {() => void} onArrive — fires when Vasco walks in (cooldown-throttled)
 */
async function startPresenceWatch(onArrive) {
  if (running) return { ok: true }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: 'Camera API unavailable' }
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
      audio: false,
    })
  } catch (e) {
    return { ok: false, error: e?.message || 'Camera denied' }
  }
  createHidden()
  video.srcObject = stream
  await video.play().catch(() => {})

  onArriveCb = onArrive
  prevPixels = null
  consecutiveMotion = 0
  lastMotionAt = 0
  isPresent = false
  running = true
  timer = setInterval(tick, FRAME_INTERVAL_MS)
  return { ok: true }
}

function stopPresenceWatch() {
  running = false
  if (timer) clearInterval(timer)
  timer = null
  try { stream?.getTracks().forEach(t => t.stop()) } catch {}
  stream = null
  teardownHidden()
  prevPixels = null
  onArriveCb = null
}

function isPresenceActive() { return running }

// ─── Natural arrival lines — varied so Maya doesn't sound canned ───
const NEUTRAL_OPENERS = [
  (n) => `There you are, ${n}.`,
  (n) => `Hey ${n}.`,
  (n) => `${n}. Good to see you.`,
  (n) => `Welcome back, ${n}.`,
  (n) => `${n}, you made it.`,
  () => `Hey, you.`,
  () => `Good. You showed up.`,
]

const MORNING_OPENERS = [
  (n) => `Morning, ${n}. Coffee not optional.`,
  (n) => `${n}. New day. Let's get into it.`,
  () => `Morning. The day's not going to lift itself.`,
]

const LATE_OPENERS = [
  (n) => `Still up, ${n}? Alright — quick one then.`,
  () => `Late session. Make it count.`,
]

const POST_FOCUS_OPENERS = [
  (n) => `${n}. How'd that block go?`,
  () => `Back at it.`,
]

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

/**
 * Compose a natural greeting for the moment Vasco walks back in.
 * Kept intentionally short — a single beat, no follow-up — so the
 * arrival feels light, not chaotic. Maya can elaborate when spoken to.
 */
function buildArrivalLine({ profile = {} } = {}) {
  const name = profile.name || 'champ'
  const hour = new Date().getHours()

  let openerPool = NEUTRAL_OPENERS
  if (hour >= 5 && hour < 11) openerPool = MORNING_OPENERS.concat(NEUTRAL_OPENERS)
  else if (hour >= 23 || hour < 5) openerPool = LATE_OPENERS

  return pick(openerPool)(name)
}

export {
  startPresenceWatch,
  stopPresenceWatch,
  isPresenceActive,
  buildArrivalLine,
}

/**
 * End-to-end onboarding click-through.
 *
 * Drives a real Chrome via puppeteer-core, walks through all 5 onboarding
 * questions, sets a parent PIN, and verifies:
 *   - profile extracted correctly (name / age / hobbies / subjects)
 *   - schedule generated and persisted
 *   - mid-flow draft was checkpointed and then cleared on completion
 *   - PIN hash stored
 *   - no console errors, no failed requests
 *
 * Usage:
 *   npm run e2e                       # tests prod (coachmaya.vercel.app)
 *   URL=http://localhost:5173 npm run e2e   # tests local dev
 *   CHROME=/path/to/chrome npm run e2e      # override Chrome path
 *
 * Requires Google Chrome (or Chromium) installed on the host machine.
 * Exits non-zero on any failure so CI can gate on it.
 */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

// Resolve a Chrome executable across macOS / Linux / Windows
function resolveChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  return candidates.find(p => existsSync(p))
}

const CHROME = resolveChrome()
if (!CHROME) {
  console.error('❌ Could not find Chrome/Chromium. Set CHROME=/path/to/chrome.')
  process.exit(2)
}

const URL = process.env.URL || 'https://coachmaya.vercel.app'
const ONBOARDING_URL = URL.replace(/\/$/, '') + '/onboarding'

const errors = []
const requestFails = []
let failures = 0

function check(label, ok, detail) {
  if (ok) {
    console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`)
  } else {
    console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`)
    failures++
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox'],
})

const page = await browser.newPage()
await page.setViewport({ width: 414, height: 896 })

page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`))
page.on('requestfailed', r => {
  const u = r.url()
  if (u.includes('chrome-extension')) return
  requestFails.push(`${r.failure()?.errorText}: ${u}`)
})

console.log(`\n=== Loading ${ONBOARDING_URL} ===`)
await page.goto(ONBOARDING_URL, { waitUntil: 'networkidle2', timeout: 30000 })
// Start with a clean slate so re-runs don't restore stale drafts/profiles
await page.evaluate(() => {
  try { localStorage.clear() } catch {}
})
await page.reload({ waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 1200))

const initial = await page.evaluate(() => {
  const input = document.querySelector('input')
  return {
    title: document.title,
    hasInput: !!input,
    placeholder: input?.placeholder || null,
    visibleMaya: !!Array.from(document.querySelectorAll('*'))
      .find(e => e.textContent === 'MEET MAYA'),
  }
})

console.log('\n=== Initial render ===')
check('Title is "Coach Maya"', initial.title === 'Coach Maya', initial.title)
check('Chat input rendered', initial.hasInput)
check('MEET MAYA header visible', initial.visibleMaya)
check('Q1 placeholder present', !!initial.placeholder, initial.placeholder)

if (!initial.hasInput) {
  await browser.close()
  process.exit(1)
}

const answers = [
  "I'm Alex, 11, from London",
  "I play football and guitar, and I do coding club",
  "I love science and art but I hate maths",
  "around 9:30",
  "Get better at football and maths",
]

console.log('\n=== Walking through Q&A ===')
for (let i = 0; i < answers.length; i++) {
  await page.waitForSelector('input:not([type="tel"])', { visible: true, timeout: 8000 })
    .catch(() => null)
  const input = await page.$('input:not([type="tel"])')
  if (!input) {
    check(`Q${i + 1} input visible`, false)
    break
  }
  await input.click({ clickCount: 3 })
  await input.type(answers[i], { delay: 20 })
  await page.keyboard.press('Enter')
  console.log(`  → Q${i + 1}: "${answers[i]}"`)
  await new Promise(r => setTimeout(r, 1200))
}

console.log('\n=== Awaiting profile build + PIN step ===')
const pinAppeared = await page.waitForSelector('input[type="tel"]', { timeout: 25000 })
  .then(() => true).catch(() => false)
check('PIN input appeared after Q5', pinAppeared)

if (pinAppeared) {
  const draftBefore = await page.evaluate(() => localStorage.getItem('maya_onboarding_draft'))
  check('Mid-flow draft checkpointed', !!draftBefore,
    draftBefore ? `${draftBefore.length} chars` : 'missing')

  const summary = await page.evaluate(() => {
    const msgs = Array.from(document.querySelectorAll('div'))
      .map(d => d.textContent?.trim())
      .filter(t => t && t.includes("Here's what I've got"))
    return msgs[msgs.length - 1] || null
  })
  check('Summary text rendered', !!summary)

  const pin = await page.$('input[type="tel"]')
  await pin.click()
  await pin.type('1234', { delay: 30 })
  await new Promise(r => setTimeout(r, 300))

  const navWait = page.waitForNavigation({ timeout: 6000 }).catch(() => null)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const go = btns.find(b => /let'?s go/i.test(b.textContent))
    if (go) go.click()
  })
  await navWait
  await new Promise(r => setTimeout(r, 1500))

  const persisted = await page.evaluate(() => ({
    url: location.pathname,
    profile: localStorage.getItem('maya_profile'),
    schedule: localStorage.getItem('maya_schedule'),
    draft: localStorage.getItem('maya_onboarding_draft'),
  })).catch(() => ({}))

  console.log('\n=== Post-completion ===')
  check('Redirected to /', persisted.url === '/', persisted.url)
  check('Profile persisted', !!persisted.profile,
    persisted.profile ? `${persisted.profile.length} chars` : 'missing')
  check('Schedule persisted', !!persisted.schedule,
    persisted.schedule ? `${persisted.schedule.length} chars` : 'missing')
  check('Draft cleared', !persisted.draft)

  if (persisted.profile) {
    const p = JSON.parse(persisted.profile)
    check('name extracted = Alex', p.name === 'Alex', p.name)
    check('age extracted = 11', p.age === 11, String(p.age))
    check('hobbies include Football', p.hobbies?.includes('Football'))
    check('hobbies include Guitar', p.hobbies?.includes('Guitar'))
    check('favoriteSubjects include Science', p.favoriteSubjects?.includes('Science'))
    check('hardSubjects include Maths', p.hardSubjects?.includes('Maths'))
    check('parentPinHash set', !!p.parentPinHash)
    check('setupComplete = true', p.setupComplete === true)
  }
}

console.log('\n=== Console errors ===')
if (errors.length === 0) console.log('  ✅ (none)')
else { errors.forEach(e => console.log('  ❌', e)); failures += errors.length }

console.log('\n=== Failed requests ===')
if (requestFails.length === 0) console.log('  ✅ (none)')
else { requestFails.forEach(r => console.log('  ❌', r)); failures += requestFails.length }

await browser.close()

console.log(`\n=== ${failures === 0 ? '✅ ALL CHECKS PASSED' : '❌ ' + failures + ' FAILURE(S)'} ===`)
process.exit(failures === 0 ? 0 : 1)

/**
 * product-signup.mjs — verifies the full sign-up flow on the public-product
 * (VITE_PRODUCT_MODE=1) deploy.
 *
 * What we assert:
 *  - cold load lands on the marketing landing (not dashboard)
 *  - "SET MAYA UP FOR YOUR KID" → /onboarding
 *  - all 6 Q&A (parent voice: 5 base + AMC level) + PIN walks cleanly
 *  - after completion: profile.name non-empty, setupComplete=true
 *  - PRODUCT_MODE reframe: parent lands on /report first (their dashboard),
 *    not on the kid drill home — Maya's note is the first thing they see
 *  - hard reload at / still shows kid product home (NOT landing, NOT canvas)
 */
import { launch } from './_helpers.mjs'

const PRODUCT_URL = (process.env.PRODUCT_URL || process.env.URL || 'https://coachmaya.vercel.app').replace(/\/$/, '')
if (!process.env.PRODUCT_URL) {
  console.warn('⚠️  PRODUCT_URL not set — falling back to', PRODUCT_URL)
  console.warn('   This test only makes sense against a deploy with VITE_PRODUCT_MODE=1.')
}

const { page, check, finish } = await launch()

console.log(`\n=== Cold-load ${PRODUCT_URL}/ ===`)
await page.goto(`${PRODUCT_URL}/`, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.evaluate(() => { try { localStorage.clear() } catch {} })
await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
await new Promise(r => setTimeout(r, 2000))

const landingState = await page.evaluate(() => {
  const bodyText = document.body.innerText || ''
  return {
    path: location.pathname,
    hasHero: /now she'?s yours/i.test(bodyText),
    hasStartBtn: !!Array.from(document.querySelectorAll('button'))
      .find(b => /set maya up for your kid/i.test(b.textContent || '')),
  }
})
check('Landing rendered at /', landingState.path === '/' && landingState.hasHero)
check('"SET MAYA UP FOR YOUR KID" CTA present', landingState.hasStartBtn)

console.log('\n=== Clicking "SET MAYA UP" → /onboarding ===')
const navWait = page.waitForFunction(
  () => location.pathname === '/onboarding',
  { timeout: 8000 },
).catch(() => null)
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => /set maya up for your kid/i.test(b.textContent || ''))
  if (btn) btn.click()
})
await navWait
await new Promise(r => setTimeout(r, 1500))

const onboardingState = await page.evaluate(() => ({
  path: location.pathname,
  hasInput: !!document.querySelector('input:not([type="tel"])'),
}))
check('On /onboarding', onboardingState.path === '/onboarding', onboardingState.path)
check('Onboarding input rendered', onboardingState.hasInput)

if (!onboardingState.hasInput) await finish()

// PRODUCT_MODE onboarding is parent-voice now — the parent answers about
// their kid. Includes the AMC level question (q6) added in v81, which
// PRODUCT_MODE always asks.
const answers = [
  "Her name is Riley, she's 10, from Austin",
  "She does swimming and chess club, and she loves drawing",
  "She loves science and reading but maths is a struggle",
  "around 9:00",
  "Get her ready for AMC 8 and stop hating maths",
  "AMC 8 — she's new to all this",
]

console.log('\n=== Walking through Q&A ===')
for (let i = 0; i < answers.length; i++) {
  await page.waitForSelector('input:not([type="tel"])', { visible: true, timeout: 8000 })
    .catch(() => null)
  const input = await page.$('input:not([type="tel"])')
  if (!input) { check(`Q${i + 1} input visible`, false); break }
  await input.click({ clickCount: 3 })
  await input.type(answers[i], { delay: 20 })
  await page.keyboard.press('Enter')
  console.log(`  → Q${i + 1}: "${answers[i]}"`)
  await new Promise(r => setTimeout(r, 1200))
}

console.log('\n=== Awaiting PIN step ===')
const pinAppeared = await page.waitForSelector('input[type="tel"]', { timeout: 25000 })
  .then(() => true).catch(() => false)
check('PIN input appeared after final question', pinAppeared)

if (!pinAppeared) await finish()

const pin = await page.$('input[type="tel"]')
await pin.click()
await pin.type('1234', { delay: 30 })
await new Promise(r => setTimeout(r, 300))

// PRODUCT_MODE reframe: finishSetup redirects to /report (parent dashboard),
// not /. The parent should see Maya's note before handing the device over.
const completeWait = page.waitForFunction(
  () => location.pathname === '/report',
  { timeout: 8000 },
).catch(() => null)
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'))
  const go = btns.find(b => /let'?s go/i.test(b.textContent))
  if (go) go.click()
})
await completeWait
await new Promise(r => setTimeout(r, 2500))

const persisted = await page.evaluate(() => ({
  path: location.pathname,
  profile: localStorage.getItem('maya_profile'),
}))

console.log('\n=== Post-completion (parent lands on /report) ===')
check('Redirected to /report (parent dashboard first)', persisted.path === '/report', persisted.path)
check('Profile persisted', !!persisted.profile)

if (persisted.profile) {
  const p = JSON.parse(persisted.profile)
  check('profile.name non-empty', !!p.name && p.name.length > 0, p.name)
  check('profile.setupComplete = true', p.setupComplete === true)
  check('profile.parentPinHash set', !!p.parentPinHash)
}

// Parent's Day-1 view: Maya's note card, hand-off CTA, kid's name visible.
const reportState = await page.evaluate(() => {
  const bodyText = document.body.innerText || ''
  const buttons = Array.from(document.querySelectorAll('button'))
  return {
    hasMayasNote: /maya'?s note/i.test(bodyText),
    hasDay1Card: /day 1/i.test(bodyText) || /before the first session/i.test(bodyText),
    hasKidName: /riley/i.test(bodyText),
    hasHandoffBtn: !!buttons.find(b => /hand the device/i.test(b.textContent || '')),
  }
})
check('Maya\'s note header rendered', reportState.hasMayasNote)
check('Day-1 framing on first visit', reportState.hasDay1Card)
check('Kid name (Riley) visible on report', reportState.hasKidName)
check('"Hand the device to Riley" CTA present', reportState.hasHandoffBtn)

console.log('\n=== Clicking handoff → kid home (/) ===')
const handoffNav = page.waitForFunction(
  () => location.pathname === '/',
  { timeout: 8000 },
).catch(() => null)
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => /hand the device/i.test(b.textContent || ''))
  if (btn) btn.click()
})
await handoffNav
await new Promise(r => setTimeout(r, 2000))

// Kid home (MayaProductHome): drill CTA primary, parent-view link top-right,
// whole-child surface tiles below. No 3D canvas (it's only in onboarding).
const kidHomeState = await page.evaluate(() => {
  const bodyText = document.body.innerText || ''
  const buttons = Array.from(document.querySelectorAll('button'))
  return {
    path: location.pathname,
    hasDrillCta: !!buttons.find(b => /(start today'?s drill|keep going|ready to drill)/i.test(b.textContent || '')),
    hasParentViewLink: !!buttons.find(b => /parent view/i.test(b.textContent || '')),
    hasSurfaceTiles: /what else maya holds/i.test(bodyText)
      && /piano/i.test(bodyText)
      && /tennis/i.test(bodyText),
    stillOnLanding: /now she'?s yours/i.test(bodyText),
  }
})
check('On / after handoff', kidHomeState.path === '/', kidHomeState.path)
check('Kid home drill CTA present', kidHomeState.hasDrillCta)
check('"Parent view" link present (1-tap back to report)', kidHomeState.hasParentViewLink)
check('Whole-child surface tiles rendered (piano/tennis)', kidHomeState.hasSurfaceTiles)
check('Landing NOT showing (setup complete)', !kidHomeState.stillOnLanding)

console.log('\n=== Hard reload — setupComplete must persist ===')
await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
await new Promise(r => setTimeout(r, 2000))

const afterReload = await page.evaluate(() => {
  const bodyText = document.body.innerText || ''
  const buttons = Array.from(document.querySelectorAll('button'))
  return {
    path: location.pathname,
    hasDrillCta: !!buttons.find(b => /(start today'?s drill|keep going|ready to drill)/i.test(b.textContent || '')),
    stillOnLanding: /now she'?s yours/i.test(bodyText),
  }
})
check('After reload still at /', afterReload.path === '/', afterReload.path)
check('After reload kid home still rendered (drill CTA)', afterReload.hasDrillCta)
check('After reload landing NOT showing', !afterReload.stillOnLanding)

await finish()

/**
 * product-signup.mjs — verifies the full sign-up flow on the public-product
 * (VITE_PRODUCT_MODE=1) deploy.
 *
 * What we assert:
 *  - cold load lands on the marketing landing (not dashboard)
 *  - START FREE → /onboarding
 *  - all 5 Q&A + PIN walks cleanly
 *  - after completion: profile.name non-empty, setupComplete=true, redirected to /
 *  - dashboard chrome (BottomNav, Maya3D canvas) is now rendered (NOT landing)
 *  - hard reload still shows dashboard (proves setupComplete gate works)
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
    hasHero: /WON'T IGNORE/i.test(bodyText),
    hasStartBtn: !!Array.from(document.querySelectorAll('button'))
      .find(b => /start free/i.test(b.textContent || '')),
  }
})
check('Landing rendered at /', landingState.path === '/' && landingState.hasHero)
check('START FREE CTA present', landingState.hasStartBtn)

console.log('\n=== Clicking START FREE → /onboarding ===')
const navWait = page.waitForFunction(
  () => location.pathname === '/onboarding',
  { timeout: 8000 },
).catch(() => null)
await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => /start free/i.test(b.textContent || ''))
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

const answers = [
  "I'm Riley, 10, from Austin",
  "I do swimming and chess club, and I like to draw",
  "I love science and reading but I find maths hard",
  "around 9:00",
  "Get faster at swimming and stop hating maths",
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
check('PIN input appeared after Q5', pinAppeared)

if (!pinAppeared) await finish()

const pin = await page.$('input[type="tel"]')
await pin.click()
await pin.type('1234', { delay: 30 })
await new Promise(r => setTimeout(r, 300))

const completeWait = page.waitForFunction(
  () => location.pathname === '/',
  { timeout: 8000 },
).catch(() => null)
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button'))
  const go = btns.find(b => /let'?s go/i.test(b.textContent))
  if (go) go.click()
})
await completeWait
await new Promise(r => setTimeout(r, 2000))

const persisted = await page.evaluate(() => ({
  path: location.pathname,
  profile: localStorage.getItem('maya_profile'),
}))

console.log('\n=== Post-completion ===')
check('Redirected to /', persisted.path === '/', persisted.path)
check('Profile persisted', !!persisted.profile)

if (persisted.profile) {
  const p = JSON.parse(persisted.profile)
  check('profile.name non-empty', !!p.name && p.name.length > 0, p.name)
  check('profile.setupComplete = true', p.setupComplete === true)
  check('profile.parentPinHash set', !!p.parentPinHash)
}

const postSetup = await page.evaluate(() => {
  const bodyText = document.body.innerText || ''
  const fixedBottomCount = Array.from(document.querySelectorAll('*')).filter(e => {
    const cs = getComputedStyle(e)
    return cs.position === 'fixed' && parseInt(cs.bottom) < 50
  }).length
  return {
    hasCanvas: !!document.querySelector('canvas'),
    fixedBottomCount,
    stillOnLanding: /WON'T IGNORE/i.test(bodyText),
  }
})
check('Dashboard rendered (Maya3D canvas present)', postSetup.hasCanvas)
check('BottomNav present (fixed-bottom el)', postSetup.fixedBottomCount >= 1,
  `${postSetup.fixedBottomCount} fixed-bottom el(s)`)
check('Landing NOT showing (setup complete)', !postSetup.stillOnLanding)

console.log('\n=== Hard reload — setupComplete must persist ===')
await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
await new Promise(r => setTimeout(r, 2000))

const afterReload = await page.evaluate(() => {
  const bodyText = document.body.innerText || ''
  return {
    path: location.pathname,
    hasCanvas: !!document.querySelector('canvas'),
    stillOnLanding: /WON'T IGNORE/i.test(bodyText),
  }
})
check('After reload still at /', afterReload.path === '/', afterReload.path)
check('After reload dashboard still rendered (canvas)', afterReload.hasCanvas)
check('After reload landing NOT showing', !afterReload.stillOnLanding)

await finish()

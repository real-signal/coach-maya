/**
 * product-landing.mjs — verifies the public-product (VITE_PRODUCT_MODE=1)
 * landing page renders at `/` on the product deploy.
 *
 * Targets a separate deploy from Vasco's via the PRODUCT_URL env var.
 * Falls back to BASE_URL so the test can be smoke-run locally against any
 * URL, but in CI PRODUCT_URL is what gets set.
 *
 * What we assert:
 *  - title is "Coach Maya"
 *  - landing hero ("WON'T IGNORE") + proof stats + value props are rendered
 *  - primary CTA navigates to /onboarding
 *  - BottomNav / VoiceFab / Maya3D <canvas> are NOT rendered (pre-onboarding)
 *  - no console errors, no failed requests
 */
import { launch } from './_helpers.mjs'

// _helpers.mjs reads URL — override before importing so launch() picks the
// product URL. PRODUCT_URL takes precedence if set, else URL, else default.
const PRODUCT_URL = (process.env.PRODUCT_URL || process.env.URL || 'https://coachmaya.vercel.app').replace(/\/$/, '')
if (!process.env.PRODUCT_URL) {
  console.warn('⚠️  PRODUCT_URL not set — falling back to', PRODUCT_URL)
  console.warn('   This test only makes sense against a deploy with VITE_PRODUCT_MODE=1.')
}

const URL = `${PRODUCT_URL}/`
const { page, check, finish } = await launch()

console.log(`\n=== Loading ${URL} (product deploy) ===`)
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.evaluate(() => { try { localStorage.clear() } catch {} })
await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
await new Promise(r => setTimeout(r, 2000))

const state = await page.evaluate(() => {
  const bodyText = document.body.innerText || ''
  // Pre-onboarding the dashboard chrome must be absent.
  const fixedBottomCount = Array.from(document.querySelectorAll('*')).filter(e => {
    const cs = getComputedStyle(e)
    return cs.position === 'fixed' && parseInt(cs.bottom) < 50
  }).length
  // Primary CTA — find by text content.
  const buttons = Array.from(document.querySelectorAll('button'))
  const startBtn = buttons.find(b => /start free/i.test(b.textContent || ''))
  const meetBtn = buttons.find(b => /meet maya/i.test(b.textContent || ''))
  return {
    title: document.title,
    path: location.pathname,
    bodyText,
    hasHero: /WON'T IGNORE/i.test(bodyText),
    hasProofStats: /5 min/i.test(bodyText) && /24\/7/i.test(bodyText),
    hasValueProps: /SHE REMEMBERS/i.test(bodyText) && /SHE PUSHES/i.test(bodyText),
    hasStartCta: !!startBtn,
    hasMeetCta: !!meetBtn,
    fixedBottomCount,
    hasCanvas: !!document.querySelector('canvas'),
  }
})

console.log('\n=== Landing render ===')
check('Title is "Coach Maya"', state.title === 'Coach Maya', state.title)
check('Path is /', state.path === '/', state.path)
check('Hero ("WON\'T IGNORE") rendered', state.hasHero)
check('Proof stats (5 min / 24/7) rendered', state.hasProofStats)
check('Value props (SHE REMEMBERS / SHE PUSHES) rendered', state.hasValueProps)
check('Primary CTA "START FREE" present', state.hasStartCta)
check('Secondary CTA "MEET MAYA" present', state.hasMeetCta)
check('No BottomNav (no fixed-bottom el)', state.fixedBottomCount === 0,
  `${state.fixedBottomCount} fixed-bottom el(s)`)
check('No Maya3D canvas (avatar hidden pre-onboarding)', !state.hasCanvas)

console.log('\n=== Clicking primary CTA ===')
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
await new Promise(r => setTimeout(r, 1000))

const afterClick = await page.evaluate(() => ({
  path: location.pathname,
  hasInput: !!document.querySelector('input:not([type="tel"])'),
}))
check('CTA navigates to /onboarding', afterClick.path === '/onboarding', afterClick.path)
check('Onboarding chat input present after nav', afterClick.hasInput)

await finish()

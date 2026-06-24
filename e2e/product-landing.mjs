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
 *  - mother-to-parent hero ("NOW SHE'S YOURS") + founder story + whole-child
 *    surface tiles + parent-fear value props are rendered
 *  - primary CTA ("SET MAYA UP FOR YOUR KID") navigates to /onboarding
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
  // Primary CTA — mother-to-parent reframe: "SET MAYA UP FOR YOUR KID".
  const buttons = Array.from(document.querySelectorAll('button'))
  const setupBtn = buttons.find(b => /set maya up for your kid/i.test(b.textContent || ''))
  const tellBtn = buttons.find(b => /tell maya about your kid/i.test(b.textContent || ''))
  return {
    title: document.title,
    path: location.pathname,
    bodyText,
    // Hero: "I BUILT MAYA FOR MY SON. NOW SHE'S YOURS."
    // innerText turns <br/> into \n, so match with \s+ across the line breaks.
    hasHero: /now she'?s yours/i.test(bodyText) && /built\s+maya\s+for\s+my\s+son/i.test(bodyText),
    // Founder spine: the mother story is the trust signal, not a footnote
    hasFounderStory: /why maya exists/i.test(bodyText) && /vasco/i.test(bodyText),
    // Whole-child surface tiles — Maya is more than AMC
    hasSurfaceTiles: /what maya holds/i.test(bodyText)
      && /music practice/i.test(bodyText)
      && /sport/i.test(bodyText)
      && /mood/i.test(bodyText),
    // Parent-fear value props (the reframe)
    hasValueProps: /remembers what you can'?t/i.test(bodyText)
      && /bad guy/i.test(bodyText)
      && /see your kid more clearly/i.test(bodyText),
    hasSetupCta: !!setupBtn,
    hasTellCta: !!tellBtn,
    fixedBottomCount,
    hasCanvas: !!document.querySelector('canvas'),
  }
})

console.log('\n=== Landing render ===')
check('Title is "Coach Maya"', state.title === 'Coach Maya', state.title)
check('Path is /', state.path === '/', state.path)
check('Hero ("NOW SHE\'S YOURS") rendered', state.hasHero)
check('Founder story (WHY MAYA EXISTS + Vasco) rendered', state.hasFounderStory)
check('Whole-child surface tiles (music/sport/mood) rendered', state.hasSurfaceTiles)
check('Parent-fear value props rendered', state.hasValueProps)
check('Primary CTA "SET MAYA UP FOR YOUR KID" present', state.hasSetupCta)
check('Closing CTA "TELL MAYA ABOUT YOUR KID" present', state.hasTellCta)
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
    .find(b => /set maya up for your kid/i.test(b.textContent || ''))
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

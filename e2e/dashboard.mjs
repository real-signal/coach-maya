/**
 * dashboard.mjs — the path 99% of users hit on coachmaya.vercel.app.
 *
 * Post-v54, a fresh device boots straight into Vasco's dashboard (no
 * onboarding). This test verifies that path renders cleanly: the dashboard
 * loads, the boot screen clears, Maya's avatar / hero / nav are present,
 * and there are no console errors or failed network requests.
 */
import { BASE_URL, launch } from './_helpers.mjs'

const URL = `${BASE_URL}/`
const { page, check, finish } = await launch()

console.log(`\n=== Loading ${URL} (fresh device, DEFAULT_PROFILE = Vasco) ===`)
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
// Clear and reload so we land in the true "first boot" state
await page.evaluate(() => { try { localStorage.clear() } catch {} })
await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
// Boot screen has a 400ms fade; give the dashboard time to mount
await new Promise(r => setTimeout(r, 3000))

const state = await page.evaluate(() => {
  const bodyText = document.body.innerText
  const boot = document.getElementById('boot')
  // BottomNav uses inline styles (no class names), so detect any
  // fixed-position element pinned near the bottom of the viewport.
  const fixedBottomCount = Array.from(document.querySelectorAll('*')).filter(e => {
    const cs = getComputedStyle(e)
    return cs.position === 'fixed' && parseInt(cs.bottom) < 50
  }).length
  return {
    title: document.title,
    path: location.pathname,
    bootGone: !boot || boot.classList.contains('gone') || getComputedStyle(boot).opacity === '0',
    hasCanvas: !!document.querySelector('canvas'),
    fixedBottomCount,
    bodyLength: bodyText.length,
    hasCombo: bodyText.includes('COMBO'),
    hasActivity: bodyText.includes('ACTIVITY') || bodyText.includes('STREAK'),
    profile: localStorage.getItem('maya_profile'),
  }
})

console.log('\n=== Dashboard render ===')
check('Title is "Coach Maya"', state.title === 'Coach Maya', state.title)
check('Path is /', state.path === '/', state.path)
check('Boot screen cleared', state.bootGone)
check('Body content rendered', state.bodyLength > 200, `${state.bodyLength} chars`)
check('Three.js canvas (Maya avatar) present', state.hasCanvas)
check('Bottom nav present (fixed-position element)', state.fixedBottomCount > 0,
  `${state.fixedBottomCount} fixed-bottom el(s)`)
check('Gamification widget (COMBO) visible', state.hasCombo)
check('Activity/streak widget visible', state.hasActivity)

// Note: MayaContext only persists profile on explicit mutation, so on a
// truly fresh first load the in-memory DEFAULT_PROFILE may not yet be in
// localStorage. The widget checks above already prove the profile is
// loaded and rendered.

await finish()

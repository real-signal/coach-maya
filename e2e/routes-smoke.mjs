/**
 * routes-smoke.mjs — loads a representative slice of the 48 routes and
 * checks each renders without throwing or 404ing a chunk.
 *
 * CLAUDE.md tracks 48 routes; testing all of them at every deploy is wasteful.
 * Instead we hit the high-value lazy-loaded views (most user-facing flows,
 * largest chunks, and anything that hits external APIs at mount). A broken
 * lazy import or missing route registration will surface here.
 *
 * The PIN-gated /parent route is exercised by its own test (parent-pin.mjs).
 */
import { BASE_URL, launch } from './_helpers.mjs'

const ROUTES = [
  '/',
  '/schedule',
  '/profile',
  '/lessons',
  '/memory',
  '/goals',
  '/insights',
  '/journal',
  '/focus',
  '/competitions',
  '/trophies',
  '/notebook',
  '/help',
  '/onboarding',
]

const { page, check, finish } = await launch()

// One-time storage clear so we don't keep the previous test's state
await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
await page.evaluate(() => { try { localStorage.clear() } catch {} })

for (const route of ROUTES) {
  const url = `${BASE_URL}${route}`
  try {
    // domcontentloaded is enough to know the SPA shell + the lazy chunk
    // mounted; networkidle2 can hang behind background API calls on a
    // cold-cache preview deploy.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await new Promise(r => setTimeout(r, 1500))
    const ok = await page.evaluate(() => {
      // A rendered React page has SOME text in body. A blank lazy-chunk
      // failure leaves <div id="root"></div> empty.
      return document.body.innerText.trim().length > 50
    })
    check(`${route} renders content`, ok)
  } catch (e) {
    check(`${route} loads without error`, false, e.message)
  }
}

await finish()

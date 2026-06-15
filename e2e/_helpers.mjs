/**
 * Shared helpers for e2e tests. Each test imports launch() + check() and
 * gets a consistent setup: Chrome resolution, viewport, error tracking,
 * pass/fail tally, exit code.
 */
import puppeteer from 'puppeteer-core'
import { existsSync } from 'node:fs'

export const BASE_URL = (process.env.URL || 'https://coachmaya.vercel.app').replace(/\/$/, '')

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

/**
 * Launch a tracked browser. Returns { browser, page, errors, requestFails, check, finish }.
 * - errors / requestFails accumulate as the page runs
 * - check(label, ok, detail) prints + increments failures
 * - finish() prints the error/request summary and exits with the right code
 */
export async function launch({ viewport = { width: 414, height: 896 } } = {}) {
  const chrome = resolveChrome()
  if (!chrome) {
    console.error('❌ Could not find Chrome/Chromium. Set CHROME=/path/to/chrome.')
    process.exit(2)
  }

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport(viewport)

  const errors = []
  const requestFails = []
  let failures = 0

  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', e => errors.push(`PAGEERROR: ${e.message}`))
  page.on('requestfailed', r => {
    const u = r.url()
    if (u.includes('chrome-extension')) return
    requestFails.push(`${r.failure()?.errorText}: ${u}`)
  })

  function check(label, ok, detail) {
    if (ok) {
      console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`)
    } else {
      console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`)
      failures++
    }
  }

  async function finish() {
    console.log('\n=== Console errors ===')
    if (errors.length === 0) console.log('  ✅ (none)')
    else { errors.forEach(e => console.log('  ❌', e)); failures += errors.length }

    console.log('\n=== Failed requests ===')
    if (requestFails.length === 0) console.log('  ✅ (none)')
    else { requestFails.forEach(r => console.log('  ❌', r)); failures += requestFails.length }

    await browser.close()
    console.log(`\n=== ${failures === 0 ? '✅ ALL CHECKS PASSED' : '❌ ' + failures + ' FAILURE(S)'} ===`)
    process.exit(failures === 0 ? 0 : 1)
  }

  return { browser, page, errors, requestFails, check, finish }
}

/** Clear localStorage + reload, so tests start from a clean slate. */
export async function resetStorage(page) {
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
  // domcontentloaded (not networkidle2) so we don't hang behind background
  // API calls on a cold-cache Vercel preview URL.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
}

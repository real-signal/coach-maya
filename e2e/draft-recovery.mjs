/**
 * draft-recovery.mjs — verifies v63's mid-flow checkpoint.
 *
 * Starts onboarding, answers 3 of the 5 questions, hard-reloads the page,
 * and asserts that the chat history, current question, and stored answers
 * are restored from `maya_onboarding_draft`. Without v63 this flow would
 * snap back to Q1 and lose everything.
 */
import { BASE_URL, launch } from './_helpers.mjs'

const URL = `${BASE_URL}/onboarding`
const { page, check, finish } = await launch()

console.log(`\n=== Loading ${URL} ===`)
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.evaluate(() => { try { localStorage.clear() } catch {} })
await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
await new Promise(r => setTimeout(r, 1500))

const partial = [
  "I'm Sam, 12, from Tokyo",
  "I do swimming and chess club",
  "I like English and history",
]

console.log('\n=== Answering 3 of 5 questions ===')
for (let i = 0; i < partial.length; i++) {
  await page.waitForSelector('input:not([type="tel"])', { visible: true, timeout: 8000 })
    .catch(() => null)
  const input = await page.$('input:not([type="tel"])')
  if (!input) { check(`Q${i + 1} input visible`, false); break }
  const placeholderBefore = await page.$eval('input:not([type="tel"])', el => el.placeholder)
  await input.click({ clickCount: 3 })
  await input.type(partial[i], { delay: 20 })
  await page.keyboard.press('Enter')
  console.log(`  → Q${i + 1}: "${partial[i]}"`)
  // Onboarding.jsx advances questionIndex inside a 600ms setTimeout after
  // saving the answer. Don't snapshot the draft until we've SEEN the next
  // question's placeholder appear, otherwise we race the state update.
  await page.waitForFunction(
    (prev) => {
      const el = document.querySelector('input:not([type="tel"])')
      return el && el.placeholder !== prev
    },
    { timeout: 8000 },
    placeholderBefore,
  ).catch(() => null)
}
// Give the draft-saving useEffect one more tick to flush.
await new Promise(r => setTimeout(r, 500))

// Snapshot draft BEFORE reload
const beforeReload = await page.evaluate(() => {
  const draft = localStorage.getItem('maya_onboarding_draft')
  return { draft: draft ? JSON.parse(draft) : null }
})
check('Draft saved to localStorage', !!beforeReload.draft)
check('Draft has 3 answers stored',
  beforeReload.draft && Object.keys(beforeReload.draft.answers || {}).length === 3,
  `${Object.keys(beforeReload.draft?.answers || {}).length} answer(s)`)
check('Draft questionIndex === 3 (next is Q4)',
  beforeReload.draft?.questionIndex === 3,
  String(beforeReload.draft?.questionIndex))

console.log('\n=== Hard-reloading page ===')
await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
// domcontentloaded fires before React mounts; wait for the chat input
// to come back so we know the draft restore has actually run.
await page.waitForSelector('input:not([type="tel"])', { visible: true, timeout: 15000 })
  .catch(() => null)
await new Promise(r => setTimeout(r, 1500))

const afterReload = await page.evaluate(() => {
  const userMsgs = Array.from(document.querySelectorAll('div'))
    .map(d => d.textContent?.trim() || '')
    .filter(t => t && t.length < 200)
  const input = document.querySelector('input:not([type="tel"])')
  return {
    bodyText: document.body.innerText,
    placeholder: input?.placeholder || null,
    userMsgCount: userMsgs.filter(t => /sam|swimming|english/i.test(t)).length,
  }
})

check('Sam (Q1 answer) still in chat', afterReload.bodyText.toLowerCase().includes('sam'))
check('Swimming (Q2 answer) still in chat', afterReload.bodyText.toLowerCase().includes('swimming'))
check('English (Q3 answer) still in chat', afterReload.bodyText.toLowerCase().includes('english'))
// Q4 is bedtime; the placeholder gives it away.
check('Resumed at Q4 (bedtime question)',
  afterReload.placeholder && /9:30|bed|time/i.test(afterReload.placeholder),
  afterReload.placeholder)

await finish()

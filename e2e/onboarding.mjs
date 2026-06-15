/**
 * onboarding.mjs — full conversational onboarding click-through.
 *
 * Walks all 5 questions, sets a PIN, verifies: Claude extracts profile fields
 * correctly, schedule is generated, mid-flow draft is checkpointed and then
 * cleared on completion, PIN is hashed. Asserts zero console errors.
 */
import { BASE_URL, launch, resetStorage } from './_helpers.mjs'

const URL = `${BASE_URL}/onboarding`
const { page, check, finish } = await launch()

console.log(`\n=== Loading ${URL} ===`)
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
await resetStorage(page)
await new Promise(r => setTimeout(r, 1500))

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

if (!initial.hasInput) await finish()

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
  if (!input) { check(`Q${i + 1} input visible`, false); break }
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

await finish()

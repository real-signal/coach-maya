/**
 * Profile Builder Agent — extracts structured profile from free-text conversation.
 *
 * Two modes:
 * 1. Claude API (preferred) — sends conversation transcript, gets structured JSON back
 * 2. Keyword fallback — regex-based extraction, works without API key
 *
 * The conversational onboarding asks 5 questions:
 * Q1: "What's your name? How old are you?"
 * Q2: "What do you do after school? Any sports, instruments, clubs?"
 * Q3: "What school subjects do you like? Any you can't stand?"
 * Q4: "What time do you usually go to bed?"
 * Q5: "What's one thing you want to get better at this year?"
 */

const EXTRACTION_PROMPT = `You are a data extraction assistant. A child just answered 5 onboarding questions for their AI coach app. Extract structured profile data from their answers.

Return ONLY valid JSON (no markdown, no explanation) with this exact structure:
{
  "name": "string",
  "age": number,
  "grade": "string",
  "location": "string",
  "sports": ["string"],
  "instruments": ["string"],
  "activities": ["string"],
  "favoriteSubjects": ["string"],
  "hardSubjects": ["string"],
  "bedtime": "HH:MM",
  "bigGoals": ["string"],
  "humorClues": "string",
  "pushClues": "string"
}

Rules:
- "sports" = physical activities (tennis, football, swimming, basketball, etc.)
- "instruments" = musical instruments (piano, guitar, drums, etc.)
- "activities" = everything else (coding, reading, drawing, gaming, chess, etc.)
- Normalize names: capitalize first letter, no abbreviations
- "bedtime" in 24h format. If they say "around 10" → "22:00". If unclear → "21:30"
- "humorClues" = brief note on how the kid communicates (enthusiastic, shy, sarcastic, etc.)
- "pushClues" = how hard to push based on their energy ("competitive" / "gentle" / "standard")
- If they don't mention something, use empty array []
- Age: if not stated, guess from context or default to 12
- bigGoals: extract from Q5 answer, rephrase into a clear goal
- "grade" = school grade/year if mentioned (e.g. "Year 9", "8", "Grade 6") — empty string if not stated
- "location" = city or country if mentioned (e.g. "Singapore", "London") — empty string if not stated
`

// ─── Sanitize Claude output: enforce shape, types, bounds ───
function sanitizeExtracted(raw) {
  if (!raw || typeof raw !== 'object') return null

  const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max).trim() : '')
  const num = (v, min, max, fb) => {
    const n = typeof v === 'number' ? v : parseInt(v)
    return Number.isFinite(n) && n >= min && n <= max ? n : fb
  }
  const arr = (v, max = 20, itemMax = 80) => {
    if (!Array.isArray(v)) return []
    return v.filter(x => typeof x === 'string').slice(0, max).map(s => s.slice(0, itemMax).trim()).filter(Boolean)
  }
  const time = (v) => {
    if (typeof v !== 'string') return '21:30'
    const m = v.match(/^(\d{1,2}):(\d{2})$/)
    if (!m) return '21:30'
    const h = parseInt(m[1]), mi = parseInt(m[2])
    if (h < 0 || h > 23 || mi < 0 || mi > 59) return '21:30'
    return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`
  }

  return {
    name: str(raw.name, 50),
    age: num(raw.age, 4, 22, 12),
    grade: str(raw.grade, 12),
    location: str(raw.location, 60),
    sports: arr(raw.sports),
    instruments: arr(raw.instruments),
    activities: arr(raw.activities),
    favoriteSubjects: arr(raw.favoriteSubjects),
    hardSubjects: arr(raw.hardSubjects),
    bedtime: time(raw.bedtime),
    bigGoals: arr(raw.bigGoals, 5, 200),
    humorClues: str(raw.humorClues, 200),
    pushClues: str(raw.pushClues, 200),
  }
}

// ─── Claude-powered extraction ───
async function extractWithClaude(transcript) {
  const { getApiKey } = await import('../lib/secrets')
  const apiKey = getApiKey('anthropic')
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 500,
        system: EXTRACTION_PROMPT,
        messages: [{ role: 'user', content: transcript }],
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    const text = data.content[0].text.trim()
    // Strip markdown code fences if present
    const json = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '')
    const parsed = JSON.parse(json)
    return sanitizeExtracted(parsed)
  } catch {
    return null
  }
}

// ─── Keyword-based fallback extraction ───
function extractWithKeywords(answers) {
  // answers = { q1: "...", q2: "...", q3: "...", q4: "...", q5: "..." }
  const result = {
    name: '',
    age: 12,
    grade: '',
    location: '',
    sports: [],
    instruments: [],
    activities: [],
    favoriteSubjects: [],
    hardSubjects: [],
    bedtime: '21:30',
    bigGoals: [],
    humorClues: '',
    pushClues: 'standard',
  }

  // Q1: Name and age
  const q1 = (answers.q1 || '').trim()
  // Try to extract name — first word that's capitalized, or first word
  const nameMatch = q1.match(/(?:i'?m|my name is|name'?s|call me)\s+(\w+)/i)
    || q1.match(/^(\w+)/)
  if (nameMatch) result.name = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase()

  // Try explicit age patterns first, then fall back to a bounded bare digit
  const ageMatch =
    q1.match(/\b(\d{1,2})\s*(?:years?\s*old|yrs?\s*old|y\/?o|yo)\b/i) ||
    q1.match(/\bage[d]?\s*(?:is\s*)?(\d{1,2})\b/i) ||
    q1.match(/\bi(?:'?m| am)\s*(\d{1,2})\b/i) ||
    q1.match(/\bturning\s*(\d{1,2})\b/i) ||
    q1.match(/\b(\d{1,2})\b/) // last resort: any standalone 1–2 digit number
  if (ageMatch) {
    const n = parseInt(ageMatch[1])
    if (Number.isFinite(n) && n >= 4 && n <= 22) result.age = n
  }

  // Grade — search across all answers
  const allText = Object.values(answers).join(' ')
  const gradeMatch = allText.match(/\b(?:grade|year|class|standard)\s*(\d{1,2})\b/i)
  if (gradeMatch) result.grade = gradeMatch[1]

  // Location — match common cities/countries (lightweight, opt-in via Claude path for full accuracy)
  const LOCATIONS = ['Singapore','London','New York','Hong Kong','Tokyo','Sydney','Melbourne','Dubai','Mumbai','Paris','Berlin','Toronto','Vancouver','Seoul','Beijing','Shanghai','Bangkok','Jakarta','Manila','Auckland']
  const locHit = LOCATIONS.find(l => new RegExp(`\\b${l}\\b`, 'i').test(allText))
  if (locHit) result.location = locHit

  // Q2: Activities
  const q2 = (answers.q2 || '').toLowerCase()
  const SPORT_WORDS = ['tennis', 'football', 'soccer', 'basketball', 'swimming', 'running', 'cycling', 'cricket', 'rugby', 'volleyball', 'badminton', 'golf', 'skating', 'surfing', 'climbing', 'boxing', 'martial arts', 'karate', 'judo', 'gymnastics', 'hockey', 'lacrosse', 'track', 'athletics', 'netball', 'baseball', 'softball']
  const INSTRUMENT_WORDS = ['piano', 'guitar', 'drums', 'violin', 'cello', 'flute', 'saxophone', 'trumpet', 'clarinet', 'ukulele', 'bass', 'keyboard', 'harmonica', 'trombone', 'harp']
  const ACTIVITY_WORDS = ['coding', 'programming', 'reading', 'drawing', 'painting', 'gaming', 'chess', 'writing', 'lego', 'robotics', 'cooking', 'baking', 'photography', 'acting', 'dance', 'dancing', 'singing', 'debate', 'scouts']

  SPORT_WORDS.forEach(s => { if (q2.includes(s)) result.sports.push(capitalize(s)) })
  INSTRUMENT_WORDS.forEach(s => { if (q2.includes(s)) result.instruments.push(capitalize(s)) })
  ACTIVITY_WORDS.forEach(s => { if (q2.includes(s)) result.activities.push(capitalize(s)) })

  // Q3: Subjects
  const q3 = (answers.q3 || '').toLowerCase()
  const ALL_SUBJECTS = ['maths', 'math', 'science', 'english', 'reading', 'writing', 'history', 'geography', 'french', 'spanish', 'german', 'mandarin', 'chinese', 'art', 'music', 'pe', 'biology', 'chemistry', 'physics', 'computing', 'ict', 'drama', 'economics', 'literature', 'portuguese']
  const SUBJECT_NORMALIZE = { math: 'Maths', pe: 'PE', ict: 'Computing', chinese: 'Mandarin' }

  // Split on common patterns: like/love vs hate/avoid/can't stand
  const likePart = q3.split(/but|except|hate|can'?t stand|don'?t like|worst|avoid|struggle/)[0] || ''
  const hatePart = q3.replace(likePart, '')

  ALL_SUBJECTS.forEach(s => {
    const normalized = SUBJECT_NORMALIZE[s] || capitalize(s)
    if (likePart.includes(s) && !hatePart.includes(s)) {
      if (!result.favoriteSubjects.includes(normalized)) result.favoriteSubjects.push(normalized)
    }
    if (hatePart.includes(s)) {
      if (!result.hardSubjects.includes(normalized)) result.hardSubjects.push(normalized)
    }
  })

  // Q4: Bedtime
  const q4 = (answers.q4 || '').toLowerCase()
  const timeMatch = q4.match(/(\d{1,2})[:\.]?(\d{2})?\s*(pm|am)?/i)
  if (timeMatch) {
    let h = parseInt(timeMatch[1])
    const m = parseInt(timeMatch[2] || '0')
    if (timeMatch[3]?.toLowerCase() === 'pm' && h < 12) h += 12
    if (timeMatch[3]?.toLowerCase() === 'am' && h === 12) h = 0
    if (h < 12 && !timeMatch[3]) h += 12 // assume PM for numbers < 12 without am/pm
    if (h >= 6 && h <= 12 && !timeMatch[3]) h += 12 // "9" → 21:00, "10" → 22:00
    // but avoid double-adding: if already > 12, leave it
    if (h > 24) h -= 12
    result.bedtime = `${String(Math.min(h, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // Q5: Goals
  const q5 = (answers.q5 || '').trim()
  if (q5) result.bigGoals = [q5.charAt(0).toUpperCase() + q5.slice(1)]

  return result
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Main entry: build profile from conversation ───
async function buildProfileFromChat(answers) {
  // Build transcript for Claude
  const transcript = [
    `Q: What's your name and how old are you?\nA: ${answers.q1}`,
    `Q: What do you do after school? Sports, instruments, clubs, hobbies?\nA: ${answers.q2}`,
    `Q: What school subjects do you like? Any you can't stand?\nA: ${answers.q3}`,
    `Q: What time do you usually go to bed?\nA: ${answers.q4}`,
    `Q: What's one thing you want to get better at this year?\nA: ${answers.q5}`,
  ].join('\n\n')

  // Try Claude first
  const claudeResult = await extractWithClaude(transcript)
  if (claudeResult) return { ...claudeResult, source: 'claude' }

  // Fallback to keywords (also sanitized for consistent bounds)
  const kw = extractWithKeywords(answers)
  return { ...(sanitizeExtracted(kw) || kw), source: 'keywords' }
}

// ─── Convert extracted profile to app profile format ───
function toAppProfile(extracted) {
  const hobbies = [
    ...extracted.sports,
    ...extracted.instruments,
    ...extracted.activities,
  ]

  // Map humor clues to humor style
  let humorStyle = 'sarcastic' // default
  const clues = (extracted.humorClues || '').toLowerCase()
  if (clues.includes('shy') || clues.includes('quiet') || clues.includes('gentle')) humorStyle = 'wholesome'
  else if (clues.includes('playful') || clues.includes('energetic') || clues.includes('enthusiastic')) humorStyle = 'playful'
  else if (clues.includes('dry') || clues.includes('short') || clues.includes('brief')) humorStyle = 'dry'

  // Map push clues to intensity
  let pushIntensity = 'medium'
  const push = (extracted.pushClues || '').toLowerCase()
  if (push.includes('gentle') || push.includes('soft') || push.includes('careful')) pushIntensity = 'light'
  else if (push.includes('competitive') || push.includes('intense') || push.includes('hard')) pushIntensity = 'hard'

  return {
    name: extracted.name || 'Champ',
    age: extracted.age || 12,
    grade: extracted.grade || '',
    location: extracted.location || '',
    hobbies,
    favoriteSubjects: extracted.favoriteSubjects || [],
    hardSubjects: extracted.hardSubjects || [],
    bigGoals: extracted.bigGoals || [],
    humorStyle,
    pushIntensity,
    motivationDriver: 'competition', // refined later by personality learner
    setupComplete: true,
    setupAt: new Date().toISOString(),
    // Store extracted data for schedule generator
    _extracted: {
      sports: extracted.sports || [],
      instruments: extracted.instruments || [],
      activities: extracted.activities || [],
      bedtime: extracted.bedtime || '21:30',
    },
  }
}

export {
  buildProfileFromChat,
  extractWithKeywords,
  toAppProfile,
}

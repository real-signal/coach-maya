/**
 * Knowledge Memory + Spaced Repetition
 *
 * Stores every concept Maya has helped Vasco learn, across all lessons.
 * Uses a simple Leitner-box style spaced repetition schedule:
 *
 *   box 1 → review in 1 day
 *   box 2 → review in 3 days
 *   box 3 → review in 7 days
 *   box 4 → review in 14 days
 *   box 5 → review in 30 days  (mastered)
 *
 * When a concept is recalled correctly it moves up a box; when failed it
 * drops back to box 1.
 */

const MEMORY_KEY = 'maya_memory'
const INTERVALS = [1, 3, 7, 14, 30] // days, by box index 0..4

function loadMemory() {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    return raw ? JSON.parse(raw) : { concepts: [] }
  } catch { return { concepts: [] } }
}
function saveMemory(mem) {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(mem)) } catch {}
}

function nowISO() { return new Date().toISOString() }
function addDays(d, n) {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out.toISOString()
}

/**
 * Add concepts from a finished lesson into memory.
 * Each unique phrase becomes a memory item with box=0, due=tomorrow.
 */
function addConceptsFromLesson(lesson, conceptList) {
  const mem = loadMemory()
  const existing = new Set(mem.concepts.map(c => c.phrase.toLowerCase()))
  const added = []
  for (const c of conceptList) {
    const phrase = c.phrase || c.word || c
    if (!phrase || existing.has(phrase.toLowerCase())) continue
    // Per-concept definition (from notebook flashcards) wins over the lesson
    // transcript snippet. Keeps the back of the card meaningful.
    const snippet = (c && c.definition)
      ? String(c.definition).slice(0, 240)
      : (lesson.fullTranscript || '').slice(0, 200)
    const item = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      phrase,
      subject: lesson.subject,
      lessonId: lesson.id,
      sourceSnippet: snippet,
      box: 0,
      learnedAt: nowISO(),
      lastReviewedAt: null,
      due: addDays(new Date(), INTERVALS[0]),
      successCount: 0,
      missCount: 0,
    }
    mem.concepts.push(item)
    added.push(item)
  }
  saveMemory(mem)
  return { added, total: mem.concepts.length }
}

/** Concepts due today or earlier */
function getDueConcepts(limit = 10) {
  const mem = loadMemory()
  const now = Date.now()
  return mem.concepts
    .filter(c => new Date(c.due).getTime() <= now)
    .sort((a, b) => new Date(a.due) - new Date(b.due))
    .slice(0, limit)
}

function getAllConcepts() {
  return loadMemory().concepts
}

function searchConcepts(query) {
  if (!query) return []
  const q = query.toLowerCase()
  return loadMemory().concepts.filter(c =>
    c.phrase.toLowerCase().includes(q) ||
    c.subject?.toLowerCase().includes(q) ||
    c.sourceSnippet?.toLowerCase().includes(q)
  )
}

/** Mark a review result. correct=true bumps box, false drops to 0. */
function reviewConcept(id, correct) {
  const mem = loadMemory()
  const c = mem.concepts.find(c => c.id === id)
  if (!c) return null
  c.lastReviewedAt = nowISO()
  if (correct) {
    c.box = Math.min(c.box + 1, INTERVALS.length - 1)
    c.successCount++
  } else {
    c.box = 0
    c.missCount++
  }
  c.due = addDays(new Date(), INTERVALS[c.box])
  saveMemory(mem)
  return c
}

function deleteConcept(id) {
  const mem = loadMemory()
  mem.concepts = mem.concepts.filter(c => c.id !== id)
  saveMemory(mem)
}

function getMemoryStats() {
  const mem = loadMemory()
  const total = mem.concepts.length
  const mastered = mem.concepts.filter(c => c.box === INTERVALS.length - 1).length
  const dueToday = mem.concepts.filter(c => new Date(c.due).getTime() <= Date.now()).length
  const subjects = {}
  mem.concepts.forEach(c => { subjects[c.subject] = (subjects[c.subject] || 0) + 1 })
  return { total, mastered, dueToday, subjects }
}

export {
  loadMemory,
  addConceptsFromLesson,
  getDueConcepts,
  getAllConcepts,
  searchConcepts,
  reviewConcept,
  deleteConcept,
  getMemoryStats,
  INTERVALS,
}

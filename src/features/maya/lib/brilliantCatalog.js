/**
 * Brilliant Companion — public course catalog.
 *
 * IMPORTANT: This is a Maya-side companion log, NOT an integration with
 * Brilliant.org. We do not scrape, embed, or transmit any Brilliant content.
 * URLs link out to publicly accessible course landing pages — same as any
 * "open in browser" button. Course names are factual identifiers.
 *
 * Catalog is static; if Brilliant restructures URLs, kid lands on their
 * search page. No app behaviour breaks.
 */

const CATALOG = [
  // Foundations
  { id: 'math-fund', name: 'Mathematical Fundamentals', url: 'https://brilliant.org/courses/math-fundamentals/', topics: ['math', 'foundations'], difficulty: 1, minutes: 15 },
  { id: 'number-bases', name: 'Number Bases', url: 'https://brilliant.org/courses/number-bases/', topics: ['math', 'foundations'], difficulty: 2, minutes: 15 },
  { id: 'algebra-puzzles', name: 'Algebra Through Puzzles', url: 'https://brilliant.org/courses/algebra-through-puzzles/', topics: ['math', 'algebra'], difficulty: 2, minutes: 20 },
  { id: 'algebra-1', name: 'Algebra I', url: 'https://brilliant.org/courses/algebra/', topics: ['math', 'algebra'], difficulty: 2, minutes: 20 },
  { id: 'algebra-2', name: 'Algebra II', url: 'https://brilliant.org/courses/algebra-extensions/', topics: ['math', 'algebra'], difficulty: 3, minutes: 25 },
  { id: 'geometry', name: 'Geometry I', url: 'https://brilliant.org/courses/geometry/', topics: ['math', 'geometry'], difficulty: 2, minutes: 20 },

  // Logic + problem solving
  { id: 'logic', name: 'Logic', url: 'https://brilliant.org/courses/logic/', topics: ['logic', 'reasoning'], difficulty: 2, minutes: 15 },
  { id: 'logic-2', name: 'Logic II', url: 'https://brilliant.org/courses/logic-deduction/', topics: ['logic', 'reasoning'], difficulty: 3, minutes: 20 },
  { id: 'joy-problem-solving', name: 'Joy of Problem Solving', url: 'https://brilliant.org/courses/joy-of-problem-solving/', topics: ['logic', 'olympiad', 'math'], difficulty: 3, minutes: 25 },
  { id: 'puzzles', name: 'Puzzles', url: 'https://brilliant.org/courses/recreational/', topics: ['logic'], difficulty: 1, minutes: 10 },

  // Probability
  { id: 'prob-fund', name: 'Probability Fundamentals', url: 'https://brilliant.org/courses/probability-fundamentals/', topics: ['math', 'probability'], difficulty: 2, minutes: 20 },
  { id: 'casino-prob', name: 'Casino Probability', url: 'https://brilliant.org/courses/casino-probability/', topics: ['math', 'probability'], difficulty: 3, minutes: 20 },

  // Number theory
  { id: 'number-theory', name: 'Number Theory', url: 'https://brilliant.org/courses/number-theory/', topics: ['math', 'olympiad', 'numbertheory'], difficulty: 3, minutes: 25 },

  // Calculus
  { id: 'calc-fund', name: 'Calculus Fundamentals', url: 'https://brilliant.org/courses/calculus-fundamentals/', topics: ['math', 'calculus'], difficulty: 3, minutes: 25 },
  { id: 'calc-int', name: 'Integral Calculus', url: 'https://brilliant.org/courses/calculus-done-right/', topics: ['math', 'calculus'], difficulty: 4, minutes: 30 },

  // CS
  { id: 'cs-fund', name: 'Computer Science Fundamentals', url: 'https://brilliant.org/courses/computer-science-essentials/', topics: ['cs', 'programming'], difficulty: 2, minutes: 20 },
  { id: 'python', name: 'Programming with Python', url: 'https://brilliant.org/courses/programming-with-python/', topics: ['cs', 'programming'], difficulty: 2, minutes: 20 },
  { id: 'algos', name: 'Algorithm Fundamentals', url: 'https://brilliant.org/courses/algorithm-fundamentals/', topics: ['cs', 'programming', 'logic'], difficulty: 3, minutes: 25 },

  // Science (variety days)
  { id: 'classical-mech', name: 'Classical Mechanics', url: 'https://brilliant.org/courses/classical-mechanics/', topics: ['physics', 'science'], difficulty: 3, minutes: 25 },
  { id: 'chemistry', name: 'Chemistry: Atomic Structure', url: 'https://brilliant.org/courses/chemistry-atoms/', topics: ['chemistry', 'science'], difficulty: 2, minutes: 20 },
]

const TOPIC_ALIASES = {
  algebra: ['algebra', 'math'],
  geometry: ['geometry', 'math'],
  calculus: ['calculus', 'math'],
  probability: ['probability', 'math'],
  statistics: ['probability', 'math'],
  'number theory': ['numbertheory', 'math'],
  'number-theory': ['numbertheory', 'math'],
  math: ['math'],
  maths: ['math'],
  olympiad: ['olympiad', 'logic', 'math'],
  logic: ['logic'],
  reasoning: ['logic'],
  puzzles: ['logic'],
  cs: ['cs'],
  coding: ['cs', 'programming'],
  programming: ['cs', 'programming'],
  python: ['programming'],
  algorithms: ['cs', 'programming'],
  physics: ['physics', 'science'],
  chemistry: ['chemistry', 'science'],
  science: ['science'],
}

function getCatalog() { return CATALOG }
function getCourseById(id) { return CATALOG.find(c => c.id === id) || null }

function getTopicsForKeyword(kw) {
  if (!kw) return []
  const key = String(kw).toLowerCase().trim()
  if (TOPIC_ALIASES[key]) return TOPIC_ALIASES[key]
  const hits = []
  for (const [k, vals] of Object.entries(TOPIC_ALIASES)) {
    if (key.includes(k)) hits.push(...vals)
  }
  return [...new Set(hits)]
}

export { getCatalog, getCourseById, getTopicsForKeyword }

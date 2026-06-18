/**
 * Source-Grounded Chat — Maya's NotebookLM-equivalent brain.
 * Answers questions strictly from uploaded sources, with [Source N] citations.
 *
 * Goes directly to Claude (bypasses the snappy 1-3 sentence Maya voice rules,
 * because here she's a research assistant, not a coach mid-drill).
 */

import { callClaude, canCallClaude, textFromResponse } from '../lib/anthropicClient'

const SYSTEM_PROMPT = `You are Maya, helping the kid study from their own sources. They have uploaded N reference documents — quoted below as <source id="1" name="...">...</source>.

YOUR JOB:
- Answer his question USING ONLY these sources. Don't pull from outside knowledge unless he explicitly asks for "general knowledge" context.
- Cite every claim inline like [Source 1] or [Source 2, 3]. If multiple sources support a point, cite all of them.
- If the sources don't actually answer the question, say so clearly: "Your sources don't cover that — closest thing they say is [...]". Don't make stuff up.
- Be substantive. Use the sources to teach, not just summarize. Pull out connections, contradictions, and specifics.
- Format clearly: headings or bullets for complex answers, prose for simple ones.

VOICE: Maya is sharp and direct, but in source-chat mode she's also rigorous. Skip the sarcasm here — the kid is studying, they want accuracy. Brief flashes of dry humor are fine. Never lecture or moralize.

If asked for a study guide, summary, or quiz: build it strictly from the sources, with citations.`

const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-opus-4-6'])

function getModel() {
  try {
    const p = JSON.parse(localStorage.getItem('maya_profile') || '{}')
    if (p?.aiModel && ALLOWED_MODELS.has(p.aiModel)) return p.aiModel
  } catch {}
  return 'claude-sonnet-4-6'
}

/**
 * Build the source bundle as an XML-tagged block. Truncates per-source if the
 * combined corpus would push past CONTEXT_BUDGET so we never blow the token cap.
 */
const CONTEXT_BUDGET = 100_000  // chars (~25k tokens) — leaves room for chat
function buildSourceBundle(sources) {
  if (!sources?.length) return ''
  const total = sources.reduce((s, x) => s + x.content.length, 0)
  const ratio = total > CONTEXT_BUDGET ? CONTEXT_BUDGET / total : 1
  const blocks = sources.map((s, i) => {
    const cap = Math.floor(s.content.length * ratio)
    const content = ratio < 1 ? s.content.slice(0, cap) + '\n[…truncated]' : s.content
    return `<source id="${i + 1}" name="${escapeXml(s.name)}">\n${content}\n</source>`
  })
  return blocks.join('\n\n')
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
  ))
}

/**
 * Ask a question grounded in the provided sources. Returns the answer string.
 * @param {string} question
 * @param {Array<{name: string, content: string}>} sources
 * @param {Array<{role: string, content: string}>} [history]
 */
async function askWithSources(question, sources, history = []) {
  if (!canCallClaude()) {
    throw new Error('No Claude API key set. Add one in Profile → Maya\'s Brain to use source chat.')
  }
  if (!sources?.length) {
    throw new Error('No sources added yet. Add notes, a PDF, or paste a transcript first.')
  }

  const bundle = buildSourceBundle(sources)
  const system = `${SYSTEM_PROMPT.replace('N reference documents', `${sources.length} reference document${sources.length === 1 ? '' : 's'}`)}\n\n${bundle}`

  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map(m => ({ role: m.role, content: String(m.content || '').slice(0, 4000) }))

  const data = await callClaude({
    model: getModel(),
    max_tokens: 2000,
    system: system.slice(0, 180_000),
    messages: [
      ...safeHistory,
      { role: 'user', content: String(question || '').slice(0, 4000) },
    ],
  }, { timeoutMs: 60_000 })
  return textFromResponse(data)
}

/**
 * One-shot helpers — sugar over askWithSources for common study moves.
 */
const studyGuide = (sources) => askWithSources(
  'Build me a structured study guide from these sources: 1) one-paragraph overview, 2) 5-10 key concepts (each defined and cited), 3) connections between sources, 4) the 3 questions this material is most likely to be tested on. Use markdown headings. Cite [Source N] throughout.',
  sources
)

const quizMe = (sources, count = 8) => askWithSources(
  `Generate ${count} questions for me on these sources, mixed difficulty (definitional, conceptual, application, edge cases). Numbered list. Don't give answers — those come later. After the list, drop one short Maya-voice line.`,
  sources
)

const summarize = (sources) => askWithSources(
  'Give me a tight 200-word summary of what these sources cover, with citations. End with the single most important takeaway.',
  sources
)

/**
 * Extract `{phrase, definition}` flashcard pairs from sources. Returns a parsed
 * JS array. The model is asked to return JSON only — we strip any markdown
 * fences and parse defensively.
 * @param {Array<{name: string, content: string}>} sources
 * @param {number} [count]
 */
async function extractFlashcards(sources, count = 12) {
  const prompt = `Pull the ${count} most important concepts from these sources for flashcard study. Return ONLY a JSON array (no markdown, no prose, no preamble) of objects shaped like:
[{"phrase": "Term or concept", "definition": "Tight 1-2 sentence definition, in your own words, grounded in the source."}]

Rules:
- "phrase" = a single concept, term, formula, or named idea (3-60 chars).
- "definition" = self-contained, learn-from-scratch quality (max 240 chars).
- Skip filler. Prefer concepts that are testable.
- Don't include citation tags inside the JSON — just clean text.
- Output MUST be valid JSON. Nothing else.`

  const raw = await askWithSources(prompt, sources)
  // Strip fences if the model wrapped output anyway.
  let txt = String(raw || '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  // Find the first [ and last ] in case the model added a preamble.
  const start = txt.indexOf('[')
  const end = txt.lastIndexOf(']')
  if (start >= 0 && end > start) txt = txt.slice(start, end + 1)
  let arr
  try { arr = JSON.parse(txt) } catch { arr = [] }
  if (!Array.isArray(arr)) return []
  return arr
    .map(x => ({
      phrase: String(x?.phrase || '').trim().slice(0, 80),
      definition: String(x?.definition || '').trim().slice(0, 280),
    }))
    .filter(x => x.phrase && x.definition)
}

export { askWithSources, studyGuide, quizMe, summarize, extractFlashcards }

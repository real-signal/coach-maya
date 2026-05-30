/**
 * Study Guide Generator — Maya's built-in NotebookLM equivalent.
 * Uses Claude to create structured study materials from a lesson transcript.
 *
 * Generates:
 *  - Executive summary (3-5 sentences)
 *  - Key concepts list
 *  - Study questions (recall + understanding + application)
 *  - Common mistakes / misconceptions
 *  - "Explain to a friend" challenge
 */

import { getApiKey } from '../lib/secrets'

async function generateStudyGuide(transcript, subject) {
  const apiKey = getApiKey('anthropic')

  if (!apiKey) {
    return { ...heuristicGuide(transcript, subject), _source: 'heuristic', _offline: true }
  }

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
        max_tokens: 1500,
        system: `You are Maya, a sarcastic but encouraging AI coach for a kid. Generate a study guide from his lesson transcript. Be concise, use simple language, make it engaging. Return STRICT JSON only (no markdown fences):
{
  "summary": "3-5 sentence summary of the lesson",
  "keyConcepts": ["concept 1", "concept 2", ...],
  "studyQuestions": [
    {"type": "recall", "q": "..."},
    {"type": "understand", "q": "..."},
    {"type": "apply", "q": "..."}
  ],
  "commonMistakes": ["mistake 1", "mistake 2"],
  "explainChallenge": "Explain X to a friend who missed this lesson — in 30 seconds",
  "mayaNote": "1-2 sentence sarcastic-encouraging note from Maya about this lesson"
}`,
        messages: [{
          role: 'user',
          content: `Subject: ${subject}\n\nFull lesson transcript:\n${transcript.slice(0, 8000)}`
        }],
      }),
    })

    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    const text = data.content[0].text
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return { ...parsed, _source: 'claude' }
  } catch (e) {
    // Surface to global error trail so the UI can show a "running in offline
    // mode" hint instead of silently degrading.
    if (typeof window !== 'undefined') {
      window.__mayaLastError = { label: 'studyGuide', msg: e?.message || String(e), ts: Date.now() }
    }
    console.warn('Claude study guide failed:', e)
    return { ...heuristicGuide(transcript, subject), _source: 'heuristic', _offline: true }
  }
}

function heuristicGuide(transcript, subject) {
  const words = transcript.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []
  const stop = new Set(['the','and','for','that','this','with','from','have','will','been','they','their','what','when','where','about','which','would','could','should','just','also','into','some','than','them','then','more','very','only','like','other','each','make','over','such','after','because','these','first','well','through','still','back','much','before','between'])
  const freq = {}
  words.forEach(w => { if (!stop.has(w) && w.length > 3) freq[w] = (freq[w] || 0) + 1 })
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w)

  return {
    summary: `This ${subject} lesson covered topics including ${top.slice(0, 3).join(', ')}. Review the key concepts below and test yourself with the study questions.`,
    keyConcepts: top,
    studyQuestions: [
      { type: 'recall', q: `What is the definition of "${top[0] || subject}"?` },
      { type: 'understand', q: `Why is "${top[1] || 'this topic'}" important?` },
      { type: 'apply', q: `Give a real-world example of "${top[0] || 'this concept'}".` },
    ],
    commonMistakes: [`Confusing "${top[0] || 'key term'}" with "${top[1] || 'related term'}"`],
    explainChallenge: `Explain the main idea of today's ${subject} lesson to a friend in 30 seconds.`,
    mayaNote: `${subject} lesson done. The concepts are in your head — now lock them in by answering the questions below.`,
  }
}

export { generateStudyGuide }

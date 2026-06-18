/**
 * Quiz Grader — uses Claude when available, falls back to heuristic.
 * Returns { score 0-100, feedback, perQuestion: [{score, note}] }
 */

import { callClaude, canCallClaude, textFromResponse } from '../lib/anthropicClient'

async function callClaudeGrader(systemPrompt, userPrompt) {
  if (!canCallClaude()) throw new Error('no key')
  const data = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })
  return textFromResponse(data)
}

/**
 * Grade an array of quiz items with transcript context.
 * @param {Array<{q:string, a:string}>} quiz
 * @param {string} transcript
 * @param {string} subject
 */
async function gradeQuiz(quiz, transcript, subject) {
  // Try Claude first
  try {
    const sys = `You are Maya, grading answers to a ${subject} lesson quiz.
You have the actual lesson transcript as ground truth.
Be encouraging but honest. Treat this like a founder reviewing work — direct, short, no fluff.

Return STRICT JSON in this exact shape (no markdown, no prose outside the JSON):
{
  "overallScore": <0-100 integer>,
  "feedback": "<1-2 sentences in Maya's voice: sarcastic, encouraging, builder energy>",
  "perQuestion": [
    { "score": <0-100>, "note": "<1 short sentence feedback>" }
  ]
}`

    const user = `LESSON TRANSCRIPT (ground truth):
${(transcript || '').slice(0, 4000)}

QUIZ:
${quiz.map((q, i) => `Q${i + 1}: ${q.q}\nA${i + 1}: ${q.a || '(no answer)'}`).join('\n\n')}

Grade each answer against what the transcript actually said. Shallow or missing answers score low. Answers that demonstrate real understanding score high. Return JSON only.`

    const text = await callClaudeGrader(sys, user)
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())
    return parsed
  } catch (e) {
    console.warn('Claude grading unavailable, using heuristic:', e.message)
    return heuristicGrade(quiz)
  }
}

function heuristicGrade(quiz) {
  const perQuestion = quiz.map(q => {
    const len = (q.a || '').trim().length
    if (!len) return { score: 0, note: 'No answer.' }
    if (len < 10) return { score: 25, note: 'Too brief. Say more next time.' }
    if (len < 30) return { score: 55, note: 'Decent start but shallow.' }
    if (len < 80) return { score: 75, note: 'Solid answer.' }
    return { score: 90, note: 'Full answer. Nice.' }
  })
  const overall = Math.round(perQuestion.reduce((s, p) => s + p.score, 0) / (perQuestion.length || 1))
  const feedback = overall >= 80
    ? "Locked in. That's the understanding we wanted."
    : overall >= 50
      ? "Halfway there. Revisit the tricky ones."
      : "Rough round. The concept goes back in box one."
  return { overallScore: overall, feedback, perQuestion }
}

export { gradeQuiz, heuristicGrade }

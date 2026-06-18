/**
 * Maya Explains — ask Maya to explain ANY topic.
 * Like a personal Wikipedia that talks to you at age 12 level.
 * Uses Claude API for real explanations, fallback message without.
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadProfile } from './lib/profile'
import { callClaude, canCallClaude, textFromResponse } from './lib/anthropicClient'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', green: '#34D399', gold: '#FFD700',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

const QUICK_TOPICS = [
  'How does Wi-Fi work?',
  'What is photosynthesis?',
  'How do rockets get to space?',
  'What is a black hole?',
  'How does a computer think?',
  'Why is the sky blue?',
  'How does the stock market work?',
  'What is DNA?',
  'How does a tennis serve work (physics)?',
  'What is cryptocurrency?',
  'How does AI actually learn?',
  'What causes thunder and lightning?',
]

export default function MayaExplain() {
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const [explanation, setExplanation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history])

  const explain = async (q) => {
    const question = q || topic.trim()
    if (!question) return
    setTopic('')
    setLoading(true)
    setHistory(h => [...h, { type: 'user', text: question }])

    let answer

    if (canCallClaude()) {
      try {
        const data = await callClaude({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          system: `You are Maya, explaining things to a kid. Rules:
- Explain like you're a cool older sibling, not a textbook
- Use analogies he'd understand (gaming, sports, building things)
- Keep it under 150 words
- Break complex ideas into 2-3 bullet points
- End with a "why this matters" one-liner
- Be slightly sarcastic but make it stick`,
          messages: [
            ...history.slice(-6).map(h => ({
              role: h.type === 'user' ? 'user' : 'assistant',
              content: h.text,
            })),
            { role: 'user', content: `Explain: ${question}` },
          ],
        })
        answer = textFromResponse(data)
      } catch {
        answer = "My brain's offline. Add a Claude API key in Profile so I can actually explain things."
      }
    } else {
      answer = `I'd love to explain "${question}" but I need a Claude API key to think. Add one in Profile → Maya's Brain. Without it I'm basically a fancy clock.`
    }

    setHistory(h => [...h, { type: 'maya', text: answer }])
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80, display: 'flex', flexDirection: 'column' }}>
      <Header onBack={() => navigate('/')} />

      <div style={{ flex: 1, overflowY: 'auto', padding: 16, maxWidth: 480, margin: '0 auto', width: '100%' }}>
        {history.length === 0 && (
          <>
            <div style={{ textAlign: 'center', padding: '20px 0', color: C.muted }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🤔</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Ask Maya anything</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>She'll explain it like a cool older sibling, not a textbook.</div>
            </div>

            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 8 }}>
              Quick topics
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_TOPICS.map((t, i) => (
                <button key={i} onClick={() => explain(t)} style={{
                  padding: '8px 12px', background: C.surface,
                  border: `1px solid ${C.border}`, borderRadius: 999,
                  color: C.text, fontSize: 11, fontFamily: C.mono, cursor: 'pointer',
                }}>{t}</button>
              ))}
            </div>
          </>
        )}

        {history.map((h, i) => (
          <div key={i} style={{
            marginBottom: 10, display: 'flex',
            justifyContent: h.type === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%', padding: '12px 16px',
              borderRadius: h.type === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: h.type === 'user' ? C.teal + '22' : C.surfaceLight,
              border: `1px solid ${h.type === 'user' ? C.teal + '33' : C.border}`,
              fontSize: 13, lineHeight: 1.6, color: C.text,
              whiteSpace: 'pre-wrap',
            }}>
              {h.type !== 'user' && (
                <div style={{ fontSize: 9, color: C.teal, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Maya</div>
              )}
              {h.text}
            </div>
          </div>
        ))}
        {loading && <div style={{ fontSize: 11, color: C.muted, padding: 8 }}>Maya is thinking...</div>}
        <div ref={endRef} />
      </div>

      <div style={{
        padding: '10px 16px', borderTop: `1px solid ${C.border}`,
        display: 'flex', gap: 8, background: C.surface,
        maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box',
      }}>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') explain() }}
          placeholder="What do you want to understand?"
          style={{
            flex: 1, padding: '12px 14px', background: C.bg,
            border: `1px solid ${C.border}`, borderRadius: 10,
            color: C.text, fontSize: 13, fontFamily: C.mono, outline: 'none',
          }}
        />
        <button
          onClick={() => explain()}
          disabled={loading || !topic.trim()}
          style={{
            padding: '12px 18px', background: loading ? C.dim : C.teal,
            border: 'none', borderRadius: 10, color: C.bg, fontSize: 13,
            fontWeight: 700, fontFamily: C.mono, cursor: 'pointer',
          }}
        >Ask</button>
      </div>
    </div>
  )
}

function Header({ onBack }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, background: C.surface, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 0 }}>←</button>
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2 }}>MAYA EXPLAINS</div>
    </div>
  )
}

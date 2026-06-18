/**
 * Homework Helper — Vasco describes a problem, Maya walks him through it.
 * Never gives the answer directly. Socratic method with sarcasm.
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaya } from './context/MayaContext'
import { loadProfile } from './lib/profile'
import { callClaude, canCallClaude, textFromResponse } from './lib/anthropicClient'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171',
  green: '#34D399', gold: '#FFD700', amber: '#FBBF24',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

const SYSTEM_PROMPT = `You are Maya, a sarcastic but encouraging tutor for a kid.
He's asking for homework help. Your job is to GUIDE him to the answer, not give it.

RULES:
- NEVER give the final answer directly. Walk him through step by step.
- Ask leading questions: "What's the first thing you'd do here?"
- If he's stuck, give ONE hint at a time
- If he gets it right, celebrate with specific praise
- Keep it short: 2-3 sentences per response
- Use his level: he's 12, smart but sometimes lazy
- Be sarcastic but kind. "Close. Your math teacher would cry a little, but close."
- If he tries to get you to just give the answer: "Nice try. What do YOU think?"`

export default function MayaHomework() {
  const navigate = useNavigate()
  const maya = useMaya()
  const [subject, setSubject] = useState('Maths')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', text: input.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    let reply
    if (canCallClaude()) {
      try {
        const history = messages.map(m => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.text,
        }))
        history.push({ role: 'user', content: `Subject: ${subject}. ${userMsg.text}` })

        const data = await callClaude({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: history.slice(-12),
        })
        reply = textFromResponse(data)
      } catch (e) {
        reply = "My brain isn't responding right now. Try again in a sec, or check your Claude API key in Profile."
      }
    } else {
      reply = "I need a Claude API key to help with homework. Add one in Profile → Maya's Brain. Without it I'm just a pretty face."
    }

    setMessages(prev => [...prev, { role: 'maya', text: reply }])
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80, display: 'flex', flexDirection: 'column' }}>
      <Header onBack={() => navigate('/')} />

      {/* Subject picker */}
      <div style={{ padding: '8px 16px', borderBottom: `1px solid ${C.border}`, background: C.surface, display: 'flex', gap: 6, overflowX: 'auto' }}>
        {['Maths', 'Science', 'English', 'History', 'Languages', 'Coding'].map(s => (
          <button key={s} onClick={() => setSubject(s)} style={{
            padding: '6px 12px', borderRadius: 999, fontSize: 10,
            border: `1px solid ${subject === s ? C.teal : C.border}`,
            background: subject === s ? C.teal + '22' : 'transparent',
            color: subject === s ? C.teal : C.muted,
            fontFamily: C.mono, cursor: 'pointer', whiteSpace: 'nowrap',
          }}>{s}</button>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              Describe your homework problem.<br/>
              I'll walk you through it — no freebies.
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{
            marginBottom: 10, display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '85%', padding: '10px 14px',
              borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: m.role === 'user' ? C.teal + '22' : C.surfaceLight,
              border: `1px solid ${m.role === 'user' ? C.teal + '33' : C.border}`,
              fontSize: 13, lineHeight: 1.6, color: C.text,
            }}>
              {m.role !== 'user' && (
                <div style={{ fontSize: 9, color: C.teal, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>Maya</div>
              )}
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ fontSize: 11, color: C.muted, padding: 8 }}>Maya is thinking...</div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 16px', borderTop: `1px solid ${C.border}`,
        display: 'flex', gap: 8, background: C.surface,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Describe the problem..."
          rows={2}
          style={{
            flex: 1, padding: '10px 12px', background: C.bg,
            border: `1px solid ${C.border}`, borderRadius: 10,
            color: C.text, fontSize: 13, fontFamily: C.mono,
            outline: 'none', resize: 'none', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: '10px 16px', background: loading ? C.dim : C.teal,
            border: 'none', borderRadius: 10,
            color: C.bg, fontSize: 13, fontWeight: 700,
            fontFamily: C.mono, cursor: loading ? 'wait' : 'pointer',
            alignSelf: 'flex-end',
          }}
        >Ask</button>
      </div>
    </div>
  )
}

function Header({ onBack }) {
  return (
    <div style={{
      padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
      background: C.surface, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <button onClick={onBack} style={{
        background: 'transparent', border: 'none', color: C.muted,
        fontSize: 18, cursor: 'pointer', padding: 0,
      }}>←</button>
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2 }}>HOMEWORK HELP</div>
    </div>
  )
}

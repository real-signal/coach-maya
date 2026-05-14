/**
 * MayaNotebook — embedded NotebookLM-equivalent.
 * Sources panel (left/top) + grounded chat (right/bottom).
 * Vasco uploads notes/PDFs/transcripts and chats against them with citations.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  loadSources, addSource, removeSource, clearAllSources,
  extractPdfText, readTextFile,
} from './lib/sources'
import { askWithSources, studyGuide, quizMe, summarize, extractFlashcards } from './agents/sourceChat'
import { addConceptsFromLesson } from './agents/memory'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171', amber: '#fbbf24',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

export default function MayaNotebook() {
  const navigate = useNavigate()
  const [sources, setSources] = useState(loadSources())
  const [messages, setMessages] = useState(() => loadNotebookChat())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteName, setPasteName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const fileRef = useRef(null)
  const chatRef = useRef(null)
  const sourceRefs = useRef({}) // id → DOM node, for citation jump
  const [flashId, setFlashId] = useState(null) // briefly highlights a source row
  const [expandedId, setExpandedId] = useState(null) // source preview expansion

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, busy])

  // Persist chat across reloads. Trimmed in saveNotebookChat to stay under
  // localStorage budget.
  useEffect(() => {
    saveNotebookChat(messages)
  }, [messages])

  const newChat = () => {
    if (messages.length && !confirm('Clear this chat? Sources stay.')) return
    setMessages([])
    setError('')
  }

  // Citation tap → scroll source into view + flash its border for 1.2s.
  // 1-indexed because Maya emits [Source 1], [Source 2], etc.
  const jumpToSource = (sourceIndex) => {
    const src = sources[sourceIndex - 1]
    if (!src) return
    const node = sourceRefs.current[src.id]
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    setFlashId(src.id)
    setTimeout(() => setFlashId(curr => (curr === src.id ? null : curr)), 1200)
  }

  const refresh = () => setSources(loadSources())

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so same file can be re-selected
    if (!file) return
    setError('')
    setAdding(true)
    try {
      let content = ''
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        content = await extractPdfText(file)
        if (!content.trim()) throw new Error('No extractable text in this PDF (might be a scanned image).')
      } else {
        content = await readTextFile(file)
      }
      addSource({ name: file.name, type: file.type || 'text', content })
      refresh()
    } catch (err) {
      setError(err?.message || 'Could not add file.')
    } finally {
      setAdding(false)
    }
  }

  const onPasteSubmit = () => {
    setError('')
    try {
      addSource({
        name: pasteName.trim() || `Note ${new Date().toLocaleDateString()}`,
        type: 'text',
        content: pasteText,
      })
      setPasteMode(false)
      setPasteName('')
      setPasteText('')
      refresh()
    } catch (err) {
      setError(err?.message || 'Could not save note.')
    }
  }

  const onRemove = (id) => {
    if (!confirm('Remove this source?')) return
    removeSource(id)
    refresh()
  }

  const onClearAll = () => {
    if (!confirm('Remove ALL sources? This cannot be undone.')) return
    clearAllSources()
    refresh()
    setMessages([])
  }

  const loadDemo = () => {
    setError('')
    try {
      addSource({ name: 'Demo — Photosynthesis basics', type: 'text', content: DEMO_SOURCE })
      refresh()
    } catch (err) {
      setError(err?.message || 'Could not load demo.')
    }
  }

  const ask = async (question) => {
    if (!question.trim() || busy) return
    setError('')
    const next = [...messages, { role: 'user', content: question }]
    setMessages(next)
    setInput('')
    setBusy(true)
    try {
      const reply = await askWithSources(question, sources, next.slice(0, -1))
      setMessages([...next, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err?.message || 'Chat failed.')
      setMessages(next) // keep the user message; just no reply
    } finally {
      setBusy(false)
    }
  }

  const startDrill = async () => {
    if (busy || !sources.length) return
    setError('')
    setBusy(true)
    try {
      const raw = await quizMe(sources, 6)
      const questions = parseNotebookQuestions(raw)
      if (questions.length < 2) {
        throw new Error('Could not extract enough questions — try Quiz me first, then start a drill.')
      }
      const topic = sources.length === 1
        ? (sources[0].name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'your notebook')
        : `your notebook (${sources.length} sources)`
      const session = {
        questions,
        idx: 0,
        topic,
        startedAt: new Date().toISOString(),
        origin: 'notebook',
      }
      try { localStorage.setItem('maya_quiz_session', JSON.stringify(session)) } catch {}
      setMessages(m => [...m, { role: 'assistant', content:
        `Drill loaded — ${questions.length} questions on ${topic}. Head to the dashboard and answer through Maya's chat. Quiz HUD will track your progress; tap ✕ END anytime.` }])
      // Brief delay so the message paints before navigating.
      setTimeout(() => navigate('/'), 600)
    } catch (err) {
      setError(err?.message || 'Could not start drill.')
    } finally {
      setBusy(false)
    }
  }

  const makeFlashcards = async () => {
    if (busy || !sources.length) return
    setError('')
    setMessages(m => [...m, { role: 'user', content: '🃏 Make flashcards from these sources' }])
    setBusy(true)
    try {
      const cards = await extractFlashcards(sources, 12)
      if (!cards.length) throw new Error('Could not extract flashcards from these sources.')
      const lesson = {
        id: `notebook_${Date.now()}`,
        subject: 'Notebook',
        fullTranscript: '',
      }
      const { added, total } = addConceptsFromLesson(lesson, cards)
      const dupes = cards.length - added.length
      const previewLines = added.slice(0, 5).map(c => `• ${c.phrase}`).join('\n')
      const more = added.length > 5 ? `\n…and ${added.length - 5} more.` : ''
      const dupNote = dupes > 0 ? `\n(${dupes} skipped — already in memory.)` : ''
      setMessages(m => [...m, { role: 'assistant', content:
        `Added ${added.length} flashcard${added.length === 1 ? '' : 's'} to your memory deck. Total deck: ${total}.\n\n${previewLines}${more}${dupNote}\n\nReview them in Memory (/memory) — spaced repetition kicks in tomorrow.` }])
    } catch (err) {
      setError(err?.message || 'Could not make flashcards.')
    } finally {
      setBusy(false)
    }
  }

  const oneShot = async (kind) => {
    if (busy || !sources.length) return
    setError('')
    const labels = { guide: 'Build me a study guide', quiz: 'Quiz me on these sources', summary: 'Summarize these sources' }
    setMessages(m => [...m, { role: 'user', content: labels[kind] }])
    setBusy(true)
    try {
      const fn = kind === 'guide' ? studyGuide : kind === 'quiz' ? quizMe : summarize
      const reply = await fn(sources)
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err?.message || 'Failed.')
    } finally {
      setBusy(false)
    }
  }

  const totalKB = Math.round(sources.reduce((s, x) => s + (x.content?.length || 0), 0) / 1024)

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: C.mono, paddingBottom: 100,
    }}>
      <Header onBack={() => navigate('/')} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }}>
        {/* Sources */}
        <Section title={`Sources (${sources.length}/12 · ${totalKB}KB)`}>
          {sources.length === 0 && (
            <>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                No sources yet. Drop in a PDF, .txt note, or paste lesson notes / transcripts. Maya will answer questions strictly from these — with citations.
              </p>
              <button onClick={loadDemo} style={{
                ...btn(C.amber), marginBottom: 10,
              }}>
                ✨ Load demo source (try it out)
              </button>
            </>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            {sources.map((s, i) => {
              const expanded = expandedId === s.id
              return (
                <div
                  key={s.id}
                  ref={el => { if (el) sourceRefs.current[s.id] = el }}
                  style={{
                    padding: 10, background: C.surfaceLight, borderRadius: 10,
                    border: `1px solid ${flashId === s.id ? C.teal : C.border}`,
                    boxShadow: flashId === s.id ? `0 0 0 2px ${C.teal}55` : 'none',
                    transition: 'border-color 200ms, box-shadow 200ms',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: C.teal,
                      minWidth: 22, textAlign: 'center',
                    }}>[{i + 1}]</div>
                    <button
                      onClick={() => setExpandedId(expanded ? null : s.id)}
                      style={{
                        flex: 1, minWidth: 0, textAlign: 'left',
                        background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                        color: C.text, fontFamily: C.mono,
                      }}>
                      <div style={{
                        fontSize: 12, fontWeight: 600,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{s.name}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                        {Math.round(s.size / 1024)}KB · {new Date(s.addedAt).toLocaleDateString()} · tap to {expanded ? 'hide' : 'preview'}
                      </div>
                    </button>
                    <button onClick={() => onRemove(s.id)} style={{
                      background: 'transparent', border: 'none', color: C.muted,
                      fontSize: 14, cursor: 'pointer', padding: 4,
                    }}>✕</button>
                  </div>
                  {expanded && (
                    <div style={{
                      marginTop: 10, padding: 10, background: C.bg,
                      borderRadius: 8, border: `1px solid ${C.border}`,
                      fontSize: 11, lineHeight: 1.5, color: C.muted,
                      maxHeight: 220, overflowY: 'auto', whiteSpace: 'pre-wrap',
                    }}>
                      {(s.content || '').slice(0, 800)}
                      {(s.content || '').length > 800 && (
                        <span style={{ color: C.dim }}> …({Math.round(((s.content || '').length - 800) / 1024)}KB more)</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => fileRef.current?.click()} disabled={adding} style={btn(C.teal)}>
              {adding ? 'Reading...' : '+ File (PDF / TXT)'}
            </button>
            <button onClick={() => setPasteMode(true)} style={btn(C.teal)}>+ Paste text</button>
            {sources.length > 0 && (
              <button onClick={onClearAll} style={{
                ...btn(C.red), background: 'transparent', border: `1px solid ${C.red}`, color: C.red,
              }}>Clear all</button>
            )}
          </div>
          <input
            ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            style={{ display: 'none' }} onChange={onPickFile}
          />

          {pasteMode && (
            <div style={{ marginTop: 12, padding: 12, background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
              <input
                placeholder="Source name (e.g. 'Bio Chapter 4 notes')"
                value={pasteName} onChange={e => setPasteName(e.target.value)}
                style={fieldStyle} />
              <textarea
                placeholder="Paste lesson notes, a transcript, an article, anything..."
                value={pasteText} onChange={e => setPasteText(e.target.value)}
                rows={6}
                style={{ ...fieldStyle, marginTop: 8, resize: 'vertical', fontFamily: C.mono }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={onPasteSubmit} style={btn(C.teal)}>Save</button>
                <button onClick={() => { setPasteMode(false); setPasteText(''); setPasteName('') }} style={{
                  ...btn(C.muted), background: 'transparent', border: `1px solid ${C.border}`, color: C.muted,
                }}>Cancel</button>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 10, padding: 10, background: `${C.red}22`,
              border: `1px solid ${C.red}66`, borderRadius: 8, fontSize: 11, color: C.red,
            }}>{error}</div>
          )}
        </Section>

        {/* Quick actions */}
        {sources.length > 0 && (
          <Section title="Quick study moves">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => oneShot('summary')} disabled={busy} style={btn(C.teal)}>📋 Summary</button>
              <button onClick={() => oneShot('guide')} disabled={busy} style={btn(C.teal)}>📚 Study guide</button>
              <button onClick={() => oneShot('quiz')} disabled={busy} style={btn(C.teal)}>🎯 Quiz me</button>
              <button onClick={makeFlashcards} disabled={busy} style={btn(C.amber)}>🃏 Make flashcards</button>
              <button onClick={startDrill} disabled={busy} style={btn(C.red)}>🔥 Start drill</button>
            </div>
          </Section>
        )}

        {/* Chat */}
        <Section title="Chat with your sources" right={messages.length > 0 && (
          <button onClick={newChat} disabled={busy} style={{
            background: 'transparent', border: `1px solid ${C.border}`, color: C.muted,
            fontSize: 10, fontFamily: C.mono, fontWeight: 600,
            padding: '4px 8px', borderRadius: 6, cursor: 'pointer', letterSpacing: 0.5,
          }}>🧹 NEW CHAT</button>
        )}>
          <div ref={chatRef} style={{
            minHeight: 200, maxHeight: 460, overflowY: 'auto',
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 12, marginBottom: 10,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {messages.length === 0 && !busy && (
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
                {sources.length === 0
                  ? 'Add at least one source to start chatting.'
                  : 'Ask anything grounded in your sources. Citations included.'}
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '90%',
                padding: '10px 12px', borderRadius: 12,
                background: m.role === 'user' ? `${C.teal}22` : C.surfaceLight,
                border: `1px solid ${m.role === 'user' ? C.teal + '44' : C.border}`,
                fontSize: 12, lineHeight: 1.55, whiteSpace: 'pre-wrap',
              }}>
                {m.role === 'assistant'
                  ? renderWithCitations(m.content, jumpToSource, sources.length)
                  : m.content}
              </div>
            ))}
            {busy && (
              <div style={{ alignSelf: 'flex-start', padding: '10px 12px', fontSize: 11, color: C.muted }}>
                Maya is thinking...
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <input
              placeholder={sources.length ? 'Ask anything about your sources...' : 'Add a source first'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') ask(input) }}
              disabled={!sources.length || busy}
              style={{ ...fieldStyleFlex, flex: 1 }}
            />
            <button onClick={() => ask(input)} disabled={!sources.length || busy || !input.trim()} style={btn(C.teal)}>
              Send
            </button>
          </div>
        </Section>
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
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2 }}>NOTEBOOK</div>
    </div>
  )
}

function Section({ title, right, children }) {
  return (
    <div style={{
      padding: 14, background: C.surface, borderRadius: 14,
      border: `1px solid ${C.border}`, marginBottom: 14,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10, gap: 8,
      }}>
        <div style={{
          fontSize: 10, color: C.muted, textTransform: 'uppercase',
          letterSpacing: 1.5,
        }}>{title}</div>
        {right || null}
      </div>
      {children}
    </div>
  )
}

// Replace `[Source N]` / `[Source N, M]` tokens with tappable pills that
// jump to the matching source row. Each token may contain multiple comma-
// separated indices. Tokens that refer to an out-of-range source render as
// muted (non-tappable) so kids see Maya cited it but know the slot is gone.
function renderWithCitations(text, onJump, sourceCount) {
  const src = String(text || '')
  if (!src) return ''
  const re = /\[Source\s+([0-9]+(?:\s*,\s*[0-9]+)*)\]/gi
  const out = []
  let last = 0
  let key = 0
  let match
  while ((match = re.exec(src)) !== null) {
    if (match.index > last) out.push(src.slice(last, match.index))
    const indices = match[1].split(',').map(x => parseInt(x.trim(), 10)).filter(Number.isFinite)
    indices.forEach((n, j) => {
      const inRange = n >= 1 && n <= sourceCount
      out.push(
        <button
          key={`cite-${key++}`}
          onClick={inRange ? () => onJump(n) : undefined}
          disabled={!inRange}
          title={inRange ? `Jump to Source ${n}` : `Source ${n} no longer loaded`}
          style={{
            display: 'inline-block',
            margin: '0 2px',
            padding: '1px 6px',
            borderRadius: 6,
            fontSize: 10, fontWeight: 700,
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: 0.3,
            border: `1px solid ${inRange ? 'rgba(45,212,191,0.45)' : 'rgba(255,255,255,0.18)'}`,
            background: inRange ? 'rgba(45,212,191,0.12)' : 'transparent',
            color: inRange ? '#2DD4BF' : '#6b6b8a',
            cursor: inRange ? 'pointer' : 'not-allowed',
            verticalAlign: 'baseline',
          }}
        >
          [{n}]
        </button>
      )
      if (j < indices.length - 1) out.push(' ')
    })
    last = match.index + match[0].length
  }
  if (last < src.length) out.push(src.slice(last))
  return out
}

// Robust numbered-question parser for notebook drill mode. Handles `1.`,
// `1)`, `**1.**`, `Q1:`, and Markdown-bold variants. Joins continuation
// lines until the next numbered marker or a blank line.
function parseNotebookQuestions(text) {
  const lines = String(text || '').split('\n')
  const items = []
  let current = null
  const startRe = /^\s*(?:\*\*)?\s*(?:Q\.?\s*)?(\d+)\s*[\.\):]\s*(?:\*\*)?\s*(.+?)\s*$/i
  for (const line of lines) {
    const m = line.match(startRe)
    if (m) {
      if (current) items.push(current.trim())
      current = m[2].replace(/\*\*/g, '').trim()
    } else if (current && line.trim() && !line.match(/^\s*[—–-]{2,}/)) {
      current += ' ' + line.replace(/\*\*/g, '').trim()
    } else if (current && !line.trim()) {
      items.push(current.trim())
      current = null
    }
  }
  if (current) items.push(current.trim())
  // Drop short/closing-banter items, strip stray citations.
  return items
    .map(q => q.replace(/\s*\[Source [^\]]+\]/gi, '').replace(/\s+/g, ' ').trim())
    .filter(q => q.length > 12 && /[?]|\bwhat|\bwhy|\bhow|\bdescribe|\bdefine|\bexplain|\bsolve|\bcalculate|\bprove|\bcompare/i.test(q))
}

// Notebook chat persistence — saved separately from sources so users can
// blow away the chat without losing what they uploaded. Bounded to keep
// localStorage healthy.
const CHAT_KEY = 'maya_notebook_chat'
const MAX_CHAT_MESSAGES = 50
function loadNotebookChat() {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter(m => m && typeof m.role === 'string' && typeof m.content === 'string')
  } catch { return [] }
}
function saveNotebookChat(messages) {
  try {
    const trimmed = (messages || []).slice(-MAX_CHAT_MESSAGES)
    localStorage.setItem(CHAT_KEY, JSON.stringify(trimmed))
  } catch {}
}

const btn = (color) => ({
  padding: '8px 14px', borderRadius: 8, border: 'none',
  background: color, color: C.bg,
  fontSize: 11, fontFamily: C.mono, fontWeight: 700, cursor: 'pointer',
})

// One-tap demo content so the chat flow is testable without uploading a real
// PDF. Substantive enough to support summary / quiz / study-guide actions.
const DEMO_SOURCE = `PHOTOSYNTHESIS — OVERVIEW

Photosynthesis is the process by which green plants, algae, and some bacteria convert light energy into chemical energy stored in glucose. It is the foundation of nearly all food chains on Earth and produces the oxygen in the atmosphere.

The overall equation is:
  6 CO2 + 6 H2O + light energy → C6H12O6 + 6 O2
Six molecules of carbon dioxide plus six molecules of water, in the presence of light, yield one molecule of glucose and six molecules of oxygen.

WHERE IT HAPPENS

Photosynthesis takes place in chloroplasts, organelles found primarily in the mesophyll cells of plant leaves. Each chloroplast contains stacks of thylakoids called grana, surrounded by a fluid-filled space called the stroma. The green pigment chlorophyll, embedded in the thylakoid membranes, absorbs light most strongly in the blue (~430 nm) and red (~660 nm) wavelengths, reflecting green — which is why leaves appear green.

TWO STAGES

1) LIGHT-DEPENDENT REACTIONS — occur in the thylakoid membranes.
   - Light hits Photosystem II, exciting electrons.
   - Water molecules are split (photolysis), releasing O2 as a byproduct, plus H+ ions and electrons.
   - Electrons travel down an electron transport chain, pumping H+ into the thylakoid lumen.
   - ATP synthase uses the H+ gradient to make ATP from ADP.
   - Photosystem I re-energizes electrons, which reduce NADP+ to NADPH.
   - Net products: ATP, NADPH, and O2.

2) LIGHT-INDEPENDENT REACTIONS (Calvin cycle) — occur in the stroma.
   - The enzyme RuBisCO fixes CO2 onto a 5-carbon sugar (RuBP), forming an unstable 6-carbon intermediate that splits into two 3-PGA molecules.
   - ATP and NADPH from the light reactions reduce 3-PGA to G3P (glyceraldehyde-3-phosphate).
   - Most G3P regenerates RuBP; some exits the cycle to form glucose and other carbohydrates.
   - The cycle must turn six times to produce one glucose molecule, using 18 ATP and 12 NADPH.

FACTORS AFFECTING THE RATE

- Light intensity: rate increases with light up to a saturation point.
- CO2 concentration: limiting at low levels; saturates above ~1000 ppm in most plants.
- Temperature: enzyme-driven, optimum around 25-35°C for most temperate plants; rate drops sharply above ~40°C as enzymes denature.
- Water availability: stomata close when water is scarce, restricting CO2 intake.

C3, C4, AND CAM PLANTS

- C3 plants (most plants, e.g. wheat, rice): fix CO2 directly via RuBisCO. Inefficient in hot/dry conditions due to photorespiration.
- C4 plants (e.g. corn, sugarcane): use PEP carboxylase to concentrate CO2 in bundle-sheath cells, minimizing photorespiration. More efficient in hot climates.
- CAM plants (e.g. cacti, pineapples): open stomata only at night, store CO2 as malic acid, then fix it during the day. Adaptation to extreme aridity.

WHY IT MATTERS

Photosynthesis produced the oxygen-rich atmosphere starting ~2.4 billion years ago (the Great Oxygenation Event), enabling complex life. Today it removes roughly 100 gigatonnes of carbon from the atmosphere each year, making it central to the global carbon cycle and to climate-change mitigation strategies.`

// Renamed off `input` to avoid shadowing the `[input, setInput]` state hook
// inside the component (that bug rendered the chat input + paste form unusable).
const fieldStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  background: C.bg, border: `1px solid ${C.border}`,
  color: C.text, fontSize: 12, fontFamily: C.mono,
  boxSizing: 'border-box',
}

const fieldStyleFlex = {
  ...fieldStyle,
  width: 'auto',
}

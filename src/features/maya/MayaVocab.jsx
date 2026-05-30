/**
 * Vocabulary Builder — extracts new/hard words from lesson transcripts,
 * defines them, builds a personal dictionary.
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadProfile } from './lib/profile'
import { getApiKey } from './lib/secrets'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171',
  green: '#34D399', gold: '#FFD700', amber: '#FBBF24',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

const VOCAB_KEY = 'maya_vocab'

function loadVocab() {
  try { return JSON.parse(localStorage.getItem(VOCAB_KEY)) || [] }
  catch { return [] }
}
function saveVocab(words) {
  try { localStorage.setItem(VOCAB_KEY, JSON.stringify(words.slice(0, 500))) } catch {}
}

export default function MayaVocab() {
  const navigate = useNavigate()
  const [words, setWords] = useState(loadVocab())
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ word: '', definition: '', example: '', subject: '' })
  const [search, setSearch] = useState('')
  const [defLoading, setDefLoading] = useState(false)

  const persist = (next) => { setWords(next); saveVocab(next) }

  const addWord = () => {
    if (!form.word.trim()) return
    const entry = {
      id: `v_${Date.now()}`,
      word: form.word.trim(),
      definition: form.definition.trim(),
      example: form.example.trim(),
      subject: form.subject.trim(),
      addedAt: new Date().toISOString(),
      mastered: false,
    }
    persist([entry, ...words])
    setForm({ word: '', definition: '', example: '', subject: '' })
    setAdding(false)
  }

  const lookUp = async () => {
    if (!form.word.trim()) return
    setDefLoading(true)
    const apiKey = getApiKey('anthropic')
    if (apiKey) {
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
            max_tokens: 200,
            system: 'You help a 12-year-old understand vocabulary. Return JSON only: {"definition":"simple 1-sentence definition","example":"example sentence using the word"}',
            messages: [{ role: 'user', content: `Define "${form.word}" for a 12-year-old.` }],
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const parsed = JSON.parse(data.content[0].text.replace(/```json|```/g, '').trim())
          setForm(f => ({ ...f, definition: parsed.definition || '', example: parsed.example || '' }))
        }
      } catch (e) { console.warn('Lookup failed:', e) }
    } else {
      // Free dictionary API fallback
      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(form.word)}`)
        if (res.ok) {
          const data = await res.json()
          const meaning = data[0]?.meanings?.[0]
          const def = meaning?.definitions?.[0]
          setForm(f => ({
            ...f,
            definition: def?.definition || '',
            example: def?.example || '',
          }))
        }
      } catch {}
    }
    setDefLoading(false)
  }

  const toggleMastered = (id) => {
    const next = words.map(w => w.id === id ? { ...w, mastered: !w.mastered } : w)
    persist(next)
  }

  const removeWord = (id) => {
    persist(words.filter(w => w.id !== id))
  }

  const filtered = search
    ? words.filter(w => w.word.toLowerCase().includes(search.toLowerCase()) || w.definition.toLowerCase().includes(search.toLowerCase()))
    : words

  const learning = filtered.filter(w => !w.mastered)
  const mastered = filtered.filter(w => w.mastered)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80 }}>
      <Header onBack={() => navigate('/')} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <Stat label="Learning" value={words.filter(w => !w.mastered).length} color={C.teal} />
          <Stat label="Mastered" value={words.filter(w => w.mastered).length} color={C.gold} />
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search your words..."
          style={{
            width: '100%', padding: '10px 14px', background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 10,
            color: C.text, fontSize: 13, fontFamily: C.mono, outline: 'none',
            boxSizing: 'border-box', marginBottom: 12,
          }}
        />

        {!adding && (
          <button onClick={() => { setAdding(true); setForm({ word: '', definition: '', example: '', subject: '' }) }} style={btn}>
            + Add word
          </button>
        )}

        {adding && (
          <div style={{ padding: 14, background: C.surfaceLight, borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={form.word}
                onChange={e => setForm({ ...form, word: e.target.value })}
                placeholder="Word"
                autoFocus
                style={{ ...inp, flex: 1 }}
              />
              <button
                onClick={lookUp}
                disabled={defLoading || !form.word.trim()}
                style={{
                  padding: '10px 14px', background: defLoading ? C.dim : C.teal,
                  border: 'none', borderRadius: 8, color: C.bg, fontSize: 11,
                  fontWeight: 700, fontFamily: C.mono, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >{defLoading ? '...' : '🔍 Define'}</button>
            </div>
            <textarea
              value={form.definition}
              onChange={e => setForm({ ...form, definition: e.target.value })}
              placeholder="Definition"
              style={{ ...inp, minHeight: 50, resize: 'vertical', marginBottom: 8 }}
            />
            <input
              value={form.example}
              onChange={e => setForm({ ...form, example: e.target.value })}
              placeholder="Example sentence (optional)"
              style={{ ...inp, marginBottom: 8 }}
            />
            <input
              value={form.subject}
              onChange={e => setForm({ ...form, subject: e.target.value })}
              placeholder="Subject (optional)"
              style={{ ...inp, marginBottom: 10 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setAdding(false)} style={secBtn}>Cancel</button>
              <button onClick={addWord} style={btn}>Save</button>
            </div>
          </div>
        )}

        {learning.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 12 }}>Learning</div>
            {learning.map(w => <WordCard key={w.id} word={w} onToggle={() => toggleMastered(w.id)} onRemove={() => removeWord(w.id)} />)}
          </>
        )}
        {mastered.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 }}>Mastered</div>
            {mastered.map(w => <WordCard key={w.id} word={w} onToggle={() => toggleMastered(w.id)} onRemove={() => removeWord(w.id)} />)}
          </>
        )}
      </div>
    </div>
  )
}

function WordCard({ word, onToggle, onRemove }) {
  return (
    <div style={{
      padding: 12, background: C.surface, borderRadius: 12,
      border: `1px solid ${C.border}`, marginBottom: 6,
      borderLeft: `3px solid ${word.mastered ? C.gold : C.teal}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: word.mastered ? C.gold : C.teal }}>{word.word}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>
            {word.mastered ? '📖' : '✅'}
          </button>
          <button onClick={onRemove} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      </div>
      {word.definition && <div style={{ fontSize: 12, color: C.text, marginTop: 4, lineHeight: 1.5 }}>{word.definition}</div>}
      {word.example && <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>"{word.example}"</div>}
      <div style={{ fontSize: 9, color: C.dim, marginTop: 4 }}>
        {word.subject && `${word.subject} · `}{new Date(word.addedAt).toLocaleDateString()}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ padding: 14, background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}
function Header({ onBack }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, background: C.surface, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 0 }}>←</button>
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2 }}>VOCABULARY</div>
    </div>
  )
}
const inp = { width: '100%', padding: '10px 12px', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12, fontFamily: C.mono, outline: 'none', boxSizing: 'border-box' }
const btn = { width: '100%', padding: '12px 18px', background: C.teal, color: C.bg, border: 'none', borderRadius: 12, fontSize: 13, fontFamily: C.mono, fontWeight: 700, cursor: 'pointer', marginBottom: 12 }
const secBtn = { flex: 1, padding: '12px 18px', background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13, fontFamily: C.mono, cursor: 'pointer' }

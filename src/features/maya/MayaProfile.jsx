import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadProfile, saveProfile, clearApiKeys } from './lib/profile'
import { listAllVoices, waitForVoices, speak, cancelSpeech } from './lib/voice'
import { getApiKey, setApiKey, clearAllApiKeys } from './lib/secrets'
import { getTokens, spendToken, MAX_TOKENS } from './agents/streakFreeze'
import VoiceStatus from './components/VoiceStatus'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

// ElevenLabs voice presets — public library voices
// Tagged with vibes so you can match Maya's personality to what you want
const VOICE_PRESETS = [
  {
    id: 'sMeMiS36FkhlOd721w9P',
    name: "Vasco's coach ⭐",
    desc: 'Custom voice — set as default for Maya. Tap to use.',
  },
  {
    id: '29vD33N1CtxCmqQRPOHJ',
    name: 'Drew 🏀',
    desc: 'CHILL BASKETBALL PLAYER — laid-back American male, casual confident delivery. Post-game interview energy.',
  },
  {
    id: 'TX3LPaxmHKxFdv7VOQHJ',
    name: 'Liam 🏀',
    desc: 'Young American athlete vibe — articulate, smooth, relaxed. Think young NBA guard.',
  },
  {
    id: 'iP95p4xoKVk53GoZ742B',
    name: 'Chris',
    desc: 'Chill conversational American — podcaster/founder energy',
  },
  {
    id: 'TxGEqnHWrfWFTfGW9XjX',
    name: 'Josh',
    desc: 'Young American male, deep confident — relaxed builder',
  },
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam',
    desc: 'Deep mature American — authoritative coach vibe',
  },
  {
    id: 'pqHfZKP75CvOlQylNhV4',
    name: 'Bill',
    desc: 'Older American male, warm — wise mentor',
  },
  {
    id: 'yoZ06aMxZJJ28mfd3POQ',
    name: 'Sam',
    desc: 'Raspy American — sarcastic edge',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah (female)',
    desc: 'Warm American female — soft confident coach',
  },
]

export default function MayaProfile() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(loadProfile())
  const [saved, setSaved] = useState(false)
  const [systemVoices, setSystemVoices] = useState([])
  const [keys, setKeys] = useState({
    anthropic: getApiKey('anthropic'),
    openai: getApiKey('openai'),
    elevenlabs: getApiKey('elevenlabs'),
  })
  const updateKey = (provider, value) => {
    setKeys(k => ({ ...k, [provider]: value }))
    setApiKey(provider, value)
  }

  useEffect(() => {
    waitForVoices().then(() => setSystemVoices(listAllVoices()))
  }, [])

  const previewVoice = (voiceName) => {
    // Save profile + temporarily clear ElevenLabs key so system voice is used
    saveProfile({ ...profile, systemVoice: voiceName })
    const savedKey = getApiKey('elevenlabs')
    setApiKey('elevenlabs', '')
    cancelSpeech()
    const n = loadProfile().name || "Champ"; speak(`Hey ${n}, this is Maya. Locked in and ready when you are.`)
    // Restore the key after preview
    setTimeout(() => { if (savedKey) setApiKey('elevenlabs', savedKey) }, 100)
  }

  const previewElevenLabs = () => {
    saveProfile(profile)
    cancelSpeech()
    const n2 = loadProfile().name || "Champ"; speak(`Hey ${n2}, this is Maya speaking through ElevenLabs. Sounds way better, right?`)
  }

  const update = (patch) => setProfile((p) => ({ ...p, ...patch }))
  const save = () => {
    saveProfile(profile)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }
  const reset = () => {
    if (!confirm(`Reset all of ${profile.name || 'your'} data? This cannot be undone.`)) return
    localStorage.clear()
    navigate('/')
    location.reload()
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80 }}>
      <Header onBack={() => navigate('/')} title="Profile" />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>

        <VoiceStatus />

        <Section title="Identity">
          <Row label="Name">
            <input style={input} value={profile.name} onChange={e => update({ name: e.target.value })} maxLength={50} />
          </Row>
          <Row label="Age">
            <input style={input} type="number" min={4} max={22} value={profile.age} onChange={e => update({ age: parseInt(e.target.value) || 0 })} />
          </Row>
          <Row label="Grade">
            <input style={input} value={profile.grade || ''} onChange={e => update({ grade: e.target.value.slice(0, 12) })} placeholder="e.g. 8 or Year 9" />
          </Row>
          <Row label="Location">
            <input style={input} value={profile.location || ''} onChange={e => update({ location: e.target.value.slice(0, 60) })} placeholder="e.g. Singapore" />
          </Row>
        </Section>

        <Section title="Goals">
          <textarea
            style={{ ...input, minHeight: 70, resize: 'vertical' }}
            value={profile.bigGoals?.join('\n') || ''}
            onChange={e => update({ bigGoals: e.target.value.split('\n').filter(Boolean) })}
            placeholder="One goal per line"
          />
        </Section>

        <Section title="Hobbies">
          <input
            style={input}
            value={profile.hobbies?.join(', ') || ''}
            onChange={e => update({ hobbies: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="Tennis, Piano, Drawing"
          />
        </Section>

        <Section title="Coach Style">
          <Row label="Humor">
            <Select value={profile.humorStyle} onChange={v => update({ humorStyle: v })}
              options={['sarcastic', 'playful', 'dry', 'wholesome']} />
          </Row>
          <Row label="Push intensity">
            <Select value={profile.pushIntensity} onChange={v => update({ pushIntensity: v })}
              options={['light', 'medium', 'hard']} />
          </Row>
          <Row label="Driver">
            <Select value={profile.motivationDriver} onChange={v => update({ motivationDriver: v })}
              options={['competition', 'identity', 'mastery', 'autonomy']} />
          </Row>
        </Section>

        <Section title="Voice">
          <Row label="Maya speaks aloud">
            <Toggle on={profile.voiceAutoSpeak} onChange={v => update({ voiceAutoSpeak: v })} />
          </Row>
          <Row label='Wake word ("hey maya")'>
            <Toggle on={profile.wakeWordEnabled} onChange={v => update({ wakeWordEnabled: v })} />
          </Row>
          <Row label="Greet me when I walk in (camera)">
            <Toggle on={profile.presenceDetectionEnabled} onChange={v => update({ presenceDetectionEnabled: v })} />
          </Row>
          <Row label="Interrupt Maya by speaking (barge-in)">
            <Toggle on={profile.voiceBargeIn !== false} onChange={v => update({ voiceBargeIn: v })} />
          </Row>
          <Row label="Tough mode — Maya pushes harder">
            <Toggle on={profile.toughMode} onChange={v => update({ toughMode: v })} />
          </Row>

          <Row label="System voice (free)">
            <select
              value={profile.systemVoice || ''}
              onChange={(e) => update({ systemVoice: e.target.value || null })}
              style={{ ...input, fontSize: 12 }}
            >
              <option value="">Auto-pick best</option>
              {systemVoices.map(v => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            {profile.systemVoice && (
              <button
                onClick={() => previewVoice(profile.systemVoice)}
                style={{
                  marginTop: 6, padding: '6px 12px', background: 'transparent',
                  border: `1px solid ${C.teal}`, borderRadius: 8,
                  color: C.teal, fontSize: 11, fontFamily: C.mono, cursor: 'pointer',
                }}
              >▶ Preview</button>
            )}
          </Row>
        </Section>

        <Section title="Maya's Brain (Claude API)">
          <p style={{ fontSize: 10, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
            Without a key Maya uses fallback templates. With a Claude API key she actually thinks. Get one at console.anthropic.com.
            <br/><span style={{ color: C.red }}>Keys are stored in this browser's localStorage. Don't share screenshots of devtools.</span>
          </p>
          <Row label="Anthropic API Key">
            <input
              style={input}
              type="password"
              value={keys.anthropic || ''}
              onChange={e => updateKey('anthropic', e.target.value)}
              placeholder="sk-ant-..."
            />
          </Row>
          <Row label="Model">
            <select
              value={profile.aiModel || 'claude-sonnet-4-5'}
              onChange={e => update({ aiModel: e.target.value })}
              style={{ ...input, fontSize: 12 }}
            >
              <option value="claude-sonnet-4-5">Sonnet 4.5 — fast, smart (default)</option>
              <option value="claude-opus-4-5">Opus 4.5 — deeper, slower, costlier</option>
            </select>
          </Row>
          <p style={{ fontSize: 10, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
            Sonnet handles most chats fine. Switch to Opus for hard math debates, deep tactical breakdowns, or when Vasco wants the smarter sparring partner.
          </p>
          <button
            onClick={() => {
              if (confirm('Wipe all API keys from this device? You will need to re-enter them to use Claude / Whisper / ElevenLabs.')) {
                clearApiKeys()
                clearAllApiKeys()
                setProfile(loadProfile())
                setKeys({ anthropic: '', openai: '', elevenlabs: '' })
              }
            }}
            style={{
              marginTop: 10, padding: '8px 14px', background: 'transparent',
              border: `1px solid ${C.red}`, borderRadius: 8,
              color: C.red, fontSize: 11, fontFamily: C.mono, cursor: 'pointer',
            }}
          >Clear all API keys</button>
        </Section>

        <Section title="Lesson Transcription (Whisper) ⭐">
          <p style={{ fontSize: 10, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
            <b>Critical for lessons.</b> Web Speech API is broken on most browsers. OpenAI Whisper transcribes every recorded lesson reliably (~$0.006/min).
            <br/>Get a key at platform.openai.com → API keys.
          </p>
          <Row label="OpenAI API Key">
            <input
              style={input}
              type="password"
              value={keys.openai || ''}
              onChange={e => updateKey('openai', e.target.value)}
              placeholder="sk-..."
            />
          </Row>
        </Section>

        <Section title="Notifications">
          <Row label="Browser nudges">
            <Toggle
              on={profile.notificationsEnabled}
              onChange={async (v) => {
                if (v && 'Notification' in window) {
                  const perm = await Notification.requestPermission()
                  update({ notificationsEnabled: perm === 'granted' })
                } else {
                  update({ notificationsEnabled: false })
                }
              }}
            />
          </Row>
          <p style={{ fontSize: 10, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
            Maya will send a desktop nudge when your combo is about to expire or a task is overdue.
          </p>
        </Section>

        <Section title="ElevenLabs (premium — sounds human)">
          <p style={{ fontSize: 10, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
            System voices sound robotic. ElevenLabs sounds real. Get a free API key from elevenlabs.io (10k chars/month free), paste it below, then tap a preset.
          </p>
          <Row label="API Key">
            <input
              style={input}
              type="password"
              value={keys.elevenlabs || ''}
              onChange={e => updateKey('elevenlabs', e.target.value)}
              placeholder="sk_..."
            />
          </Row>

          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginTop: 12, marginBottom: 6 }}>
            Voice presets (sarcastic / funny / encouraging energy)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {VOICE_PRESETS.map(v => {
              const active = profile.elevenLabsVoiceId === v.id
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    const next = { ...profile, elevenLabsVoiceId: v.id }
                    setProfile(next)
                    saveProfile(next)
                  }}
                  style={{
                    padding: '10px 12px', textAlign: 'left',
                    background: active ? C.teal + '15' : C.bg,
                    border: `1px solid ${active ? C.teal : C.border}`,
                    borderRadius: 10, cursor: 'pointer', fontFamily: C.mono,
                  }}
                >
                  <div style={{ fontSize: 12, color: active ? C.teal : C.text, fontWeight: 600 }}>
                    {v.name} {active && '✓'}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{v.desc}</div>
                </button>
              )
            })}
          </div>

          <Row label="Or paste any Voice ID">
            <input
              style={{ ...input, marginTop: 8 }}
              value={profile.elevenLabsVoiceId || ''}
              onChange={e => update({ elevenLabsVoiceId: e.target.value })}
              placeholder="Paste a Voice ID from elevenlabs.io"
            />
          </Row>

          {keys.elevenlabs && profile.elevenLabsVoiceId && (
            <button
              onClick={previewElevenLabs}
              style={{
                marginTop: 10, padding: '10px 14px', background: C.teal,
                border: 'none', borderRadius: 10,
                color: C.bg, fontSize: 12, fontFamily: C.mono, fontWeight: 700, cursor: 'pointer',
                width: '100%',
              }}
            >▶ Preview voice</button>
          )}
        </Section>

        {profile.worksOn?.length > 0 && (
          <Section title="What Maya has learned works">
            {profile.worksOn.map((w, i) => (
              <div key={i} style={tag('#34D399')}>{w}</div>
            ))}
          </Section>
        )}
        {profile.avoids?.length > 0 && (
          <Section title="What Maya is avoiding">
            {profile.avoids.map((w, i) => (
              <div key={i} style={tag(C.red)}>{w}</div>
            ))}
          </Section>
        )}

        <button onClick={save} style={primary}>{saved ? 'Saved ✓' : 'Save Changes'}</button>

        <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
            Danger zone
          </div>
          <button onClick={reset} style={{ ...primary, background: C.red + '22', color: C.red, border: `1px solid ${C.red}44` }}>
            Reset all data
          </button>
        </div>
      </div>
    </div>
  )
}

function Header({ onBack, title }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderBottom: `1px solid ${C.border}`,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      background: C.surface,
    }}>
      <button onClick={onBack} style={{
        background: 'transparent', border: 'none', color: C.muted,
        fontSize: 18, cursor: 'pointer', padding: 0,
      }}>←</button>
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2 }}>{title}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{title}</div>
      <div style={{ background: C.surface, padding: 12, borderRadius: 12, border: `1px solid ${C.border}` }}>
        {children}
      </div>
    </div>
  )
}
function Row({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  )
}
function Select({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: `1px solid ${value === o ? C.teal : C.border}`,
          background: value === o ? C.teal + '22' : 'transparent',
          color: value === o ? C.teal : C.text,
          fontSize: 11, fontFamily: C.mono, cursor: 'pointer',
        }}>{o}</button>
      ))}
    </div>
  )
}
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 44, height: 24, borderRadius: 12,
      background: on ? C.teal : C.dim,
      border: 'none', position: 'relative', cursor: 'pointer',
      transition: 'background 200ms',
    }}>
      <div style={{
        position: 'absolute', top: 2, left: on ? 22 : 2,
        width: 20, height: 20, borderRadius: 10, background: 'white',
        transition: 'left 200ms',
      }} />
    </button>
  )
}
const input = {
  width: '100%', padding: '10px 12px', background: C.bg,
  border: `1px solid ${C.border}`, borderRadius: 8,
  color: C.text, fontSize: 13, fontFamily: C.mono, outline: 'none', boxSizing: 'border-box',
}
const primary = {
  width: '100%', padding: '14px 20px', background: C.teal,
  color: C.bg, border: 'none', borderRadius: 12,
  fontSize: 14, fontFamily: C.mono, fontWeight: 700, cursor: 'pointer',
}
const tag = (color) => ({
  display: 'inline-block', padding: '6px 10px', margin: '2px 4px 2px 0',
  borderRadius: 8, fontSize: 10, color, border: `1px solid ${color}44`,
  background: color + '11',
})

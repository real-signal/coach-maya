/**
 * Trophy Room — the kid's achievement history.
 * Shows user-added entries. For the seed user (Vasco), pre-loads from CV seed.
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CV_ACHIEVEMENTS } from './lib/cvData'
import { loadProfile } from './lib/profile'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', glassBorder: 'rgba(255,255,255,0.14)',
  text: '#f0f0f5', muted: '#6b6b8a', dim: '#3a3a55',
  teal: '#2DD4BF', gold: '#FFD700', amber: '#FBBF24',
  green: '#34D399', red: '#F87171', blue: '#93C5FD',
  purple: '#A78BFA', pink: '#F472B6', orange: '#FB923C',
  glass: 'rgba(255,255,255,0.08)', blur: 'blur(20px)',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

const TROPHY_KEY = 'maya_trophies_custom'

const CATS = {
  math: { label: 'Math', icon: '🧮', color: C.blue },
  piano: { label: 'Piano', icon: '🎹', color: C.purple },
  tennis: { label: 'Tennis', icon: '🎾', color: C.green },
  coding: { label: 'Coding', icon: '💻', color: C.teal },
  speech: { label: 'Speech', icon: '🎤', color: C.pink },
  academic: { label: 'Academic', icon: '🎓', color: C.amber },
  music_theory: { label: 'Music Theory', icon: '🎵', color: C.purple },
  acting: { label: 'Acting', icon: '🎭', color: C.orange },
  other: { label: 'Other', icon: '🏅', color: C.muted },
}

const MEDAL = {
  gold: { emoji: '🥇', label: 'Gold', color: C.gold, rank: 1 },
  platinum: { emoji: '💎', label: 'Platinum', color: '#E5E4E2', rank: 0 },
  silver: { emoji: '🥈', label: 'Silver', color: '#C0C0C0', rank: 2 },
  bronze: { emoji: '🥉', label: 'Bronze', color: '#CD7F32', rank: 3 },
  distinction: { emoji: '⭐', label: 'Distinction', color: C.amber, rank: 2 },
  honour: { emoji: '🏅', label: 'Honour', color: C.purple, rank: 3 },
  merit: { emoji: '📜', label: 'Merit', color: C.teal, rank: 4 },
  laureate: { emoji: '🌿', label: 'Laureate', color: C.green, rank: 2 },
  finalist: { emoji: '🎯', label: 'Finalist', color: C.teal, rank: 4 },
  winner: { emoji: '🏆', label: 'Winner', color: C.gold, rank: 1 },
  scholarship: { emoji: '🎓', label: 'Scholarship', color: C.gold, rank: 1 },
  second: { emoji: '🥈', label: '2nd Prize', color: '#C0C0C0', rank: 2 },
  fourth: { emoji: '4️⃣', label: '4th Prize', color: C.muted, rank: 5 },
  special: { emoji: '✨', label: 'Special Mention', color: C.pink, rank: 3 },
  proficiency: { emoji: '📋', label: 'Proficiency', color: C.muted, rank: 5 },
  honourable: { emoji: '📜', label: 'Hon. Mention', color: C.teal, rank: 4 },
  participant: { emoji: '✓', label: 'Participated', color: C.dim, rank: 6 },
  semifinal: { emoji: '🎯', label: 'Semifinal', color: C.teal, rank: 4 },
  quarterfinal: { emoji: '🎯', label: 'Quarterfinal', color: C.teal, rank: 4 },
}

function loadCustom() {
  try { return JSON.parse(localStorage.getItem(TROPHY_KEY)) || [] } catch { return [] }
}
function saveCustom(data) {
  try { localStorage.setItem(TROPHY_KEY, JSON.stringify(data)) } catch {}
}

export default function MayaTrophyRoom() {
  const navigate = useNavigate()
  const [custom, setCustom] = useState(loadCustom())
  const [filterCat, setFilterCat] = useState('all')
  const [filterYear, setFilterYear] = useState('all')

  // Only seed the CV achievements for the original user (Vasco). Any other
  // profile starts with an empty Trophy Room and adds their own.
  const seedAchievements = useMemo(() => {
    const name = (loadProfile().name || '').trim().toLowerCase()
    return name === 'vasco' ? CV_ACHIEVEMENTS : []
  }, [])

  const allAchievements = useMemo(() => {
    const combined = [...seedAchievements, ...custom.map(c => ({ ...c, isCustom: true }))]
    return combined.sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))
  }, [custom, seedAchievements])

  const filtered = useMemo(() => {
    let list = allAchievements
    if (filterCat !== 'all') list = list.filter(a => a.cat === filterCat)
    if (filterYear !== 'all') list = list.filter(a => a.year === parseInt(filterYear))
    return list
  }, [allAchievements, filterCat, filterYear])

  const years = useMemo(() => [...new Set(allAchievements.map(a => a.year))].sort((a, b) => b - a), [allAchievements])

  // Stats
  const totalCount = allAchievements.length
  const goldCount = allAchievements.filter(a => ['gold', 'winner', 'platinum', 'scholarship'].includes(a.result)).length
  const silverCount = allAchievements.filter(a => ['silver', 'second', 'laureate'].includes(a.result)).length
  const bronzeCount = allAchievements.filter(a => a.result === 'bronze').length
  const distinctionCount = allAchievements.filter(a => a.result === 'distinction').length

  // By category counts
  const catCounts = {}
  allAchievements.forEach(a => { catCounts[a.cat] = (catCounts[a.cat] || 0) + 1 })

  return (
    <div style={{ minHeight: '100vh', background: 'transparent', color: C.text, fontFamily: C.mono, paddingBottom: 80, position: 'relative' }}>
      {/* Ambient */}
      <div style={{ position: 'fixed', top: -40, left: -40, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: 200, right: -60, width: 250, height: 250, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.25) 0%, transparent 70%)', filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0 }} />

      <Header onBack={() => navigate('/')} />
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* Hero stats */}
        <div style={{
          textAlign: 'center', padding: 24,
          background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
          borderRadius: 20, border: `1px solid ${C.glassBorder}`, marginBottom: 16,
        }}>
          <div style={{ fontFamily: C.display, fontSize: 48, color: C.gold, lineHeight: 1 }}>{totalCount}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>achievements & counting</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
            <MedalStat emoji="🥇" count={goldCount} label="Gold" />
            <MedalStat emoji="🥈" count={silverCount} label="Silver" />
            <MedalStat emoji="🥉" count={bronzeCount} label="Bronze" />
            <MedalStat emoji="⭐" count={distinctionCount} label="Dist." />
          </div>
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 12, paddingBottom: 4 }}>
          <FilterPill label="All" active={filterCat === 'all'} onClick={() => setFilterCat('all')} count={totalCount} />
          {Object.entries(CATS).filter(([k]) => catCounts[k]).map(([k, v]) => (
            <FilterPill key={k} label={`${v.icon} ${v.label}`} active={filterCat === k} onClick={() => setFilterCat(k)} count={catCounts[k]} color={v.color} />
          ))}
        </div>

        {/* Year filter */}
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
          <FilterPill label="All years" active={filterYear === 'all'} onClick={() => setFilterYear('all')} />
          {years.map(y => (
            <FilterPill key={y} label={String(y)} active={filterYear === String(y)} onClick={() => setFilterYear(String(y))} />
          ))}
        </div>

        {/* Results count */}
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </div>

        {/* Achievement list */}
        {filtered.map((a, i) => {
          const cat = CATS[a.cat] || CATS.other
          const medal = MEDAL[a.result] || { emoji: '✓', label: a.result, color: C.dim, rank: 6 }
          return (
            <div key={`${a.name}-${a.year}-${i}`} style={{
              padding: '12px 14px',
              background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
              borderRadius: 12, border: `1px solid ${C.glassBorder}`, marginBottom: 6,
              borderLeft: `3px solid ${medal.color}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 22, flexShrink: 0 }}>{medal.emoji || cat.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{a.name}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                  {a.year} {a.grade && `· ${a.grade}`} · <span style={{ color: medal.color }}>{medal.label}</span>
                </div>
              </div>
              <div style={{ fontSize: 14, flexShrink: 0 }}>{cat.icon}</div>
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', color: C.dim, fontSize: 12, marginTop: 32 }}>
            No achievements in this filter.
          </div>
        )}
      </div>
    </div>
  )
}

function MedalStat({ emoji, count, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22 }}>{emoji}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{count}</div>
      <div style={{ fontSize: 8, color: C.muted, textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function FilterPill({ label, active, onClick, count, color }) {
  return (
    <button onClick={onClick} style={{
      flex: '0 0 auto', padding: '6px 12px',
      background: active ? (color || C.teal) + '18' : C.surface,
      border: `1px solid ${active ? (color || C.teal) + '55' : C.border}`,
      borderRadius: 20, color: active ? (color || C.teal) : C.muted,
      fontSize: 10, fontFamily: C.mono, cursor: 'pointer',
      whiteSpace: 'nowrap',
    }}>
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  )
}

function Header({ onBack }) {
  return (
    <div style={{
      padding: '14px 16px', borderBottom: `1px solid ${C.glassBorder}`,
      background: C.glass, backdropFilter: C.blur, WebkitBackdropFilter: C.blur,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 18, cursor: 'pointer', padding: 0 }}>←</button>
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.gold, letterSpacing: 2 }}>TROPHY ROOM</div>
    </div>
  )
}

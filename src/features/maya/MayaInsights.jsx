import { useNavigate } from 'react-router-dom'
import { weeklyInsights } from './agents/insights'
import { loadProfile } from './lib/profile'
import { adherenceByDay, adherenceLastNDays, adherenceStreak, getTrack } from './lib/compassTracks'

const C = {
  bg: '#0a0a14', surface: 'rgba(255,255,255,0.04)', surfaceLight: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)', text: '#f0f0f5', muted: '#6b6b8a',
  dim: '#3a3a55', teal: '#2DD4BF', red: '#F87171',
  green: '#34D399', gold: '#FFD700', amber: '#FBBF24',
  blue: '#93C5FD', purple: '#A78BFA',
  mono: "'IBM Plex Mono', monospace", display: "'Bebas Neue', sans-serif",
}

export default function MayaInsights() {
  const navigate = useNavigate()
  const data = weeklyInsights()
  const maxXP = Math.max(...data.days.map(d => d.xp), 10)
  const profile = loadProfile()
  const compass = profile?.parentCompass
  const compassActive = !!compass?.track
  const compassTrackLabel = compassActive
    ? (compass.track === 'custom' && compass.customLabel ? compass.customLabel : (getTrack(compass.track)?.label || compass.track))
    : ''
  const compassDays = compassActive ? adherenceByDay(compass, 14) : []
  const compass7d = compassActive ? adherenceLastNDays(compass, 7) : null
  const compassStreakDays = compassActive ? adherenceStreak(compass) : 0

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: C.mono, paddingBottom: 80 }}>
      <Header onBack={() => navigate('/')} />

      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        {/* Headline numbers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <BigStat label="XP this week" value={data.totals.xp} color={C.teal} />
          <BigStat label="Lesson minutes" value={data.totals.min} color={C.gold} />
          <BigStat label="Tasks done" value={data.totals.tasks} color={C.green} />
          <BigStat label="Active streak" value={`${data.streak}d`} color={C.amber} />
        </div>

        {/* XP per day chart */}
        <Card title="XP per day">
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 100, gap: 6, marginTop: 8 }}>
            {data.days.map((d, i) => {
              const h = (d.xp / maxXP) * 100
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div title={`${d.xp} XP`} style={{
                    width: '100%',
                    height: `${Math.max(h, 2)}%`,
                    background: d.xp > 0 ? `linear-gradient(180deg, ${C.teal}, ${C.blue})` : C.dim,
                    borderRadius: 4,
                    transition: 'height 400ms ease',
                    minHeight: 2,
                  }} />
                  <div style={{ fontSize: 9, color: C.muted }}>{d.label}</div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Parent compass */}
        {compassActive && compassDays.length > 0 && (
          <Card title={`Compass · ${compassTrackLabel}`} color={C.gold}>
            {compass.northStar && (
              <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', marginBottom: 10, lineHeight: 1.4 }}>
                ★ {compass.northStar}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>7-day</div>
                <div style={{
                  fontSize: 22, fontWeight: 700, fontFamily: C.display,
                  color: compass7d?.pct >= 80 ? C.green : compass7d?.pct >= 60 ? C.amber : C.red,
                }}>
                  {compass7d?.pct != null ? `${compass7d.pct}%` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Perfect streak</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.gold, fontFamily: C.display }}>
                  {compassStreakDays}d
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Done</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.teal, fontFamily: C.display }}>
                  {compass7d?.totalCompleted || 0}/{compass7d?.totalScheduled || 0}
                </div>
              </div>
            </div>
            {/* 14-day sparkline */}
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 60, gap: 4, marginTop: 8 }}>
              {compassDays.map((d, i) => {
                const isToday = i === compassDays.length - 1
                const h = d.pct == null ? 8 : Math.max(d.pct, 6)
                const color = d.pct == null
                  ? C.dim
                  : d.pct === 100 ? C.green
                  : d.pct >= 60 ? C.amber
                  : C.red
                return (
                  <div key={d.dateKey} title={`${d.dateKey}: ${d.completed}/${d.scheduled}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: '100%', height: `${h}%`, minHeight: 3,
                      background: color, borderRadius: 3,
                      opacity: d.scheduled === 0 ? 0.25 : 1,
                      border: isToday ? `1px solid ${C.text}` : 'none',
                    }} />
                    <div style={{ fontSize: 8, color: isToday ? C.text : C.muted }}>{d.label}</div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Memory growth */}
        <Card title="Memory bank">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>New this week</div>
              <div style={{ fontSize: 22, color: C.teal, fontWeight: 700 }}>{data.newConcepts}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Mastered</div>
              <div style={{ fontSize: 22, color: C.gold, fontWeight: 700 }}>{data.masteredConcepts}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Total</div>
              <div style={{ fontSize: 22, color: C.text, fontWeight: 700 }}>{data.totalConcepts}</div>
            </div>
          </div>
        </Card>

        {/* Subject breakdown */}
        {Object.keys(data.subjectXP).length > 0 && (
          <Card title="Subjects you've worked on">
            {Object.entries(data.subjectXP)
              .sort((a, b) => b[1] - a[1])
              .map(([s, xp]) => {
                const max = Math.max(...Object.values(data.subjectXP))
                const pct = (xp / max) * 100
                return (
                  <div key={s} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: C.text }}>{s}</span>
                      <span style={{ color: C.muted }}>{xp} XP · {data.subjectMin[s] || 0}m</span>
                    </div>
                    <div style={{ height: 6, background: C.dim, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${pct}%`,
                        background: `linear-gradient(90deg, ${C.teal}, ${C.blue})`,
                      }} />
                    </div>
                  </div>
                )
              })}
          </Card>
        )}

        {/* Best day */}
        {data.bestDay && data.bestDay.xp > 0 && (
          <Card title="Best day this week" color={C.gold}>
            <div style={{ fontSize: 14, color: C.text }}>
              {new Date(data.bestDay.date).toLocaleDateString('en-US', { weekday: 'long' })} · {data.bestDay.xp} XP
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              {data.bestDay.tasks} tasks · {data.bestDay.lessonCount} lessons · {data.bestDay.lessonMin}m
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

function BigStat({ label, value, color }) {
  return (
    <div style={{
      padding: 16, background: C.surface, borderRadius: 12,
      border: `1px solid ${C.border}`, textAlign: 'center',
    }}>
      <div style={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, marginTop: 4, fontFamily: C.display }}>{value}</div>
    </div>
  )
}

function Card({ title, color, children }) {
  return (
    <div style={{
      padding: 14, background: C.surface, borderRadius: 12,
      border: `1px solid ${C.border}`, marginBottom: 10,
      borderLeft: color ? `3px solid ${color}` : `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 9, color: color || C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
        {title}
      </div>
      {children}
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
      <div style={{ fontFamily: C.display, fontSize: 22, color: C.teal, letterSpacing: 2 }}>WEEKLY INSIGHTS</div>
    </div>
  )
}

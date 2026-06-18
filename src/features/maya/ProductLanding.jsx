/**
 * ProductLanding — public-product (VITE_PRODUCT_MODE=1) landing page.
 *
 * Shown at `/` only when the user hasn't completed onboarding yet. After
 * setup the user sees the normal MayaDashboard at `/` instead. Vasco's
 * personal deploy never renders this (PRODUCT_MODE is false there).
 *
 * Mobile-first, glassmorphic, matches the rest of the app's voice.
 */
import { useNavigate } from 'react-router-dom'

const COLORS = {
  bg: '#0a0a14',
  surface: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  text: '#e8e8f0',
  dim: 'rgba(232,232,240,0.65)',
  accent: '#2DD4BF',
}

const PROOF = [
  { stat: '5 min', label: 'to set up' },
  { stat: '24/7', label: 'in your pocket' },
  { stat: '$0', label: 'to try it' },
]

const VALUE_PROPS = [
  {
    title: 'She remembers',
    body: 'Maya knows your kid\'s goals, hobbies, and patterns. No re-explaining every session.',
  },
  {
    title: 'She pushes',
    body: 'Not a chatbot. Maya tracks streaks, calls out shortcuts, and refuses to let your kid coast.',
  },
  {
    title: 'You stay in the loop',
    body: 'Parent dashboard with weekly reports. PIN-gated so your kid can\'t peek.',
  },
]

export default function ProductLanding() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'IBM Plex Mono', monospace",
      padding: '24px 20px 80px',
      maxWidth: 480,
      margin: '0 auto',
    }}>
      {/* Ambient orb */}
      <div style={{
        position: 'fixed',
        top: -120, left: -80,
        width: 280, height: 280,
        background: 'radial-gradient(circle, rgba(45,212,191,0.18), transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Brand */}
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 14,
          letterSpacing: 4,
          color: COLORS.accent,
          marginBottom: 48,
        }}>
          COACH MAYA
        </div>

        {/* Hero */}
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 56,
          lineHeight: 1.0,
          margin: 0,
          letterSpacing: 1,
        }}>
          THE AI COACH<br/>
          YOUR KID<br/>
          <span style={{ color: COLORS.accent }}>WON'T IGNORE.</span>
        </h1>

        <p style={{
          fontSize: 15,
          lineHeight: 1.6,
          color: COLORS.dim,
          marginTop: 24,
          marginBottom: 32,
        }}>
          Built for the kid who's already trying — and the parent who knows
          they could do more. Maya nudges, tracks, and remembers. So you don't
          have to be the nag.
        </p>

        {/* Primary CTA */}
        <button
          onClick={() => navigate('/onboarding')}
          style={{
            width: '100%',
            padding: '18px 20px',
            background: COLORS.accent,
            color: '#06121a',
            border: 'none',
            borderRadius: 12,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 18,
            letterSpacing: 3,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          START FREE — 5 MIN SETUP
        </button>

        <div style={{
          textAlign: 'center',
          fontSize: 11,
          color: COLORS.dim,
          marginTop: 12,
          letterSpacing: 1,
        }}>
          NO CARD. NO LOGIN. WORKS OFFLINE.
        </div>

        {/* Proof row */}
        <div style={{
          display: 'flex',
          gap: 12,
          marginTop: 40,
        }}>
          {PROOF.map((p) => (
            <div key={p.label} style={{
              flex: 1,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 12,
              backdropFilter: 'blur(20px)',
              padding: '16px 12px',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 22,
                color: COLORS.accent,
                letterSpacing: 1,
              }}>
                {p.stat}
              </div>
              <div style={{
                fontSize: 10,
                color: COLORS.dim,
                marginTop: 4,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}>
                {p.label}
              </div>
            </div>
          ))}
        </div>

        {/* Value props */}
        <div style={{ marginTop: 48 }}>
          {VALUE_PROPS.map((v) => (
            <div key={v.title} style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 16,
              backdropFilter: 'blur(20px)',
              padding: 20,
              marginBottom: 12,
            }}>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 22,
                letterSpacing: 2,
                marginBottom: 8,
              }}>
                {v.title.toUpperCase()}
              </div>
              <div style={{
                fontSize: 14,
                lineHeight: 1.5,
                color: COLORS.dim,
              }}>
                {v.body}
              </div>
            </div>
          ))}
        </div>

        {/* Founder narrative — the strategy memo's positioning
            differentiator. Vasco's verified results are the proof. */}
        <div style={{ marginTop: 40 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 11,
            letterSpacing: 3,
            color: COLORS.accent,
            marginBottom: 10,
          }}>
            WHY THIS EXISTS
          </div>
          <div style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            backdropFilter: 'blur(20px)',
            padding: 22,
          }}>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 24,
              letterSpacing: 1.5,
              lineHeight: 1.1,
              marginBottom: 12,
            }}>
              BUILT BY A MENSA<br/>KID'S DAD.
            </div>
            <div style={{
              fontSize: 14,
              lineHeight: 1.6,
              color: COLORS.dim,
              marginBottom: 16,
            }}>
              Maya was built for my son Vasco. He's 14, in Singapore, and
              this is the coach I wanted to give him. Now I'm giving her
              to your kid too.
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              fontSize: 11,
              color: COLORS.text,
            }}>
              {[
                ['MENSA', 'member'],
                ['30+', 'math olympiad medals'],
                ['20+', 'piano competition awards'],
                ['ITF 29.4', 'junior tennis ranking'],
                ['STRAIGHT A', "Johns Hopkins CTY"],
                ['GRADE 6', 'piano (Trinity)'],
              ].map(([stat, label]) => (
                <div key={label} style={{
                  background: 'rgba(45,212,191,0.05)',
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: '8px 10px',
                }}>
                  <div style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: 14,
                    letterSpacing: 1,
                    color: COLORS.accent,
                  }}>{stat}</div>
                  <div style={{
                    fontSize: 9,
                    color: COLORS.dim,
                    letterSpacing: 0.5,
                    marginTop: 2,
                  }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Secondary CTA */}
        <button
          onClick={() => navigate('/onboarding')}
          style={{
            width: '100%',
            padding: '18px 20px',
            background: 'transparent',
            color: COLORS.text,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 16,
            letterSpacing: 3,
            cursor: 'pointer',
            marginTop: 24,
          }}
        >
          MEET MAYA →
        </button>

        <div style={{
          textAlign: 'center',
          fontSize: 10,
          color: COLORS.dim,
          marginTop: 64,
          letterSpacing: 1,
        }}>
          PRIVATE BY DEFAULT · YOUR DATA STAYS ON DEVICE
        </div>
      </div>
    </div>
  )
}

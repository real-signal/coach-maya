/**
 * ProductLanding — public-product (VITE_PRODUCT_MODE=1) landing page.
 *
 * Shown at `/` only when the user hasn't completed onboarding yet. After
 * setup the user sees the normal MayaDashboard at `/` instead. Vasco's
 * personal deploy never renders this (PRODUCT_MODE is false there).
 *
 * Positioning: mother-to-parent. Maya is the personal assistant a mother
 * built for her own son across his whole pursuit — math, music, sport,
 * mood, sleep, the whole kid. Not a tutor. The parent's thinking partner,
 * scaled.
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

// What Maya actually holds for a kid — the whole-child surface, not just
// drills. This is the unfair advantage of the 20-agent system: parents
// already have ten apps for ten subjects. Maya is one assistant for one
// kid across all of it.
const SURFACE = [
  { icon: '∑', label: 'Math & olympiads' },
  { icon: '♪', label: 'Music practice' },
  { icon: '⊕', label: 'Sport & training' },
  { icon: '☾', label: 'Sleep & energy' },
  { icon: '♡', label: 'Mood & focus' },
  { icon: '✎', label: 'Homework & reading' },
]

const VASCO_PROOF = [
  ['MENSA', 'member'],
  ['30+', 'math olympiad medals'],
  ['20+', 'piano competition awards'],
  ['ITF 29.4', 'junior tennis ranking'],
  ['STRAIGHT A', 'Johns Hopkins CTY'],
  ['GRADE 6', 'piano (Trinity)'],
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
          marginBottom: 40,
        }}>
          COACH MAYA
        </div>

        {/* Founder line — sets the trust signal BEFORE the pitch.
            This is the credential no other EdTech app has. */}
        <div style={{
          fontSize: 12,
          letterSpacing: 2,
          color: COLORS.dim,
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          A note from the mother who built her —
        </div>

        {/* Hero — reframed. Personal assistant for the kid's whole
            pursuit, not a single-subject drill app. */}
        <h1 style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 52,
          lineHeight: 1.0,
          margin: 0,
          letterSpacing: 1,
        }}>
          I BUILT MAYA<br/>
          FOR MY SON.<br/>
          <span style={{ color: COLORS.accent }}>NOW SHE'S YOURS.</span>
        </h1>

        <p style={{
          fontSize: 15,
          lineHeight: 1.65,
          color: COLORS.dim,
          marginTop: 24,
          marginBottom: 16,
        }}>
          Maya is the personal assistant I wished I had as a parent — one
          who knows your kid across <em>everything</em> they're trying to
          be great at. Math. Music. Sport. Reading. Sleep. Mood. The whole
          kid, not just a test score.
        </p>

        <p style={{
          fontSize: 15,
          lineHeight: 1.65,
          color: COLORS.text,
          marginTop: 0,
          marginBottom: 32,
          fontWeight: 500,
        }}>
          You stay the parent. <span style={{ color: COLORS.accent }}>Maya holds the rope.</span>
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
          SET MAYA UP FOR YOUR KID
        </button>

        <div style={{
          textAlign: 'center',
          fontSize: 11,
          color: COLORS.dim,
          marginTop: 12,
          letterSpacing: 1,
        }}>
          5 MINUTES · NO CARD · NO LOGIN · FREE TO TRY
        </div>

        {/* The mother story — this is the spine, not a footnote.
            Sara's voice, mother-to-parent. */}
        <div style={{ marginTop: 56 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 11,
            letterSpacing: 3,
            color: COLORS.accent,
            marginBottom: 12,
          }}>
            WHY MAYA EXISTS
          </div>
          <div style={{
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 16,
            backdropFilter: 'blur(20px)',
            padding: 24,
          }}>
            <p style={{
              fontSize: 14.5,
              lineHeight: 1.7,
              color: COLORS.text,
              margin: 0,
              marginBottom: 14,
            }}>
              My son Vasco is 14. Mensa. 30+ olympiad medals. Grade 6 piano.
              Competitive tennis. Straight A's at Johns Hopkins CTY.
            </p>
            <p style={{
              fontSize: 14.5,
              lineHeight: 1.7,
              color: COLORS.dim,
              margin: 0,
              marginBottom: 14,
            }}>
              None of that happened because of an app. It happened because
              someone — me — was tracking everything. His mood before piano.
              His focus dip on Wednesdays. When to push tennis, when to let
              him rest. When the math was sinking in and when it was just
              noise.
            </p>
            <p style={{
              fontSize: 14.5,
              lineHeight: 1.7,
              color: COLORS.dim,
              margin: 0,
              marginBottom: 14,
            }}>
              I couldn't be that person for him forever. So I built Maya
              to be — the assistant I wished I had.
            </p>
            <p style={{
              fontSize: 14.5,
              lineHeight: 1.7,
              color: COLORS.text,
              margin: 0,
              fontStyle: 'italic',
            }}>
              Now I'm giving her to your kid too.
            </p>

            {/* Vasco proof grid — receipts under the story */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginTop: 20,
              paddingTop: 20,
              borderTop: `1px solid ${COLORS.border}`,
            }}>
              {VASCO_PROOF.map(([stat, label]) => (
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

        {/* What Maya actually holds — the whole-child surface.
            This is the differentiator: not one subject, the whole kid. */}
        <div style={{ marginTop: 48 }}>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 11,
            letterSpacing: 3,
            color: COLORS.accent,
            marginBottom: 12,
          }}>
            WHAT MAYA HOLDS FOR YOUR KID
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}>
            {SURFACE.map((s) => (
              <div key={s.label} style={{
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                backdropFilter: 'blur(20px)',
                padding: '14px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <div style={{
                  fontSize: 22,
                  color: COLORS.accent,
                  width: 24,
                  textAlign: 'center',
                }}>{s.icon}</div>
                <div style={{
                  fontSize: 12,
                  lineHeight: 1.3,
                  color: COLORS.text,
                }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: COLORS.dim,
            marginTop: 14,
            textAlign: 'center',
          }}>
            One assistant. One kid. Everything they're trying to be great at.
          </div>
        </div>

        {/* The three promises — reframed from kid-focused to parent-focused.
            The buyer is the parent; the language meets the parent's actual
            fears, not the kid's. */}
        <div style={{ marginTop: 48 }}>
          {[
            {
              title: 'She remembers what you can\'t',
              body: 'Every practice, every mood, every breakthrough. Maya carries the whole picture so you don\'t have to.',
            },
            {
              title: 'She\'s the bad guy so you don\'t have to be',
              body: 'Maya nudges. Maya pushes. Maya calls out the shortcuts. You get to be the parent who shows up with dinner.',
            },
            {
              title: 'You see your kid more clearly',
              body: 'Weekly report in Maya\'s voice — what she noticed, what worked, where your kid needs you. Built for screenshots.',
            },
          ].map((v) => (
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
                fontSize: 20,
                letterSpacing: 1.5,
                marginBottom: 8,
                lineHeight: 1.15,
              }}>
                {v.title.toUpperCase()}
              </div>
              <div style={{
                fontSize: 13.5,
                lineHeight: 1.55,
                color: COLORS.dim,
              }}>
                {v.body}
              </div>
            </div>
          ))}
        </div>

        {/* Closing CTA */}
        <div style={{ marginTop: 40 }}>
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
            START — TELL MAYA ABOUT YOUR KID
          </button>
          <div style={{
            textAlign: 'center',
            fontSize: 11,
            color: COLORS.dim,
            marginTop: 12,
            letterSpacing: 1,
          }}>
            YOU FILL OUT DAY 1. YOUR KID NEVER SEES A FORM.
          </div>
        </div>

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

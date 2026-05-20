# Coach Maya

AI Performance Coach for kids. Originally built for Vasco (age 14, Singapore) — now a product for any child. Maya is funny enough to keep them engaged, smart enough to know when to push, and relentless enough to never let them settle for less than their best.

Vasco's context: Mensa member, 30+ math olympiad medals, Grade 6 piano with 20+ international competition awards, competitive tennis (ITF 29.4), Johns Hopkins CTY straight A's, co-founder of Sustainable Squad. Maya coaches at elite junior competitor level.

## Stack

- **Frontend:** React 18 + Vite 5, React Router v6
- **AI:** Claude API (Anthropic) — optional, fallback templates work without it
- **Backend:** Supabase (auth, database, cloud sync) — optional, works locally without it
- **Persistence:** localStorage (offline-first) + Supabase cloud sync
- **PWA:** Web app manifest + meta tags for iOS standalone mode

## Commands

```bash
npm run dev      # Vite dev server at localhost:5173
npm run build    # Production build → dist/
npm run preview  # Preview production build locally
```

## Environment Variables

Copy `.env.example` to `.env`:
- `VITE_ANTHROPIC_API_KEY` — Anthropic API key (optional — fallback templates work without it)
- `VITE_SUPABASE_URL` — Supabase project URL (optional — app works locally without it)
- `VITE_SUPABASE_ANON_KEY` — Supabase anon key
- `VITE_VAPID_PUBLIC_KEY` — VAPID key for web push notifications

## Architecture

### 20-Agent System

| # | Agent | Role | File |
|---|-------|------|------|
| 1 | Maya Core | Personality voice + Claude API | `mayaCore.js` |
| 2 | Lesson Analyst | Transcript → quiz | `lessonAnalyst.js` |
| 3 | Schedule Conductor | Nudge timing | `scheduler.js` |
| 4 | Gamification Engine | XP, combos, grades, levels | `gamification.js` |
| 5 | Personality Learner | Pattern analysis | `personalityLearner.js` |
| 6 | Parent Intelligence | Daily reports | `parentIntelligence.js` |
| 7 | Anti-Gaming Sentinel | Spot-checks | `antiGaming.js` |
| 8 | Narrative Engine | Growth stories | `narrative.js` |
| 9 | Orchestrator | Event routing | `orchestrator.js` |
| 10 | Memory | Spaced repetition | `memory.js` |
| 11 | Insights | Weekly analytics | `insights.js` |
| 12 | Suggestions | Context-aware nudges | `suggestions.js` |
| 13 | Challenges | Weekly challenges | `challenges.js` |
| 14 | Daily Content | Quotes, facts, riddles | `dailyContent.js` |
| 15 | Records | Personal bests | `records.js` |
| 16 | Quiz Grader | Score answers | `quizGrader.js` |
| 17 | Study Guide | Lesson → guide | `studyGuide.js` |
| 18 | Intelligence | Predictive brain | `intelligence.js` |
| 19 | Profile Builder | Chat → structured profile | `profileBuilder.js` |
| 20 | Schedule Generator | Profile → daily tasks | `scheduleGenerator.js` |

### Key Directories

```
src/
├── main.jsx, App.jsx
├── styles/global.css                  # Glassmorphic design system
├── lib/                               # Supabase, auth, storage, push
└── features/maya/
    ├── MayaDashboard.jsx              # Main UI — hero avatar, glass cards
    ├── Onboarding.jsx                 # Conversational chat onboarding
    ├── context/MayaContext.jsx        # State management + persistence
    ├── agents/                        # 20 agents (see table above)
    ├── components/                    # BottomNav, CommandBar, Maya3D, etc.
    └── lib/                           # voice, sfx, profile, moods, etc.
```

### Routes (48)

Dashboard, Schedule, Profile, Parent (PIN-gated), Lesson, Lessons, Memory, Ritual, Goals, Help, Shop, Insights, Journal, Story, Focus, News, Homework, Tennis, Reading, Flashcards, Screen Time, Piano, Records, Vocab, Explain, Timer, Habits, Math Drill, Typing, Intel, Sleep, Water, Workout, Moods, Weekly, Login, Signup, Children, Competitions, Prep Plans, Analytics, Trophies, Onboarding, Briefing, Notebook, Notes

## Design Patterns

- **Glassmorphic dark theme** — rgba surfaces, backdrop-blur, ambient orbs, inspired by Tran Mau Tri Tam
- **Inline styles** — All styling via `style={{}}` props
- **No TypeScript** — Pure JSX/JS
- **Fonts** — IBM Plex Mono (body), Bebas Neue (display)
- **Mobile-first** — Max-width 480px, centered
- **Gamification** — XP/levels/combos/grades/achievements, all deterministic logic
- **Maya's voice** — Short, punchy, never lectures, uses humor as delivery vehicle
- **Conversational onboarding** — 5-question chat, profile auto-extracted via Claude API
- **Parent PIN** — 4-digit PIN gates the parent dashboard
- **Offline-first** — localStorage always works, Supabase syncs when configured

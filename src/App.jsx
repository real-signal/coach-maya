import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { MayaProvider } from './features/maya/context/MayaContext'
import CommandBar from './features/maya/components/CommandBar'
import AchievementModal from './features/maya/components/AchievementModal'
import LiveLessonBanner from './features/maya/components/LiveLessonBanner'
import BottomNav from './features/maya/components/BottomNav'
import VoiceFab from './features/maya/components/VoiceFab'
import QuizHUD from './features/maya/components/QuizHUD'
import ErrorBoundary from './features/maya/components/ErrorBoundary'
import { loadProfile, PRODUCT_MODE } from './features/maya/lib/profile'
import { registerServiceWorker, scheduleDailyNotifications, getPermission } from './lib/push'

// Eager: dashboard (needed immediately)
import MayaDashboard from './features/maya/MayaDashboard'
// Eager: product-mode landing (gated by PRODUCT_MODE, lightweight)
import ProductLanding from './features/maya/ProductLanding'

// Lazy: everything else (shrinks initial bundle)
const MayaSchedule = lazy(() => import('./features/maya/MayaSchedule'))
const MayaProfile = lazy(() => import('./features/maya/MayaProfile'))
const MayaParent = lazy(() => import('./features/maya/MayaParent'))
const MayaParentCompass = lazy(() => import('./features/maya/MayaParentCompass'))
const MayaLesson = lazy(() => import('./features/maya/MayaLesson'))
const MayaLessons = lazy(() => import('./features/maya/MayaLessons'))
const MayaMemory = lazy(() => import('./features/maya/MayaMemory'))
const MayaRitual = lazy(() => import('./features/maya/MayaRitual'))
const MayaGoals = lazy(() => import('./features/maya/MayaGoals'))
const Onboarding = lazy(() => import('./features/maya/Onboarding'))
const MayaHelp = lazy(() => import('./features/maya/MayaHelp'))
const MayaShop = lazy(() => import('./features/maya/MayaShop'))
const MayaInsights = lazy(() => import('./features/maya/MayaInsights'))
const MayaJournal = lazy(() => import('./features/maya/MayaJournal'))
const MayaStory = lazy(() => import('./features/maya/MayaStory'))
const MayaFocus = lazy(() => import('./features/maya/MayaFocus'))
const MayaNews = lazy(() => import('./features/maya/MayaNews'))
const MayaHomework = lazy(() => import('./features/maya/MayaHomework'))
const MayaTennis = lazy(() => import('./features/maya/MayaTennis'))
const MayaReading = lazy(() => import('./features/maya/MayaReading'))
const MayaFlashcards = lazy(() => import('./features/maya/MayaFlashcards'))
const MayaScreenTime = lazy(() => import('./features/maya/MayaScreenTime'))
const MayaPiano = lazy(() => import('./features/maya/MayaPiano'))
const MayaRecords = lazy(() => import('./features/maya/MayaRecords'))
const MayaVocab = lazy(() => import('./features/maya/MayaVocab'))
const MayaExplain = lazy(() => import('./features/maya/MayaExplain'))
const MayaTimer = lazy(() => import('./features/maya/MayaTimer'))
const MayaHabits = lazy(() => import('./features/maya/MayaHabits'))
const MayaMathDrill = lazy(() => import('./features/maya/MayaMathDrill'))
const MayaTyping = lazy(() => import('./features/maya/MayaTyping'))
const MayaIntel = lazy(() => import('./features/maya/MayaIntel'))
const MayaSleep = lazy(() => import('./features/maya/MayaSleep'))
const MayaWater = lazy(() => import('./features/maya/MayaWater'))
const MayaWorkout = lazy(() => import('./features/maya/MayaWorkout'))
const MayaMoodBoard = lazy(() => import('./features/maya/MayaMoodBoard'))
const MayaWeekly = lazy(() => import('./features/maya/MayaWeekly'))
const MayaLogin = lazy(() => import('./features/maya/MayaLogin'))
const MayaSignup = lazy(() => import('./features/maya/MayaSignup'))
const MayaChildren = lazy(() => import('./features/maya/MayaChildren'))
const MayaCompetitions = lazy(() => import('./features/maya/MayaCompetitions'))
const MayaPrepPlan = lazy(() => import('./features/maya/MayaPrepPlan'))
const MayaAnalytics = lazy(() => import('./features/maya/MayaAnalytics'))
const MayaTrophyRoom = lazy(() => import('./features/maya/MayaTrophyRoom'))
const MayaBriefing = lazy(() => import('./features/maya/MayaBriefing'))
const MayaNotebook = lazy(() => import('./features/maya/MayaNotebook'))
const MayaNotes = lazy(() => import('./features/maya/MayaNotes'))
const MayaBrilliant = lazy(() => import('./features/maya/MayaBrilliant'))
const MayaOlympiad = lazy(() => import('./features/maya/MayaOlympiad'))
const MayaParentReport = lazy(() => import('./features/maya/MayaParentReport'))

function Loading() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: '#0a0a14', color: '#2DD4BF',
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
    }}>
      loading...
    </div>
  )
}

function GatedRoutes() {
  const profile = loadProfile()
  const location = useLocation()
  const [cmdOpen, setCmdOpen] = useState(false)

  // PRODUCT_MODE: public-product builds start with an empty profile
  // (setupComplete=false). Allowed routes for pre-setup users are `/`
  // (marketing landing) and `/onboarding` (the chat flow). Everything else
  // bounces back to the landing so they can't poke around an empty app.
  // Vasco's deploy (no env var set) skips this entirely.
  const PUBLIC_PRE_SETUP = new Set(['/', '/onboarding'])
  if (
    PRODUCT_MODE &&
    !profile.setupComplete &&
    !PUBLIC_PRE_SETUP.has(location.pathname)
  ) {
    return <Navigate to="/" replace />
  }

  // PRODUCT_MODE post-setup: the public product is the olympiad wedge, not
  // the 48-route grab-bag Vasco uses. Allowlist the 6 routes that belong
  // to the wedge and bounce everything else back to /. A paying parent who
  // typed /tennis or /piano would otherwise think this is a scam grab-bag.
  // Vasco's deploy (no env var set) skips this — all 48 routes work for him.
  const PRODUCT_ALLOWED_POST_SETUP = new Set([
    '/',
    '/onboarding',
    '/olympiad',
    '/report',
    '/parent',
    '/parent/compass',
    '/profile',
  ])
  if (
    PRODUCT_MODE &&
    profile.setupComplete &&
    !PRODUCT_ALLOWED_POST_SETUP.has(location.pathname)
  ) {
    return <Navigate to="/" replace />
  }

  const showLanding = PRODUCT_MODE && !profile.setupComplete

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(o => !o)
      }
      if (e.key === 'Escape') setCmdOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/" element={showLanding ? <ProductLanding /> : <MayaDashboard onOpenSearch={() => setCmdOpen(true)} />} />
          <Route path="/schedule" element={<MayaSchedule />} />
          <Route path="/profile" element={<MayaProfile />} />
          <Route path="/parent" element={<MayaParent />} />
          <Route path="/parent/compass" element={<MayaParentCompass />} />
          <Route path="/lesson" element={<MayaLesson />} />
          <Route path="/lessons" element={<MayaLessons />} />
          <Route path="/memory" element={<MayaMemory />} />
          <Route path="/ritual" element={<MayaRitual />} />
          <Route path="/goals" element={<MayaGoals />} />
          <Route path="/help" element={<MayaHelp />} />
          <Route path="/shop" element={<MayaShop />} />
          <Route path="/insights" element={<MayaInsights />} />
          <Route path="/journal" element={<MayaJournal />} />
          <Route path="/story" element={<MayaStory />} />
          <Route path="/focus" element={<MayaFocus />} />
          <Route path="/news" element={<MayaNews />} />
          <Route path="/homework" element={<MayaHomework />} />
          <Route path="/tennis" element={<MayaTennis />} />
          <Route path="/reading" element={<MayaReading />} />
          <Route path="/flashcards" element={<MayaFlashcards />} />
          <Route path="/screentime" element={<MayaScreenTime />} />
          <Route path="/piano" element={<MayaPiano />} />
          <Route path="/records" element={<MayaRecords />} />
          <Route path="/vocab" element={<MayaVocab />} />
          <Route path="/explain" element={<MayaExplain />} />
          <Route path="/timer" element={<MayaTimer />} />
          <Route path="/habits" element={<MayaHabits />} />
          <Route path="/mathdrill" element={<MayaMathDrill />} />
          <Route path="/typing" element={<MayaTyping />} />
          <Route path="/intel" element={<MayaIntel />} />
          <Route path="/sleep" element={<MayaSleep />} />
          <Route path="/water" element={<MayaWater />} />
          <Route path="/workout" element={<MayaWorkout />} />
          <Route path="/moods" element={<MayaMoodBoard />} />
          <Route path="/weekly" element={<MayaWeekly />} />
          <Route path="/login" element={<MayaLogin />} />
          <Route path="/signup" element={<MayaSignup />} />
          <Route path="/children" element={<MayaChildren />} />
          <Route path="/competitions" element={<MayaCompetitions />} />
          <Route path="/prep" element={<MayaPrepPlan />} />
          <Route path="/analytics" element={<MayaAnalytics />} />
          <Route path="/trophies" element={<MayaTrophyRoom />} />
          <Route path="/briefing" element={<MayaBriefing />} />
          <Route path="/notebook" element={<MayaNotebook />} />
          <Route path="/notes" element={<MayaNotes />} />
          <Route path="/brilliant" element={<MayaBrilliant />} />
          <Route path="/olympiad" element={<MayaOlympiad />} />
          <Route path="/report" element={<MayaParentReport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {!showLanding && (
        <>
          <CommandBar open={cmdOpen} onClose={() => setCmdOpen(false)} />
          <AchievementModal />
          <LiveLessonBanner />
          <QuizHUD />
          <BottomNav />
          <VoiceFab />
        </>
      )}
    </>
  )
}

export default function App() {
  useEffect(() => {
    // Register service worker + schedule notifications
    registerServiceWorker().then(() => {
      if (getPermission() === 'granted') {
        const profile = loadProfile()
        scheduleDailyNotifications(profile)
      }
    })
  }, [])

  return (
    <ErrorBoundary>
      <MayaProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <GatedRoutes />
        </BrowserRouter>
      </MayaProvider>
    </ErrorBoundary>
  )
}

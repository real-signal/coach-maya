/**
 * Push Notification Manager
 *
 * Handles:
 * 1. Service worker registration
 * 2. Push subscription (for server-sent notifications)
 * 3. Local scheduled notifications (via service worker messaging)
 * 4. Permission management
 */
import { getSupabase, isCloudEnabled } from './supabase'
import { getActiveChild } from './storage'

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

let _swRegistration = null

// ─── Service Worker Registration ───
// In dev, the SW must NOT run — it cache-firsts JS chunks, and when Vite's
// optimizer rotates dep hashes mid-session the browser keeps stale chunks
// cached. Result: two copies of React in one page → "Cannot read properties
// of null (reading 'useContext')" + "Invalid hook call". Skip + cleanup.
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  if (import.meta.env.DEV) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(r => r.unregister()))
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      }
    } catch {}
    return null
  }
  try {
    _swRegistration = await navigator.serviceWorker.register('/sw.js')
    return _swRegistration
  } catch {
    return null
  }
}

export function getRegistration() {
  return _swRegistration
}

// ─── Permission ───
export async function requestPermission() {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return await Notification.requestPermission()
}

export function getPermission() {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission
}

// ─── Push Subscription (for server-sent notifications) ───
export async function subscribeToPush() {
  if (!_swRegistration || !VAPID_KEY) return null

  try {
    let subscription = await _swRegistration.pushManager.getSubscription()

    if (!subscription) {
      subscription = await _swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      })
    }

    // Save subscription to Supabase
    if (isCloudEnabled()) {
      const sb = getSupabase()
      const childId = getActiveChild()
      if (sb && childId) {
        await sb.from('push_subscriptions').upsert({
          child_id: childId,
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys,
        }, { onConflict: 'endpoint' })
      }
    }

    return subscription
  } catch {
    return null
  }
}

// ─── Local Scheduled Notifications ───

/**
 * Schedule a local notification via the service worker.
 * Works without any server or Supabase.
 */
export function scheduleNotification({ title, body, tag, url, delayMs }) {
  if (!_swRegistration?.active) return false
  _swRegistration.active.postMessage({
    type: 'SCHEDULE_NOTIFICATION',
    delay: delayMs || 0,
    title,
    body,
    tag,
    url,
  })
  return true
}

/**
 * Show a notification immediately.
 */
export async function showNotification(title, body, options = {}) {
  if (Notification.permission !== 'granted') return false

  if (_swRegistration) {
    await _swRegistration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: options.tag || 'maya-immediate',
      data: options.url || '/',
      vibrate: [100, 50, 100],
      ...options,
    })
    return true
  }

  // Fallback to basic Notification API
  new Notification(title, { body, icon: '/icon-192.png' })
  return true
}

// ─── Maya-specific notification presets ───

export function notifyMorning(name, streak) {
  return showNotification('Coach Maya', `Morning, ${name}. Day ${streak} of the streak. Let's go.`, {
    tag: 'maya-morning',
    url: '/',
  })
}

export function notifyComboWarning(combo, minutesLeft) {
  return showNotification('Combo at risk!', `Your ${combo}× combo dies in ${minutesLeft} min. Don't throw it away.`, {
    tag: 'maya-combo',
    url: '/',
  })
}

export function notifyIdleNudge(minutes) {
  return showNotification('Coach Maya', `${minutes} min of nothing. You alive over there?`, {
    tag: 'maya-idle',
    url: '/',
  })
}

export function notifyTaskReminder(taskName) {
  return showNotification('Coach Maya', `${taskName} is waiting. Your combo thanks you in advance.`, {
    tag: 'maya-task',
    url: '/',
  })
}

export function notifyBedtime(name, bedtime) {
  return showNotification('Coach Maya', `${name}, it's ${bedtime}. Wrap up and get to bed. Sleep is XP for your brain.`, {
    tag: 'maya-bedtime',
    url: '/sleep',
  })
}

export function notifyWaterReminder(glassesLeft) {
  return showNotification('Coach Maya', `${glassesLeft} glasses to go. Hydrate.`, {
    tag: 'maya-water',
    url: '/water',
  })
}

/**
 * Schedule daily notification cycles.
 * Call once on app load.
 */
export function scheduleDailyNotifications(profile) {
  if (Notification.permission !== 'granted' || !_swRegistration?.active) return

  const now = new Date()
  const name = profile?.name || 'Champ'

  // Morning briefing at 8:00
  const morning = new Date(now)
  morning.setHours(8, 0, 0, 0)
  if (morning > now) {
    scheduleNotification({
      title: 'Coach Maya',
      body: `Morning, ${name}. Day ${profile?.currentStreak || 1}. Let's ship it.`,
      tag: 'maya-morning',
      url: '/',
      delayMs: morning - now,
    })
  }

  // Water reminder at 12:00
  const noon = new Date(now)
  noon.setHours(12, 0, 0, 0)
  if (noon > now) {
    scheduleNotification({
      title: 'Coach Maya',
      body: 'Halfway through the day. How many glasses?',
      tag: 'maya-water-noon',
      url: '/water',
      delayMs: noon - now,
    })
  }

  // Afternoon check-in at 15:00
  const afternoon = new Date(now)
  afternoon.setHours(15, 0, 0, 0)
  if (afternoon > now) {
    scheduleNotification({
      title: 'Coach Maya',
      body: `${name}, how's the task list looking? Don't make me come find you.`,
      tag: 'maya-afternoon',
      url: '/',
      delayMs: afternoon - now,
    })
  }

  // Bedtime reminder
  const bedtime = profile?._extracted?.bedtime || '21:30'
  const [bH, bM] = bedtime.split(':').map(Number)
  const bed = new Date(now)
  bed.setHours(bH, bM - 15, 0, 0) // 15 min before bedtime
  if (bed > now) {
    scheduleNotification({
      title: 'Coach Maya',
      body: `15 minutes to bed, ${name}. Wrap it up.`,
      tag: 'maya-bedtime',
      url: '/sleep',
      delayMs: bed - now,
    })
  }
}

// ─── Utility ───
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Supabase client.
 *
 * Behavior:
 *  - If VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are both set, a real
 *    client is lazily created and cached.
 *  - Otherwise getSupabase() returns null and the app runs fully offline
 *    against localStorage (auth.js + storage.js no-op cleanly).
 *
 * Vasco's personal deploy doesn't set these env vars → returns null →
 * existing offline behavior is unchanged.
 */
import { createClient } from '@supabase/supabase-js'

let _client = null
let _initialized = false

function init() {
  if (_initialized) return _client
  _initialized = true

  const url = import.meta.env?.VITE_SUPABASE_URL
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null

  try {
    _client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    })
  } catch {
    _client = null
  }
  return _client
}

export function getSupabase() {
  return init()
}

export function isCloudEnabled() {
  return !!init()
}

export default getSupabase()

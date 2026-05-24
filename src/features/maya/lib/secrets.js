/**
 * Secrets storage — API keys, isolated from the main profile blob.
 *
 * Why this exists: keys used to live on `maya_profile`, so any profile
 * dump (cloud sync, screenshot of devtools, accidental log) leaked them.
 * They're now stored under their own key (`maya_secrets`) so the profile
 * blob can be moved around without exposing credentials.
 *
 * On first access we transparently migrate any keys still on the legacy
 * profile fields, then strip them from the profile.
 */

const SECRETS_KEY = 'maya_secrets'
const PROFILE_KEY = 'maya_profile'

const PROVIDERS = {
  anthropic:   { secretField: 'anthropic',   legacyField: 'anthropicApiKey' },
  openai:      { secretField: 'openai',      legacyField: 'openaiApiKey' },
  elevenlabs:  { secretField: 'elevenlabs',  legacyField: 'elevenLabsApiKey' },
}

function loadSecrets() {
  try {
    const raw = localStorage.getItem(SECRETS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

function saveSecrets(secrets) {
  try { localStorage.setItem(SECRETS_KEY, JSON.stringify(secrets || {})) } catch {}
}

/**
 * One-time migration: copy keys out of profile into secrets, then strip
 * them from profile. Idempotent — safe to call repeatedly.
 */
let _migrated = false
function migrateOnce() {
  if (_migrated) return
  _migrated = true
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return
    const profile = JSON.parse(raw)
    if (!profile || typeof profile !== 'object') return
    const secrets = loadSecrets()
    let profileChanged = false
    let secretsChanged = false
    for (const [provider, def] of Object.entries(PROVIDERS)) {
      const legacyVal = profile[def.legacyField]
      if (typeof legacyVal === 'string' && legacyVal.length > 0 && !secrets[def.secretField]) {
        secrets[def.secretField] = legacyVal
        secretsChanged = true
      }
      if (def.legacyField in profile) {
        delete profile[def.legacyField]
        profileChanged = true
      }
    }
    if (secretsChanged) saveSecrets(secrets)
    if (profileChanged) {
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)) } catch {}
    }
  } catch {}
}

function getApiKey(provider) {
  migrateOnce()
  const def = PROVIDERS[provider]
  if (!def) return ''
  const secrets = loadSecrets()
  const fromSecrets = secrets[def.secretField]
  if (typeof fromSecrets === 'string' && fromSecrets.length > 0) return fromSecrets
  // Final fallback: env var (build-time, never persisted)
  if (provider === 'anthropic') return import.meta.env.VITE_ANTHROPIC_API_KEY || ''
  if (provider === 'openai') return import.meta.env.VITE_OPENAI_API_KEY || ''
  if (provider === 'elevenlabs') return import.meta.env.VITE_ELEVENLABS_API_KEY || ''
  return ''
}

function setApiKey(provider, value) {
  migrateOnce()
  const def = PROVIDERS[provider]
  if (!def) return
  const secrets = loadSecrets()
  const v = String(value || '').trim()
  if (v) secrets[def.secretField] = v
  else delete secrets[def.secretField]
  saveSecrets(secrets)
}

function clearAllApiKeys() {
  try { localStorage.removeItem(SECRETS_KEY) } catch {}
  // Also strip any stragglers still on profile (paranoia)
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return
    const profile = JSON.parse(raw)
    if (!profile || typeof profile !== 'object') return
    let changed = false
    for (const def of Object.values(PROVIDERS)) {
      if (def.legacyField in profile) { delete profile[def.legacyField]; changed = true }
    }
    if (changed) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {}
}

function hasAnyKey() {
  migrateOnce()
  const secrets = loadSecrets()
  return Object.values(PROVIDERS).some(def => {
    const v = secrets[def.secretField]
    return typeof v === 'string' && v.length > 0
  })
}

export { getApiKey, setApiKey, clearAllApiKeys, hasAnyKey, migrateOnce }

/**
 * Vercel serverless proxy for Anthropic /v1/messages.
 *
 * The browser POSTs the same payload it would normally send to
 * api.anthropic.com; this function forwards it with the secret key from
 * process.env.ANTHROPIC_API_KEY. The key never leaves the server.
 *
 * Only used in product-mode builds (VITE_PRODUCT_MODE=1). Vasco's deploy
 * calls Anthropic directly with the user's own key and never hits this
 * route — but the route is harmless to deploy either way.
 */

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Per-instance rate limit. Serverless instances are short-lived and not
// shared across regions, so this is a coarse safety valve, not real quota
// management. Real per-user limits need session auth (Supabase).
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30
const _bucket = []

function rateLimitedNow() {
  const now = Date.now()
  while (_bucket.length && _bucket[0] < now - RATE_WINDOW_MS) _bucket.shift()
  if (_bucket.length >= RATE_MAX) return true
  _bucket.push(now)
  return false
}

// Bill-protection guardrails. Without these, anyone who finds the proxy
// URL can hit `/api/anthropic` with `model: 'claude-opus-4'` +
// `max_tokens: 200000` and burn through the budget until rate limit kicks
// in. Whitelist the models we actually call and cap output length.
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
])
const MAX_OUTPUT_TOKENS = 4096
const MAX_PAYLOAD_BYTES = 64 * 1024 // 64KB — generous for our longest prompts

// Only forward fields we actually use. Anything else (e.g. tools,
// custom metadata) gets stripped so the proxy can't be coerced into
// modes we didn't design for.
const ALLOWED_FIELDS = ['model', 'max_tokens', 'system', 'messages', 'temperature', 'stop_sequences']

function sanitizePayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'missing_body' }
  }

  if (typeof raw.model !== 'string' || !ALLOWED_MODELS.has(raw.model)) {
    return { error: 'model_not_allowed' }
  }

  const maxTokens = Number(raw.max_tokens)
  if (!Number.isFinite(maxTokens) || maxTokens < 1) {
    return { error: 'invalid_max_tokens' }
  }

  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    return { error: 'invalid_messages' }
  }

  const clean = {}
  for (const k of ALLOWED_FIELDS) {
    if (raw[k] !== undefined) clean[k] = raw[k]
  }
  clean.max_tokens = Math.min(maxTokens, MAX_OUTPUT_TOKENS)
  return { payload: clean }
}

export default async function handler(req, res) {
  // Same-origin only. No CORS — the browser only ever calls this from the
  // product-mode bundle, which is served from the same domain.
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    res.status(500).json({ error: 'server_not_configured' })
    return
  }

  if (rateLimitedNow()) {
    res.status(429).json({ error: 'rate_limited', retry_after_ms: RATE_WINDOW_MS })
    return
  }

  // Vercel parses JSON bodies automatically when content-type matches.
  // Fall back to manual parse for safety.
  let payload = req.body
  if (typeof payload === 'string') {
    if (payload.length > MAX_PAYLOAD_BYTES) {
      res.status(413).json({ error: 'payload_too_large' })
      return
    }
    try { payload = JSON.parse(payload) } catch {
      res.status(400).json({ error: 'invalid_json' })
      return
    }
  }

  const { payload: clean, error } = sanitizePayload(payload)
  if (error) {
    res.status(400).json({ error })
    return
  }

  // Re-check size after sanitization — a payload could be valid JSON but
  // still wildly oversized in a single field (e.g. a giant messages array).
  const body = JSON.stringify(clean)
  if (body.length > MAX_PAYLOAD_BYTES) {
    res.status(413).json({ error: 'payload_too_large' })
    return
  }

  try {
    const upstream = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body,
    })

    const text = await upstream.text()
    res.status(upstream.status)
    // Forward Anthropic's response verbatim. Try to parse so the client
    // gets a real JSON object; fall back to raw text if Anthropic returned
    // a non-JSON error.
    try {
      res.json(JSON.parse(text))
    } catch {
      res.send(text)
    }
  } catch (e) {
    res.status(502).json({ error: 'upstream_failed', message: String(e?.message || e) })
  }
}

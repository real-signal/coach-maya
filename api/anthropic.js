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
    try { payload = JSON.parse(payload) } catch {
      res.status(400).json({ error: 'invalid_json' })
      return
    }
  }
  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ error: 'missing_body' })
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
      body: JSON.stringify(payload),
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

/**
 * anthropicClient — single entry point for every Claude API call in the app.
 *
 * Two modes:
 *  - PRODUCT_MODE (public product, VITE_PRODUCT_MODE=1): POSTs to the
 *    same-origin `/api/anthropic` serverless function. The browser never
 *    sees the API key — it lives on the server only.
 *  - Vasco mode (no env var): POSTs directly to Anthropic with the user's
 *    own key from `getApiKey('anthropic')`. Preserves the existing
 *    BYO-key behavior of his personal deploy.
 *
 * Same return shape in both modes — the parsed JSON response from
 * Anthropic's `/v1/messages` endpoint, e.g. `{ content: [{ text }], ... }`.
 */
import { PRODUCT_MODE } from './profile'
import { getApiKey } from './secrets'

const ANTHROPIC_DIRECT = 'https://api.anthropic.com/v1/messages'
const PROXY_ENDPOINT = '/api/anthropic'

/**
 * Call Claude. Throws on non-2xx (caller catches).
 *
 * @param {object} payload — Anthropic /v1/messages body
 * @param {object} [opts]  — { signal, timeoutMs }
 * @returns {Promise<object>} parsed JSON response
 */
export async function callClaude(payload, opts = {}) {
  const { signal, timeoutMs } = opts

  // Optional client-side timeout — caller can still pass their own AbortSignal.
  let abortCtl = null
  let timer = null
  let effectiveSignal = signal
  if (timeoutMs && !signal) {
    abortCtl = new AbortController()
    effectiveSignal = abortCtl.signal
    timer = setTimeout(() => abortCtl.abort(), timeoutMs)
  }

  try {
    const url = PRODUCT_MODE ? PROXY_ENDPOINT : ANTHROPIC_DIRECT
    const headers = { 'Content-Type': 'application/json' }

    if (!PRODUCT_MODE) {
      const key = getApiKey('anthropic')
      if (!key) throw new Error('No Anthropic API key configured')
      headers['x-api-key'] = key
      headers['anthropic-version'] = '2023-06-01'
      headers['anthropic-dangerous-direct-browser-access'] = 'true'
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: effectiveSignal,
    })

    if (!res.ok) {
      let detail = ''
      try { detail = await res.text() } catch {}
      const err = new Error(`Claude API ${res.status}${detail ? ': ' + detail.slice(0, 200) : ''}`)
      err.status = res.status
      throw err
    }

    return await res.json()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Convenience: return just the first text block of the response.
 * Most callers just want the string.
 */
export function textFromResponse(response) {
  return response?.content?.[0]?.text || ''
}

/**
 * `true` when a Claude call is possible right now — either we're in
 * product-mode (proxy handles auth) or the user has a key on file.
 * Use this to short-circuit before invoking callClaude.
 */
export function canCallClaude() {
  if (PRODUCT_MODE) return true
  return !!getApiKey('anthropic')
}

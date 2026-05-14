/**
 * Sources storage — Vasco's NotebookLM-equivalent corpus.
 * Pasted text, .txt uploads, and PDFs (extracted via pdf.js from CDN).
 *
 * Stored in localStorage under maya_sources as an array of:
 *   { id, name, type, content, addedAt, size }
 *
 * Caps:
 *   - 12 sources max (so chat prompts stay inside Claude's context)
 *   - 250KB per source (extracted text)
 *   - 1.5MB total across all sources (localStorage safety margin)
 */

const STORAGE_KEY = 'maya_sources'
const MAX_SOURCES = 12
const MAX_BYTES_PER_SOURCE = 250 * 1024
const MAX_BYTES_TOTAL = 1500 * 1024

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function loadSources() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function saveSources(arr) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)) }
  catch (e) {
    if (e?.name === 'QuotaExceededError') {
      throw new Error('Storage full — remove a source before adding another.')
    }
    throw e
  }
}

function totalBytes(sources) {
  return sources.reduce((sum, s) => sum + (s.content?.length || 0), 0)
}

/**
 * Add a source. Throws on validation errors so the UI can surface them.
 */
function addSource({ name, type, content }) {
  const text = String(content || '').trim()
  if (!text) throw new Error('Source is empty.')
  if (text.length > MAX_BYTES_PER_SOURCE) {
    throw new Error(`Source too large (${Math.round(text.length / 1024)}KB). Max 250KB — trim it down or split into two.`)
  }
  const sources = loadSources()
  if (sources.length >= MAX_SOURCES) {
    throw new Error(`Source limit reached (${MAX_SOURCES}). Remove one first.`)
  }
  if (totalBytes(sources) + text.length > MAX_BYTES_TOTAL) {
    throw new Error('Total source size would exceed limit. Remove a source first.')
  }
  const source = {
    id: uid(),
    name: String(name || 'Untitled').slice(0, 80),
    type: type || 'text',
    content: text,
    size: text.length,
    addedAt: new Date().toISOString(),
  }
  saveSources([...sources, source])
  return source
}

function removeSource(id) {
  saveSources(loadSources().filter(s => s.id !== id))
}

function clearAllSources() {
  saveSources([])
}

/**
 * Load pdf.js from CDN once and cache the lib for subsequent extractions.
 * No npm dep — pdfjs is heavy and we'd rather not bundle it.
 */
let pdfjsLibPromise = null
function loadPdfJs() {
  if (pdfjsLibPromise) return pdfjsLibPromise
  pdfjsLibPromise = (async () => {
    const VERSION = '4.0.379'
    const src = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build/pdf.min.mjs`
    const worker = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/build/pdf.worker.min.mjs`
    const lib = await import(/* @vite-ignore */ src)
    lib.GlobalWorkerOptions.workerSrc = worker
    return lib
  })()
  return pdfjsLibPromise
}

/**
 * Extract plain text from a PDF File. Joins pages with double newlines.
 * Returns the text string. Throws on parse errors.
 */
async function extractPdfText(file) {
  const lib = await loadPdfJs()
  const buf = await file.arrayBuffer()
  const pdf = await lib.getDocument({ data: buf }).promise
  const pages = []
  const pageCount = Math.min(pdf.numPages, 200) // safety cap
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    const text = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim()
    if (text) pages.push(text)
  }
  return pages.join('\n\n')
}

/**
 * Read a plain-text file (.txt, .md) into a string.
 */
async function readTextFile(file) {
  return await file.text()
}

export {
  loadSources,
  addSource,
  removeSource,
  clearAllSources,
  extractPdfText,
  readTextFile,
  MAX_SOURCES,
  MAX_BYTES_PER_SOURCE,
  MAX_BYTES_TOTAL,
}

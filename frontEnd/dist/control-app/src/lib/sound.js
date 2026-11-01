// ============================================================
// lib/sound.js
// ----------------------------------------------------------------
// Tiny Web Audio utility that plays a short synthesised beep
// without requiring any external audio files.
//
// Two channels are exposed:
//
//   playAlert()    — high-priority system alert sound
//                    (2 short high notes — urgent)
//
//   playTicket()   — ticket logged sound
//                    (1 longer mid-pitch note — confirmation)
//
// Sound is RESPECTED only when:
//   - the user has not muted it (localStorage flag `finsage_sound_muted`)
//   - the document has focus OR the user has previously interacted
//     with the page (browsers otherwise block autoplay)
//
// The AudioContext is created lazily on first play and "resumed"
// if suspended (Safari requires this).
// ============================================================

const STORAGE_KEY = 'finsage_sound_muted'
const VOLUME_KEY  = 'finsage_sound_volume'

let _ctx = null
let _userInteracted = false

// Browsers block audio until the user has interacted with the page.
// Listen for the first gesture (any click / keypress) and unlock.
if (typeof window !== 'undefined') {
  const unlock = () => {
    _userInteracted = true

    // Force-create the AudioContext inside the user gesture so
    // subsequent calls from background polls can play.
    _getContext()

    window.removeEventListener('click', unlock)
    window.removeEventListener('keydown', unlock)
    window.removeEventListener('touchstart', unlock)
  }

  window.addEventListener('click', unlock, { once: false, passive: true })
  window.addEventListener('keydown', unlock, { once: false, passive: true })
  window.addEventListener('touchstart', unlock, { once: false, passive: true })
}

function _getContext() {
  if (_ctx) return _ctx

  if (typeof window === 'undefined') return null

  const AC = window.AudioContext || window.webkitAudioContext

  if (!AC) return null

  try {
    _ctx = new AC()
  } catch {
    _ctx = null
  }

  return _ctx
}

// ============================================================
// Persistence helpers
// ============================================================

export function isMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMuted(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // localStorage may be unavailable (private mode); fall back to memory.
  }

  // Notify listeners (the header toggle re-renders from this).
  window.dispatchEvent(
    new CustomEvent('finsage:sound-mute-changed', {
      detail: { muted: !!value },
    })
  )
}

export function toggleMuted() {
  setMuted(!isMuted())
}

export function getVolume() {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY))
    if (!Number.isNaN(v) && v > 0 && v <= 1) return v
  } catch {}
  return 0.6
}

export function setVolume(v) {
  try {
    const clamped = Math.max(0, Math.min(1, v))
    localStorage.setItem(VOLUME_KEY, String(clamped))
  } catch {}
  window.dispatchEvent(
    new CustomEvent('finsage:sound-volume-changed', { detail: { volume: v } })
  )
}

// ============================================================
// Core synth — one beep
// ============================================================

function _beep({ frequency, durationMs, type = 'sine', volume, delayMs = 0 }) {
  const ctx = _getContext()

  if (!ctx) return Promise.resolve()

  // Safari starts AudioContext in 'suspended' state until a gesture.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }

  const startAt = ctx.currentTime + delayMs / 1000
  const endAt   = startAt + durationMs / 1000

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(frequency, startAt)

  // ADSR-ish envelope so the beep is soft rather than clicky.
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012)
  gain.gain.exponentialRampToValueAtTime(volume * 0.6, startAt + durationMs / 2000)
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt)

  osc.connect(gain).connect(ctx.destination)

  osc.start(startAt)
  osc.stop(endAt + 0.02)

  return new Promise((resolve) => {
    osc.onended = () => resolve()
  })
}

// ============================================================
// Public channels
// ============================================================

/**
 * Play the system-alert sound (two short high notes).
 * Skip silently when muted OR when the page has not yet been
 * interacted with (browsers would block it anyway).
 */
export async function playAlert() {
  if (isMuted()) return
  if (!_userInteracted && typeof document !== 'undefined' && document.hasFocus && !document.hasFocus()) {
    // Allow if the user has interacted at least once; otherwise skip.
    if (!_userInteracted) return
  }

  const v = getVolume()

  // Two urgent high notes.
  await _beep({ frequency: 880, durationMs: 140, type: 'square', volume: v * 0.35, delayMs: 0 })
  await _beep({ frequency: 1175, durationMs: 200, type: 'square', volume: v * 0.35, delayMs: 80 })
}

/**
 * Play the ticket-logged sound (one longer mid-pitch note).
 */
export async function playTicket() {
  if (isMuted()) return
  if (!_userInteracted) return

  const v = getVolume()

  // Single rising triad.
  await _beep({ frequency: 523, durationMs: 120, type: 'sine', volume: v * 0.40, delayMs: 0 })
  await _beep({ frequency: 659, durationMs: 120, type: 'sine', volume: v * 0.40, delayMs: 100 })
  await _beep({ frequency: 784, durationMs: 240, type: 'sine', volume: v * 0.40, delayMs: 200 })
}

/**
 * Play a soft UI tick (used for "marked read", etc. — optional).
 */
export async function playTick() {
  if (isMuted()) return
  if (!_userInteracted) return
  await _beep({ frequency: 660, durationMs: 70, type: 'sine', volume: getVolume() * 0.20 })
}

// ============================================================
// Convenience: a guard against sound spam.
// If the same channel fired within the last N ms, skip.
// ============================================================

const _lastFired = { alert: 0, ticket: 0 }
const DEBOUNCE_MS = 4000

export function playAlertDebounced() {
  const now = Date.now()
  if (now - _lastFired.alert < DEBOUNCE_MS) return
  _lastFired.alert = now
  playAlert()
}

export function playTicketDebounced() {
  const now = Date.now()
  if (now - _lastFired.ticket < DEBOUNCE_MS) return
  _lastFired.ticket = now
  playTicket()
}

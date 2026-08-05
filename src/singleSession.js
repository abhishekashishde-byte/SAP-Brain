import { supabase, signOut } from './supabaseClient'

const LAST_SESSION_KEY = 'wani-last-auth-session-v1'
const REPLACED_NOTICE_KEY = 'wani-session-replaced-notice'
const NOTICE_ID = 'wani-session-notice'
const POLL_MS = 6000

let installed = false
let checking = false
let forcedSignOut = false
let pollTimer = null
let observer = null
let authSubscription = null

function decodeSessionId(accessToken) {
  try {
    const payload = accessToken?.split('.')?.[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded))?.session_id || null
  } catch {
    return null
  }
}

function readStoredSessionId() {
  try { return localStorage.getItem(LAST_SESSION_KEY) } catch { return null }
}

function storeSessionId(sessionId) {
  try { localStorage.setItem(LAST_SESSION_KEY, sessionId) } catch {}
}

function queueReplacementNotice() {
  try { sessionStorage.setItem(REPLACED_NOTICE_KEY, '1') } catch {}
}

function showReplacementNotice() {
  let shouldShow = false
  try {
    shouldShow = sessionStorage.getItem(REPLACED_NOTICE_KEY) === '1'
    if (shouldShow) sessionStorage.removeItem(REPLACED_NOTICE_KEY)
  } catch {}
  if (!shouldShow || !document.body) return

  document.getElementById(NOTICE_ID)?.remove()
  const notice = document.createElement('div')
  notice.id = NOTICE_ID
  notice.setAttribute('role', 'alert')
  notice.textContent = 'You were logged out because this account was opened on another device.'
  Object.assign(notice.style, {
    position: 'fixed',
    left: '50%',
    top: '18px',
    transform: 'translateX(-50%)',
    width: 'min(420px, calc(100vw - 28px))',
    boxSizing: 'border-box',
    padding: '12px 16px',
    borderRadius: '12px',
    border: '1px solid rgba(239,68,68,.45)',
    background: 'rgba(69,10,10,.97)',
    color: '#fff',
    boxShadow: '0 12px 34px rgba(0,0,0,.38)',
    font: "600 13px/1.45 'Inter','DM Sans',sans-serif",
    textAlign: 'center',
    zIndex: '2147483647',
  })
  document.body.appendChild(notice)
  setTimeout(() => notice.remove(), 7000)
}

async function forceReplacedSignOut() {
  if (forcedSignOut) return
  forcedSignOut = true
  queueReplacementNotice()
  await signOut().catch(() => {})
  setTimeout(showReplacementNotice, 150)
}

async function establishOrVerify(session) {
  if (checking || forcedSignOut || !session?.access_token) return true
  const sessionId = decodeSessionId(session.access_token)
  if (!sessionId) return false

  checking = true
  try {
    const storedSessionId = readStoredSessionId()
    const isNewBrowserSession = storedSessionId !== sessionId
    const rpcName = isNewBrowserSession ? 'claim_wani_session' : 'verify_wani_session'
    const { data, error } = await supabase.rpc(rpcName)

    if (error) {
      console.error(`[single-session] ${rpcName} failed:`, error.message)
      return false
    }

    if (data !== true) {
      await forceReplacedSignOut()
      return false
    }

    storeSessionId(sessionId)

    if (isNewBrowserSession) {
      // Revoke the refresh tokens of every other Supabase session. Their current
      // access token may live briefly, so Wani also checks the active session in
      // the database on every protected API request.
      await supabase.auth.signOut({ scope: 'others' }).catch(() => {})
    }

    return true
  } finally {
    checking = false
  }
}

async function checkCurrentSession() {
  if (forcedSignOut) return
  const { data } = await supabase.auth.getSession()
  if (data?.session) await establishOrVerify(data.session)
}

function enhanceLogoutButtons() {
  document.querySelectorAll('button[title="Sign out"], button[title="Log out"]').forEach(button => {
    if (!(button instanceof HTMLButtonElement)) return
    button.title = 'Log out'
    button.setAttribute('aria-label', 'Log out')
    button.style.setProperty('width', 'auto')
    button.style.setProperty('min-width', '92px')
    button.style.setProperty('padding', '0 12px')
    button.style.setProperty('gap', '7px')

    if (!button.querySelector('[data-wani-logout-label]')) {
      const label = document.createElement('span')
      label.dataset.waniLogoutLabel = 'true'
      label.textContent = 'Log out'
      label.style.fontSize = '12px'
      label.style.fontWeight = '600'
      label.style.whiteSpace = 'nowrap'
      button.appendChild(label)
    }
  })
}

function installObservers() {
  enhanceLogoutButtons()
  observer = new MutationObserver(enhanceLogoutButtons)
  observer.observe(document.body, { childList: true, subtree: true })

  const checkWhenVisible = () => {
    if (document.visibilityState === 'visible') void checkCurrentSession()
  }
  window.addEventListener('focus', checkCurrentSession)
  window.addEventListener('online', checkCurrentSession)
  document.addEventListener('visibilitychange', checkWhenVisible)
  window.addEventListener('wani:session-replaced', forceReplacedSignOut)

  pollTimer = window.setInterval(checkCurrentSession, POLL_MS)

  return () => {
    observer?.disconnect()
    observer = null
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    window.removeEventListener('focus', checkCurrentSession)
    window.removeEventListener('online', checkCurrentSession)
    document.removeEventListener('visibilitychange', checkWhenVisible)
    window.removeEventListener('wani:session-replaced', forceReplacedSignOut)
  }
}

export async function initializeSingleSession() {
  if (installed || typeof window === 'undefined') return
  installed = true

  showReplacementNotice()

  const { data } = await supabase.auth.getSession()
  if (data?.session) await establishOrVerify(data.session)

  const cleanupObservers = installObservers()
  const { data: authData } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') return
    if (event === 'SIGNED_IN') forcedSignOut = false
    // Keep Supabase's auth callback synchronous; perform RPC work afterward.
    setTimeout(() => {
      if (session) void establishOrVerify(session)
    }, 0)
  })
  authSubscription = authData?.subscription || null

  window.addEventListener('beforeunload', () => {
    cleanupObservers()
    authSubscription?.unsubscribe()
  }, { once: true })
}

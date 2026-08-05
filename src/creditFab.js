import { supabase } from './supabaseClient'

const FAB_SELECTOR = 'button[title="New chat"], button[data-wani-credit-fab="true"]'
const LONG_PRESS_MS = 520
const PURPLE = '#4F46E5'
const PURPLE_BORDER = '#6D5DFB'
const USED_DARK = '#050508'

let installed = false
let currentStatus = null
let popover = null
let popoverTimer = null
let observer = null
let authSubscription = null
let refreshInFlight = null
const bindings = new WeakMap()

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function statusTone(usage) {
  if (!usage) return { color: '#A78BFA', label: 'Free credits' }
  if (usage.dailyRemaining <= 0 || usage.monthlyRemaining <= 0) {
    return { color: '#F87171', label: 'Limit reached' }
  }
  if (usage.dailyRemaining === 1 || usage.monthlyRemaining <= 3) {
    return { color: '#FBBF24', label: 'Running low' }
  }
  return { color: '#A78BFA', label: 'Free credits' }
}

function removePopover() {
  if (popoverTimer) clearTimeout(popoverTimer)
  popoverTimer = null
  popover?.remove()
  popover = null
}

function progressRow(label, used, limit, color) {
  const pct = limit > 0 ? clamp((used / limit) * 100, 0, 100) : 0
  return `
    <div style="margin-top:12px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:6px">
        <span style="font-size:12px;color:rgba(255,255,255,.62)">${label}</span>
        <span style="font-size:12px;font-weight:650;color:#F5F3FF">${used} / ${limit} used</span>
      </div>
      <div style="height:5px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden">
        <div style="width:${pct}%;height:100%;border-radius:999px;background:${color};transition:width .25s ease"></div>
      </div>
    </div>`
}

function showPopover(button) {
  const usage = currentStatus?.creditUsage
  if (!usage || currentStatus?.isUnlimited) return

  removePopover()
  const tone = statusTone(usage)
  const dailyLeft = Math.max(Number(usage.dailyRemaining) || 0, 0)
  const monthlyLeft = Math.max(Number(usage.monthlyRemaining) || 0, 0)
  const rect = button.getBoundingClientRect()

  popover = document.createElement('div')
  popover.id = 'wani-credit-popover'
  popover.setAttribute('role', 'status')
  popover.innerHTML = `
    <div style="display:flex;align-items:center;gap:9px">
      <span style="width:9px;height:9px;border-radius:50%;background:${tone.color};box-shadow:0 0 12px ${tone.color}"></span>
      <span style="font-size:13px;font-weight:700;color:#F8F7FF;letter-spacing:.01em">${tone.label}</span>
    </div>
    <div style="font-size:20px;font-weight:750;color:#FFFFFF;margin-top:10px;letter-spacing:-.02em">
      ${dailyLeft} question${dailyLeft === 1 ? '' : 's'} left today
    </div>
    ${progressRow('Today', usage.dailyUsed, usage.dailyLimit, '#7C6CF2')}
    ${progressRow('This month', usage.monthlyUsed, usage.monthlyLimit, '#9B8AFB')}
    <div style="height:1px;background:rgba(255,255,255,.08);margin:14px 0 10px"></div>
    <div style="font-size:11px;line-height:1.45;color:rgba(255,255,255,.48)">
      ${monthlyLeft} monthly credit${monthlyLeft === 1 ? '' : 's'} remaining · Daily credits reset at midnight Berlin time
    </div>`

  const right = Math.max(12, window.innerWidth - rect.right)
  const bottom = Math.max(12, window.innerHeight - rect.top + 12)
  Object.assign(popover.style, {
    position: 'fixed',
    right: `${right}px`,
    bottom: `${bottom}px`,
    width: 'min(272px, calc(100vw - 28px))',
    boxSizing: 'border-box',
    padding: '16px 17px 15px',
    borderRadius: '16px',
    background: 'linear-gradient(145deg, rgba(24,19,45,.985), rgba(9,8,17,.985))',
    border: '1px solid rgba(109,93,251,.58)',
    boxShadow: '0 18px 48px rgba(0,0,0,.52), 0 0 0 1px rgba(124,108,242,.08) inset',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    fontFamily: "'Inter','DM Sans',sans-serif",
    zIndex: '500',
    animation: 'waniCreditPopoverIn .2s cubic-bezier(.2,.8,.2,1) both',
    pointerEvents: 'none',
  })

  document.body.appendChild(popover)
  popoverTimer = setTimeout(removePopover, 5200)
}

function addGlobalStyles() {
  if (document.getElementById('wani-credit-fab-styles')) return
  const style = document.createElement('style')
  style.id = 'wani-credit-fab-styles'
  style.textContent = `
    @keyframes waniCreditPopoverIn {
      from { opacity:0; transform:translateY(8px) scale(.96); }
      to { opacity:1; transform:translateY(0) scale(1); }
    }
    @keyframes waniCreditPulse {
      0% { box-shadow:0 0 0 0 rgba(109,93,251,.48), 0 7px 22px rgba(79,70,229,.38); }
      100% { box-shadow:0 0 0 11px rgba(109,93,251,0), 0 7px 22px rgba(79,70,229,.38); }
    }
  `
  document.head.appendChild(style)
}

function restoreAdminButton(button) {
  const binding = bindings.get(button)
  binding?.cleanup?.()
  bindings.delete(button)

  button.style.background = PURPLE
  button.style.border = 'none'
  button.style.boxSizing = ''
  button.style.boxShadow = '0 6px 20px rgba(79,70,229,0.45)'
  button.style.color = '#fff'
  button.style.touchAction = ''
  button.style.userSelect = ''
  button.style.webkitUserSelect = ''
  button.title = 'New chat'
  button.removeAttribute('aria-label')
  delete button.dataset.waniCreditFab
}

function applyUsageStyle(button) {
  const usage = currentStatus?.creditUsage
  if (!usage || currentStatus?.isUnlimited) {
    restoreAdminButton(button)
    return
  }

  const dailyLimit = Math.max(Number(usage.dailyLimit) || 5, 1)
  const dailyUsed = clamp(Number(usage.dailyUsed) || 0, 0, dailyLimit)
  const blocked = Number(usage.dailyRemaining) <= 0 || Number(usage.monthlyRemaining) <= 0
  const usedPct = blocked ? 100 : clamp((dailyUsed / dailyLimit) * 100, 0, 100)
  const angle = Math.round(usedPct * 3.6 * 10) / 10

  button.style.background = `conic-gradient(from -90deg, ${USED_DARK} 0deg ${angle}deg, ${PURPLE} ${angle}deg 360deg)`
  button.style.border = `2px solid ${PURPLE_BORDER}`
  button.style.boxSizing = 'border-box'
  button.style.color = '#fff'
  button.style.boxShadow = '0 0 0 1px rgba(109,93,251,.18), 0 7px 22px rgba(79,70,229,.38)'
  button.style.touchAction = 'manipulation'
  button.style.userSelect = 'none'
  button.style.webkitUserSelect = 'none'
  button.dataset.waniCreditFab = 'true'
  button.title = 'New chat · hold for credit details'
  button.setAttribute(
    'aria-label',
    `New chat. ${usage.dailyRemaining} of ${dailyLimit} daily credits remaining. Hold for details.`,
  )
}

function bindButton(button) {
  applyUsageStyle(button)
  if (!currentStatus?.creditUsage || currentStatus?.isUnlimited || bindings.has(button)) return

  let timer = null
  let longPressed = false
  let suppressNextClick = false

  const resetScale = () => {
    button.style.transform = 'scale(1)'
  }

  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const onPointerDown = event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    clearTimer()
    longPressed = false
    button.style.transform = 'scale(.92)'
    timer = setTimeout(() => {
      longPressed = true
      suppressNextClick = true
      button.style.transform = 'scale(.97)'
      button.style.animation = 'waniCreditPulse .55s ease-out'
      setTimeout(() => { button.style.animation = 'fabIn .3s ease' }, 580)
      try { navigator.vibrate?.([28, 34, 28]) } catch (_) {}
      showPopover(button)
    }, LONG_PRESS_MS)
  }

  const onPointerUp = () => {
    clearTimer()
    resetScale()
  }

  const onPointerCancel = () => {
    clearTimer()
    resetScale()
  }

  const onPointerLeave = () => {
    if (!longPressed) clearTimer()
    resetScale()
  }

  const onClickCapture = event => {
    if (!suppressNextClick) return
    suppressNextClick = false
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()
  }

  const onContextMenu = event => {
    if (longPressed) event.preventDefault()
  }

  button.addEventListener('pointerdown', onPointerDown)
  button.addEventListener('pointerup', onPointerUp)
  button.addEventListener('pointercancel', onPointerCancel)
  button.addEventListener('pointerleave', onPointerLeave)
  button.addEventListener('click', onClickCapture, true)
  button.addEventListener('contextmenu', onContextMenu)

  bindings.set(button, {
    cleanup: () => {
      clearTimer()
      button.removeEventListener('pointerdown', onPointerDown)
      button.removeEventListener('pointerup', onPointerUp)
      button.removeEventListener('pointercancel', onPointerCancel)
      button.removeEventListener('pointerleave', onPointerLeave)
      button.removeEventListener('click', onClickCapture, true)
      button.removeEventListener('contextmenu', onContextMenu)
    },
  })
}

function syncButtons() {
  document.querySelectorAll(FAB_SELECTOR).forEach(button => {
    if (currentStatus?.isUnlimited || !currentStatus?.creditUsage) restoreAdminButton(button)
    else bindButton(button)
  })
}

async function refreshStatus() {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const { data } = await supabase.auth.getSession()
    if (!data?.session?.access_token) {
      currentStatus = null
      removePopover()
      document.querySelectorAll(FAB_SELECTOR).forEach(restoreAdminButton)
      return
    }

    try {
      const response = await window.__waniCreditBaseFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_credit_usage' }),
      })
      if (!response.ok) return
      const payload = await response.json()
      currentStatus = {
        isUnlimited: payload.isUnlimited === true,
        creditUsage: payload.creditUsage || null,
      }
      removePopover()
      syncButtons()
    } catch (error) {
      console.error('[credit-fab] Could not refresh credit status:', error.message)
    }
  })().finally(() => { refreshInFlight = null })

  return refreshInFlight
}

function isQuestionRequest(input, init = {}) {
  try {
    const rawUrl = input instanceof Request ? input.url : String(input)
    const url = new URL(rawUrl, window.location.origin)
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (url.origin !== window.location.origin || url.pathname !== '/api/chat' || method !== 'POST') return false
    if (typeof init.body !== 'string') return false
    const body = JSON.parse(init.body)
    return !body?.action
  } catch {
    return false
  }
}

export function installCreditFab() {
  if (installed || typeof window === 'undefined') return
  installed = true
  addGlobalStyles()

  const authenticatedFetch = window.fetch.bind(window)
  window.__waniCreditBaseFetch = authenticatedFetch
  window.fetch = async (input, init = {}) => {
    const questionRequest = isQuestionRequest(input, init)
    const response = await authenticatedFetch(input, init)
    if (questionRequest) setTimeout(refreshStatus, 250)
    return response
  }

  observer = new MutationObserver(syncButtons)
  observer.observe(document.body, { childList: true, subtree: true })

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session) setTimeout(refreshStatus, 0)
    else {
      currentStatus = null
      removePopover()
      syncButtons()
    }
  })
  authSubscription = data?.subscription || null

  window.addEventListener('resize', removePopover, { passive: true })
  window.addEventListener('scroll', removePopover, { passive: true, capture: true })

  setTimeout(refreshStatus, 0)
  setTimeout(syncButtons, 0)
}

export function uninstallCreditFab() {
  observer?.disconnect()
  observer = null
  authSubscription?.unsubscribe?.()
  authSubscription = null
  removePopover()
  document.querySelectorAll(FAB_SELECTOR).forEach(restoreAdminButton)
  installed = false
}

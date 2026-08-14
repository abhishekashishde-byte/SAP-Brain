const VISUAL_BUTTON_LABELS = new Set([
  'Customer Brief',
  'View customer brief',
  'Hide customer brief',
  'Creating customer brief…',
  'Creating customer brief...',
  'Consultant Note',
  'View consultant note',
  'Hide consultant note',
  'Creating consultant note…',
  'Creating consultant note...',
])

const QUOTA_TEXT_PATTERNS = [
  /You have used all \d+ free questions for today\./i,
  /You have used all \d+ free questions for this month\./i,
  /Wani is temporarily unable to verify your free credits\./i,
]

let installed = false
let observer = null

function normalizedText(node) {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim()
}

function isQuotaText(text) {
  return QUOTA_TEXT_PATTERNS.some(pattern => pattern.test(text))
}

function findQuotaMessageAncestor(button) {
  let node = button.parentElement
  for (let depth = 0; node && depth < 10; depth += 1) {
    if (isQuotaText(normalizedText(node))) return node
    node = node.parentElement
  }
  return null
}

function syncQuotaVisualControls() {
  document.querySelectorAll('button').forEach(button => {
    const label = normalizedText(button)
    if (!VISUAL_BUTTON_LABELS.has(label)) return

    const wrapper = button.parentElement
    if (!wrapper) return

    const quotaMessage = findQuotaMessageAncestor(button)
    if (quotaMessage) {
      wrapper.dataset.waniQuotaVisualHidden = 'true'
      wrapper.style.display = 'none'
      return
    }

    if (wrapper.dataset.waniQuotaVisualHidden === 'true') {
      delete wrapper.dataset.waniQuotaVisualHidden
      wrapper.style.display = ''
    }
  })
}

export function installQuotaVisualGuard() {
  if (installed || typeof window === 'undefined') return
  installed = true

  observer = new MutationObserver(syncQuotaVisualControls)
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  setTimeout(syncQuotaVisualControls, 0)
}

export function uninstallQuotaVisualGuard() {
  observer?.disconnect()
  observer = null
  installed = false
}

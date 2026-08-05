const FILE_INPUT_SELECTOR = [
  'input[type="file"][accept*=".pdf"]',
  'input[type="file"][accept*=".docx"]',
  'input[type="file"][accept*=".txt"]',
  'input[type="file"][accept*="application/pdf"]',
].join(',')

const INTRO_STYLE_ID = 'wani-intro-replay-guard-style'
const INTRO_SUPPRESSED_CLASS = 'wani-intro-suppressed'
const INTRO_SEEN_KEY = 'wani-intro-seen-v1'
const PICKER_MARKER = 'wani-upload-picker-opened-at'

let installed = false
let observer = null

function restoreNormalStartup() {
  // Remove every startup/video change introduced by the attachment experiments.
  document.getElementById(INTRO_STYLE_ID)?.remove()
  document.getElementById('wani-upload-toast')?.remove()
  document.querySelectorAll(`.${INTRO_SUPPRESSED_CLASS}`).forEach(element => {
    element.classList.remove(INTRO_SUPPRESSED_CLASS)
  })

  try {
    localStorage.removeItem(INTRO_SEEN_KEY)
    sessionStorage.removeItem(PICKER_MARKER)
  } catch {}
}

function disableAttachmentControls() {
  document.querySelectorAll(FILE_INPUT_SELECTOR).forEach(input => {
    if (!(input instanceof HTMLInputElement)) return

    input.disabled = true
    input.hidden = true
    input.tabIndex = -1
    input.setAttribute('aria-hidden', 'true')
    input.style.setProperty('display', 'none', 'important')

    const button = input.previousElementSibling
    if (button instanceof HTMLButtonElement) {
      button.type = 'button'
      button.disabled = true
      button.hidden = true
      button.tabIndex = -1
      button.setAttribute('aria-hidden', 'true')
      button.style.setProperty('display', 'none', 'important')
    }
  })
}

export function installDocumentUploadGuard() {
  if (installed || typeof window === 'undefined') return
  installed = true

  restoreNormalStartup()
  disableAttachmentControls()

  // React may recreate the composer while switching conversations. Keep only
  // the attachment control disabled; do not touch videos, navigation, forms,
  // click events, file events, or application startup.
  observer = new MutationObserver(disableAttachmentControls)
  observer.observe(document.body, { childList: true, subtree: true })
}

export function uninstallDocumentUploadGuard() {
  if (!installed || typeof window === 'undefined') return
  installed = false
  observer?.disconnect()
  observer = null
}
